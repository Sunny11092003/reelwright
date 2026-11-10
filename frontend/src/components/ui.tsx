import clsx from 'clsx';
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { ContentStatus, JobStatus } from '../types';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-canvas text-ink-soft', analyzing: 'bg-signal-bluebg text-signal-blue', generating: 'bg-signal-bluebg text-signal-blue',
  ready: 'bg-harbor-100 text-harbor-700', scheduled: 'bg-signal-amberbg text-signal-amber', publishing: 'bg-signal-bluebg text-signal-blue',
  published: 'bg-signal-greenbg text-signal-green', failed: 'bg-signal-redbg text-signal-red', cancelled: 'bg-canvas text-ink-faint',
  queued: 'bg-canvas text-ink-soft', uploaded: 'bg-canvas text-ink-soft', analyzed: 'bg-harbor-100 text-harbor-700',
  connected: 'bg-signal-greenbg text-signal-green', expired: 'bg-signal-redbg text-signal-red', error: 'bg-signal-redbg text-signal-red',
  processing: 'bg-signal-bluebg text-signal-blue', pending: 'bg-signal-bluebg text-signal-blue',
};

export function StatusBadge({ status }: { status: ContentStatus | JobStatus | string }) {
  const busy = ['analyzing', 'generating', 'publishing', 'processing', 'pending'].includes(status);
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', STATUS_STYLE[status] ?? 'bg-canvas text-ink-soft')}>
      {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {status}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-line bg-white/60 px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-ink-faint" aria-hidden />
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-signal-red/30 bg-signal-redbg p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-signal-red" aria-hidden />
      <div className="flex-1 text-sm text-signal-red">{message}</div>
      {onRetry && <button className="btn-secondary !py-1" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-harbor-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={clsx('panel flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-b-xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-ink-line px-5 py-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label="Close dialog"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; message: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onClose} footer={<>
      <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}</button>
    </>}>
      <div className="text-sm text-ink-soft">{message}</div>
    </Modal>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-ink-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={clsx('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold', value === t.id ? 'border-marigold-500 text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
          {t.label}{t.badge}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
        <div className="h-full rounded-full bg-marigold-500 transition-[width] duration-200" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-ink-soft" role="status"><Loader2 className="h-4 w-4 animate-spin" />{label ?? 'Loading'}</div>;
}
