import { useState } from 'react';
import { api } from '../api';
import { ROLES } from '../../shared/roles.js';
import type { ActionResult, ClientPlayer, ClientState } from '../../shared/types.js';
import ActionPanel from './ActionPanel';
import Lobby from './Lobby';
import RoleCard from './RoleCard';
import RoomCode from './RoomCode';
import Script from './Script';

const avatars = ['🎃', '🦇', '🕯️', '🕸️', '🌙', '👻', '🍬', '⚰️'];

function phaseLabel(state: ClientState): string {
  if (state.phase === 'lobby') return 'Gathering';
  if (state.phase === 'roleReveal') return 'Role reveal';
  if (state.phase === 'night') return `Night ${state.night}`;
  if (state.phase === 'day' || state.phase === 'nominations') return `Day ${state.day}`;
  return state.winner === 'good' ? 'Good wins' : 'Evil wins';
}

interface NeighbourView {
  previous: ClientPlayer | null;
  next: ClientPlayer | null;
  title: string;
  hint: string;
}

function getNeighbours(state: ClientState): NeighbourView {
  const selfIndex = state.players.findIndex((player) => player.id === state.selfId);
  if (selfIndex === -1 || state.players.length < 2) {
    return { previous: null, next: null, title: 'Your living neighbours', hint: 'Neighbours will appear once the game begins.' };
  }

  let previous: ClientPlayer | null = null;
  let next: ClientPlayer | null = null;
  for (let distance = 1; distance < state.players.length; distance += 1) {
    const before = state.players[(selfIndex - distance + state.players.length) % state.players.length];
    const after = state.players[(selfIndex + distance) % state.players.length];
    if (!previous && before.alive) previous = before;
    if (!next && after.alive) next = after;
    if (previous && next) break;
  }

  const selfAlive = state.players[selfIndex].alive;
  return {
    previous,
    next,
    title: 'Your nearest living neighbours',
    hint: state.selfRole?.id === 'ghost_whisperer'
      ? 'These are the living neighbours used by your Ghost Whisperer ability.'
      : selfAlive
        ? 'Dead players are skipped when finding the nearest living seats around you.'
        : 'Dead players are skipped when finding the nearest living seats around your old seat.',
  };
}

function NeighbourChip({ player, side }: { player: ClientPlayer | null; side: 'Previous' | 'Next' }) {
  if (!player) return <div className="neighbour-chip empty"><span>{side} living seat</span><strong>—</strong></div>;
  return (
    <div className="neighbour-chip">
      <span>{side} living seat</span>
      <strong>{player.name}</strong>
      <small>Alive</small>
    </div>
  );
}

