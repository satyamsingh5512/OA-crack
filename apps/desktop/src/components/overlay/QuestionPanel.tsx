import type { JSX } from 'react';
import { memo } from 'react';
import { HelpCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssistant } from '@/stores/assistant';
import { useOverlayStore } from '@/stores/overlay.store';

const CATEGORY_LABEL: Record<string, string> = {
  technical: 'TECHNICAL',
  behavioral: 'BEHAVIORAL',
  system_design: 'SYSTEM DESIGN',
  coding: 'CODING',
  other: 'GENERAL',
};

/** Detected question with category badge, confidence bar and timestamp. */
export const QuestionPanel = memo(function QuestionPanel(): JSX.Element {
  const question = useAssistant((s) => s.question);
  const fontSize = useOverlayStore((s) => s.fontSize);
  const confidence = question ? Math.round(question.confidence * 100) : 0;

  return (
    <Card className="panel-contained border-[hsl(var(--border))]/70 bg-[hsl(var(--card))]/80 shadow-none">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
          <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">QUESTION</span>
          {question && <Badge variant="secondary" className="ml-auto">{CATEGORY_LABEL[question.category] ?? question.category.toUpperCase()}</Badge>}
        </div>
        {question ? (
          <>
            <p style={{ fontSize: `${fontSize}px` }} className="font-medium leading-snug">{question.question}</p>
            <div className="flex items-center gap-2" aria-label={`Detection confidence ${confidence}%`}>
              <Progress value={confidence} className="h-1.5 flex-1" aria-hidden="true" />
              <span className="font-mono text-[0.6875rem] text-[hsl(var(--muted-foreground))]">{confidence}%</span>
            </div>
            <p className="font-mono text-[0.6875rem] text-[hsl(var(--muted-foreground))]">
              {new Date(question.detectedAt).toLocaleTimeString()}
            </p>
            <span aria-live="polite" className="sr-only">New question: {question.question}</span>
          </>
        ) : (
          <div className="space-y-2" role="status" aria-label="Waiting for a detected question">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Listening for a question…</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});