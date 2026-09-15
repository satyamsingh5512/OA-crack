import { create } from 'zustand';

export type OverlayTheme = 'system' | 'light' | 'dark';

interface OverlayState {
  opacity: number;          // 0.30 – 1.00, surface only (never text)
  fontSize: number;         // 12 – 24 px
  clickThrough: boolean;
  collapsed: boolean;       // 48×48 floating orb
  pinned: boolean;          // always-on-top
  theme: OverlayTheme;
  /** Persisted prefs are mirrored to the backend settings surface. */
  hydrated: boolean;
  setOpacity: (v: number) => void;
  setFontSize: (v: number) => void;
  toggleClickThrough: () => void;
  toggleCollapsed: () => void;
  setPinned: (v: boolean) => void;
  setTheme: (t: OverlayTheme) => void;
  hydrate: (p: Partial<Pick<OverlayState, 'opacity' | 'fontSize' | 'theme' | 'pinned'>>) => void;
}

const STORAGE_KEY = 'overlay-prefs';

function persist(s: OverlayState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ opacity: s.opacity, fontSize: s.fontSize, theme: s.theme, pinned: s.pinned }));
  } catch { /* storage unavailable in some webviews */ }
}

function initial(): Pick<OverlayState, 'opacity' | 'fontSize' | 'theme' | 'pinned'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { opacity: 0.85, fontSize: 15, theme: 'system', pinned: true, ...JSON.parse(raw) as Record<string, never> };
  } catch { /* ignore */ }
  return { opacity: 0.85, fontSize: 15, theme: 'system', pinned: true };
}

export const useOverlayStore = create<OverlayState>((set, get) => ({
  ...initial(),
  hydrated: true,
  clickThrough: false,
  collapsed: false,
  setOpacity: (v) => { set({ opacity: Math.min(1, Math.max(0.3, v)) }); persist(get()); },
  setFontSize: (v) => { set({ fontSize: Math.min(24, Math.max(12, Math.round(v))) }); persist(get()); },
  toggleClickThrough: () => set((s) => ({ clickThrough: !s.clickThrough })),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setPinned: (v) => { set({ pinned: v }); persist(get()); },
  setTheme: (t) => { set({ theme: t }); persist(get()); },
  hydrate: (p) => set({ ...p, hydrated: true }),
}));