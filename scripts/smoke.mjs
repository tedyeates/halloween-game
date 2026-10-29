import { io } from 'socket.io-client';

const url = process.env.GAME_URL ?? 'http://localhost:3001';
const clients = Array.from({ length: 5 }, (_, index) => ({
  name: `Smoke ${index + 1}`,
  socket: io(url, { transports: ['websocket'] }),
  state: null,
}));
let code;
let pumping = false;
let queued = false;
let finished = false;

function emit(client, event, payload) {
  return new Promise((resolve, reject) => {
    const callback = (result) => result.ok ? resolve(result.data) : reject(new Error(result.error));
    if (payload === undefined) client.socket.emit(event, callback);
    else client.socket.emit(event, payload, callback);
  });
}

async function pump() {
  if (finished) return;
  if (pumping) {
    queued = true;
    return;
  }
  pumping = true;
  try {
    for (const client of clients) {
      const state = client.state;
      if (!state) continue;
      if (state.phase === 'gameOver') {
        finished = true;
        console.log(`Smoke game completed: ${state.winner} wins after day ${state.day}.`);
        for (const other of clients) other.socket.disconnect();
        return;
      }
      if (state.phase === 'roleReveal' && !state.readyPlayerIds.includes(state.selfId)) {
        await emit(client, 'player:ready');
        return;
      }
      if (state.phase === 'night' && state.prompt) {
        await emit(client, 'night:act', { targetIds: state.prompt.targetPlayerIds.slice(0, state.prompt.selectionCount) });
        return;
      }
      const me = state.players.find((player) => player.id === state.selfId);
      if (state.phase === 'day' && me.alive && !state.readyPlayerIds.includes(state.selfId)) {
        await emit(client, 'player:ready');
        return;
      }
      if (state.phase === 'nominations' && state.activeVote?.canVote) {
        await emit(client, 'vote:cast', { vote: true });
        return;
      }
      if (state.phase === 'nominations' && !state.activeVote && state.currentNominatorId === state.selfId) {
        const target = state.players.find((player) => player.alive && !state.nominatedToday.includes(player.id));
        await emit(client, 'nomination:act', { targetId: target?.id ?? null });
        return;
      }
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    finished = true;
    for (const client of clients) client.socket.disconnect();
  } finally {
    pumping = false;
    if (queued && !finished) {
      queued = false;
      queueMicrotask(() => void pump());
    }
  }
}

for (const client of clients) {
  client.socket.on('state:update', (state) => {
    client.state = state;
    void pump();
  });
}

await Promise.all(clients.map((client) => new Promise((resolve) => client.socket.on('connect', resolve))));
clients[0].socket.emit('room:create', null);
clients[0].socket.emit('game:start');
clients[0].socket.emit('night:act', null);
const health = await fetch(`${url}/health`);
if (!health.ok) throw new Error('Server did not survive malformed event smoke checks.');
code = await emit(clients[0], 'room:create', { name: clients[0].name }).then((result) => result.code);
for (const client of clients.slice(1)) await emit(client, 'room:join', { name: client.name, code });
await emit(clients[0], 'game:start');
await pump();

setTimeout(() => {
  if (!finished) {
    console.error('Smoke game did not finish within 30 seconds.');
    for (const client of clients) client.socket.disconnect();
    process.exitCode = 1;
  }
}, 30_000).unref();
