import type { JSX } from 'react';
import { ModeSelector } from '@/components/modes/ModeSelector';
import { QuestionPanel } from '@/components/overlay/QuestionPanel';
import { AnswerPanel } from '@/components/overlay/AnswerPanel';
import { TranscriptPanel } from '@/components/overlay/TranscriptPanel';

export interface OverlayRootProps {
  /** Accessibility mode raises contrast/typography tokens on the surface. */
  a11y?: boolean;
  children: React.ReactNode;
}

/** Glass surface: window drag region + scaled radius in accessibility mode. */
export function OverlayRoot({ a11y = false, children }: OverlayRootProps): JSX.Element {
  return (
    <main className={`overlay-root ${a11y ? 'a11y-mode' : ''}`} aria-label="AI Interview Assistant overlay">
      {children}
    </main>
  );
}

/** Body of the overlay: mode-specific view + shared question/answer/transcript panels. */
export function OverlayBody(): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
      <ModeSelector />
      <QuestionPanel />
      <AnswerPanel />
      <TranscriptPanel />
    </div>
  );
}
