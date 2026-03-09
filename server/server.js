import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "files.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");

ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);
ensureFile(DB_PATH, "[]");

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "nga-share-server", date: new Date().toISOString() });
});

app.get("/api/files", (_req, res) => {
  const files = pruneExpired(readFiles());
  writeFiles(files);
  res.json(files);
});

app.post("/api/files", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Brak pliku." });
    return;
  }

  const now = Date.now();
  const id = nanoid(12);
  const expiresAt = computeExpiry(now, req.body.expiry || "never");
  const tag = normalizeTag(req.body.tag || "");
  const category = detectCategory(file.mimetype, file.originalname);
  const downloadPath = `/api/files/${id}/download`;
  const origin = `${req.protocol}://${req.get("host")}`;
  const preview = file.mimetype.startsWith("image/") ? `${origin}/uploads/${file.filename}` : "";

  const item = {
    id,
    name: file.originalname,
    type: file.mimetype || "application/octet-stream",
    category,
    size: file.size,
    tag,
    createdAt: now,
    expiresAt,
    downloads: 0,
    link: `${origin}${downloadPath}`,
    preview,
    storageName: file.filename
  };

  const files = pruneExpired(readFiles());
  files.unshift(item);
  writeFiles(files);
  res.status(201).json(item);
});

app.get("/api/files/:id/download", (req, res) => {
  const files = pruneExpired(readFiles());
  const index = files.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    res.status(404).json({ error: "Plik nie istnieje." });
    return;
  }

  const item = files[index];
  const filePath = path.join(UPLOAD_DIR, item.storageName);
  if (!fs.existsSync(filePath)) {
    res.status(410).json({ error: "Plik usuniety z dysku." });
    return;
  }

  files[index] = { ...item, downloads: item.downloads + 1 };
  writeFiles(files);
  res.download(filePath, item.name);
});

app.delete("/api/files/:id", (req, res) => {
  const files = readFiles();
  const item = files.find((x) => x.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: "Nie znaleziono." });
    return;
  }

  const filtered = files.filter((x) => x.id !== req.params.id);
  writeFiles(filtered);

  const target = path.join(UPLOAD_DIR, item.storageName);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  res.json({ ok: true });
});

app.delete("/api/files/expired", (_req, res) => {
  const before = readFiles();
  const after = pruneExpired(before, true);
  writeFiles(after);
  res.json({ removed: before.length - after.length });
});

app.listen(PORT, () => {
  console.log(`[nga-share-server] listening on http://localhost:${PORT}`);
});

function readFiles() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFiles(files) {
  fs.writeFileSync(DB_PATH, JSON.stringify(files, null, 2));
}

function pruneExpired(files, deletePhysical = false) {
  const now = Date.now();
  const kept = [];
  for (const item of files) {
    const expired = item.expiresAt && item.expiresAt <= now;
    if (!expired) {
      kept.push(item);
      continue;
    }
    if (deletePhysical) {
      const target = path.join(UPLOAD_DIR, item.storageName);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  }
  return kept;
}

function computeExpiry(now, preset) {
  if (preset === "1d") return now + 24 * 60 * 60 * 1000;
  if (preset === "7d") return now + 7 * 24 * 60 * 60 * 1000;
  if (preset === "30d") return now + 30 * 24 * 60 * 60 * 1000;
  return null;
}

function detectCategory(mime, fileName) {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  const docs = ["pdf", "doc", "docx", "txt", "xlsx", "xls", "ppt", "pptx", "odt", "csv"];
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (docs.includes(ext)) return "doc";
  return "other";
}

function normalizeTag(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, "-").slice(0, 24);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function ensureFile(filePath, initialContent) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, initialContent);
}

