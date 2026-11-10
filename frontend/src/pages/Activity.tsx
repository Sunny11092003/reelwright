import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { useAsync } from '../hooks';
import { get } from '../services/api';
import type { ActivityLog } from '../types';
import { formatDateTime } from '../utils/format';

export function Activity() {
  const { data, loading, error, reload } = useAsync(() => get<ActivityLog[]>('/activity'), []);
  return (
    <>
      <PageHeader title="Activity" description="A record of uploads, analysis, edits, connections and publishing." />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading ? <Skeleton className="h-64" /> : data && data.length === 0 ? <EmptyState title="No activity yet" /> :
        <ol className="panel divide-y divide-ink-line">{data?.map((a) => <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"><span>{a.message}</span><span className="text-xs text-ink-faint">{a.action} · {formatDateTime(a.createdAt)}</span></li>)}</ol>}
    </>
  );
}
