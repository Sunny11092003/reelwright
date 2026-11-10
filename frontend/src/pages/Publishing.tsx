import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync } from '../hooks';
import { errMessage, get, post } from '../services/api';
import { PLATFORM_LABELS, type GeneratedContent, type PublishingJob } from '../types';
import { formatDateTime } from '../utils/format';

export function Publishing() {
  const toast = useToast();
  const jobs = useAsync(() => get<PublishingJob[]>('/publishing/jobs'), []);
  const content = useAsync(() => get<GeneratedContent[]>('/content'), []);
  const [retrying, setRetrying] = useState<string | null>(null);
  const active = (jobs.data ?? []).some((j) => j.status === 'queued' || j.status === 'publishing');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(jobs.reload, 4000);
    return () => clearInterval(t);
  }, [active, jobs.reload]);
  const title = (id: string) => content.data?.find((c) => c.id === id)?.title ?? 'Content';
  const retry = async (j: PublishingJob) => {
    setRetrying(j.id);
    try { await post('/publish/retry', { jobId: j.id }); toast.success('Retry started'); jobs.reload(); } catch (e) { toast.error(errMessage(e)); } finally { setRetrying(null); }
  };
  return (
    <>
      <PageHeader title="Publishing" description="Every publish attempt, with status and errors." actions={<button className="btn-secondary" onClick={jobs.reload}><RefreshCw className="h-4 w-4" />Refresh</button>} />
      {jobs.error && <ErrorState message={jobs.error} onRetry={jobs.reload} />}
      {jobs.loading && !jobs.data ? <Skeleton className="h-64" /> : jobs.data && jobs.data.length === 0 ? <EmptyState title="Nothing published yet" description="Open content from the library and choose Publish." action={<Link to="/library" className="btn-primary">Go to library</Link>} />
        : <div className="panel overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-ink-line text-ink-soft"><tr><th className="p-3 font-medium">Content</th><th className="p-3 font-medium">Platform</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Updated</th><th className="p-3 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-ink-line">{jobs.data?.map((j) => (
            <tr key={j.id} className="align-top">
              <td className="p-3"><Link className="font-medium text-harbor-700 underline" to={`/content/${j.contentId}`}>{title(j.contentId)}</Link>
                {j.error && <div role="alert" className="mt-2 rounded-lg bg-signal-redbg p-2 text-xs text-signal-red"><strong>{j.error.errorCode}</strong>: {j.error.errorMessage}<br /><span className="text-ink-soft">Request {j.error.requestId} · retries {j.error.retryCount} · {formatDateTime(j.error.timestamp)}</span></div>}</td>
              <td className="p-3">{PLATFORM_LABELS[j.platform]}</td>
              <td className="p-3"><StatusBadge status={j.status} />{j.progress && j.status === 'publishing' && <p className="mt-1 text-xs text-ink-soft">{j.progress}</p>}</td>
              <td className="p-3 text-ink-soft">{formatDateTime(j.updatedAt)}</td>
              <td className="p-3 text-right">
                {j.status === 'failed' && <button className="btn-secondary !py-1" disabled={retrying === j.id} onClick={() => retry(j)}>{retrying === j.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Retry</button>}
                {j.publishedUrl && <a className="btn-secondary !py-1" href={j.publishedUrl} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" />Open post</a>}
              </td>
            </tr>))}</tbody></table></div>}
    </>
  );
}
