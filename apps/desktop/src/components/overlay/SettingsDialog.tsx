import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/sonner';
import { useAssistant } from '@/stores/assistant';
import { useOverlayStore, type OverlayTheme } from '@/stores/overlay.store';

const THEMES: OverlayTheme[] = ['system', 'light', 'dark'];

/** In-overlay settings surface: appearance + privacy toggles. Opened from the header gear. */
export function SettingsDialog(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const openIt = (): void => setOpen(true);
    const closeIt = (): void => setOpen(false);
    window.addEventListener('overlay:open-settings', openIt);
    window.addEventListener('overlay:close-settings', closeIt);
    return () => {
      window.removeEventListener('overlay:open-settings', openIt);
      window.removeEventListener('overlay:close-settings', closeIt);
    };
  }, []);
  if (!open) return null;

  const { opacity, setOpacity, fontSize, setFontSize, theme, setTheme, clickThrough } = useOverlayStore.getState();
  const { mode, answerMode, captureOn, active, paused, set } = useAssistant.getState();

  function close(): void {
    setOpen(false);
    toast.success('Settings saved');
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Overlay settings">
      <div className="max-h-full w-full max-w-sm overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-base font-semibold">Overlay settings</h2>
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close settings" onClick={close}>
            <X />
          </Button>
        </div>
        <Separator className="mb-3" />
        <div className="space-y-4 text-sm">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">APPEARANCE</h3>
            <label className="block space-y-1">
              <span className="flex justify-between text-xs"><span>Opacity (surface only)</span><span className="font-mono">{Math.round(opacity * 100)}%</span></span>
              <Slider value={[Math.round(opacity * 100)]} onValueChange={([v]) => setOpacity((v ?? 85) / 100)} min={30} max={100} step={5} aria-label="Opacity" />
            </label>
            <label className="block space-y-1">
              <span className="flex justify-between text-xs"><span>Font size</span><span className="font-mono">{fontSize}px</span></span>
              <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v ?? 15)} min={12} max={24} step={1} aria-label="Font size" />
            </label>
            <div className="flex items-center gap-2 text-xs">
              <span>Theme</span>
              {THEMES.map((t) => (
                <Button key={t} size="sm" variant={theme === t ? 'default' : 'outline'} onClick={() => setTheme(t)} aria-pressed={theme === t}>{t}</Button>
              ))}
            </div>
          </section>
          <Separator />
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">SESSION & PRIVACY</h3>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary">{mode}</Badge>
              <Badge variant="outline">{answerMode}</Badge>
              <Badge variant={active ? (paused ? 'warning' : 'success') : 'outline'}>{active ? (paused ? 'paused' : 'active') : 'idle'}</Badge>
            </div>
            <label className="flex items-center justify-between text-xs">
              Screen context capture
              <Switch checked={captureOn} onCheckedChange={(v) => set({ captureOn: v })} aria-label="Screen context capture" />
            </label>
            <p className="text-[0.6875rem] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Capture runs only with your explicit permission. Click-through is currently {clickThrough ? 'on' : 'off'}.
            </p>
          </section>
          <Separator />
          <Button className="w-full" onClick={close}>Done</Button>
        </div>
      </div>
    </div>
  );
}