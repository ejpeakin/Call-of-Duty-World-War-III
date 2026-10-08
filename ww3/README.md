# Call of Duty: World War Three - multiplayer website

A browser FPS you can play with friends. One small Node.js server hosts the game page and relays
multiplayer rooms over WebSockets. No database, no accounts.

## Run it on your own computer (1 minute)

    npm install
    npm start

Open http://localhost:3000. To play with friends:
- **Same Wi-Fi:** they open `http://YOUR-COMPUTER-IP:3000`.
- **Over the internet, no account needed:** in a second terminal run `npx localtunnel --port 3000`
  (or `ngrok http 3000`) and send friends the https link it prints.

## Put it online for free (a real website)

**Render (recommended)**
1. Put this folder in a GitHub repository.
2. On render.com choose New > Web Service, pick the repo. Render reads `render.yaml`
   (Build: `npm install`, Start: `npm start`). Choose the free plan.
3. When it finishes you get a URL like `https://ww3-multiplayer.onrender.com`.
   Free services sleep when idle, so the first load after a break can take about a minute.

**Replit**: create a Node.js Repl, upload these files, press Run, and share the Webview link.

**Railway / Fly.io / Glitch**: any host that runs `npm start` and allows WebSockets works.
The server uses the `PORT` environment variable automatically.

## How to play together
1. Open the site, press through the intro, open the **SQUAD** tab.
2. Enter a callsign and press **CREATE ROOM**. Send friends the link (it looks like `/?room=ABCD`)
   or the 4-letter code. Up to 8 players per room.
3. The host picks **Free For All** or **Team Deathmatch** and a kill limit, then presses **START MATCH**.
4. Hold **Tab** for the scoreboard. You respawn after 4 seconds. Med packs still parachute in and
   are shared by everyone. Grenades, outfits and weapon upgrades all work online.

## Notes
- Hits are decided by the shooter's browser (fine with friends, not cheat-proof for strangers).
- Unlocks and credits are saved in each player's own browser (localStorage).
- The solo mission (enemy soldiers, bombers, objectives) is unchanged and still works offline.
- Multiplayer is player-versus-player. Co-op against the AI soldiers is not synced yet.
