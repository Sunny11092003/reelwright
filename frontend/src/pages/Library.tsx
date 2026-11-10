import { CalendarClock, Copy, Eye, Pencil, Search, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync, useDebounced } from '../hooks';
import { del, errMessage, get, post } from '../services/api';
import { CONTENT_STATUSES_LIST, PLATFORM_LABELS, PLATFORMS, type Brand, type GeneratedContent } from '../types';
import { formatDate } from '../utils/format';

export function Library() {
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [brandId, setBrandId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounced(q);
  const brands = useAsync(() => get<Brand[]>('/brands'), []);
  const { data, loading, error, reload } = useAsync(() => {
    const p = new URLSearchParams();
    if (dq) p.set('q', dq); if (status) p.set('status', status); if (platform) p.set('platform', platform); if (brandId) p.set('brandId', brandId);
    if (from) p.set('from', new Date(from).toISOString()); if (to) p.set('to', new Date(`${to}T23:59:59`).toISOString());
    return get<GeneratedContent[]>(`/content?${p.toString()}`);
  }, [dq, status, platform, brandId, from, to]);
  const [toDelete, setToDelete] = useState<GeneratedContent | null>(null);

  const duplicate = async (c: GeneratedContent) => { try { await post(`/content/${c.id}/duplicate`); toast.success('Duplicated'); reload(); } catch (e) { toast.error(errMessage(e)); } };
  const remove = async () => { if (!toDelete) return; try { await del(`/content/${toDelete.id}`); toast.success('Deleted'); reload(); } catch (e) { toast.error(errMessage(e)); } setToDelete(null); };
  const brandName = (id: string | null) => brands.data?.find((b) => b.id === id)?.name ?? '';

  return (
    <>
      <PageHeader title="Content library" description="Search everything the agent has generated." actions={<Link to="/create" className="btn-accent">New video</Link>} />
      <div className="panel mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2"><label className="sr-only" htmlFor="q">Search</label><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-faint" /><input id="q" className="input pl-9" placeholder="Search titles, captions, keywords" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label className="sr-only" htmlFor="f-status">Status</label><select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{CONTENT_STATUSES_LIST.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</select></div>
        <div><label className="sr-only" htmlFor="f-plat">Platform</label><select id="f-plat" className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}</select></div>
        <div><label className="sr-only" htmlFor="f-brand">Brand</label><select id="f-brand" className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">All brands</option>{(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-2"><div><label className="sr-only" htmlFor="f-from">From</label><input id="f-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" /></div><div><label className="sr-only" htmlFor="f-to">To</label><input id="f-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} title="To date" /></div></div>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
        : data && data.length === 0 ? <EmptyState title="No content found" description="Change the filters, or upload a video to generate new content." action={<Link to="/create" className="btn-primary">Upload a video</Link>} />
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data?.map((c) => (
          <article key={c.id} className="panel flex flex-col overflow-hidden">
            <img src={c.thumbnailUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-2"><h2 className="line-clamp-2 font-display text-base font-bold">{c.title}</h2><StatusBadge status={c.status} /></div>
              <p className="mt-1 text-xs text-ink-soft">{c.platforms.map((p) => PLATFORM_LABELS[p]).join(', ')}{brandName(c.brandId) ? ` · ${brandName(c.brandId)}` : ''}</p>
              <p className="mt-1 text-xs text-ink-faint">Created {formatDate(c.createdAt)}{c.publishedAt ? ` · Published ${formatDate(c.publishedAt)}` : ''}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                <button className="btn-secondary !px-2.5 !py-1" onClick={() => nav(`/content/${c.id}`)}><Eye className="h-4 w-4" />View</button>
                <button className="btn-secondary !px-2.5 !py-1" onClick={() => nav(`/content/${c.id}`)}><Pencil className="h-4 w-4" />Edit</button>
                <button className="btn-secondary !px-2.5 !py-1" onClick={() => duplicate(c)}><Copy className="h-4 w-4" />Duplicate</button>
                <button className="btn-secondary !px-2.5 !py-1" disabled={c.status === 'generating' || c.status === 'publishing'} onClick={() => nav(`/content/${c.id}?action=publish`)}><Send className="h-4 w-4" />Publish</button>
                <button className="btn-secondary !px-2.5 !py-1" disabled={c.status === 'generating' || c.status === 'publishing'} onClick={() => nav(`/content/${c.id}?action=schedule`)}><CalendarClock className="h-4 w-4" />Schedule</button>
                <button className="btn-ghost !px-2.5 !py-1 text-signal-red" onClick={() => setToDelete(c)} aria-label={`Delete ${c.title}`}><Trash2 className="h-4 w-4" />Delete</button>
              </div>
            </div>
          </article>))}</div>}
      <ConfirmDialog open={Boolean(toDelete)} danger title="Delete this content?" confirmLabel="Delete" message={`“${toDelete?.title}” and its versions will be deleted. Published posts stay live on their platforms.`} onConfirm={remove} onClose={() => setToDelete(null)} />
    </>
  );
}
