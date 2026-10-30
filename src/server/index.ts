import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  actOnNomination,
  castVote,
  createGameState,
  hunterShoot,
  markReady,
  reconcileAfterDisconnect,
  restartGame,
  startGame,
} from '../shared/engine.js';
import {
  finishNarratorPause,
  handlePlayerDeparture,
  markNarratorVisit,
  rerollNarratorSetup,
  setNarratorAllVisited,
  setNarratorSetup,
  submitNarratorAction,
  syncNarratorSetup,
} from '../shared/narrator.js';
import { submitNightAction } from '../shared/night.js';
import { stateForPlayer, stateForStoryteller } from '../shared/sanitize.js';
import type {
  ClientToServerEvents,
  GameMode,
  GameState,
  JoinResult,
  ServerToClientEvents,
} from '../shared/types.js';

interface Room {
  state: GameState;
  reconnectTokens: Map<string, string>;
  lastActivity: number;
  storytellerSocketId?: string;
}

interface SocketData {
  code?: string;
  playerId?: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: true },
});
const rooms = new Map<string, Room>();
const port = Number(process.env.PORT ?? 3001);
const abandonedRoomTtl = 24 * 60 * 60 * 1000;

setInterval(() => {
  for (const [code, room] of rooms) {
    const occupied = room.state.players.some((player) => player.connected) || Boolean(room.storytellerSocketId);
    if (!occupied && Date.now() - room.lastActivity > abandonedRoomTtl) rooms.delete(code);
  }
}, 60 * 60 * 1000).unref();

app.get('/health', (_request, response) => response.json({ ok: true, rooms: rooms.size }));

function cleanName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('Enter your name.');
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 20) throw new Error('Names must be between 1 and 20 characters.');
  return cleaned;
}

function cleanCode(code: unknown): string {
  if (typeof code !== 'string') throw new Error('Enter a room code.');
  return code.trim().toUpperCase();
}

function cleanMode(mode: unknown): GameMode {
  return mode === 'storyteller' ? 'storyteller' : 'automated';
}

function createCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from(randomBytes(5)).map((byte) => alphabet[byte % alphabet.length]).join('');
  } while (rooms.has(code));
  return code;
}

function addPlayer(room: Room, name: string, socket: GameSocket): JoinResult {
  if (room.state.phase !== 'lobby') throw new Error('This game has already begun. Reconnect with your original session.');
  if (room.state.players.length >= 8) throw new Error('This room is full.');
  if (room.state.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('That name is already in use in this room.');
  }
  const playerId = randomUUID();
  const reconnectToken = randomBytes(32).toString('hex');
  room.state.players.push({
    id: playerId,
    name,
    alive: true,
    connected: true,
    ghostVoteUsed: false,
    abilityUsed: false,
    socketId: socket.id,
  });
  room.reconnectTokens.set(playerId, reconnectToken);
  if (room.state.mode === 'automated' && !room.state.players.some((player) => player.id === room.state.hostId)) {
    room.state.hostId = playerId;
  }
  attachSocket(socket, room.state.code, playerId);
  syncNarratorSetup(room.state, Math.random);
  return { playerId, reconnectToken, mode: room.state.mode };
}

function attachSocket(socket: GameSocket, code: string, playerId: string): void {
  socket.data.code = code;
  socket.data.playerId = playerId;
  void socket.join(code);
}

function context(socket: GameSocket): { room: Room; playerId: string } {
  const { code, playerId } = socket.data;
  if (!code || !playerId) throw new Error('Join a room first.');
  const room = rooms.get(code);
  const player = room?.state.players.find((candidate) => candidate.id === playerId);
  if (!room || !player || player.socketId !== socket.id) throw new Error('Your room session is no longer valid.');
  return { room, playerId };
}

function hostContext(socket: GameSocket): { room: Room; playerId: string } {
  const { code, playerId } = socket.data;
  if (!code || !playerId) throw new Error('Join a room first.');
  const room = rooms.get(code);
  if (!room || room.state.hostId !== playerId) throw new Error('Only the room host can do that.');
  const authorized = room.state.mode === 'storyteller'
    ? room.storytellerSocketId === socket.id
    : room.state.players.find((player) => player.id === playerId)?.socketId === socket.id;
  if (!authorized) throw new Error('Your room session is no longer valid.');
  return { room, playerId };
}

function broadcast(room: Room): void {
  room.lastActivity = Date.now();
  for (const player of room.state.players) {
    if (player.socketId) io.to(player.socketId).emit('state:update', stateForPlayer(room.state, player.id));
  }
  if (room.state.mode === 'storyteller' && room.storytellerSocketId) {
    io.to(room.storytellerSocketId).emit('storyteller:update', stateForStoryteller(room.state));
  }
}

type AcknowledgementResult = { ok: false; error: string } | { ok: true; data?: unknown };

function acknowledgement(callback: unknown): (result: AcknowledgementResult) => void {
  if (typeof callback !== 'function') return () => undefined;
  return (result) => (callback as (value: AcknowledgementResult) => void)(result);
}

