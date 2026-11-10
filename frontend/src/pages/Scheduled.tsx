import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync } from '../hooks';
import { del, errMessage, get } from '../services/api';
import { PLATFORM_LABELS, type ConnectedAccount, type GeneratedContent, type ScheduledPost } from '../types';
import { formatDateTime } from '../utils/format';

export function Scheduled() {
  const toast = useToast();
  const posts = useAsync(() => get<ScheduledPost[]>('/publish/scheduled'), []);
  const content = useAsync(() => get<GeneratedContent[]>('/content'), []);
  const accounts = useAsync(() => get<ConnectedAccount[]>('/accounts'), []);
  const [cancel, setCancel] = useState<ScheduledPost | null>(null);
  const doCancel = async () => { if (!cancel) return; try { await del(`/publish/scheduled/${cancel.id}`); toast.success('Schedule cancelled'); posts.reload(); } catch (e) { toast.error(errMessage(e)); } setCancel(null); };
  return (
    <>
      <PageHeader title="Scheduled posts" description="Posts waiting for their time. Publishing is triggered by n8n or the built-in scheduler, checked every minute." />
      {posts.error && <ErrorState message={posts.error} onRetry={posts.reload} />}
      {posts.loading ? <Skeleton className="h-48" /> : posts.data && posts.data.length === 0 ? <EmptyState title="No scheduled posts" description="Choose Schedule on any content item to queue it." action={<Link to="/library" className="btn-primary">Go to library</Link>} />
        : <div className="panel overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-ink-line text-ink-soft"><tr><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Content</th><th className="p-3 font-medium">Platform</th><th className="p-3 font-medium">Status</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-ink-line">{posts.data?.map((p) => (
            <tr key={p.id}><td className="p-3">{formatDateTime(p.scheduledAt, p.timezone)}<div className="text-xs text-ink-faint">{p.timezone}</div></td>
              <td className="p-3"><Link className="text-harbor-700 underline" to={`/content/${p.contentId}`}>{content.data?.find((c) => c.id === p.contentId)?.title ?? 'Content'}</Link></td>
              <td className="p-3">{PLATFORM_LABELS[p.platform]}<div className="text-xs text-ink-faint">{accounts.data?.find((a) => a.id === p.accountId)?.name}</div></td>
              <td className="p-3"><StatusBadge status={p.status} /></td>
              <td className="p-3 text-right">{p.status === 'scheduled' && <button className="btn-secondary !py-1" onClick={() => setCancel(p)}>Cancel</button>}</td></tr>))}</tbody></table></div>}
      <ConfirmDialog open={Boolean(cancel)} title="Cancel this scheduled post?" confirmLabel="Cancel schedule" danger message="The post will not be published. You can schedule it again later." onConfirm={doCancel} onClose={() => setCancel(null)} />
    </>
  );
}
