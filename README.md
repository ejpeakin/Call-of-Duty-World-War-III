# FortDay

An original 3D battle royale that runs in the browser: drop from the bus, loot, build, and outlast the storm on five islands.

- `index.html` is the whole game in one page. `server.js` serves it (with a `/health` check for the host).
- The source lives in `src/`. After changing it, run `bash build.sh` to rebuild `index.html`.
- Run locally with `npm install` then `npm start`, and open http://localhost:3000.

## Play

**https://ejpeakin.github.io/FortDay/** (GitHub Pages, from the `main` branch)

## Multiplayer

On the Play tab, one player creates a room and shares its 4-letter code; up to 8 players join with it from the same site. The room's host picks the mode and island and starts the match, and bots fill the remaining spots.

The host's browser runs the bots, storm and loot, and each player's browser runs their own character. Players are linked in one of two ways:

- **GitHub Pages (or any static host):** browsers connect directly to the host's browser over WebRTC using [PeerJS](https://peerjs.com). The free public PeerJS broker only introduces them. Some school or office networks block these direct links.
- **`npm start`:** `server.js` also relays players over a WebSocket at `/ws` (the `ws` package), which works on networks that block direct links.

Cars, sharks and the Skywhale event are switched off in shared matches.

## Accounts, friends and party invites

Players can make an account (email, password and a unique player name), add friends by player name, and invite friends to their party.
Friends who are online get requests and invites instantly in the game, and everyone also gets an email; an emailed party invite has a link that joins the room.
This runs on Supabase and a Gmail account, and stays switched off until they're set up: follow [supabase/SETUP.md](supabase/SETUP.md).

## Multiplayer on school networks

Some networks block direct browser-to-browser links, and players then see "Could not connect to that room". A TURN relay fixes that by passing the game messages through a server on the normal secure web port. To turn it on, put the relay details from a TURN provider into `NET_TURN` at the top of `src/87_net.js`, then run `bash build.sh` and push. Whatever goes there is visible to anyone who opens the page, so use a free plan with a usage limit.

