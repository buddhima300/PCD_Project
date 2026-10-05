import React, { useEffect, useState } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { cn } from '../../utils/cn';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

// Debounced search: parent receives the value 300ms after typing stops, keeping server queries lean.
export function SearchInput({ value, onChange, placeholder = 'Search…', className, label }: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const debounced = useDebounce(local, 300);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label ?? placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-8 text-[13px] text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      
      {local &&
      <button onClick={() => setLocal('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-subtle hover:text-ink" aria-label="Clear search">
          <XIcon className="h-3.5 w-3.5" />
        </button>
      }
    </div>);

}