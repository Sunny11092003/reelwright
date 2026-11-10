import { AlertTriangle, CalendarClock, Copy, History, Loader2, RefreshCw, RotateCcw, Save, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PublishDialog } from '../components/PublishDialog';
import { RichTextEditor } from '../components/RichTextEditor';
import { ConfirmDialog, ErrorState, Modal, PageHeader, Skeleton, StatusBadge, Tabs } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync, useDoc } from '../hooks';
import { del, errMessage, get, post, put } from '../services/api';
import { PLATFORM_LABELS, type ContentVersion, type FacebookContent, type GeneratedContent, type InstagramContent, type Platform, type PlatformContent, type WebsiteContent } from '../types';
import { csv, formatDateTime } from '../utils/format';

const PRESETS = ['Make this more professional.', 'Make it shorter.', 'Target parents instead of students.', 'Make it more local to Bangalore.', 'Make it less promotional.'];

interface RegenTarget { scope: 'all' | 'platform' | 'field'; platform?: Platform; field?: string; label: string }

export function ContentEditor() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: server, loading, error } = useDoc<GeneratedContent>('content', id);
  const [draft, setDraft] = useState<PlatformContent>({});
  const [title, setTitle] = useState('');
  const [tab, setTab] = useState<Platform | 'history'>('instagram');
  const [saving, setSaving] = useState(false);
  const [regen, setRegen] = useState<RegenTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dialog, setDialog] = useState<'publish' | 'schedule' | null>(null);
  const versions = useAsync(() => (id ? get<ContentVersion[]>(`/content/${id}/versions`) : Promise.resolve([])), [id, server?.version]);

  useEffect(() => { if (server) { setDraft(server.content); setTitle(server.title); } }, [server?.version, server?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (server && !server.platforms.includes(tab as Platform) && tab !== 'history') setTab(server.platforms[0]); }, [server, tab]);
  useEffect(() => {
    const a = params.get('action');
    if (a === 'publish' || a === 'schedule') { setDialog(a); params.delete('action'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  const dirty = useMemo(() => server ? JSON.stringify(draft) !== JSON.stringify(server.content) || title !== server.title : false, [draft, server, title]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div>;
  if (error) return <ErrorState message={error} />;
  if (!server) return <ErrorState message="This content no longer exists." />;
  if (server.status === 'generating') return <div className="panel flex items-center gap-3 p-6"><Loader2 className="h-5 w-5 animate-spin" />Content is still being generated.</div>;

  const locked = server.status === 'publishing';
  const setP = <K extends Platform>(p: K, patch: Partial<NonNullable<PlatformContent[K]>>) => setDraft((d) => ({ ...d, [p]: { ...(d[p] as object), ...patch } }));

  const save = async () => {
    setSaving(true);
    try { await put<GeneratedContent>(`/content/${server.id}`, { title, content: draft }); toast.success('Saved'); }
    catch (e) { toast.error(errMessage(e)); } finally { setSaving(false); }
  };
  const duplicate = async () => {
    try { const c = await post<GeneratedContent>(`/content/${server.id}/duplicate`); toast.success('Duplicated'); nav(`/content/${c.id}`); } catch (e) { toast.error(errMessage(e)); }
  };
  const remove = async () => {
    try { await del(`/content/${server.id}`); toast.success('Deleted'); nav('/library'); } catch (e) { toast.error(errMessage(e)); setConfirmDelete(false); }
  };
  const restore = async (v: ContentVersion) => {
    try { await post(`/content/${server.id}/restore`, { versionId: v.id }); toast.success(`Restored version ${v.version}`); } catch (e) { toast.error(errMessage(e)); }
  };

  const R = ({ platform, field }: { platform: Platform; field: string }) => (
    <button type="button" className="rounded p-1 text-ink-faint hover:bg-harbor-50 hover:text-harbor-700 disabled:opacity-40" disabled={dirty || locked} title={dirty ? 'Save your edits before regenerating' : `Regenerate ${field}`} aria-label={`Regenerate ${field}`} onClick={() => setRegen({ scope: 'field', platform, field, label: field })}><Sparkles className="h-4 w-4" /></button>
  );
  const Txt = ({ platform, field, label, value, onChange, rows, max, hint }: { platform: Platform; field: string; label: string; value: string; onChange: (v: string) => void; rows?: number; max?: number; hint?: string }) => {
    const fid = `${platform}-${field}`;
    return (
      <div>
        <div className="mb-1 flex items-center justify-between"><label className="text-sm font-medium" htmlFor={fid}>{label}</label><span className="flex items-center gap-2">{max && <span className={`text-xs ${value.length > max ? 'text-signal-red' : 'text-ink-faint'}`}>{value.length}/{max}</span>}<R platform={platform} field={field} /></span></div>
        {rows ? <textarea id={fid} className="input" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} disabled={locked} /> : <input id={fid} className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={locked} />}
        {hint && <p className="hint">{hint}</p>}
      </div>
    );
  };
  const List = ({ platform, field, label, value, onChange }: { platform: Platform; field: string; label: string; value: string[]; onChange: (v: string[]) => void }) => (
    <Txt platform={platform} field={field} label={label} rows={2} value={value.join(field.toLowerCase().includes('hashtag') ? ' ' : ', ')} hint="Separate with commas or spaces." onChange={(v) => onChange(field.toLowerCase().includes('hashtag') ? v.split(/[\s,]+/).filter(Boolean) : csv(v))} />
  );

  const ig = draft.instagram as InstagramContent | undefined;
  const fb = draft.facebook as FacebookContent | undefined;
  const web = draft.website as WebsiteContent | undefined;
  const issues = server.quality?.issues ?? [];

  return (
    <>
      <PageHeader title={title || 'Untitled'} description={`${server.platforms.map((p) => PLATFORM_LABELS[p]).join(', ')} · version ${server.version}`}
        actions={<>
          <button className="btn-secondary" onClick={duplicate}><Copy className="h-4 w-4" />Duplicate</button>
          <button className="btn-secondary" onClick={() => setConfirmDelete(true)} disabled={locked}><Trash2 className="h-4 w-4" />Delete</button>
          <button className="btn-secondary" onClick={() => setDialog('schedule')} disabled={dirty || locked}><CalendarClock className="h-4 w-4" />Schedule</button>
          <button className="btn-accent" onClick={() => setDialog('publish')} disabled={dirty || locked}><Send className="h-4 w-4" />Publish</button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-3"><StatusBadge status={server.status} />
        {server.error && server.status === 'failed' && <span className="text-sm text-signal-red">{server.error.errorMessage}</span>}
        {dirty && <span className="text-sm text-signal-amber">Unsaved changes. Save before publishing or regenerating.</span>}
        {locked && <span className="text-sm text-ink-soft">Publishing in progress. Editing is locked.</span>}
      </div>

      {server.quality && (
        <section className={`mb-5 rounded-xl border p-4 ${server.quality.passed ? 'border-signal-green/30 bg-signal-greenbg' : 'border-signal-amber/40 bg-signal-amberbg'}`} aria-labelledby="qc">
          <h2 id="qc" className="flex items-center gap-2 font-display text-base font-bold">{!server.quality.passed && <AlertTriangle className="h-4 w-4 text-signal-amber" />}Quality check: {server.quality.passed ? 'passed' : 'needs review'} <span className="text-sm font-normal text-ink-soft">score {server.quality.score}/100</span></h2>
          {issues.length > 0 ? <ul className="mt-2 space-y-1 text-sm">{issues.map((i, k) => <li key={k}><strong className={i.severity === 'error' ? 'text-signal-red' : 'text-signal-amber'}>{i.severity === 'error' ? 'Fix' : 'Check'}</strong> {i.platform !== 'all' ? `${PLATFORM_LABELS[i.platform]}${i.field ? ' · ' + i.field : ''}: ` : ''}{i.message}</li>)}</ul> : <p className="mt-1 text-sm text-ink-soft">No issues found.</p>}
        </section>
      )}

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2 pr-3">
          <Tabs value={tab} onChange={setTab} tabs={[...server.platforms.map((p) => ({ id: p as Platform | 'history', label: PLATFORM_LABELS[p] })), { id: 'history' as const, label: 'Versions', badge: <span className="rounded-full bg-canvas px-1.5 text-xs">{versions.data?.length ?? 0}</span> }]} />
          <div className="flex gap-2 py-2">
            <button className="btn-secondary !py-1.5" disabled={dirty || locked} onClick={() => setRegen({ scope: 'all', label: 'all content' })}><RefreshCw className="h-4 w-4" />Regenerate all</button>
            {tab !== 'history' && <button className="btn-secondary !py-1.5" disabled={dirty || locked} onClick={() => setRegen({ scope: 'platform', platform: tab, label: `${PLATFORM_LABELS[tab]} content` })}><RefreshCw className="h-4 w-4" />Regenerate {PLATFORM_LABELS[tab]}</button>}
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div><label className="mb-1 block text-sm font-medium" htmlFor="title">Internal title</label><input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} /></div>

          {tab === 'instagram' && ig && <>
            <Txt platform="instagram" field="hook" label="Hook" value={ig.hook} onChange={(v) => setP('instagram', { hook: v })} />
            <Txt platform="instagram" field="caption" label="Caption" rows={7} value={ig.caption} onChange={(v) => setP('instagram', { caption: v })} />
            <Txt platform="instagram" field="cta" label="CTA" value={ig.cta} onChange={(v) => setP('instagram', { cta: v })} />
            <List platform="instagram" field="hashtags" label="Hashtags" value={ig.hashtags} onChange={(v) => setP('instagram', { hashtags: v })} />
            <List platform="instagram" field="keywords" label="Keywords" value={ig.keywords} onChange={(v) => setP('instagram', { keywords: v })} />
            <Txt platform="instagram" field="altText" label="Alt text" max={125} value={ig.altText} onChange={(v) => setP('instagram', { altText: v })} />
            <Txt platform="instagram" field="coverText" label="Suggested cover text" value={ig.coverText} onChange={(v) => setP('instagram', { coverText: v })} />
            <Txt platform="instagram" field="shortCaption" label="Short caption version" rows={2} value={ig.shortCaption} onChange={(v) => setP('instagram', { shortCaption: v })} />
            <Txt platform="instagram" field="longCaption" label="Long caption version" rows={6} value={ig.longCaption} onChange={(v) => setP('instagram', { longCaption: v })} />
            <p className="rounded-lg bg-canvas p-3 text-sm text-ink-soft">Published caption = hook + caption + CTA + hashtags. The short and long versions are alternates you can paste into the caption field.</p>
          </>}

          {tab === 'facebook' && fb && <>
            <Txt platform="facebook" field="title" label="Post title" max={100} value={fb.title} onChange={(v) => setP('facebook', { title: v })} />
            <Txt platform="facebook" field="description" label="Description" rows={3} value={fb.description} onChange={(v) => setP('facebook', { description: v })} />
            <Txt platform="facebook" field="caption" label="Caption" rows={7} value={fb.caption} onChange={(v) => setP('facebook', { caption: v })} />
            <Txt platform="facebook" field="cta" label="CTA" value={fb.cta} onChange={(v) => setP('facebook', { cta: v })} />
            <List platform="facebook" field="hashtags" label="Hashtags" value={fb.hashtags} onChange={(v) => setP('facebook', { hashtags: v })} />
          </>}

          {tab === 'website' && web && <>
            <Txt platform="website" field="seoTitle" label="SEO title" max={60} value={web.seoTitle} onChange={(v) => setP('website', { seoTitle: v })} />
            <Txt platform="website" field="metaDescription" label="Meta description" rows={2} max={155} value={web.metaDescription} onChange={(v) => setP('website', { metaDescription: v })} />
            <Txt platform="website" field="h1" label="H1 (post title)" value={web.h1} onChange={(v) => setP('website', { h1: v })} />
            <Txt platform="website" field="slug" label="URL slug" value={web.slug} onChange={(v) => setP('website', { slug: v })} />
            <Txt platform="website" field="shortDescription" label="Short description (excerpt)" rows={2} value={web.shortDescription} onChange={(v) => setP('website', { shortDescription: v })} />
            <div>
              <div className="mb-1 flex items-center justify-between"><span className="text-sm font-medium" id="art-label">Article</span><R platform="website" field="articleHtml" /></div>
              <RichTextEditor label="Article" value={web.articleHtml} onChange={(v) => !locked && setP('website', { articleHtml: v })} />
            </div>
            <Txt platform="website" field="primaryKeyword" label="Primary keyword" value={web.primaryKeyword} onChange={(v) => setP('website', { primaryKeyword: v })} />
            <List platform="website" field="secondaryKeywords" label="Secondary keywords" value={web.secondaryKeywords} onChange={(v) => setP('website', { secondaryKeywords: v })} />
            <PairEditor title="FAQ" a="question" b="answer" aLabel="Question" bLabel="Answer" items={web.faq} onChange={(v) => setP('website', { faq: v })} />
            <Txt platform="website" field="imageAltText" label="Image alt text" value={web.imageAltText} onChange={(v) => setP('website', { imageAltText: v })} />
            <PairEditor title="Suggested internal links" a="anchor" b="suggestion" aLabel="Anchor text" bLabel="Link to" items={web.internalLinks} onChange={(v) => setP('website', { internalLinks: v })} />
            <PairEditor title="Suggested external references" a="title" b="note" aLabel="Source type" bLabel="Why cite it" items={web.externalReferences} onChange={(v) => setP('website', { externalReferences: v })} />
            <List platform="website" field="categories" label="Categories" value={web.categories} onChange={(v) => setP('website', { categories: v })} />
            <List platform="website" field="tags" label="Tags" value={web.tags} onChange={(v) => setP('website', { tags: v })} />
            <SchemaEditor value={web.schemaJsonLd} onChange={(v) => setP('website', { schemaJsonLd: v })} />
          </>}

          {tab === 'history' && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold"><History className="h-5 w-5" />Version history</h2>
              {versions.loading ? <Skeleton className="h-24" /> : <ul className="divide-y divide-ink-line">{(versions.data ?? []).map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div><strong>Version {v.version}</strong>{v.version === server.version && <span className="ml-2 rounded-full bg-harbor-100 px-2 py-0.5 text-xs text-harbor-700">current</span>}
                    <p className="text-ink-soft capitalize">{v.reason}{v.instruction ? ` · “${v.instruction}”` : ''} · {formatDateTime(v.createdAt)}</p></div>
                  {v.version !== server.version && <button className="btn-secondary !py-1" disabled={dirty || locked} onClick={() => restore(v)}><RotateCcw className="h-4 w-4" />Restore</button>}
                </li>))}</ul>}
            </div>
          )}
        </div>

        {tab !== 'history' && (
          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-ink-line bg-white/95 px-5 py-3 backdrop-blur">
            <button className="btn-secondary" disabled={!dirty || saving} onClick={() => { setDraft(server.content); setTitle(server.title); }}><RotateCcw className="h-4 w-4" />Reset</button>
            <button className="btn-primary" disabled={!dirty || saving || locked} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save</button>
          </div>
        )}
      </div>

      {regen && <RegenerateDialog contentId={server.id} target={regen} onClose={() => setRegen(null)} />}
      {dialog && <PublishDialog content={server} mode={dialog} onClose={() => setDialog(null)} />}
      <ConfirmDialog open={confirmDelete} danger title="Delete this content?" confirmLabel="Delete" message="The generated content and its versions will be deleted. Already published posts stay on their platforms. Pending scheduled posts are cancelled." onConfirm={remove} onClose={() => setConfirmDelete(false)} />
    </>
  );
}

