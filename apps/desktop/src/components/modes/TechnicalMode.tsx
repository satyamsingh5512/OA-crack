import type { JSX } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAssistant } from '@/stores/assistant';

const REQUIREMENTS = [
  'Functional: shorten URL, redirect, custom aliases, click analytics.',
  'Non-functional: 99.99% uptime, <100ms redirect reads, predictable IDs.',
];

const ASSUMPTIONS = [
  '100M new URLs/day (~1,160 writes/s), 10:1 read/write ratio.',
  'Store for 10 years → ~365B rows; alias length 7 base62.',
];

const SCALING = [
  'Stateless API tier behind an LB; Redis cache in front of Postgres/Cassandra.',
  'Key-generation service (Snowflake IDs + base62) avoids hot counters.',
  'CDN for hot redirects; async analytics pipeline (Kafka) for click events.',
];

const TRADEOFFS = [
  'Hash + collision check vs counter/Snowflake IDs: simplicity vs unpredictability.',
  'SQL for strong alias uniqueness vs NoSQL for write scale; cache buys read latency.',
];

const DIAGRAM = `Client ──▶ Load Balancer ──▶ API (stateless)
                              │        │
                    Redis ────┘        └──▶ Postgres (aliases)
                              │
                       ID Generator (Snowflake)`;

/** Technical mode: expandable system-design sections + ASCII architecture diagram. */
export function TechnicalMode(): JSX.Element {
  const question = useAssistant((s) => s.question);

  return (
    <Card className="panel-contained flex min-h-0 flex-1 flex-col overflow-hidden border-[hsl(var(--border))]/70 bg-[hsl(var(--card))]/80 shadow-none">
      <CardContent className="min-h-0 flex-1 overflow-auto p-3">
        <p className="mb-2 text-xs font-medium">{question?.question ?? 'Design a URL shortener like bit.ly.'}</p>
        <Accordion type="multiple" defaultValue={['requirements', 'architecture']} className="w-full">
          <AccordionItem value="requirements">
            <AccordionTrigger className="text-xs">Requirements</AccordionTrigger>
            <AccordionContent><ul className="list-disc space-y-0.5 pl-4 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">{REQUIREMENTS.map((r) => <li key={r}>{r}</li>)}</ul></AccordionContent>
          </AccordionItem>
          <AccordionItem value="assumptions">
            <AccordionTrigger className="text-xs">Assumptions</AccordionTrigger>
            <AccordionContent><ul className="list-disc space-y-0.5 pl-4 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">{ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}</ul></AccordionContent>
          </AccordionItem>
          <AccordionItem value="architecture">
            <AccordionTrigger className="text-xs">Architecture</AccordionTrigger>
            <AccordionContent>
              <pre className="overflow-x-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 p-2 font-mono text-[0.625rem] leading-relaxed" aria-label="ASCII architecture diagram">{DIAGRAM}</pre>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="scaling">
            <AccordionTrigger className="text-xs">Scaling</AccordionTrigger>
            <AccordionContent><ul className="list-disc space-y-0.5 pl-4 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">{SCALING.map((s) => <li key={s}>{s}</li>)}</ul></AccordionContent>
          </AccordionItem>
          <AccordionItem value="tradeoffs">
            <AccordionTrigger className="text-xs">Tradeoffs</AccordionTrigger>
            <AccordionContent><ul className="list-disc space-y-0.5 pl-4 text-[0.6875rem] text-[hsl(var(--muted-foreground))]">{TRADEOFFS.map((t) => <li key={t}>{t}</li>)}</ul></AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}