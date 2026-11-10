import clsx from 'clsx';
import { Check, Loader2 } from 'lucide-react';

export const PIPELINE = ['Upload', 'Analysis', 'SEO', 'Content', 'Review', 'Publish'] as const;

/** The film-strip tracker: each stage is a frame; the active frame glows marigold. */
export function PipelineStrip({ current, busy, failedAt }: { current: number; busy?: boolean; failedAt?: number }) {
  return (
    <ol className="flex overflow-x-auto rounded-xl bg-harbor-900 p-2 shadow-panel" aria-label="Progress through the publishing pipeline">
      {PIPELINE.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const failed = failedAt === i;
        return (
          <li key={label} aria-current={active ? 'step' : undefined}
            className={clsx('relative mx-0.5 flex min-w-[5.5rem] flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-sm font-semibold',
              failed ? 'bg-signal-red text-white' : active ? 'bg-marigold-500 text-harbor-950' : done ? 'bg-harbor-700 text-white' : 'bg-harbor-800 text-harbor-100/60')}>
            <span aria-hidden className="absolute left-1 top-1 flex flex-col gap-[3px] opacity-40"><i className="h-[3px] w-[3px] rounded-full bg-current" /><i className="h-[3px] w-[3px] rounded-full bg-current" /></span>
            {done ? <Check className="h-4 w-4" aria-hidden /> : active && busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {label}
          </li>
        );
      })}
    </ol>
  );
}
