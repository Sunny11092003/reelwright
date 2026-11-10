import { AlertTriangle, CalendarClock, CheckCircle2, Clapperboard, FileText, Film, Plug } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { useAsync } from '../hooks';
import { get } from '../services/api';
import { PLATFORM_LABELS, type DashboardData } from '../types';
import { timeAgo } from '../utils/format';

export function Dashboard() {
  const { data, loading, error, reload } = useAsync(() => get<DashboardData>('/dashboard'), []);
  const nav = useNavigate();
  const stats = data ? [
    { label: 'Videos processed', value: data.counts.videosProcessed, icon: Film },
    { label: 'Content generated', value: data.counts.contentGenerated, icon: FileText },
    { label: 'Posts published', value: data.counts.postsPublished, icon: CheckCircle2 },
    { label: 'Scheduled posts', value: data.counts.scheduledPosts, icon: CalendarClock },
    { label: 'Failed posts', value: data.counts.failedPosts, icon: AlertTriangle },
  ] : [];
  return (
    <>
      <PageHeader title="Dashboard" description="Everything from upload to results, in one place." actions={<Link to="/create" className="btn-accent"><Clapperboard className="h-4 w-4" />New video</Link>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />) : stats.map((s) => (
          <div key={s.label} className="panel p-4">
            <s.icon className={`h-5 w-5 ${s.label === 'Failed posts' && s.value > 0 ? 'text-signal-red' : 'text-harbor-500'}`} aria-hidden />
            <div className="mt-3 font-display text-3xl font-bold">{s.value}</div>
            <div className="text-sm text-ink-soft">{s.label}</div>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="recent">
          <h2 id="recent" className="mb-3 font-display text-lg font-bold">Recent content</h2>
          {loading ? <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div>
            : data && data.recentContent.length === 0 ? <EmptyState title="No content yet" description="Upload a video and the agent will draft posts for each channel." action={<Link to="/create" className="btn-primary">Upload a video</Link>} />
            : <div className="grid gap-3 sm:grid-cols-2">{data?.recentContent.map((c) => (
              <article key={c.id} className="panel overflow-hidden">
                <img src={c.thumbnailUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 font-display text-base font-bold">{c.title}</h3><StatusBadge status={c.status} /></div>
                  <p className="mt-1 text-xs text-ink-soft">{c.platforms.map((p) => PLATFORM_LABELS[p]).join(', ')} · {timeAgo(c.createdAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button className="btn-secondary !py-1" onClick={() => nav(`/content/${c.id}`)}>View</button>
                    <button className="btn-secondary !py-1" onClick={() => nav(`/content/${c.id}`)}>Edit</button>
                    <button className="btn-secondary !py-1" disabled={c.status === 'generating'} onClick={() => nav(`/content/${c.id}?action=publish`)}>Publish</button>
                    <button className="btn-secondary !py-1" disabled={c.status === 'generating'} onClick={() => nav(`/content/${c.id}?action=schedule`)}>Schedule</button>
                  </div>
                </div>
              </article>))}</div>}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="plat" className="panel p-4">
            <h2 id="plat" className="mb-3 font-display text-lg font-bold">Connected platforms</h2>
            {loading ? <Skeleton className="h-16" /> : data && data.accounts.length === 0 ? <p className="text-sm text-ink-soft">None yet. <Link className="text-harbor-700 underline" to="/accounts">Connect accounts</Link> to publish.</p>
              : <ul className="space-y-2">{data?.accounts.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 text-sm"><span className="flex min-w-0 items-center gap-2"><Plug className="h-4 w-4 shrink-0 text-ink-faint" /><span className="truncate">{PLATFORM_LABELS[a.platform]} · {a.name}</span></span><StatusBadge status={a.status} /></li>)}</ul>}
          </section>
          <section aria-labelledby="act" className="panel p-4">
            <h2 id="act" className="mb-3 font-display text-lg font-bold">Recent activity</h2>
            {loading ? <Skeleton className="h-24" /> : data && data.recentActivity.length === 0 ? <p className="text-sm text-ink-soft">Activity appears here as you work.</p>
              : <ul className="space-y-3">{data?.recentActivity.map((a) => <li key={a.id} className="text-sm"><p>{a.message}</p><p className="text-xs text-ink-faint">{timeAgo(a.createdAt)}</p></li>)}</ul>}
          </section>
        </aside>
      </div>
    </>
  );
}
