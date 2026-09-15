import type { JSX } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ChevronDown } from 'lucide-react';
import { useAssistant } from '@/stores/assistant';

/** Mock mode: the standard overlay (question/answer/transcript) + live evaluation sidebar. */
export function MockMode(): JSX.Element {
  const evaluation = useAssistant((s) => s.evaluation);
  const dimensions = useAssistant((s) => s.evaluationDimensions);

  return (
    <div className="panel-contained flex flex-col gap-2">
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          Live evaluation
        </CollapsibleTrigger>
        <CollapsibleContent>
          {evaluation ? (
            <div className="mt-2 space-y-1.5 rounded-lg border border-[hsl(var(--border))] p-2">
              {dimensions.map((d) => {
                const score = evaluation.scores[d];
                return (
                  <div key={d} className="flex items-center gap-2 text-[0.6875rem]">
                    <span className="w-24 shrink-0 capitalize text-[hsl(var(--muted-foreground))]">{d}</span>
                    <Progress value={score} className="h-1.5 flex-1" aria-hidden="true" />
                    <span className="w-8 text-right font-mono" aria-label={`${d} score ${score}`}>{score}</span>
                  </div>
                );
              })}
              {evaluation.summary && <p className="pt-1 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">{evaluation.summary}</p>}
            </div>
          ) : (
            <p className="mt-2 text-[0.6875rem] text-[hsl(var(--muted-foreground))]" role="status">
              Evaluation appears here after you answer. Not assessed yet.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}