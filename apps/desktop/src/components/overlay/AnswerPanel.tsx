import type { JSX } from 'react';
import { memo, useMemo } from 'react';
import { Copy, RefreshCw, Maximize2, Volume2, ChevronDown, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useAssistant } from '@/stores/assistant';
import { useOverlayStore } from '@/stores/overlay.store';

interface CharSpanProps { text: string; isStreaming: boolean }

/** Renders streaming text with a per-character fade-in (CSS-driven; transform/opacity only). */
function StreamingText({ text, isStreaming }: CharSpanProps): JSX.Element {
  const chars = useMemo(() => Array.from(text), [text]);
  return (
    <span>
      {chars.map((ch, i) => (
        <span key={i} className={i >= chars.length - 12 && isStreaming ? 'char-in' : undefined}>{ch}</span>
      ))}
      {isStreaming && <span className="caret" aria-hidden="true">▌</span>}
    </span>
  );
}

/** Streaming suggested answer with key points, follow-ups and answer actions. */
export const AnswerPanel = memo(function AnswerPanel(): JSX.Element {
  const answer = useAssistant((s) => s.answer);
  const streaming = useAssistant((s) => s.streaming);
  const isStreaming = useAssistant((s) => s.isStreaming);
  const fontSize = useOverlayStore((s) => s.fontSize);
  const text = streaming || answer?.answer || '';

  async function copy(): Promise<void> {
    if (!text) return;
    await navigator.clipboard?.writeText(text).then(
      () => toast.success('Answer copied to clipboard'),
      () => toast.error('Clipboard unavailable'),
    );
  }

  function speak(): void {
    if (!text || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(u);
  }

  return (
    <Card className="panel-contained flex min-h-0 flex-1 flex-col border-[hsl(var(--border))]/70 bg-[hsl(var(--card))]/80 shadow-none">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 shrink-0 text-[hsl(var(--warning))]" aria-hidden="true" />
          <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">SUGGESTED RESPONSE</span>
          {isStreaming && <Badge variant="warning" className="ml-auto">streaming</Badge>}
        </div>

        {!text && !isStreaming ? (
          <div className="space-y-2 py-1" role="status" aria-label="Waiting for answer">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-10/12" />
            <Skeleton className="h-3.5 w-6/12" />
          </div>
        ) : (
          <ScrollArea className="min-h-[72px] flex-1">
            <div aria-live="polite" aria-atomic="false" style={{ fontSize: `${fontSize}px` }} className="whitespace-pre-wrap leading-relaxed">
              <StreamingText text={text} isStreaming={isStreaming} />
            </div>
          </ScrollArea>
        )}

        {answer && answer.keyPoints.length > 0 && (
          <div className="space-y-1">
            <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">KEY POINTS</span>
            <div className="flex flex-wrap gap-1">
              {answer.keyPoints.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
            </div>
          </div>
        )}

        {answer && answer.followUpQuestions.length > 0 && (
          <Collapsible className="shrink-0">
            <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              Follow-up questions ({answer.followUpQuestions.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-1 space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                {answer.followUpQuestions.map((f: string) => <li key={f} className="border-l-2 border-[hsl(var(--border))] pl-2">{f}</li>)}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        <Separator className="opacity-60" />
        <div role="toolbar" aria-label="Answer actions" className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label="Copy answer"><Copy /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => useAssistant.getState().requestAnswer()} aria-label="Regenerate answer"><RefreshCw /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => window.dispatchEvent(new CustomEvent('overlay:expand-answer'))} aria-label="Expand answer"><Maximize2 /></Button>
          <Button variant="ghost" size="icon-sm" onClick={speak} aria-label="Speak answer"><Volume2 /></Button>
        </div>
      </CardContent>
    </Card>
  );
});