function respond(
  socket: GameSocket,
  callback: unknown,
  action: (session: { room: Room; playerId: string }) => void,
): void {
  const reply = acknowledgement(callback);
  try {
    const session = context(socket);
    action(session);
    broadcast(session.room);
    reply({ ok: true });
  } catch (error) {
    reply({ ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' });
  }
}

function respondHost(
  socket: GameSocket,
  callback: unknown,
  action: (session: { room: Room; playerId: string }) => void,
): void {
  const reply = acknowledgement(callback);
  try {
    const session = hostContext(socket);
    action(session);
    broadcast(session.room);
    reply({ ok: true });
  } catch (error) {
    reply({ ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' });
  }
}

io.on('connection', (socket: GameSocket) => {
  socket.on('room:create', (payload, callback) => {
    const reply = acknowledgement(callback);
    try {
      const code = createCode();
      const mode = cleanMode(payload?.mode);
      const name = cleanName(payload?.name);
      let room: Room;
      let result: JoinResult;

      if (mode === 'storyteller') {
        const hostId = randomUUID();
        const reconnectToken = randomBytes(32).toString('hex');
        room = {
          state: createGameState(code, hostId, 'storyteller'),
          reconnectTokens: new Map([[hostId, reconnectToken]]),
          lastActivity: Date.now(),
          storytellerSocketId: socket.id,
        };
        attachSocket(socket, code, hostId);
        result = { playerId: hostId, reconnectToken, mode };
      } else {
        room = {
          state: createGameState(code, '', 'automated'),
          reconnectTokens: new Map(),
          lastActivity: Date.now(),
        };
        result = addPlayer(room, name, socket);
        room.state.hostId = result.playerId;
      }

      rooms.set(code, room);
      broadcast(room);
      reply({ ok: true, data: { ...result, code } });
    } catch (error) {
      reply({ ok: false, error: error instanceof Error ? error.message : 'Could not create the room.' });
    }
  });

  socket.on('room:join', (payload, callback) => {
    const reply = acknowledgement(callback);
    try {
      const code = cleanCode(payload?.code);
      const room = rooms.get(code);
      if (!room) throw new Error('No room exists with that code.');
      const result = addPlayer(room, cleanName(payload?.name), socket);
      broadcast(room);
      reply({ ok: true, data: { ...result, code } });
    } catch (error) {
      reply({ ok: false, error: error instanceof Error ? error.message : 'Could not join the room.' });
    }
  });

  socket.on('room:rejoin', (payload, callback) => {
    const reply = acknowledgement(callback);
    try {
      const code = cleanCode(payload?.code);
      const playerId = payload?.playerId;
      const reconnectToken = payload?.reconnectToken;
      const room = rooms.get(code);
      if (!room || room.reconnectTokens.get(playerId) !== reconnectToken) throw new Error('Your saved session could not be found.');
      if (room.state.mode === 'storyteller' && room.state.storytellerId === playerId) {
        room.storytellerSocketId = socket.id;
        attachSocket(socket, code, playerId);
        broadcast(room);
        reply({ ok: true, data: { code, playerId, reconnectToken, mode: room.state.mode } });
        return;
      }
      const player = room.state.players.find((candidate) => candidate.id === playerId);
      if (!player) throw new Error('Your saved player could not be found.');
      player.socketId = socket.id;
      player.connected = true;
      attachSocket(socket, code, playerId);
      broadcast(room);
      reply({ ok: true, data: { code, playerId, reconnectToken, mode: room.state.mode } });
    } catch (error) {
      reply({ ok: false, error: error instanceof Error ? error.message : 'Could not reconnect.' });
    }
  });

  socket.on('game:start', (callback) => {
    respondHost(socket, callback, ({ room, playerId }) => startGame(room.state, playerId, Math.random));
  });

  socket.on('game:restart', (callback) => {
    respondHost(socket, callback, ({ room, playerId }) => restartGame(room.state, playerId, Math.random));
  });

  socket.on('player:ready', (callback) => {
    respond(socket, callback, ({ room, playerId }) => markReady(room.state, playerId, Math.random));
  });

  socket.on('night:act', (payload, callback) => {
    respond(socket, callback, ({ room, playerId }) => {
      if (room.state.mode === 'storyteller') {
        submitNarratorAction(room.state, playerId, payload?.targetIds, payload?.note ?? '', Math.random);
      } else {
        submitNightAction(room.state, playerId, payload?.targetIds, Math.random);
      }
    });
  });

  socket.on('storyteller:update-setup', (payload, callback) => {
    respondHost(socket, callback, ({ room }) => {
      setNarratorSetup(room.state, { roles: payload?.roles ?? [], bluffs: payload?.bluffs ?? [] });
    });
  });

  socket.on('storyteller:reroll', (callback) => {
    respondHost(socket, callback, ({ room }) => rerollNarratorSetup(room.state, Math.random));
  });

  socket.on('storyteller:mark-visit', (payload, callback) => {
    respondHost(socket, callback, ({ room }) => markNarratorVisit(room.state, payload?.playerId, Boolean(payload?.done)));
  });

  socket.on('storyteller:all-visited', (payload, callback) => {
    respondHost(socket, callback, ({ room }) => setNarratorAllVisited(room.state, Boolean(payload?.allVisited)));
  });

  socket.on('storyteller:finish-pause', (callback) => {
    respondHost(socket, callback, ({ room }) => finishNarratorPause(room.state, Math.random));
  });

  socket.on('nomination:act', (payload, callback) => {
    respond(socket, callback, ({ room, playerId }) => actOnNomination(room.state, playerId, payload?.targetId ?? null, Math.random));
  });

  socket.on('vote:cast', (payload, callback) => {
    respond(socket, callback, ({ room, playerId }) => castVote(room.state, playerId, payload?.vote, Math.random));
  });

  socket.on('hunter:shoot', (payload, callback) => {
    respond(socket, callback, ({ room, playerId }) => hunterShoot(room.state, playerId, payload?.targetId, Math.random));
  });

  socket.on('host:kick', (payload, callback) => {
    respondHost(socket, callback, ({ room, playerId }) => {
      if (room.state.phase !== 'lobby') throw new Error('Players can only be removed before the game begins.');
      const target = room.state.players.find((player) => player.id === payload?.playerId);
      if (!target) throw new Error('That player is no longer in the room.');
      if (target.id === playerId) throw new Error('You cannot remove yourself.');
      const kickedSocketId = target.socketId;
      room.state.players = room.state.players.filter((player) => player.id !== target.id);
      delete room.state.privateInfo[target.id];
      room.reconnectTokens.delete(target.id);
      syncNarratorSetup(room.state, Math.random);

      if (kickedSocketId) {
        io.to(kickedSocketId).emit('room:closed', 'The host removed you from the room.');
        const kickedSocket = io.sockets.sockets.get(kickedSocketId);
        if (kickedSocket) {
          kickedSocket.data.code = undefined;
          kickedSocket.data.playerId = undefined;
          void kickedSocket.leave(room.state.code);
        }
      }
    });
  });

  socket.on('room:leave', (callback) => {
    const reply = acknowledgement(callback);
    const { code, playerId } = socket.data;
    try {
      if (!code || !playerId) {
        reply({ ok: true });
        return;
      }
      const room = rooms.get(code);
      if (!room) throw new Error('This room no longer exists.');

      const isStoryteller = room.state.mode === 'storyteller' && room.state.storytellerId === playerId;
      if (isStoryteller) {
        if (room.storytellerSocketId !== socket.id) throw new Error('Your Storyteller session is no longer active.');
        room.reconnectTokens.delete(playerId);
        room.storytellerSocketId = undefined;
        for (const player of room.state.players) {
          player.connected = false;
          player.socketId = undefined;
        }
        rooms.delete(code);
        io.to(code).emit('room:closed', 'The Storyteller left and closed the room.');
        io.in(code).socketsLeave(code);
      } else {
        const player = room.state.players.find((candidate) => candidate.id === playerId);
        if (!player || player.socketId !== socket.id) throw new Error('Your player session is no longer active.');
        player.connected = false;
        player.socketId = undefined;
        room.reconnectTokens.delete(playerId);

        if (room.state.phase === 'lobby') {
          room.state.players = room.state.players.filter((candidate) => candidate.id !== playerId);
          delete room.state.privateInfo[playerId];
          if (room.state.mode === 'automated' && room.state.hostId === playerId) {
            room.state.hostId = room.state.players.find((candidate) => candidate.connected)?.id ?? '';
          }
          syncNarratorSetup(room.state, Math.random);
          if (room.state.players.length === 0 && !room.storytellerSocketId) rooms.delete(code);
        } else {
          if (room.state.mode === 'automated' && room.state.hostId === playerId) {
            room.state.hostId = room.state.players.find((candidate) => candidate.connected)?.id ?? playerId;
          }
          if (room.state.phase !== 'gameOver') {
            handlePlayerDeparture(room.state, playerId, Math.random);
            if (!room.state.winner) {
              reconcileAfterDisconnect(room.state, playerId, Math.random);
            }
          }
        }
        if (rooms.has(code)) broadcast(room);
      }

      socket.data.code = undefined;
      socket.data.playerId = undefined;
      void socket.leave(code);
      reply({ ok: true });
    } catch (error) {
      reply({ ok: false, error: error instanceof Error ? error.message : 'Could not leave the room.' });
    }
  });

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return;
    const room = rooms.get(code);
    const player = room?.state.players.find((candidate) => candidate.id === playerId);
    if (room && room.state.mode === 'storyteller' && room.state.storytellerId === playerId) {
      if (room.storytellerSocketId === socket.id) room.storytellerSocketId = undefined;
      return;
    }
    if (room && player?.socketId === socket.id) {
      player.connected = false;
      player.socketId = undefined;
      reconcileAfterDisconnect(room.state, playerId, Math.random);
      broadcast(room);
    }
  });
});

const clientPath = path.resolve('dist/client');
if (existsSync(clientPath)) {
  app.use(express.static(clientPath));
  app.get('*', (_request, response) => response.sendFile(path.join(clientPath, 'index.html')));
}

httpServer.listen(port, () => {
  console.log(`Hollowbrook server listening on http://localhost:${port}`);
});
