import type { ClientPlayer } from '../../shared/types.js';

interface TargetPickerProps {
  players: ClientPlayer[];
  eligibleIds: string[];
  selected: string[];
  count: number;
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function TargetPicker({ players, eligibleIds, selected, count, onChange, disabled, compact }: TargetPickerProps) {
  function toggle(playerId: string) {
    if (selected.includes(playerId)) onChange(selected.filter((id) => id !== playerId));
    else if (selected.length < count) onChange([...selected, playerId]);
  }

  return (
    <div className={`target-picker ${compact ? 'compact' : ''}`}>
      {players.map((player) => {
        const eligible = eligibleIds.includes(player.id);
        const isSelected = selected.includes(player.id);
        return (
          <button
            type="button"
            key={player.id}
            className={isSelected ? 'selected' : ''}
            disabled={disabled || !eligible || (!isSelected && selected.length >= count)}
            onClick={() => toggle(player.id)}
            aria-pressed={isSelected}
          >
            <span className="target-status">{isSelected ? '✓' : !player.alive ? '†' : ''}</span>
            {player.name}
            {!player.alive && <small>dead</small>}
          </button>
        );
      })}
    </div>
  );
}
