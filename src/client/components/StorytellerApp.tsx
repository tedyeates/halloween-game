import { useState } from 'react';
import { api } from '../api';
import { ROLE_LIST, ROLES, MINIONS, OUTSIDERS, TOWNSFOLK } from '../../shared/roles.js';
import { setupGuidance } from '../../shared/setup.js';
import type {
  ActionResult,
  RoleCategory,
  RoleId,
  StorytellerFactView,
  StorytellerState,
} from '../../shared/types.js';
import RoomCode from './RoomCode';

const categories: { id: RoleCategory; label: string }[] = [
  { id: 'townsfolk', label: 'Townsfolk' },
  { id: 'outsider', label: 'Outsiders' },
  { id: 'minion', label: 'Minion' },
  { id: 'demon', label: 'Demon' },
];

function phaseLabel(state: StorytellerState): string {
  if (state.phase === 'lobby') return 'Lobby';
  if (state.phase === 'roleReveal') return 'Role delivery';
  if (state.phase === 'night') return `Night ${state.night}`;
  if (state.phase === 'day' || state.phase === 'nominations') return `Day ${state.day}`;
  return state.winner === 'good' ? 'Good wins' : 'Evil wins';
}

export default function StorytellerApp({ state, onLeave }: { state: StorytellerState; onLeave: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true);
    setError('');
    const result = await action();
    if (!result.ok) setError(result.error);
    setBusy(false);
    return result.ok;
  }

  return (
    <main className="game page-shell storyteller-app">
      <header className="game-header">
        <div className="brand"><span className="brand-mark">☾</span><div><h1>Hollowbrook</h1><p>Storyteller table</p></div></div>
        <div className="header-actions">
          <span className="storyteller-badge">Storyteller</span>
          <span className={`phase-badge ${state.phase === 'night' ? 'night' : ''}`}>{phaseLabel(state)}</span>
          <RoomCode code={state.code} />
          <button className="leave-room-button" onClick={onLeave}>Leave</button>
        </div>
      </header>
      {error && <div className="game-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {state.phase === 'lobby'
        ? <StorytellerLobby state={state} run={run} busy={busy} />
        : <StorytellerTable state={state} run={run} busy={busy} />}
    </main>
  );
}

