import type { JSX } from 'react';
import { MessagesSquare, Code2, HeartHandshake, Network, Accessibility } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MockMode } from '@/components/modes/MockMode';
import { CodingMode } from '@/components/modes/CodingMode';
import { BehavioralMode } from '@/components/modes/BehavioralMode';
import { TechnicalMode } from '@/components/modes/TechnicalMode';
import { AccessibilityMode } from '@/components/modes/AccessibilityMode';
import { useAssistant } from '@/stores/assistant';
import type { InterviewMode } from '@ai-assistant/shared';

const MODES: Array<{ value: InterviewMode; icon: JSX.Element; label: string; description: string }> = [
  { value: 'mock', icon: <MessagesSquare />, label: 'Mock', description: 'Full interview simulation with live scoring.' },
  { value: 'coding', icon: <Code2 />, label: 'Coding', description: 'Editor plus AI hints and complexity analysis.' },
  { value: 'behavioral', icon: <HeartHandshake />, label: 'Behavioral', description: 'STAR-structured storytelling practice.' },
  { value: 'technical', icon: <Network />, label: 'Technical', description: 'System-design walkthroughs and tradeoffs.' },
  { value: 'accessibility', icon: <Accessibility />, label: 'A11y', description: 'Real-time captions and read-aloud support.' },
];

/** Interview mode switcher — each mode renders its dedicated UI (spec §7). */
export function ModeSelector(): JSX.Element {
  const mode = useAssistant((s) => s.mode);
  const set = useAssistant((s) => s.set);

  return (
    <Tabs value={mode} onValueChange={(v) => set({ mode: v as InterviewMode })}>
      <TabsList className="h-8 w-full justify-start overflow-x-auto" aria-label="Interview mode">
        {MODES.map((m) => (
          <Tooltip key={m.value}>
            <TooltipTrigger asChild>
              <TabsTrigger value={m.value} className="shrink-0 px-2" aria-label={`${m.label} mode: ${m.description}`}>
                {m.icon}
                <span className="hidden sm:inline">{m.label}</span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent>{m.description}</TooltipContent>
          </Tooltip>
        ))}
      </TabsList>
      {MODES.map((m) => (
        <TabsContent key={m.value} value={m.value} className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          {m.value === 'mock' && <MockMode />}
          {m.value === 'coding' && <CodingMode />}
          {m.value === 'behavioral' && <BehavioralMode />}
          {m.value === 'technical' && <TechnicalMode />}
          {m.value === 'accessibility' && <AccessibilityMode />}
        </TabsContent>
      ))}
    </Tabs>
  );
}