import { io } from 'socket.io-client';
import type { ActionResult, GameMode, JoinResult, RoleId } from '../shared/types.js';

export const socket = io();

function request<T>(emit: (callback: (result: ActionResult<T>) => void) => void): Promise<ActionResult<T>> {
  return new Promise((resolve) => emit(resolve));
}

export interface SavedSession extends JoinResult {
  code: string;
}

export const api = {
  createRoom: (name: string, mode: GameMode) => request<SavedSession>((callback) => socket.emit('room:create', { name, mode }, callback)),
  joinRoom: (name: string, code: string) => request<SavedSession>((callback) => socket.emit('room:join', { name, code }, callback)),
  rejoin: (session: SavedSession) => request<SavedSession>((callback) => socket.emit('room:rejoin', session, callback)),
  leaveRoom: () => request((callback) => socket.emit('room:leave', callback)),
  kickPlayer: (playerId: string) => request((callback) => socket.emit('host:kick', { playerId }, callback)),
  start: () => request((callback) => socket.emit('game:start', callback)),
  restart: () => request((callback) => socket.emit('game:restart', callback)),
  ready: () => request((callback) => socket.emit('player:ready', callback)),
  nightAct: (targetIds: string[], note?: string) => request((callback) => socket.emit('night:act', { targetIds, note }, callback)),
  nominate: (targetId: string | null) => request((callback) => socket.emit('nomination:act', { targetId }, callback)),
  vote: (vote: boolean) => request((callback) => socket.emit('vote:cast', { vote }, callback)),
  hunterShoot: (targetId: string) => request((callback) => socket.emit('hunter:shoot', { targetId }, callback)),
  updateSetup: (roles: RoleId[], bluffs: RoleId[]) => request((callback) => socket.emit('storyteller:update-setup', { roles, bluffs }, callback)),
  rerollSetup: () => request((callback) => socket.emit('storyteller:reroll', callback)),
  markVisit: (playerId: string, done: boolean) => request((callback) => socket.emit('storyteller:mark-visit', { playerId, done }, callback)),
  allVisited: (allVisited: boolean) => request((callback) => socket.emit('storyteller:all-visited', { allVisited }, callback)),
  finishPause: () => request((callback) => socket.emit('storyteller:finish-pause', callback)),
};
