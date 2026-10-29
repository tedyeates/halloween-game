import { useEffect, useRef, useState } from 'react';
import { api, socket, type SavedSession } from './api';
import Landing from './components/Landing';
import Game from './components/Game';
import StorytellerApp from './components/StorytellerApp';
import type { ClientState, GameMode, StorytellerState } from '../shared/types.js';

const SESSION_KEY = 'hollowbrook:session';
const isTestMode = new URLSearchParams(window.location.search).get('test') === '1';
const sessionStore = (() => {
  try {
    return isTestMode ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
})();

function loadSession(): SavedSession | null {
  try {
    const value = sessionStore?.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as SavedSession : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [state, setState] = useState<ClientState | null>(null);
  const [storytellerState, setStorytellerState] = useState<StorytellerState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const session = useRef<SavedSession | null>(loadSession());

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (session.current) {
        void api.rejoin(session.current).then((result) => {
          if (!result.ok) {
            sessionStore?.removeItem(SESSION_KEY);
            session.current = null;
            setState(null);
            setStorytellerState(null);
            setError('Your previous room has expired. Create or join a new room.');
          }
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onState = (nextState: ClientState) => {
      setStorytellerState(null);
      setState(nextState);
    };
    const onStorytellerState = (nextState: StorytellerState) => {
      setState(null);
      setStorytellerState(nextState);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state:update', onState);
    socket.on('storyteller:update', onStorytellerState);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state:update', onState);
      socket.off('storyteller:update', onStorytellerState);
    };
  }, []);

  async function enterRoom(mode: 'create' | 'join', name: string, code?: string, gameMode: GameMode = 'automated') {
    setBusy(true);
    setError('');
    setStorytellerState(null);
    const result = mode === 'create' ? await api.createRoom(name, gameMode) : await api.joinRoom(name, code ?? '');
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    session.current = result.data;
    sessionStore?.setItem(SESSION_KEY, JSON.stringify(result.data));
  }

  return (
    <>
      <div className="ambient" aria-hidden="true"><span className="moon" /><span className="mist mist-one" /><span className="mist mist-two" /></div>
      {isTestMode && (
        <div className="test-mode-badge">
          Test mode · this tab remembers its own player
          <button onClick={() => { sessionStorage.removeItem(SESSION_KEY); window.location.reload(); }}>Reset tab</button>
        </div>
      )}
      {!connected && <div className="connection-banner">Reconnecting to Hollowbrook…</div>}
      {storytellerState ? <StorytellerApp state={storytellerState} /> : state ? <Game state={state} /> : (
        <Landing
          onEnter={enterRoom}
          busy={busy}
          error={error}
          restoring={Boolean(session.current && connected)}
        />
      )}
      <footer className="site-footer">An original, unofficial social deduction game · No narrator required</footer>
    </>
  );
}
