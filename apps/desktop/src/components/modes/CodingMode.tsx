import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssistant } from '@/stores/assistant';
import { toast } from '@/components/ui/sonner';

/** Monaco is lazy-loaded and only bundles into the editor chunk when coding mode mounts. */
const MonacoEditor = lazy(async () => {
  const mod = await import('@monaco-editor/react');
  return { default: mod.default };
});

export interface Complexity { time: string; space: string }

export interface CodingModeProps {
  /** Two-pointer / hash-map worked example used until the backend returns hints. */
  starterCode?: string;
}

const DEFAULT_STARTER = `function twoSum(nums: number[], target: number): number[] {
  const map = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i]!;
    if (map.has(need)) return [map.get(need)!, i];
    map.set(nums[i]!, i);
  }
  return [];
}`;

const HINTS = [
  'Brute force is O(n²) — a hash map of value → index makes lookups O(1).',
  'One pass: for each num, check whether target − num was already seen.',
  'Edge cases: empty array, duplicate values, negative numbers, no answer.',
];

const EDGE_CASES = ['Empty array', 'Duplicate values', 'Negative numbers', 'No valid pair'];

function EditorSkeleton(): JSX.Element {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Loading editor">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-10/12" />
      <Skeleton className="h-3.5 w-4/12" />
    </div>
  );
}

/** Coding mode: 60/40 split — Monaco editor (left) + AI hints, complexity and edge cases (right). */
export function CodingMode({ starterCode = DEFAULT_STARTER }: CodingModeProps): JSX.Element {
  const question = useAssistant((s) => s.question);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-2 overflow-hidden">
      <Card className="flex min-h-0 flex-col overflow-hidden border-[hsl(var(--border))]/70 bg-[hsl(var(--card))]/80 shadow-none">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center gap-1 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <span className="truncate">Problem: {question?.question ?? 'Two-sum on an unsorted array'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-[hsl(var(--muted-foreground))]">
                Return indices of the two numbers that add up to the target. Exactly one solution exists.
              </p>
            </CollapsibleContent>
          </Collapsible>
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[hsl(var(--border))]" aria-label="Code editor">
            <Suspense fallback={<EditorSkeleton />}>
              <MonacoEditor
                height="100%"
                defaultLanguage="typescript"
                defaultValue={starterCode}
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, automaticLayout: true }}
              />
            </Suspense>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" onClick={() => toast.success('All 4 tests passed', { description: 'twoSum([2,7,11,15], 9) → [0,1]' })}>Run tests</Button>
            <Button size="sm" variant="outline" onClick={() => toast.info('Submitted — complexity looks good')}>Submit</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden border-[hsl(var(--border))]/70 bg-[hsl(var(--card))]/80 shadow-none">
        <CardContent className="space-y-3 p-3">
          <div>
            <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">COMPLEXITY</span>
            <div className="mt-1 flex gap-1">
              <Badge variant="secondary">Time: O(n)</Badge>
              <Badge variant="secondary">Space: O(n)</Badge>
            </div>
          </div>
          <div>
            <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">AI HINTS</span>
            <ul className="mt-1 space-y-1">
              {HINTS.map((h) => <li key={h} className="border-l-2 border-[hsl(var(--primary))]/40 pl-2 text-[0.6875rem] leading-snug text-[hsl(var(--muted-foreground))]">{h}</li>)}
            </ul>
          </div>
          <div>
            <span className="text-[0.6875rem] font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">EDGE CASES</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">
              {EDGE_CASES.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => toast.info('Walkthrough started')}>Explain</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => toast.info('Optimization pass started')}>Optimize</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}