import { getPlayer, isAbilityWorking, livingPlayers, registersDemon, registersEvil } from './engineUtils.js';
import { addInfo, addLog, finishGame, killPlayer, nameList, pick, shuffle, type Random } from './engineUtils.js';
import { MINIONS, ROLE_LIST, ROLES, TOWNSFOLK } from './roles.js';
import { STATEMENTS } from './statements.js';
import type { GameState, NightPrompt, Player, RoleId } from './types.js';

export const FIRST_NIGHT_ORDER: RoleId[] = ['bog_witch', 'occultist', 'candlemaker', 'coven_cook', 'ghost_whisperer', 'oracle'];
export const OTHER_NIGHT_ORDER: RoleId[] = ['bog_witch', 'guardian', 'ghost_whisperer', 'oracle', 'gravedigger', 'headless_horseman'];

export function nightRoleOrder(night: number): RoleId[] {
  return night === 1 ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
}

export function beginNight(state: GameState, rng: Random): void {
  state.phase = 'night';
  state.night += 1;
  state.readyPlayerIds = [];
  state.poisonedPlayerId = null;
  state.protectedPlayerId = null;
  state.nightDeaths = [];
  state.nightActorId = null;
  state.nightIndex = 0;
  const order = state.night === 1 ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
  state.nightQueue = order
    .map((roleId) => state.players.find((player) => player.alive && player.roleId === roleId)?.id)
    .filter((playerId): playerId is string => Boolean(playerId));
  addLog(state, STATEMENTS.nightFalls(state.night), 'story', rng);
  advanceNight(state, rng);
}

export function getNightPrompt(state: GameState, playerId: string): NightPrompt | null {
  if (state.phase !== 'night' || state.nightActorId !== playerId) return null;
  return buildNightPrompt(state, getPlayer(state, playerId));
}

export function buildNightPrompt(state: GameState, player: Player): NightPrompt | null {
  if (!player.roleId) return null;
  const livingIds = livingPlayers(state).map((candidate) => candidate.id);

  switch (player.roleId) {
    case 'bog_witch':
      return {
        roleId: player.roleId,
        title: 'Brew a curse',
        description: 'Choose one living player to poison until the next night.',
        targetPlayerIds: livingIds,
        selectionCount: 1,
        confirmLabel: 'Poison player',
      };
    case 'guardian':
      return {
        roleId: player.roleId,
        title: 'Place your ward',
        description: 'Choose another living player to protect from the Demon tonight.',
        targetPlayerIds: livingIds.filter((id) => id !== player.id),
        selectionCount: 1,
        confirmLabel: 'Protect player',
      };
    case 'oracle':
      return {
        roleId: player.roleId,
        title: 'Consult the moon',
        description: 'Choose any two players. Learn whether either registers as the Demon.',
        targetPlayerIds: state.players.map((candidate) => candidate.id),
        selectionCount: 2,
        confirmLabel: 'Read the omen',
      };
    case 'headless_horseman':
      return {
        roleId: player.roleId,
        title: 'Ride through Hollowbrook',
        description: 'Choose a living player to kill. Choosing yourself passes the Demon role to a living Minion.',
        targetPlayerIds: livingIds,
        selectionCount: 1,
        confirmLabel: 'Claim a victim',
      };
    default:
      return null;
  }
}

export function submitNightAction(state: GameState, playerId: string, targetIds: string[], rng: Random): void {
  const prompt = getNightPrompt(state, playerId);
  if (!prompt) throw new Error('It is not your turn to act.');
  if (!Array.isArray(targetIds) || targetIds.length !== prompt.selectionCount || new Set(targetIds).size !== targetIds.length) {
    throw new Error(`Choose exactly ${prompt.selectionCount} ${prompt.selectionCount === 1 ? 'player' : 'players'}.`);
  }
  if (targetIds.some((id) => !prompt.targetPlayerIds.includes(id))) throw new Error('That target is not available.');

  const actor = getPlayer(state, playerId);
  if (actor.roleId === 'bog_witch') {
    state.poisonedPlayerId = targetIds[0];
  } else if (actor.roleId === 'guardian') {
    state.protectedPlayerId = isAbilityWorking(state, actor) ? targetIds[0] : null;
  } else if (actor.roleId === 'oracle') {
    resolveOracle(state, actor, targetIds, rng);
  } else if (actor.roleId === 'headless_horseman') {
    resolveDemon(state, actor, targetIds[0], rng);
  }

  state.nightActorId = null;
  state.nightIndex += 1;
  if (state.phase !== 'gameOver') advanceNight(state, rng);
}

export function skipDisconnectedNightAction(state: GameState, playerId: string, rng: Random): void {
  if (state.phase !== 'night' || state.nightActorId !== playerId) return;
  state.nightActorId = null;
  state.nightIndex += 1;
  advanceNight(state, rng);
}

function advanceNight(state: GameState, rng: Random): void {
  while (state.nightIndex < state.nightQueue.length) {
    const playerId = state.nightQueue[state.nightIndex];
    const player = getPlayer(state, playerId);
    if (!player.alive || !player.connected || !player.roleId) {
      state.nightIndex += 1;
      continue;
    }

    if (['occultist', 'candlemaker', 'coven_cook', 'ghost_whisperer', 'gravedigger'].includes(player.roleId)) {
      const shouldSkip = player.roleId === 'gravedigger' && !state.lastExecutedPlayerId;
      if (!shouldSkip) resolveAutomaticInfo(state, player, rng);
      state.nightIndex += 1;
      continue;
    }

    state.nightActorId = playerId;
    if (getNightPrompt(state, playerId)) return;
    state.nightActorId = null;
    state.nightIndex += 1;
  }
  endNight(state, rng);
}

