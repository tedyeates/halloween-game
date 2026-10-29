import { useState } from 'react';

export default function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return <button className="room-code" onClick={copy} title="Copy room code"><span>Room</span>{code}<small>{copied ? 'Copied!' : 'Copy'}</small></button>;
}
