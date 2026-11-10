import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync } from '../hooks';
import { errMessage, get, post } from '../services/api';
import { PLATFORM_LABELS, PLATFORMS, type AnalyticsSummary, type PostMetrics } from '../types';
import { formatDate, number } from '../utils/format';

const METRICS: { key: keyof PostMetrics; label: string }[] = [
  { key: 'views', label: 'Views' }, { key: 'reach', label: 'Reach' }, { key: 'likes', label: 'Likes' }, { key: 'reactions', label: 'Reactions' },
  { key: 'comments', label: 'Comments' }, { key: 'shares', label: 'Shares' }, { key: 'saves', label: 'Saves' },
];
const COLORS = { instagram: '#CF8F22', facebook: '#1D4E89', website: '#2F7A77' };

export function Analytics() {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useAsync(() => get<AnalyticsSummary>(`/analytics?days=${days}`), [days]);
  const [syncing, setSyncing] = useState(false);
  const [insightBusy, setInsightBusy] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try { await post('/analytics/sync'); toast.info('Collecting metrics from your platforms. Refresh in a minute.'); setTimeout(reload, 15000); } catch (e) { toast.error(errMessage(e)); } finally { setSyncing(false); }
  };
  const insights = async () => {
    setInsightBusy(true);
    try { await post('/analytics/insights'); reload(); } catch (e) { toast.error(errMessage(e)); } finally { setInsightBusy(false); }
  };
  const hasPosts = (data?.posts.length ?? 0) > 0;

  return (
    <>
      <PageHeader title="Analytics" description="Real metrics collected from Instagram, Facebook and (if configured) Google Analytics. Nothing is estimated."
        actions={<>
          <label className="sr-only" htmlFor="range">Date range</label>
          <select id="range" className="input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
          <button className="btn-secondary" onClick={sync} disabled={syncing}>{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Collect latest metrics</button>
        </>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading ? <Skeleton className="h-96" /> : data && !hasPosts ? <EmptyState title="No published posts in this range" description="Publish content, then collect metrics. Platforms may take a while to report numbers." /> : data && (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            {PLATFORMS.map((p) => (
              <section key={p} className="panel p-4" aria-label={`${PLATFORM_LABELS[p]} totals`}>
                <h2 className="font-display text-base font-bold">{PLATFORM_LABELS[p]} <span className="text-sm font-normal text-ink-soft">· {data.totals[p].posts} posts</span></h2>
                {p === 'website' && !data.websiteAnalyticsConfigured ? <p className="mt-2 text-sm text-ink-soft">Traffic data needs a Google Analytics 4 connection. See docs/SETUP.md (GA4 variables). Published post counts are shown above.</p>
                  : <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">{METRICS.filter((m) => data.totals[p][m.key] !== undefined).map((m) => <div key={m.key}><dt className="text-ink-faint">{m.label}</dt><dd className="font-display text-xl font-bold">{number(data.totals[p][m.key] as number)}</dd></div>)}
                    {METRICS.every((m) => data.totals[p][m.key] === undefined) && <p className="col-span-2 text-ink-soft">No metrics collected yet.</p>}</dl>}
              </section>))}
          </div>

          <section className="panel p-4" aria-labelledby="trend">
            <h2 id="trend" className="font-display text-lg font-bold">Views over time</h2>
            <p className="text-xs text-ink-soft">Total views reported at each collection date. The line starts when you first collect metrics.</p>
            {data.series.length < 2 ? <p className="mt-4 text-sm text-ink-soft">The trend appears after metrics have been collected on at least two different days.</p> :
              <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.series}><CartesianGrid strokeDasharray="3 3" stroke="#DDE3E0" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} /><Tooltip /><Legend />
                {PLATFORMS.map((p) => <Line key={p} type="monotone" dataKey={p} name={PLATFORM_LABELS[p]} stroke={COLORS[p]} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer></div>}
          </section>

          <section className="panel p-4" aria-labelledby="ins">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="ins" className="font-display text-lg font-bold">AI insights</h2>
              <button className="btn-secondary" onClick={insights} disabled={insightBusy}>{insightBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate insights</button></div>
            {data.insights ? <><ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">{data.insights.items.map((i, k) => <li key={k}>{i}</li>)}</ul><p className="mt-2 text-xs text-ink-faint">Based on {data.insights.basedOnPosts} posts · {formatDate(data.insights.generatedAt)}. Patterns in small samples are not proof of cause.</p></>
              : <p className="mt-2 text-sm text-ink-soft">Insights are generated from your real metrics and need at least three posts with collected data.</p>}
          </section>

          <section className="panel overflow-x-auto" aria-labelledby="pp">
            <h2 id="pp" className="p-4 font-display text-lg font-bold">Posts</h2>
            <table className="w-full min-w-[40rem] text-left text-sm"><thead className="border-y border-ink-line text-ink-soft"><tr><th className="p-3 font-medium">Post</th><th className="p-3 font-medium">Platform</th><th className="p-3 font-medium">Published</th>{METRICS.slice(0, 5).map((m) => <th key={m.key} className="p-3 font-medium">{m.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-ink-line">{data.posts.map((p) => (
                <tr key={p.publishedPostId}><td className="p-3">{p.url ? <a className="text-harbor-700 underline" href={p.url} target="_blank" rel="noreferrer noopener">{p.title}</a> : p.title}{p.note && !p.metrics?.views && <div className="max-w-xs truncate text-xs text-ink-faint" title={p.note}>{p.note}</div>}</td>
                  <td className="p-3">{PLATFORM_LABELS[p.platform]}</td><td className="p-3 text-ink-soft">{formatDate(p.publishedAt)}</td>
                  {METRICS.slice(0, 5).map((m) => <td key={m.key} className="p-3">{p.metrics ? number(p.metrics[m.key]) : 'n/a'}</td>)}</tr>))}</tbody></table>
          </section>
        </div>)}
    </>
  );
}
