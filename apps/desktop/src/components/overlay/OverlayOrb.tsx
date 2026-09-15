import type { JSX } from 'react';
import { Maximize2 } from 'lucide-react';
import { useOverlayStore } from '@/stores/overlay.store';
import { useAssistant } from '@/stores/assistant';

/** 48x48 collapsed floating orb. Drag handle is the orb body; click expands. */
export function OverlayOrb(): JSX.Element {
  const toggleCollapsed = useOverlayStore((s) => s.toggleCollapsed);
  const status = useAssistant((s) => s.status);
  const animated = status === 'listening' || status === 'processing';
  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      onDoubleClick={toggleCollapsed}
      className="overlay-orb app-region-drag interactive"
      aria-label={`Expand assistant overlay (status ${status})`}
      title="Expand assistant"
    >
      <span className="relative flex h-3 w-3" aria-hidden="true">
        <span className={`absolute inline-flex h-full w-full rounded-full ${status === 'listening' ? 'bg-[hsl(var(--success))]' : status === 'paused' ? 'bg-[hsl(var(--warning))]' : status === 'error' ? 'bg-[hsl(var(--destructive))]' : 'bg-[hsl(var(--muted-foreground))]'} ${animated ? 'dot-pulse' : ''}`} />
      </span>
      <Maximize2 className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
    </button>
  );
}
