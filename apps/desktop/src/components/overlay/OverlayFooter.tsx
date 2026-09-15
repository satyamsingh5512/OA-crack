import type { JSX } from 'react';
import { Loader2, Pause, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAssistant } from '@/stores/assistant';
import { useOverlayStore } from '@/stores/overlay.store';

export interface OverlayFooterProps {
  starting: boolean;
  active: boolean;
  paused: boolean;
  onStart: () => void;
  onEnd: () => void;
  onPauseToggle: () => void;
}

/** Session controls + opacity / font-size / click-through. Opacity affects the surface only. */
export function OverlayFooter({ starting, active, paused, onStart, onEnd, onPauseToggle }: OverlayFooterProps): JSX.Element {
  const opacity = useOverlayStore((s) => s.opacity);
  const setOpacity = useOverlayStore((s) => s.setOpacity);
  const fontSize = useOverlayStore((s) => s.fontSize);
  const setFontSize = useOverlayStore((s) => s.setFontSize);
  const clickThrough = useOverlayStore((s) => s.clickThrough);
  const captureOn = useAssistant((s) => s.captureOn);
  const set = useAssistant((s) => s.set);

  return (
    <footer className="app-region-no-drag flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 px-3 py-2">
      {!active ? (
        <Button size="sm" onClick={onStart} disabled={starting}>
          {starting ? <Loader2 className="animate-spin" /> : null}
          {starting ? 'Starting…' : 'Start session'}
        </Button>
      ) : (
        <>
          <Button size="sm" variant="outline" onClick={onPauseToggle} aria-pressed={paused}>
            {paused ? <Play /> : <Pause />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="destructive" onClick={onEnd} aria-label="End session">
            <Square />
            End
          </Button>
        </>
      )}
      <label className="flex items-center gap-2 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">
        Opacity
        <Slider
          value={[Math.round(opacity * 100)]}
          onValueChange={(v) => setOpacity((v[0] ?? 85) / 100)}
          min={30}
          max={100}
          step={5}
          className="w-24"
          aria-label="Overlay opacity percent"
        />
        <span className="w-8 font-mono">{Math.round(opacity * 100)}%</span>
      </label>
      <div className="flex items-center gap-1 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">
        <span>Font</span>
        <button
          type="button"
          onClick={() => setFontSize(fontSize - 1)}
          className="h-6 w-6 rounded border border-[hsl(var(--border))] leading-none hover:bg-[hsl(var(--accent))]"
          aria-label="Decrease font size"
        >A−</button>
        <span className="w-6 text-center font-mono">{fontSize}</span>
        <button
          type="button"
          onClick={() => setFontSize(fontSize + 1)}
          className="h-6 w-6 rounded border border-[hsl(var(--border))] leading-none hover:bg-[hsl(var(--accent))]"
          aria-label="Increase font size"
        >A+</button>
      </div>
      <label className="ml-auto flex items-center gap-2 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">
        Click-through
        <Switch checked={clickThrough} onCheckedChange={() => useOverlayStore.getState().toggleClickThrough()} aria-label="Toggle click-through mode" />
      </label>
      <label className="flex items-center gap-2 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">
        Screen context
        <Switch checked={captureOn} onCheckedChange={(v) => set({ captureOn: v })} aria-label="Toggle screen context capture" />
      </label>
    </footer>
  );
}
