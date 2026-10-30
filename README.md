# Hollowbrook

Hollowbrook is an original Halloween social deduction game for **5–8 online players**. It uses Clocktower-style hidden roles and day/night play and supports two ways to run the game:

- **Automated narrator:** the server assigns roles, guides night actions, calculates information, resolves votes and deaths, announces results, and detects victory.
- **Human Storyteller:** the host builds the role setup, sees the full grimoire, visits players privately, delivers information in their own words, and controls pause/resume points. The app still validates actions, calculates outcomes, and runs daytime voting.

In Storyteller mode the host does **not** play a character. This is designed for groups playing over Teams or another voice platform who move the Storyteller between private rooms.

## Play locally

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite server is exposed on your local network, so other devices on the same network can use the shown network URL. Each player should use a separate browser/device.

For a production build:

```sh
npm run build
npm start
```

Then open **http://localhost:3001**. Set `PORT` to change the server port.

## Deploy on Render

Hollowbrook runs as a single Node web service. The included [`render.yaml`](./render.yaml) builds the client and server, starts them together, and configures the `/health` check.

1. Open [Render](https://dashboard.render.com/) and choose **New → Blueprint**.
2. Select the `tedyeates/halloween-game` repository.
3. Apply the detected `hollowbrook` service from `render.yaml`.
4. Share the generated `onrender.com` URL with the players.

No environment variables are required. Render supplies `PORT` automatically, and the Node server serves the built React client and Socket.IO endpoint from the same origin.

The free Render plan can sleep after inactivity and restarts clear in-memory rooms. Use a paid instance for a game you expect to keep open for a long time, and reconnect if the service restarts.

> Vercel's default Vite preset only deploys the static frontend. Hollowbrook's realtime rooms require the Node server, so deploying only with Vercel will not produce a playable game.

## Included gameplay

- Private online rooms with five-character codes and reconnect tokens
- Balanced role compositions for 5, 6, 7, and 8 players
- 15 original Halloween roles across Townsfolk, Outsider, Minion, and Demon teams
- Automated first and subsequent night orders, private prompts, poison, protection, and Demon succession
- Human Storyteller mode with suggested and editable role setups, balance guidance, a full grimoire, private-visit checklists, voice-only result delivery, and a public suicide moderation control for players who leave or cheat
- Roles visible privately on each player’s screen before any Storyteller visit, plus an optional role-reading pause
- Automatic Storyteller pauses every night, with a required-visit tracker and a conspicuous reminder to visit every player
- Player-selected secret actions with an optional note for how the Storyteller should narrate them
- Open discussion, ordered nomination turns, simultaneous hidden ballots, execution, and one ghost vote per dead player
- Witch Hunter, Harvest Mayor, Doomed, Crimson Heir, and Headless Horseman victory interactions
- Public narration and private information handled by either the app or the human Storyteller
- Full role reveal and host-controlled rematches

See [GAME_DESIGN.md](./GAME_DESIGN.md) for the complete rules and role script.

## Test with five players in one browser

Open the game with `?test=1`:

```text
http://localhost:3001/?test=1
```

In test mode, each **new tab** stores its player session separately in that tab. Create a room in the first tab, then open four more new tabs at the same URL and join with the room code. You can play all five seats from one normal or private browser window.

To test Storyteller mode, open **six** tabs: create a Storyteller room in the first, then join five player tabs. The Storyteller is a separate host seat and is not one of the five characters.

Do not duplicate an existing tab, because a duplicated tab copies its session storage. Open a genuinely new tab instead. Reloading a tab preserves that tab's player; closing it loses that player's saved reconnect token. The floating **Reset tab** button clears only that tab's test session. Test sessions are isolated from the normal saved game in `localStorage`.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

With the production server running, an additional five-client network smoke test is available:

```sh
node scripts/smoke.mjs
```

The smoke test creates a temporary room, plays it with five automated clients, and exits when a team wins. `GAME_URL` can point it at another server.

## Project structure

```text
src/
  client/          React interface and responsive styling
  server/          Authoritative Socket.IO room server
  shared/
    engine.ts      Setup, discussion, nomination, voting, and victory
    night.ts       Night order, actions, and secret information
    roles.ts       Role script and ability text
    statements.ts  Prewritten public statement templates
    sanitize.ts    Per-player views that conceal secret game state
    engine.test.ts Rules tests
scripts/
  smoke.mjs        End-to-end multiplayer smoke game
```

Rooms are currently **in memory**. Restarting the server clears all rooms and saved reconnect sessions; rooms with no connected players also expire after 24 hours. For a public deployment, put the Node server behind a WebSocket-capable HTTPS reverse proxy; no separate client server is needed.

Hollowbrook is an original, unofficial project and is not affiliated with Blood on the Clocktower or The Pandemonium Institute.
