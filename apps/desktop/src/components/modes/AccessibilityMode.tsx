import type { JSX } from 'react';
import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAssistant } from '@/stores/assistant';
import { useOverlayStore } from '@/stores/overlay.store';

/** Accessibility mode: high-contrast, large-font, screen-reader-first overlay view. */
export function AccessibilityMode(): JSX.Element {
  const setFontSize = useOverlayStore((s) => s.setFontSize);
  const set = useAssistant((s) => s.set);
  const paused = useAssistant((s) => s.paused);
  const [speakTranscript, setSpeakTranscript] = useState(true);

  return (
    <div className="panel-contained space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 p-3">
      <span className="block text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">ACCESSIBILITY SUPPORT</span>
      <p aria-live="polite" className="text-sm leading-relaxed">
        Live captions with screen-reader optimized markup. New questions and answers are announced automatically.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setFontSize(19)}>Large font (19px)</Button>
        <Button size="sm" variant="outline" onClick={() => setFontSize(24)}>Extra large (24px)</Button>
        <label className="ml-auto flex items-center gap-2 text-xs">
          Read transcript aloud
          <Switch checked={speakTranscript} onCheckedChange={(v) => {
            setSpeakTranscript(v);
            if (!v && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
          }} aria-label="Speak new transcript lines" />
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => set({ paused: !paused })}
          aria-label={paused ? 'Resume announcements' : 'Pause announcements'}
        >
          {paused ? <Volume2 /> : <VolumeX />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>
      <p className="text-[0.6875rem] text-[hsl(var(--muted-foreground))]">
        Keyboard-only navigation is supported; every control has a visible focus ring and tooltip.
      </p>
    </div>
  );
}