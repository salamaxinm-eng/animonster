'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function PlayerSelect({
  label,
  className,
  value,
  options,
  onValueChange,
}: {
  label: string;
  className?: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={`player-select ${className || ''}`}>
      <Select items={options} value={value} onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }} disabled={!options.length}>
        <SelectTrigger className="player-select-trigger" aria-label={label}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className="player-select-popup" align="start" alignItemWithTrigger={false} sideOffset={8}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="player-select-option">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