function PairEditor<K extends string>({ title, a, b, aLabel, bLabel, items, onChange }: { title: string; a: K; b: K; aLabel: string; bLabel: string; items: Record<K, string>[]; onChange: (v: Record<K, string>[]) => void }) {
  const set = (i: number, k: K, v: string) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  return (
    <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">{title}</legend>
      {items.map((it, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-ink-line p-3 sm:grid-cols-[1fr_1.5fr_auto]">
          <input className="input" aria-label={`${aLabel} ${i + 1}`} placeholder={aLabel} value={it[a]} onChange={(e) => set(i, a, e.target.value)} />
          <textarea className="input" rows={2} aria-label={`${bLabel} ${i + 1}`} placeholder={bLabel} value={it[b]} onChange={(e) => set(i, b, e.target.value)} />
          <button type="button" className="btn-ghost self-start" aria-label={`Remove ${title} item ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
        </div>))}
      <button type="button" className="btn-secondary !py-1" onClick={() => onChange([...items, { [a]: '', [b]: '' } as Record<K, string>])}>Add item</button>
    </fieldset>
  );
}

function SchemaEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(JSON.stringify(value, null, 2)); }, [value]);
  return (
    <div><label className="mb-1 block text-sm font-medium" htmlFor="schema">Schema.org structured data (JSON-LD)</label>
      <textarea id="schema" className="input font-mono text-xs" rows={8} value={text} onChange={(e) => { setText(e.target.value); try { const p = JSON.parse(e.target.value); if (typeof p !== 'object' || Array.isArray(p) || !p) throw new Error('Must be a JSON object'); onChange(p); setErr(null); } catch (x) { setErr((x as Error).message); } }} />
      {err && <p role="alert" className="mt-1 text-xs text-signal-red">Invalid JSON: {err}. Changes are not applied until valid.</p>}
    </div>
  );
}

function RegenerateDialog({ contentId, target, onClose }: { contentId: string; target: RegenTarget; onClose: () => void }) {
  const toast = useToast();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await post('/content/regenerate', { contentId, scope: target.scope, platform: target.platform, field: target.field, instruction: instruction.trim() || undefined });
      toast.success('Regenerated. The previous version is saved in Versions.');
      onClose();
    } catch (e) { toast.error(errMessage(e)); setBusy(false); }
  };
  return (
    <Modal open title={`Regenerate ${target.label}`} onClose={onClose} footer={<><button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Regenerate</button></>}>
      <label className="label" htmlFor="instr">Instructions (optional)</label>
      <textarea id="instr" className="input" rows={3} maxLength={600} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="For example: make it shorter and more local." />
      <div className="mt-3 flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p} type="button" className="rounded-full border border-ink-line px-2.5 py-1 text-xs hover:bg-harbor-50" onClick={() => setInstruction(p)}>{p}</button>)}</div>
      <p className="hint mt-3">The existing content is used as context and the current version is kept so you can restore it.</p>
    </Modal>
  );
}
