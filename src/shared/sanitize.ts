import { getNightPrompt } from './night.js';
import { narratorPauseCanFinish } from './narrator.js';
import { ROLES } from './roles.js';
import type {
  ClientState,
  EvilTeamView,
  GameState,
  NarratorPlayerView,
  RoleId,
  StorytellerState,
} from './types.js';

export function stateForPlayer(state: GameState, playerId: string): ClientState {
  const ballot = state.activeVote;
  const revealedRoles: Record<string, RoleId> | null = state.phase === 'gameOver'
    ? Object.fromEntries(state.players.map((player) => [player.id, player.roleId!]))
    : null;
  const player = state.players.find((candidate) => candidate.id === playerId);
  const isStorytellerMode = state.mode === 'storyteller';
  const roleDelivered = !isStorytellerMode || state.roleDeliveredIds.includes(playerId);
  const selfRole = roleDelivered ? player?.roleId : undefined;
  let evilTeam: EvilTeamView | null = null;

  if (selfRole && ROLES[selfRole].team === 'evil') {
    const evilPlayers = state.players.filter((candidate) => candidate.roleId && ROLES[candidate.roleId].category !== 'townsfolk' && ROLES[candidate.roleId].category !== 'outsider');
    const demon = evilPlayers.find((candidate) => candidate.alive && candidate.roleId === 'headless_horseman')
      ?? evilPlayers.find((candidate) => candidate.roleId === 'headless_horseman');
    evilTeam = {
      demon: demon?.roleId ? { id: demon.id, name: demon.name, roleId: demon.roleId, alive: demon.alive } : null,
      minions: evilPlayers
        .filter((candidate) => candidate.roleId && ROLES[candidate.roleId].category === 'minion')
        .map((minion) => ({ id: minion.id, name: minion.name, roleId: minion.roleId!, alive: minion.alive })),
    };
  }

  let narrator: NarratorPlayerView | null = null;

  if (isStorytellerMode && state.narrator) {
    const action = state.narrator.kind === 'night'
      ? state.narrator.actions.find((candidate) => candidate.playerId === playerId)
      : undefined;
    narrator = {
      pause: state.narrator.kind,
      roleDelivered,
      action: action && player?.roleId
        ? {
            roleId: player.roleId,
            title: action.title,
            description: action.description,
            targetPlayerIds: action.targetPlayerIds,
            selectionCount: action.selectionCount,
            confirmLabel: 'Send to Storyteller',
            selectedTargetIds: action.targetIds,
          }
        : null,
      actionSubmitted: action?.submitted ?? false,
      actionNote: action?.note ?? '',
    };
  }

  return {
    code: state.code,
    hostId: state.hostId,
    mode: state.mode,
    storytellerId: state.storytellerId,
    phase: state.phase,
    players: state.players.map(({ id, name, alive, connected, ghostVoteUsed, abilityUsed }) => ({
      id,
      name,
      alive,
      connected,
      ghostVoteUsed,
      abilityUsed,
    })),
    day: state.day,
    night: state.night,
    log: state.log,
    selfId: playerId,
    selfRole: selfRole ? ROLES[selfRole] : null,
    evilTeam,
    narrator,
    privateInfo: isStorytellerMode ? [] : state.privateInfo[playerId] ?? [],
    readyPlayerIds: state.readyPlayerIds,
    prompt: isStorytellerMode ? null : getNightPrompt(state, playerId),
    currentNominatorId: state.phase === 'nominations' && !state.activeVote
      ? state.nominationOrder[state.nominationIndex] ?? null
      : null,
    nominatedToday: state.nominatedToday,
    activeVote: ballot
      ? {
          nomineeId: ballot.nomineeId,
          nominatorId: ballot.nominatorId,
          votesSubmitted: Object.keys(ballot.votes).length,
          eligibleCount: ballot.eligibleVoterIds.length,
          canVote: ballot.eligibleVoterIds.includes(playerId) && ballot.votes[playerId] === undefined,
          yourVote: ballot.votes[playerId] ?? null,
        }
      : null,
    voteHistory: state.voteHistory,
    onBlock: state.onBlock,
    winner: state.winner,
    endReason: state.endReason,
    revealedRoles,
  };
}

export function stateForStoryteller(state: GameState): StorytellerState {
  const nameOf = (playerId: string) => state.players.find((player) => player.id === playerId)?.name ?? 'Unknown';
  const roleNameOf = (playerId: string) => {
    const roleId = state.players.find((player) => player.id === playerId)?.roleId;
    return roleId ? ROLES[roleId].name : 'Awaiting role';
  };
  const pause = state.narrator;
  const pending = pause?.pending;
  return {
    code: state.code,
    phase: state.phase,
    day: state.day,
    night: state.night,
    players: state.players.map(({ id, name, alive, connected, ghostVoteUsed, roleId }) => ({
      id,
      name,
      alive,
      connected,
      ghostVoteUsed,
      roleId,
    })),
    setup: state.setup,
    pause: pause
      ? {
          kind: pause.kind,
          visits: pause.visits.map((visit) => ({
            playerId: visit.playerId,
            playerName: nameOf(visit.playerId),
            roleName: roleNameOf(visit.playerId),
            reasons: visit.reasons,
            done: visit.done,
          })),
          actions: pause.actions.map((action) => ({
            playerId: action.playerId,
            playerName: nameOf(action.playerId),
            roleName: roleNameOf(action.playerId),
            title: action.title,
            targetNames: action.targetIds.map(nameOf),
            note: action.note,
            submitted: action.submitted,
          })),
          facts: pause.facts.map((fact) => ({
            id: fact.id,
            playerId: fact.playerId,
            playerName: nameOf(fact.playerId),
            text: fact.text,
            hint: fact.hint,
            isFalse: fact.isFalse,
          })),
          allVisited: pause.allVisited,
          resolved: pause.resolved,
          publicSummary: pending?.publicSummary ?? [],
          canFinish: narratorPauseCanFinish(state),
        }
      : null,
    log: state.log,
    winner: state.winner,
    endReason: state.endReason,
    activeVote: state.activeVote
      ? {
          nomineeName: nameOf(state.activeVote.nomineeId),
          votesSubmitted: Object.keys(state.activeVote.votes).length,
          eligibleCount: state.activeVote.eligibleVoterIds.length,
        }
      : null,
  };
}
