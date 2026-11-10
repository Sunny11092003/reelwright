import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorState, Field, PageHeader, Skeleton, Tabs } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync } from '../hooks';
import { errMessage, get, put } from '../services/api';
import { PLATFORM_LABELS, PLATFORMS, type Brand, type UserSettings } from '../types';
import { timezones } from '../utils/format';

interface SystemInfo {
  n8n: { configured: boolean; reachable: boolean; detail: string; baseUrl: string | null; webhookPrefix: string };
  providers: { gemini: boolean; anthropic: boolean };
  meta: { configured: boolean; graphVersion: string };
  ga4: { configured: boolean };
  limits: { maxUploadMb: number };
  internalScheduler: boolean;
}
type Tab = 'ai' | 'seo' | 'publishing' | 'system';

const Status = ({ ok, label }: { ok: boolean; label: string }) => <li className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-signal-green" aria-label="Ready" /> : <XCircle className="h-4 w-4 text-signal-red" aria-label="Not ready" />}{label}</li>;

export function Settings() {
  const toast = useToast();
  const s = useAsync(() => get<UserSettings>('/settings'), []);
  const brands = useAsync(() => get<Brand[]>('/brands'), []);
  const sys = useAsync(() => get<SystemInfo>('/settings/system'), []);
  const [form, setForm] = useState<UserSettings | null>(null);
  const [tab, setTab] = useState<Tab>('ai');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s.data) setForm(s.data); }, [s.data]);
  if (s.error) return <ErrorState message={s.error} onRetry={s.reload} />;
  if (!form) return <Skeleton className="h-96" />;

  const patch = (p: Partial<UserSettings>) => setForm({ ...form, ...p });
  const save = async () => {
    setBusy(true);
    try {
      const { userId: _u, updatedAt: _t, videoProvider: _v, ...body } = form; void _u; void _t; void _v;
      await put('/settings', body); toast.success('Settings saved'); s.reload();
    } catch (e) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Settings" actions={<button className="btn-primary" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</button>} />
      <div className="panel">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'ai', label: 'AI and defaults' }, { id: 'seo', label: 'SEO' }, { id: 'publishing', label: 'Publishing and WordPress' }, { id: 'system', label: 'System and n8n' }]} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {tab === 'ai' && <>
            <Field label="AI provider for text" htmlFor="s-prov" hint="Used for SEO, content generation, quality checks and insights. Video analysis always uses Gemini."><select id="s-prov" className="input" value={form.aiProvider} onChange={(e) => patch({ aiProvider: e.target.value as UserSettings['aiProvider'] })}><option value="gemini">Google Gemini</option><option value="anthropic">Anthropic Claude</option></select></Field>
            <Field label="Model" htmlFor="s-model" hint="Exact model ID from your provider."><input id="s-model" className="input" value={form.aiModel} onChange={(e) => patch({ aiModel: e.target.value })} /></Field>
            <Field label="Default language" htmlFor="s-lang"><input id="s-lang" className="input" value={form.defaultLanguage} onChange={(e) => patch({ defaultLanguage: e.target.value })} /></Field>
            <Field label="Default country" htmlFor="s-country"><input id="s-country" className="input" value={form.defaultCountry} onChange={(e) => patch({ defaultCountry: e.target.value })} /></Field>
            <Field label="Default timezone" htmlFor="s-tz"><select id="s-tz" className="input" value={form.defaultTimezone} onChange={(e) => patch({ defaultTimezone: e.target.value })}>{timezones().map((z) => <option key={z}>{z}</option>)}</select></Field>
            <Field label="Default brand profile" htmlFor="s-brand"><select id="s-brand" className="input" value={form.defaultBrandId ?? ''} onChange={(e) => patch({ defaultBrandId: e.target.value || null })}><option value="">None</option>{(brands.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          </>}
          {tab === 'seo' && <>
            <Field label="SEO title max length" htmlFor="s-tl"><input id="s-tl" type="number" min={30} max={100} className="input" value={form.seo.titleMaxLength} onChange={(e) => patch({ seo: { ...form.seo, titleMaxLength: Number(e.target.value) } })} /></Field>
            <Field label="Meta description max length" htmlFor="s-ml"><input id="s-ml" type="number" min={80} max={320} className="input" value={form.seo.metaMaxLength} onChange={(e) => patch({ seo: { ...form.seo, metaMaxLength: Number(e.target.value) } })} /></Field>
            <Field label="Max Instagram hashtags" htmlFor="s-hc"><input id="s-hc" type="number" min={0} max={30} className="input" value={form.seo.maxInstagramHashtags} onChange={(e) => patch({ seo: { ...form.seo, maxInstagramHashtags: Number(e.target.value) } })} /></Field>
            <div className="sm:col-span-2"><Field label="Default SEO goal" htmlFor="s-goal"><input id="s-goal" className="input" value={form.seo.goal} onChange={(e) => patch({ seo: { ...form.seo, goal: e.target.value } })} /></Field></div>
          </>}
          {tab === 'publishing' && <>
            <fieldset className="sm:col-span-2"><legend className="label">Default platforms</legend><div className="flex flex-wrap gap-4">{PLATFORMS.map((p) => <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-harbor-700" checked={form.publishing.defaultPlatforms.includes(p)} onChange={(e) => patch({ publishing: { ...form.publishing, defaultPlatforms: e.target.checked ? [...form.publishing.defaultPlatforms, p] : form.publishing.defaultPlatforms.filter((x) => x !== p) } })} />{PLATFORM_LABELS[p]}</label>)}</div></fieldset>
            <Field label="Default WordPress post status" htmlFor="s-wps"><select id="s-wps" className="input" value={form.publishing.wordpressStatus} onChange={(e) => patch({ publishing: { ...form.publishing, wordpressStatus: e.target.value as 'publish' | 'draft' } })}><option value="publish">Publish</option><option value="draft">Save as draft</option></select></Field>
            <Field label="SEO plugin on your site" htmlFor="s-seop" hint="Writes the SEO title, description and focus keyword to the plugin's meta fields. These fields must be exposed to the REST API; see docs/WORDPRESS_SETUP.md."><select id="s-seop" className="input" value={form.wordpress.seoPlugin} onChange={(e) => patch({ wordpress: { ...form.wordpress, seoPlugin: e.target.value as UserSettings['wordpress']['seoPlugin'] } })}><option value="none">None</option><option value="yoast">Yoast SEO</option><option value="rankmath">Rank Math</option></select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-harbor-700" checked={form.wordpress.embedVideo} onChange={(e) => patch({ wordpress: { ...form.wordpress, embedVideo: e.target.checked } })} />Embed the video at the top of the post</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-harbor-700" checked={form.wordpress.includeSchema} onChange={(e) => patch({ wordpress: { ...form.wordpress, includeSchema: e.target.checked } })} />Include schema.org JSON-LD (needs an administrator account)</label>
          </>}
          {tab === 'system' && <>
            <Field label="Execution mode" htmlFor="s-mode" hint="n8n runs each stage through your n8n workflows. Direct runs everything inside the backend, useful for local testing."><select id="s-mode" className="input" value={form.executionMode} onChange={(e) => patch({ executionMode: e.target.value as 'n8n' | 'direct' })}><option value="direct">Direct (no n8n)</option><option value="n8n">n8n workflows</option></select></Field>
            <div />
            <section className="rounded-lg border border-ink-line p-4"><h2 className="mb-2 font-display text-base font-bold">Server status</h2>
              {sys.loading ? <Skeleton className="h-24" /> : sys.data && <ul className="space-y-1.5">
                <Status ok={sys.data.n8n.configured} label="n8n variables set on backend" /><Status ok={sys.data.n8n.reachable} label={`n8n reachable: ${sys.data.n8n.detail}`} />
                <Status ok={sys.data.providers.gemini} label="Gemini API key" /><Status ok={sys.data.providers.anthropic} label="Anthropic API key (optional)" />
                <Status ok={sys.data.meta.configured} label={`Meta app credentials (Graph ${sys.data.meta.graphVersion})`} /><Status ok={sys.data.ga4.configured} label="Google Analytics 4 (optional, website traffic)" /></ul>}</section>
            <section className="rounded-lg border border-ink-line p-4"><h2 className="mb-2 font-display text-base font-bold">n8n webhooks</h2>
              {sys.data && <><p className="text-sm text-ink-soft">Base URL: <code className="text-xs">{sys.data.n8n.baseUrl ?? 'not set'}</code></p><ul className="mt-2 space-y-1 font-mono text-xs text-ink-soft">{['video-analysis', 'seo-generation', 'content-generation', 'publishing', 'analytics'].map((w) => <li key={w}>POST {sys.data!.n8n.webhookPrefix}/{w}</li>)}</ul>
                <p className="hint mt-2">Secrets and the base URL are set through backend environment variables, not here.</p><p className="hint">Max upload: {sys.data.limits.maxUploadMb} MB · Built-in scheduler: {sys.data.internalScheduler ? 'on' : 'off'}</p></>}</section>
          </>}
        </div>
      </div>
    </>
  );
}
