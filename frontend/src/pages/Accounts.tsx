import { CheckCircle2, Globe, Instagram, Facebook, Loader2, Plug, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync } from '../hooks';
import { del, errMessage, get, post } from '../services/api';
import { PLATFORM_LABELS, type ConnectedAccount } from '../types';
import { formatDateTime } from '../utils/format';

const ICON = { instagram: Instagram, facebook: Facebook, website: Globe };

export function Accounts() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useAsync(() => get<ConnectedAccount[]>('/accounts'), []);
  const [wpOpen, setWpOpen] = useState<{ siteUrl?: string; username?: string } | null>(null);
  const [remove, setRemove] = useState<ConnectedAccount | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(false);

  useEffect(() => {
    if (params.get('connected') === 'meta') toast.success(`Connected ${params.get('count') ?? ''} Meta account(s)`);
    if (params.get('error')) toast.error(params.get('error')!);
    if (params.get('connected') || params.get('error')) { setParams({}, { replace: true }); reload(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectMeta = async () => {
    setMetaBusy(true);
    try { const r = await post<{ authUrl: string }>('/accounts/connect', { provider: 'meta' }); window.location.assign(r.authUrl); }
    catch (e) { toast.error(errMessage(e)); setMetaBusy(false); }
  };
  const test = async (a: ConnectedAccount) => {
    setTesting(a.id);
    try { const r = await post<{ ok: boolean; detail: string }>(`/accounts/${a.id}/test`); (r.ok ? toast.success : toast.error)(r.detail); } catch (e) { toast.error(errMessage(e)); } finally { setTesting(null); reload(); }
  };
  const doRemove = async () => { if (!remove) return; try { await del(`/accounts/${remove.id}`); toast.success('Disconnected'); reload(); } catch (e) { toast.error(errMessage(e)); } setRemove(null); };

  return (
    <>
      <PageHeader title="Connected accounts" description="Instagram and Facebook connect through Meta's official login. We never see or store your social passwords."
        actions={<><button className="btn-primary" onClick={connectMeta} disabled={metaBusy}>{metaBusy && <Loader2 className="h-4 w-4 animate-spin" />}Connect Instagram & Facebook</button><button className="btn-secondary" onClick={() => setWpOpen({})}>Connect WordPress</button></>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading ? <Skeleton className="h-48" /> : data && data.length === 0 ? <EmptyState title="No accounts connected" description="Connect Meta to publish Reels and Facebook videos, and WordPress to publish articles." /> :
        <div className="grid gap-3 md:grid-cols-2">{data?.map((a) => { const Icon = ICON[a.platform] ?? Plug; return (
          <article key={a.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-harbor-50 p-2"><Icon className="h-5 w-5 text-harbor-700" aria-hidden /></span>
                <div className="min-w-0"><h2 className="truncate font-display text-base font-bold">{a.name}</h2><p className="text-sm text-ink-soft">{PLATFORM_LABELS[a.platform]}{a.siteUrl ? ` · ${a.siteUrl}` : ''}</p></div></div>
              <StatusBadge status={a.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-soft"><div><dt>Account ID</dt><dd className="truncate font-mono text-ink">{a.externalId}</dd></div><div><dt>Last checked</dt><dd className="text-ink">{formatDateTime(a.lastCheckedAt)}</dd></div></dl>
            {a.lastError && <p className="mt-2 rounded bg-signal-redbg p-2 text-xs text-signal-red">{a.lastError}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-secondary !py-1" onClick={() => test(a)} disabled={testing === a.id}>{testing === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Test connection</button>
              <button className="btn-secondary !py-1" onClick={() => (a.provider === 'meta' ? connectMeta() : setWpOpen({ siteUrl: a.siteUrl, username: a.username }))}><RefreshCw className="h-4 w-4" />Reconnect</button>
              <button className="btn-ghost !py-1 text-signal-red" onClick={() => setRemove(a)}><Trash2 className="h-4 w-4" />Disconnect</button>
            </div>
          </article>); })}</div>}
      {wpOpen && <WordPressDialog initial={wpOpen} onClose={() => setWpOpen(null)} onDone={() => { setWpOpen(null); reload(); }} />}
      <ConfirmDialog open={Boolean(remove)} danger title="Disconnect this account?" confirmLabel="Disconnect" message={`${remove?.name} will be removed and its stored credentials deleted. Posts already published stay live.`} onConfirm={doRemove} onClose={() => setRemove(null)} />
    </>
  );
}

function WordPressDialog({ initial, onClose, onDone }: { initial: { siteUrl?: string; username?: string }; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [siteUrl, setSiteUrl] = useState(initial.siteUrl ?? '');
  const [username, setUsername] = useState(initial.username ?? '');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await post('/accounts/connect', { provider: 'wordpress', siteUrl, username, applicationPassword: pw }); toast.success('WordPress connected'); onDone(); }
    catch (x) { setErr(errMessage(x)); setBusy(false); }
  };
  return (
    <Modal open title="Connect WordPress" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-soft">Use a WordPress Application Password, not your login password. Create one under Users → Profile → Application Passwords. See docs/WORDPRESS_SETUP.md.</p>
        <Field label="Site URL" htmlFor="wp-url"><input id="wp-url" className="input" type="url" required placeholder="https://example.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} /></Field>
        <Field label="Username" htmlFor="wp-user"><input id="wp-user" className="input" required autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="Application password" htmlFor="wp-pw" hint="Stored encrypted on the server. It is never shown again."><input id="wp-pw" className="input" type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {err && <p role="alert" className="rounded-lg bg-signal-redbg p-2 text-sm text-signal-red">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Connect and test</button></div>
      </form>
    </Modal>
  );
}