function StorytellerLobby({ state, run, busy }: { state: StorytellerState; run: (action: () => Promise<ActionResult>) => Promise<boolean>; busy: boolean }) {
  const setup = state.setup;
  const enoughPlayers = state.players.length >= 5 && state.players.length <= 8;
  const guidance = setup ? setupGuidance(setup) : [];

  function changeRole(oldRole: RoleId, newRole: RoleId) {
    if (!setup) return;
    const roles = setup.roles.map((roleId) => roleId === oldRole ? newRole : roleId);
    void run(() => api.updateSetup(roles, setup.bluffs));
  }

  function changeBluff(oldRole: RoleId, newRole: RoleId) {
    if (!setup) return;
    const bluffs = setup.bluffs.map((roleId) => roleId === oldRole ? newRole : roleId);
    void run(() => api.updateSetup(setup.roles, bluffs));
  }

  return (
    <div className="storyteller-lobby">
      <div className="storyteller-intro panel">
        <p className="eyebrow-text">The human Storyteller</p>
        <h2>Build tonight’s curse</h2>
        <p>You know every role, resolve every secret, and visit every player privately. The app keeps the rules, actions, and outcomes consistent while you handle the performance.</p>
        <div className="storyteller-code-row"><span>Invite 5–8 players with room code</span><RoomCode code={state.code} /></div>
      </div>

      <div className="storyteller-lobby-grid">
        <section className="panel st-player-panel">
          <div className="section-heading"><div><p className="eyebrow-text">The gathering</p><h2>Players</h2></div><span className="player-count">{state.players.length} / 8</span></div>
          <div className="st-player-list">
            {state.players.map((player, index) => (
              <div className="st-player-row" key={player.id}>
                <span className="avatar">{['🎃', '🦇', '🕯️', '🕸️', '🌙', '👻', '🍬', '⚰️'][index]}</span>
                <strong>{player.name}</strong>
                <small>{player.connected ? 'Ready' : 'Disconnected'}</small>
                <button className="kick-player-button" onClick={() => {
                  if (window.confirm(`Remove ${player.name} from the room?`)) void run(() => api.kickPlayer(player.id));
                }}>Remove</button>
              </div>
            ))}
          </div>
          {!enoughPlayers && <p className="form-hint">Waiting for at least {Math.max(0, 5 - state.players.length)} more {5 - state.players.length === 1 ? 'player' : 'players'}.</p>}
        </section>

        <section className="panel st-setup-panel">
          <div className="section-heading"><div><p className="eyebrow-text">Suggested by the app</p><h2>Role composition</h2></div><button className="secondary-button compact-button" onClick={() => void run(api.rerollSetup)} disabled={!enoughPlayers || busy}>Reroll</button></div>
          {!setup ? <p className="muted">A legal setup will appear once 5 players have joined.</p> : (
            <>
              <div className="setup-categories">
                {categories.map((category) => {
                  const selected = setup.roles.filter((roleId) => ROLES[roleId].category === category.id);
                  if (selected.length === 0) return null;
                  const pool = ROLE_LIST.filter((role) => role.category === category.id);
                  return (
                    <div className="setup-category" key={category.id}>
                      <h3>{category.label}</h3>
                      {selected.map((roleId) => (
                        <label className="setup-select" key={roleId}>
                          <span>{ROLES[roleId].icon} {ROLES[roleId].name}</span>
                          <select
                            value={roleId}
                            disabled={busy || category.id === 'demon' || (category.id === 'minion' && MINIONS.length === 1)}
                            onChange={(event) => changeRole(roleId, event.target.value as RoleId)}
                          >
                            {pool.filter((role) => role.id === roleId || (!setup.roles.includes(role.id) && !setup.bluffs.includes(role.id))).map((role) => (
                              <option key={role.id} value={role.id}>{role.name}</option>
                            ))}
                          </select>
                          <small>{ROLES[roleId].summary}</small>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="setup-bluffs">
                <h3>Demon bluffs</h3>
                <p>Three good roles not in play, shown to the Demon.</p>
                {setup.bluffs.map((bluff) => (
                  <label className="setup-select" key={bluff}>
                    <span>{ROLES[bluff].icon} {ROLES[bluff].name}</span>
                    <select value={bluff} disabled={busy} onChange={(event) => changeBluff(bluff, event.target.value as RoleId)}>
                      {[...TOWNSFOLK, ...OUTSIDERS].filter((role) => role.id === bluff || (!setup.roles.includes(role.id) && !setup.bluffs.includes(role.id))).map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="setup-guidance">
                <p className="eyebrow-text">Balance notes</p>
                {guidance.map((note) => <p key={note}>{note}</p>)}
              </div>
            </>
          )}
          <button className="primary-button full-width" disabled={!enoughPlayers || !setup || busy} onClick={() => void run(api.start)}>Approve setup & begin <span>→</span></button>
        </section>
      </div>
    </div>
  );
}

function StorytellerTable({ state, run, busy }: { state: StorytellerState; run: (action: () => Promise<ActionResult>) => Promise<boolean>; busy: boolean }) {
  const pause = state.pause;
  const canRestart = state.phase === 'gameOver';
  return (
    <>
      {canRestart && (
        <section className={`game-over-banner ${state.winner}`}>
          <span className="game-over-icon">{state.winner === 'good' ? '☀️' : '🌑'}</span>
          <div><p className="eyebrow-text">The tale is ended</p><h2>{state.winner === 'good' ? 'Good saves Hollowbrook' : 'Evil claims Hollowbrook'}</h2><p>{state.endReason}</p></div>
          <button className="primary-button" disabled={busy} onClick={() => void run(api.restart)}>Play again <span>↻</span></button>
        </section>
      )}

      <div className="storyteller-table-grid">
        <div className="main-column">
          {pause ? <StorytellerPausePanel state={state} pause={pause} run={run} busy={busy} /> : (
            <section className="panel st-day-panel">
              <p className="eyebrow-text">{state.phase === 'nominations' ? 'The app is running the vote' : 'The town is talking'}</p>
              <h2>{state.phase === 'nominations' ? 'Listen. Do not steer the vote.' : 'Daytime in Hollowbrook'}</h2>
              <p>Players manage readiness, nominations, secret ballots, and executions on their own screens. Keep the grimoire open and narrate only public outcomes.</p>
              {state.activeVote && (
                <div className="st-vote-status">
                  <span>Voting on <strong>{state.activeVote.nomineeName}</strong></span>
                  <span>{state.activeVote.votesSubmitted} / {state.activeVote.eligibleCount} submitted</span>
                </div>
              )}
              <div className="waiting-host"><span className="pulse-dot" /> Waiting for the players.</div>
            </section>
          )}
          <PublicChronicle state={state} />
        </div>
        <aside className="side-column">
          <Grimoire state={state} />
        </aside>
      </div>
    </>
  );
}

function StorytellerPausePanel({
  state,
  pause,
  run,
  busy,
}: {
  state: StorytellerState;
  pause: NonNullable<StorytellerState['pause']>;
  run: (action: () => Promise<ActionResult>) => Promise<boolean>;
  busy: boolean;
}) {
  const factsByPlayer = new Map<string, StorytellerFactView[]>();
  for (const fact of pause.facts) {
    const facts = factsByPlayer.get(fact.playerId) ?? [];
    facts.push(fact);
    factsByPlayer.set(fact.playerId, facts);
  }
  const completedVisits = pause.visits.filter((visit) => visit.done).length;
  const pendingActions = pause.actions.filter((action) => !action.submitted).length;
  const title = pause.kind === 'roles' ? 'Private role delivery' : `Night ${state.night} · private visits`;
  return (
    <section className="panel st-pause-panel">
      <div className="st-pause-heading">
        <div><p className="eyebrow-text">Storyteller pause</p><h2>{title}</h2></div>
        <span className="pause-counter">{completedVisits} / {pause.visits.length} required visits</span>
      </div>
      <p className="st-instructions">
        Visit <strong>every player</strong> so nobody can infer who has a role. Only required conversations are tracked below.
        Move through the breakout rooms, then mark each conversation complete.
      </p>

      {pause.actions.length > 0 && (
        <div className="st-section">
          <h3>Secret actions</h3>
          <div className="st-action-list">
            {pause.actions.map((action) => (
              <article className={action.submitted ? 'submitted' : ''} key={action.playerId}>
                <div><strong>{action.playerName}</strong><span>{action.roleName}</span></div>
                <p>{action.title}</p>
                {action.submitted ? (
                  <>
                    <small>Chose: {action.targetNames.join(' and ')}</small>
                    {action.note && <blockquote>“{action.note}”</blockquote>}
                  </>
                ) : <small>Waiting for their choice to arrive.</small>}
              </article>
            ))}
          </div>
          {pendingActions > 0 && <p className="form-hint">{pendingActions} secret {pendingActions === 1 ? 'action is' : 'actions are'} still being chosen.</p>}
        </div>
      )}

      {pause.publicSummary.length > 0 && (
        <div className="st-section public-briefing">
          <h3>Public facts to announce</h3>
          {pause.publicSummary.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
        </div>
      )}

      <div className="st-section">
        <h3>Required visits</h3>
        {pause.visits.length === 0 ? <p className="muted">No required private conversations this pause. Still visit everyone before continuing.</p> : (
          <div className="visit-list">
            {pause.visits.map((visit) => {
              const facts = factsByPlayer.get(visit.playerId) ?? [];
              return (
                <article className={`visit-card ${visit.done ? 'done' : ''}`} key={visit.playerId}>
                  <label className="visit-check">
                    <input type="checkbox" checked={visit.done} disabled={busy} onChange={(event) => void run(() => api.markVisit(visit.playerId, event.target.checked))} />
                    <span>
                      <strong>{visit.playerName}</strong>
                      <small>{visit.roleName}</small>
                    </span>
                  </label>
                  <div className="visit-reasons">
                    {visit.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                    {facts.map((fact) => (
                      <div className={`fact-card ${fact.isFalse ? 'false' : ''}`} key={fact.id}>
                        <span>{fact.isFalse ? 'Poisoned information' : 'Secret information'}</span>
                        <p><strong>Fact:</strong> {fact.text}</p>
                        <small>{fact.hint}</small>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <label className="all-visited-check">
        <input type="checkbox" checked={pause.allVisited} disabled={busy} onChange={(event) => void run(() => api.allVisited(event.target.checked))} />
        I have visited every player, including those not on this list.
      </label>
      <button className="primary-button full-width" disabled={!pause.canFinish || busy} onClick={() => void run(api.finishPause)}>
        {pause.kind === 'roles' ? 'Begin the first night' : pause.resolved ? 'Announce dawn & continue' : 'Waiting for all secret actions…'}
        <span>→</span>
      </button>
    </section>
  );
}

function Grimoire({ state }: { state: StorytellerState }) {
  return (
    <section className="panel grimoire">
      <div className="section-heading"><div><p className="eyebrow-text">For your eyes only</p><h2>Grimoire</h2></div><span aria-hidden="true">🔒</span></div>
      <div className="grimoire-list">
        {state.players.map((player) => {
          const role = player.roleId ? ROLES[player.roleId] : null;
          return (
            <article className={`grimoire-player ${!player.alive ? 'dead' : ''}`} key={player.id}>
              <span className="grimoire-icon">{role?.icon ?? '·'}</span>
              <div><strong>{player.name}</strong><small>{role?.name ?? 'Awaiting role'} · {player.alive ? 'Alive' : 'Dead'}{!player.alive && !player.ghostVoteUsed ? ' · Ghost vote' : ''}</small></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PublicChronicle({ state }: { state: StorytellerState }) {
  return (
    <section className="panel chronicle-panel st-chronicle">
      <div className="section-heading"><div><p className="eyebrow-text">The town crier</p><h2>Public chronicle</h2></div><span className="automated-badge">Shared with players</span></div>
      <div className="public-log">
        {[...state.log].reverse().map((entry) => (
          <article className={entry.kind} key={entry.id}><span className="log-marker">{entry.kind === 'death' ? '†' : entry.kind === 'vote' ? '◆' : '☾'}</span><p>{entry.text}</p></article>
        ))}
      </div>
    </section>
  );
}
