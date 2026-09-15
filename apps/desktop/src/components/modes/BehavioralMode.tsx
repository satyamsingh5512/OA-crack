import type { JSX } from 'react';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { useAssistant } from '@/stores/assistant';

export interface StarSections { situation: string; task: string; action: string; result: string }

export interface BehavioralModeProps {
  /** Example STAR content, typically produced by the AI for the current question. */
  example?: StarSections | null;
  onUseAsInspiration?: () => void;
}

const STAR_CARDS: Array<{ key: keyof StarSections; title: string; hint: string; border: string }> = [
  { key: 'situation', title: 'SITUATION', hint: 'Set the context in one or two sentences.', border: 'border-l-[hsl(var(--primary))]' },
  { key: 'task', title: 'TASK', hint: 'What were you responsible for?', border: 'border-l-[hsl(var(--warning))]' },
  { key: 'action', title: 'ACTION', hint: 'The concrete steps you personally took.', border: 'border-l-[hsl(var(--success))]' },
  { key: 'result', title: 'RESULT', hint: 'Quantify the impact and what you learned.', border: 'border-l-[hsl(var(--destructive))]' },
];

/** Behavioral mode: STAR template as editable, highlighted cards. */
export function BehavioralMode({ example, onUseAsInspiration }: BehavioralModeProps): JSX.Element {
  const [sections, setSections] = useState<StarSections>({ situation: '', task: '', action: '', result: '' });
  const answer = useAssistant((s) => s.answer);

  function fillFromExample(): void {
    const src = example ?? fallbackFromAnswer(answer?.answer ?? '');
    setSections(src);
    toast.success('STAR example applied — edit inline', { description: 'Use it as inspiration, not a script.' });
    onUseAsInspiration?.();
  }

  return (
    <Card className="panel-contained shrink-0 border-[hsl(var(--border))]/70 bg-[hsl(var(--card))]/80 shadow-none">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">STAR TEMPLATE</span>
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={fillFromExample}>Use as inspiration</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {STAR_CARDS.map(({ key, title, hint, border }) => (
            <label key={key} className={`rounded-lg border border-[hsl(var(--border))] border-l-4 ${border} bg-[hsl(var(--background))]/60 p-2`}>
              <div className="mb-1 flex items-center gap-1">
                <Badge variant="secondary" className="px-1.5 py-0 text-[0.625rem]">{title}</Badge>
              </div>
              <textarea
                value={sections[key]}
                onChange={(e) => setSections((s) => ({ ...s, [key]: e.target.value }))}
                placeholder={example?.[key] ?? hint}
                rows={2}
                aria-label={`STAR ${key} section`}
                className="w-full resize-none bg-transparent text-xs leading-snug outline-none placeholder:text-[hsl(var(--muted-foreground))]"
              />
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Deterministic STAR scaffolding derived from the AI answer until a structured endpoint exists. */
export function fallbackFromAnswer(answer: string): StarSections {
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pick = (from: number, to: number): string => sentences.slice(from, to).join(' ');
  return {
    situation: pick(0, 1),
    task: pick(1, 2),
    action: pick(2, Math.max(3, sentences.length - 1)),
    result: sentences.length > 3 ? pick(sentences.length - 1, sentences.length) : '',
  };
}