function resolveAutomaticInfo(state: GameState, player: Player, rng: Random): void {
  const poisoned = !isAbilityWorking(state, player);
  if (player.roleId === 'occultist') {
    const minions = state.players.filter((candidate) => candidate.roleId && ROLES[candidate.roleId].category === 'minion');
    const revealed = poisoned ? pick(state.players, rng) : pick(minions, rng);
    const role = poisoned ? pick(MINIONS, rng) : ROLES[revealed.roleId!];
    const other = pick(state.players.filter((candidate) => candidate.id !== revealed.id), rng);
    const [first, second] = shuffle([revealed, other], rng);
    addInfo(state, player.id, `${first.name} or ${second.name} is the ${role.name}.`, rng, { isFalse: poisoned });
    return;
  }

  if (player.roleId === 'candlemaker') {
    const townsfolk = state.players.filter((candidate) => candidate.roleId && ROLES[candidate.roleId].category === 'townsfolk');
    const revealed = poisoned ? pick(state.players, rng) : pick(townsfolk, rng);
    const role = poisoned ? pick(TOWNSFOLK, rng) : ROLES[revealed.roleId!];
    const other = pick(state.players.filter((candidate) => candidate.id !== revealed.id), rng);
    const [first, second] = shuffle([revealed, other], rng);
    addInfo(state, player.id, `${first.name} or ${second.name} is the ${role.name}.`, rng, { isFalse: poisoned });
    return;
  }

  if (player.roleId === 'coven_cook') {
    let pairs = 0;
    if (poisoned) {
      pairs = Math.floor(rng() * 3);
    } else {
      for (let index = 0; index < state.players.length; index += 1) {
        const current = state.players[index];
        const next = state.players[(index + 1) % state.players.length];
        if (registersEvil(state, current) && registersEvil(state, next)) pairs += 1;
      }
    }
    addInfo(state, player.id, `There ${pairs === 1 ? 'is' : 'are'} ${pairs} adjacent ${pairs === 1 ? 'pair' : 'pairs'} of evil players.`, rng, { isFalse: poisoned });
    return;
  }

  if (player.roleId === 'ghost_whisperer') {
    let evilCount = 0;
    if (poisoned) {
      evilCount = Math.floor(rng() * 3);
    } else {
      const living = livingPlayers(state);
      const index = living.findIndex((candidate) => candidate.id === player.id);
      const neighbors = [living[(index - 1 + living.length) % living.length], living[(index + 1) % living.length]];
      evilCount = neighbors.filter((neighbor) => registersEvil(state, neighbor)).length;
    }
    addInfo(state, player.id, `${evilCount} of your two nearest living neighbors ${evilCount === 1 ? 'is' : 'are'} evil.`, rng, { isFalse: poisoned });
    return;
  }

  if (player.roleId === 'gravedigger' && state.lastExecutedPlayerId) {
    const executed = getPlayer(state, state.lastExecutedPlayerId);
    const role = poisoned ? pick(ROLE_LIST, rng) : ROLES[executed.roleId!];
    addInfo(state, player.id, `${executed.name} was the ${role.name}.`, rng, { isFalse: poisoned });
  }
}

function resolveOracle(state: GameState, player: Player, targetIds: string[], rng: Random): void {
  const targets = targetIds.map((id) => getPlayer(state, id));
  const detected = isAbilityWorking(state, player)
    ? targets.some((target) => registersDemon(state, target) || target.id === state.redHerringId)
    : rng() < 0.5;
  const names = nameList(targets.map((target) => target.name));
  addInfo(
    state,
    player.id,
    detected ? `Yes — a Demon omen hangs over ${names}.` : `No — neither ${names} registers as the Demon.`,
    rng,
    { isFalse: !isAbilityWorking(state, player) },
  );
}

function resolveDemon(state: GameState, demon: Player, targetId: string, rng: Random): void {
  if (!isAbilityWorking(state, demon)) return;
  const target = getPlayer(state, targetId);
  if (state.protectedPlayerId === targetId) return;
  if (target.roleId === 'pumpkin_knight' && isAbilityWorking(state, target)) return;
  const cause = target.id === demon.id ? 'demonSelf' : 'demon';
  if (killPlayer(state, target.id, cause, rng)) state.nightDeaths.push(target.id);
}

function endNight(state: GameState, rng: Random): void {
  if (state.phase === 'gameOver') return;
  state.nightActorId = null;
  state.day += 1;
  const names = state.nightDeaths.map((id) => getPlayer(state, id).name);
  if (state.night === 1) {
    addLog(state, STATEMENTS.firstDawn, 'story', rng);
  } else if (names.length === 0) {
    addLog(state, STATEMENTS.quietDawn, 'story', rng);
  } else {
    addLog(state, STATEMENTS.deadlyDawn(nameList(names)), 'death', rng);
  }

  if (livingPlayers(state).length <= 2) {
    finishGame(state, 'evil', STATEMENTS.evilWins, rng);
    return;
  }
  state.phase = 'day';
  state.readyPlayerIds = [];
  addLog(state, STATEMENTS.discussion, 'system', rng);
}
