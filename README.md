# NGA Share

Nowoczesna strona do przesylania i udostepniania plikow. Front-end dziala samodzielnie w trybie lokalnym, ale automatycznie przechodzi w tryb online po wykryciu API.

## Co dostajesz

- Modułowy front-end (`src/*.js`)
- Upload z drag&drop i paskiem postepu
- Tagi, wygasanie linkow, filtrowanie, sortowanie, eksport CSV
- PWA (`manifest.webmanifest`, `sw.js`) z cache offline
- Backend Express (`server/`) z realnym uploadem i pobieraniem

## Uruchomienie front-endu

Wystarczy dowolny serwer statyczny (np. VSCode Live Server) uruchomiony w katalogu projektu.

## Uruchomienie backendu

1. `cd server`
2. `npm install`
3. `npm run start`

Domyslnie API bedzie na `http://localhost:3000`.

## Polaczenie front-endu z API

- Automatycznie: jesli front i API sa pod ta sama domena i portem.
- Recznie: dodaj parametr query, np. `strona.html?api=http://localhost:3000`

## Endpointy API

- `GET /api/health`
- `GET /api/files`
- `POST /api/files` (multipart, pole `file`)
- `GET /api/files/:id/download`
- `DELETE /api/files/:id`
- `DELETE /api/files/expired`

