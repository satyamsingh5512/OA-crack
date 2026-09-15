import type { JSX } from 'react';
import { memo } from 'react';
import { Minus, Pin, PinOff, Settings2, MousePointerClick, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAssistant, type AssistantStatus } from '@/stores/assistant';
import { useOverlayStore } from '@/stores/overlay.store';

const STATUS_LABEL: Record<AssistantStatus, string> = {
  idle: 'IDLE',
  listening: 'LISTENING',
  processing: 'PROCESSING',
  paused: 'PAUSED',
  error: 'ERROR',
};

const STATUS_COLOR: Record<AssistantStatus, string> = {
  idle: 'bg-[hsl(var(--muted-foreground))]',
  listening: 'bg-[hsl(var(--success))]',
  processing: 'bg-[hsl(var(--warning))]',
  paused: 'bg-[hsl(var(--warning))]',
  error: 'bg-[hsl(var(--destructive))]',
};

/** Transparent overlay identification + window controls. Drag region is handled by CSS. */
export const OverlayHeader = memo(function OverlayHeader(): JSX.Element {
  const status = useAssistant((s) => s.status);
  const pinned = useOverlayStore((s) => s.pinned);
  const clickThrough = useOverlayStore((s) => s.clickThrough);
  const toggleClickThrough = useOverlayStore((s) => s.toggleClickThrough);
  const toggleCollapsed = useOverlayStore((s) => s.toggleCollapsed);
  const setPinned = useOverlayStore((s) => s.setPinned);
  const animated = status === 'listening' || status === 'processing';

  return (
    <header className="app-region-drag flex items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 px-3 py-2 select-none">
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <span className={`absolute inline-flex h-full w-full rounded-full ${STATUS_COLOR[status]} ${animated ? 'dot-pulse' : ''}`} />
      </span>
      <span role="status" aria-label={`Assistant status ${STATUS_LABEL[status]}`} className="w-[86px] shrink-0 font-mono text-[0.6875rem] tracking-wide text-[hsl(var(--muted-foreground))]">
        {STATUS_LABEL[status]}
      </span>
      <span className="truncate text-sm font-semibold">AI Assistant</span>
      <GripHorizontal className="ml-auto h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      <nav className="app-region-no-drag flex shrink-0 items-center gap-0.5" aria-label="Window controls">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={toggleCollapsed} aria-label="Collapse to floating orb">
              <Minus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Collapse to orb</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => setPinned(!pinned)} aria-pressed={pinned} aria-label="Toggle always on top">
              {pinned ? <Pin /> : <PinOff />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{pinned ? 'Unpin (release always-on-top)' : 'Pin (always on top)'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={toggleClickThrough} aria-pressed={clickThrough} aria-label="Toggle click-through mode">
              <MousePointerClick />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Click-through mode</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => window.dispatchEvent(new CustomEvent('overlay:open-settings'))} aria-label="Open settings">
              <Settings2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </nav>
    </header>
  );
});