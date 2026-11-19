# FortDay

An original 3D battle royale that runs in the browser (Three.js r128, no framework, no bundler).

**Two people build this game, each with their own Claude sessions, and both push to `main`.**
GitHub Pages serves `index.html` from `main`, so whatever lands on `main` is live for players within about a minute.
Your session may be out of date: the other person can push while you work.

## Working alongside the other person

1. **Start from the latest `main`.** Before changing anything, run `git fetch origin main` and merge it into your branch (`git merge origin/main`). Don't assume the checkout you started with is current.
2. **Never hand-merge `index.html`.** It is generated from `src/` and conflicts on almost every merge. Resolve any conflicts in `src/` first, then run `bash build.sh` and `git add index.html`.
3. **Before pushing to `main`:** fetch and merge `origin/main` again, rebuild with `bash build.sh`, check the game still runs (see below), then push.
4. **Never force-push `main`.** If a push is rejected, the other person pushed first: fetch, merge, rebuild, check, push again.
5. **Keep changes focused** on what you were asked to do, and tell the user which files you changed so they can tell the other person. Two sessions rewriting the same feature at the same time is the main source of real conflicts.
6. **Commit messages** describe the change for players in plain words, with a short title line and a few lines of detail. Match the existing history.

## How the code is put together

- `src/` is the source. `build.sh` joins it into the single page `index.html`: `src/00_head.html` (title, fonts, all CSS), then `src/01_body.html` (all markup), then every `src/*.js` in filename order inside one `<script>`.
- Every JS file shares **one global scope**. A top-level `const` or `function` in one file is visible in all the others, and a duplicate name breaks the whole game. Pick unique names.
- Never edit `index.html` directly. Edit `src/`, then run `bash build.sh`.
- `src/76_carmodel.js`, `src/77_creatures_data.js` and `src/77b_character_data.js` are large embedded 3D models made by the scripts in `tools/`. Search them with grep; don't read them whole.
- `server.js` serves the page locally and relays multiplayer over a WebSocket at `/ws`: `npm install`, `npm start`, then open http://localhost:3000. On GitHub Pages, multiplayer uses PeerJS (WebRTC) instead (`src/87_net.js`).

### Where things live

| What | Files |
|---|---|
| Lobby (Play tab, mode picker, Unranked/Ranked, party spots, Locker, Shop, Pass) | `src/97_lobby.js`, `src/01_body.html`, `src/00_head.html` |
| Building (walls, ramps, floors, cones) | `src/70_build.js` |
| Characters and their size | `src/40_actors.js`, `src/79_charmodel.js` |
| Weapons and combat | `src/10_core.js` (weapon stats), `src/41_guns.js`, `src/60_combat.js` |
| Match flow, bus, storm | `src/85_match.js` |
| Controls and camera | `src/90_input.js` |
| HUD | `src/95_hud.js` |
| Multiplayer rooms | `src/87_net.js`, `server.js` |
| Accounts, friends, party invites | `src/89_social.js`, `supabase/` |

### Things to keep consistent

- Build tiles are 5.12 m wide and 3.84 m tall (`T`, `TH` in `src/70_build.js`). Characters are about 1.9 m tall (`BODY_SCALE = 1.0` in `src/40_actors.js`), so a wall is about twice a player's height. Keep that proportion.
- A placed build starts see-through and turns solid over `BUILD_TIME` seconds (`src/70_build.js`).
- FortDay is its own game. Don't copy names, characters, art, music or the look of existing games.

## Accounts, friends and party invites (Supabase)

- These stay off until `SOCIAL.url` and `SOCIAL.key` are filled in at the top of `src/89_social.js`. Until then the Friends card is hidden and the account library isn't loaded. Setup steps for the humans: `supabase/SETUP.md`.
- `SOCIAL.key` is the public anon / publishable key. Never put the `service_role` / secret key, the Gmail app password or the database password in this repo: `index.html` is public.
- Editing `supabase/schema.sql` does **not** change the live database. Someone has to run it in Supabase's SQL Editor, so keep it safe to run again (`create … if not exists`, `create or replace`, `drop policy if exists`). Tell the user when it needs re-running.
- Editing `supabase/functions/notify/index.ts` does nothing until it's deployed again in Supabase. Tell the user.
- Email addresses never reach the page. Only the `notify` function reads them. Players see each other's player names only.
- To test schema changes in a cloud session, start the local Postgres 16 (`pg_ctlcluster 16 main start`) and mimic Supabase: an `auth.users` table, `auth.uid()` reading `current_setting('request.jwt.claim.sub', true)`, the `anon`, `authenticated` and `service_role` roles, and a `supabase_realtime` publication. Then run the schema and call the functions as different players with `set role authenticated` and `set request.jwt.claim.sub`.

## Checking that it runs

Syntax check of the built page:

```bash
python3 -c "import re;h=open('index.html').read();open('/tmp/fd.js','w').write(re.findall(r'<script>(.*?)</script>',h,re.S)[-1])" && node --check /tmp/fd.js
```

A syntax check isn't enough for UI or gameplay changes: load the game in a browser and look at it.
In a cloud session, use the pre-installed Playwright:

- Launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` so WebGL works.
- If the CDNs (cdnjs.cloudflare.com, cdn.jsdelivr.net) are blocked, run `npm install three@0.128.0 peerjs@1.5.4` in a scratch folder. Then serve those files with `page.route` in place of the CDN URLs: `three/build/three.min.js`, `three/examples/js/loaders/GLTFLoader.js`, `three/examples/js/utils/SkeletonUtils.js` and `peerjs/dist/peerjs.min.js`. Don't change the CDN URLs in `build.sh`.
- Game objects such as `Match`, `Lobby`, `Build`, `player`, `Profile` and `Net` can be reached from `page.evaluate`, for example `Match.state === 'play'` once a match has started.
- Check the console for errors before saying it works.
