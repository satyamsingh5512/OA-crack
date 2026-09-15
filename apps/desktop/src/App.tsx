import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { MicPipeline } from './audio/pipeline';
import { useAssistant } from './stores/assistant';
import { useOverlayStore } from './stores/overlay.store';
import { OverlayHeader } from './components/overlay/OverlayHeader';
import { OverlayBody, OverlayRoot } from './components/overlay/OverlayBody';
import { OverlayFooter } from './components/overlay/OverlayFooter';
import { SettingsDialog } from './components/overlay/SettingsDialog';
import { OverlayOrb } from './components/overlay/OverlayOrb';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const pipe = new MicPipeline();

/** Applies overlay prefs to the document and mirrors pin/click-through to the main process. */
function useOverlaySync(a11y: boolean): void {
  const opacity = useOverlayStore((s) => s.opacity);
  const fontSize = useOverlayStore((s) => s.fontSize);
  const theme = useOverlayStore((s) => s.theme);
  const clickThrough = useOverlayStore((s) => s.clickThrough);
  const pinned = useOverlayStore((s) => s.pinned);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--overlay-alpha', opacity.toFixed(2));
    root.style.setProperty('font-size', `${fontSize}px`);
  }, [opacity, fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      root.classList.toggle('dark', dark);
      root.classList.toggle('a11y-mode', a11y);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, a11y]);

  useEffect(() => {
    void window.aiAssistant?.invoke('overlay:set-options', { clickThrough, pinned });
  }, [clickThrough, pinned]);
}

export default function App(): JSX.Element {
  const { active, paused, mode, answerMode, captureOn, level, error, set, pushTranscript } = useAssistant();
  const a11y = mode === 'accessibility';
  useOverlaySync(a11y);
  const collapsed = useOverlayStore((s) => s.collapsed);
  const [starting, setStarting] = useState(false);

  // Seed demo question/answer so panels show real content before a backend stream exists.
  useEffect(() => {
    const t = window.setTimeout(() => {
      useAssistant.setState({
        question: {
          question: 'Tell me about a difficult project you shipped under a hard deadline. What made it hard, and what did you do?',
          category: 'behavioral',
          confidence: 0.92,
          detectedAt: new Date().toISOString(),
          context: 'Session start; resume on file.',
        },
        streaming: 'I led the migration of our billing pipeline to an event-driven design, which cut reconciliation drift from hours to minutes and gave support a live status view for the first time.',
        isStreaming: false,
        answer: {
          answer: 'I led the migration of our billing pipeline to an event-driven design, which cut reconciliation drift from hours to minutes and gave support a live status view for the first time.',
          keyPoints: ['Deadline pressure', 'Event-driven redesign', 'Support visibility'],
          confidence: 0.88,
          reasoningSummary: 'STAR structure with quantified outcome.',
          followUpQuestions: ['How did you keep the team aligned?', 'What would you change now?', 'How did you de-risk the cutover?'],
          citations: [],
          latencyMs: 420,
        },
        evaluation: { scores: { clarity: 82, structure: 74, relevance: 88, confidence: 69 }, summary: 'Strong ownership signal; make the result more quantified.' },
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, []);

  async function startSession(): Promise<void> {
    setStarting(true);
    set({ error: null, status: 'processing' });
    try {
      await window.aiAssistant?.invoke('session:start');
      await pipe.start({
        onLevel: (l) => set({ level: l }),
        onChunk: () => { /* forward to transcription WS; stub keeps 16kHz PCM contract */ },
      });
      set({ active: true, paused: false, status: 'listening' });
      pushTranscript({ speaker: 'system', text: `Session started (${mode}/${answerMode}). Grant mic + screen explicitly.`, at: new Date().toISOString() });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Microphone unavailable. Check permissions and devices.' });
    } finally {
      setStarting(false);
    }
  }

  async function endSession(): Promise<void> {
    await pipe.stop().catch(() => undefined);
    await window.aiAssistant?.invoke('session:end').catch(() => undefined);
    set({ active: false, status: 'idle' });
  }

  if (collapsed) {
    return (
      <>
        <OverlayOrb />
        <Toaster position="bottom-right" />
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <OverlayRoot a11y={a11y}>
        <OverlayHeader />
        <OverlayBody />
        <OverlayFooter
          starting={starting}
          active={active}
          paused={paused}
          onStart={() => void startSession()}
          onEnd={() => void endSession()}
          onPauseToggle={() => set({ paused: !paused })}
        />
        <SettingsDialog />
        <p aria-live="polite" className="sr-only">
          Mic level: {level.toFixed(3)}{captureOn ? ' · SCREEN CONTEXT: ON' : ''}
        </p>
        {error && <p role="alert" aria-live="assertive" className="sr-only">{error}</p>}
      </OverlayRoot>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
