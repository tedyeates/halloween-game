import { api } from '../api';
import type { ActionResult, ClientState } from '../../shared/types.js';
import Script from './Script';

interface LobbyProps {
  state: ClientState;
  run: (action: () => Promise<ActionResult>) => Promise<boolean>;
  busy: boolean;
}

const avatars = ['🎃', '🦇', '🕯️', '🕸️', '🌙', '👻', '🍬', '⚰️'];

export default function Lobby({ state, run, busy }: LobbyProps) {
  const isHost = state.hostId === state.selfId;
  const enoughPlayers = state.players.length >= 5 && state.players.length <= 8;
  return (
    <div className="lobby-layout">
      <section className="panel gathering-panel">
        <div className="section-heading"><div><p className="eyebrow-text">{state.mode === 'storyteller' ? 'Storyteller-led gathering' : 'The gathering'}</p><h2>Waiting at the village gates</h2></div><span className="player-count">{state.players.length} / 8</span></div>
        <p className="muted">Share the room code above. Each player should join on a separate device.</p>
        <div className="lobby-players">
          {state.players.map((player, index) => (
            <div className="lobby-player" key={player.id}>
              <span className="avatar">{avatars[index]}</span>
              <div><strong>{player.name}</strong><small>{player.id === state.selfId ? 'You' : player.connected ? 'Ready to play' : 'Disconnected'}</small></div>
              {player.id === state.hostId && <span className="host-badge">Host</span>}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 5 - state.players.length) }).map((_, index) => (
            <div className="lobby-player empty" key={`empty-${index}`}><span className="avatar">＋</span><div><strong>Waiting for a player</strong><small>Share the room code</small></div></div>
          ))}
        </div>
        {isHost ? (
          <>
            <button className="primary-button full-width" onClick={() => void run(api.start)} disabled={!enoughPlayers || busy}>Begin the first night <span>→</span></button>
            {!enoughPlayers && <p className="form-hint">At least {5 - state.players.length} more {5 - state.players.length === 1 ? 'player' : 'players'} needed.</p>}
          </>
        ) : <div className="waiting-host"><span className="pulse-dot" /> Waiting for the {state.mode === 'storyteller' ? 'Storyteller' : 'host'} to begin…</div>}
      </section>
      <aside className="panel lobby-briefing">
        <p className="eyebrow-text">Before the candles go out</p><h2>How the night works</h2>
        <ol>
          <li><span>01</span><p><strong>Keep your role secret.</strong> Evil learns its allies; good receives clues.</p></li>
          <li><span>02</span><p><strong>Follow private prompts.</strong> The app resolves abilities in the correct order.</p></li>
          <li><span>03</span><p><strong>Find the Demon.</strong> Good wins by killing it. Evil wins when two remain.</p></li>
        </ol>
        <div className="rule-note"><span>👻</span><p>Death is not the end. Dead players can still speak and hold one final ghost vote.</p></div>
      </aside>
      <Script />
    </div>
  );
}