export default function Game({ state }: { state: ClientState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const neighbours = getNeighbours(state);
  const neighbourIds = new Set([neighbours.previous?.id, neighbours.next?.id].filter((id): id is string => Boolean(id)));

  async function run(action: () => Promise<ActionResult>): Promise<boolean> {
    setBusy(true);
    setError('');
    const result = await action();
    if (!result.ok) setError(result.error);
    setBusy(false);
    return result.ok;
  }

  return (
    <main className={`game page-shell phase-${state.phase.toLowerCase()}`}>
      <header className="game-header">
        <div className="brand"><span className="brand-mark">☾</span><div><h1>Hollowbrook</h1><p>Tricks, trust & treachery</p></div></div>
        <div className="header-actions">
          {state.mode === 'storyteller' && <span className="storyteller-badge">Storyteller-led</span>}
          <span className={`phase-badge ${state.phase === 'night' ? 'night' : ''}`}>{phaseLabel(state)}</span>
          <RoomCode code={state.code} />
        </div>
      </header>

      {error && <div className="game-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {state.phase === 'gameOver' && (
        <section className={`game-over-banner ${state.winner}`}>
          <span className="game-over-icon">{state.winner === 'good' ? '☀️' : '🌑'}</span>
          <div><p className="eyebrow-text">The tale is ended</p><h2>{state.winner === 'good' ? 'Good saves Hollowbrook' : 'Evil claims Hollowbrook'}</h2><p>{state.endReason}</p></div>
          {state.hostId === state.selfId ? <button className="primary-button" disabled={busy} onClick={() => void run(api.restart)}>Play again <span>↻</span></button> : <span className="waiting-host">Waiting for the host…</span>}
        </section>
      )}

      {state.phase === 'lobby' ? <Lobby state={state} run={run} busy={busy} /> : (
        <>
          <div className="game-layout">
            <div className="main-column">
              <ActionPanel state={state} run={run} busy={busy} />
              <section className="panel town-panel">
                <div className="section-heading"><div><p className="eyebrow-text">The town</p><h2>Seats around the circle</h2></div><span className="living-count">{state.players.filter((player) => player.alive).length} alive</span></div>
                <div className={`neighbour-guide ${state.selfRole?.id === 'ghost_whisperer' || state.selfRole?.id === 'coven_cook' ? 'role-aware' : ''}`}>
                  <div className="neighbour-copy">
                    <p className="eyebrow-text">Seating sight</p>
                    <strong>{neighbours.title}</strong>
                    <small>{neighbours.hint}</small>
                  </div>
                  <div className="neighbour-line" aria-label={neighbours.title}>
                    <NeighbourChip player={neighbours.previous} side="Previous" />
                    <div className="neighbour-self"><span>You</span><strong>{state.players.find((player) => player.id === state.selfId)?.name}</strong></div>
                    <NeighbourChip player={neighbours.next} side="Next" />
                  </div>
                </div>
                <div className="town-grid">
                  {state.players.map((player, index) => {
                    const revealed = state.revealedRoles?.[player.id];
                    const isNeighbour = neighbourIds.has(player.id);
                    return (
                      <article className={`seat ${!player.alive ? 'dead' : ''} ${player.id === state.selfId ? 'you' : ''} ${isNeighbour ? 'neighbour' : ''}`} key={player.id}>
                        <span className="seat-number">Seat {index + 1}</span>
                        <div className="seat-avatar"><span>{revealed ? ROLES[revealed].icon : avatars[index]}</span>{!player.alive && <i>†</i>}{!player.connected && <b title="Disconnected">●</b>}</div>
                        <h3>{player.name}</h3>
                        <p>{player.id === state.selfId ? 'You' : player.id === state.hostId ? 'Host' : '\u00a0'}</p>
                        {revealed && <div className="revealed-role">{ROLES[revealed].name}</div>}
                        <div className="seat-tags">{isNeighbour && <span className="neighbour-tag">Neighbour</span>}{!player.alive && <span>Dead</span>}{!player.alive && !player.ghostVoteUsed && <span className="ghost">Ghost vote</span>}</div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
            <aside className="side-column">
              {state.selfRole && <RoleCard role={state.selfRole} />}
              {state.mode !== 'storyteller' && (
                <section className="panel private-panel">
                  <div className="section-heading"><div><p className="eyebrow-text">For your eyes only</p><h2>Private whispers</h2></div><span aria-hidden="true">🔒</span></div>
                  <div className="private-log">
                    {state.privateInfo.length === 0 ? <p className="empty-log">No secret information yet. Keep your role hidden.</p> : [...state.privateInfo].reverse().map((info) => (
                      <article key={info.id}><span>{info.night ? `Night ${info.night}` : `Day ${info.day}`}</span><p>{info.text}</p></article>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>
          <section className="panel chronicle-panel">
            <div className="section-heading"><div><p className="eyebrow-text">The town crier</p><h2>Public chronicle</h2></div><span className="automated-badge">Automated narration</span></div>
            <div className="public-log">
              {[...state.log].reverse().map((entry) => <article className={entry.kind} key={entry.id}><span className="log-marker">{entry.kind === 'death' ? '†' : entry.kind === 'vote' ? '◆' : '☾'}</span><p>{entry.text}</p></article>)}
            </div>
          </section>
          <Script />
        </>
      )}
    </main>
  );
}
