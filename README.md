# FortDay

An original 3D battle royale that runs in the browser: drop from the bus, loot, build, and outlast the storm on five islands.

- `index.html` is the whole game in one page. `server.js` serves it (with a `/health` check for the host).
- The source lives in `src/`. After changing it, run `bash build.sh` to rebuild `index.html`.
- Run locally with `npm install` then `npm start`, and open http://localhost:3000.

## Play

**https://ejpeakin.github.io/Call-of-Duty-World-War-III/** (GitHub Pages, from the `main` branch)

## Multiplayer

On the Play tab, one player creates a room and shares its 4-letter code; up to 8 players join with it from the same site. The room's host picks the mode and island and starts the match, and bots fill the remaining spots.

The host's browser runs the bots, storm and loot, and each player's browser runs their own character. Players are linked in one of two ways:

- **GitHub Pages (or any static host):** browsers connect directly to the host's browser over WebRTC using [PeerJS](https://peerjs.com). The free public PeerJS broker only introduces them. Some school or office networks block these direct links.
- **`npm start`:** `server.js` also relays players over a WebSocket at `/ws` (the `ws` package), which works on networks that block direct links.

Cars, sharks and the Skywhale event are switched off in shared matches.
