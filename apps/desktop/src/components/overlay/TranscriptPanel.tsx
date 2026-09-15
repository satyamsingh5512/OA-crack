import type { JSX } from 'react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDeferredValue } from 'react';
import { useAssistant } from '@/stores/assistant';

export interface TranscriptLine { speaker: 'interviewer' | 'candidate' | 'system'; text: string; at: string; partial?: boolean }

const SPEAKER_LABEL = { interviewer: 'Interviewer', candidate: 'Candidate', system: 'System' } as const;

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour12: false });
}

/** Virtualized live transcript with speaker labels, timestamps and auto-scroll. */
export const TranscriptPanel = memo(function TranscriptPanel(): JSX.Element {
  const raw = useAssistant((s) => s.transcript);
  const transcript = useDeferredValue(raw); // keep streaming answer smooth (perf §9)
  const parentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  const items = useMemo(() => transcript.slice(-500), [transcript]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  useEffect(() => {
    if (stuck.current && items.length > 0) virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
  }, [items.length, virtualizer]);

  return (
    <Card className="panel-contained flex h-44 shrink-0 flex-col border-[hsl(var(--border))]/70 bg-[hsl(var(--card))]/80 shadow-none">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">LIVE TRANSCRIPT</span>
          <Badge variant="outline" className="font-mono text-[0.625rem]">{items.length}</Badge>
        </div>
        {items.length === 0 ? (
          <p className="py-3 text-center text-xs text-[hsl(var(--muted-foreground))]" role="status">
            Live transcript will appear here once the microphone is granted.
          </p>
        ) : (
          <div
            ref={parentRef}
            onScroll={(e) => { const el = e.currentTarget; stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
            className="min-h-0 flex-1 overflow-auto"
            tabIndex={0}
            aria-label="Live transcript"
            role="log"
            aria-live="polite"
          >
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vRow) => {
                const line = items[vRow.index]!;
                return (
                  <div
                    key={vRow.key}
                    ref={virtualizer.measureElement}
                    data-index={vRow.index}
                    className="absolute left-0 top-0 w-full px-0.5 py-1"
                    style={{ transform: `translateY(${vRow.start}px)` }}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[0.625rem] text-[hsl(var(--muted-foreground))]">{timeOf(line.at)}</span>
                      <Badge variant={line.speaker === 'interviewer' ? 'default' : line.speaker === 'candidate' ? 'secondary' : 'outline'} className="shrink-0 px-1.5 py-0 text-[0.625rem]">
                        {SPEAKER_LABEL[line.speaker]}
                      </Badge>
                      <span className={`min-w-0 flex-1 text-xs leading-snug ${line.partial ? 'italic text-[hsl(var(--muted-foreground))]' : ''}`}>{line.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});