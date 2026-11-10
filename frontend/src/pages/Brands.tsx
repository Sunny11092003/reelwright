import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Skeleton } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useAsync } from '../hooks';
import { del, errMessage, get, post, put } from '../services/api';
import type { Brand } from '../types';
import { csv } from '../utils/format';

type Form = Omit<Brand, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'keywords' | 'forbiddenWords' | 'colors'> & { keywords: string; forbiddenWords: string; colors: string };
const blank: Form = { name: '', description: '', website: '', industry: '', country: '', city: '', targetAudience: '', tone: '', keywords: '', forbiddenWords: '', preferredCta: '', socialHandles: {}, logoUrl: '', colors: '' };

export function Brands() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => get<Brand[]>('/brands'), []);
  const [editing, setEditing] = useState<{ id?: string; form: Form } | null>(null);
  const [remove, setRemove] = useState<Brand | null>(null);
  const edit = (b: Brand) => setEditing({ id: b.id, form: { ...b, keywords: b.keywords.join(', '), forbiddenWords: b.forbiddenWords.join(', '), colors: b.colors.join(', '), logoUrl: b.logoUrl ?? '' } });
  const doRemove = async () => { if (!remove) return; try { await del(`/brands/${remove.id}`); toast.success('Brand deleted'); reload(); } catch (e) { toast.error(errMessage(e)); } setRemove(null); };
  return (
    <>
      <PageHeader title="Brand profiles" description="The AI follows the selected profile for tone, audience, keywords and forbidden words." actions={<button className="btn-primary" onClick={() => setEditing({ form: blank })}><Plus className="h-4 w-4" />New brand</button>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading ? <Skeleton className="h-40" /> : data && data.length === 0 ? <EmptyState title="No brand profiles" description="Add your first brand so generated content matches your voice." /> :
        <div className="grid gap-3 md:grid-cols-2">{data?.map((b) => (
          <article key={b.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">{b.name}</h2><p className="text-sm text-ink-soft">{[b.industry, [b.city, b.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p></div>
              <div className="flex gap-1">{b.colors.map((c) => <span key={c} className="h-5 w-5 rounded-full border border-ink-line" style={{ background: c }} title={c} />)}</div></div>
            <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{b.description}</p>
            <div className="mt-3 flex gap-2"><button className="btn-secondary !py-1" onClick={() => edit(b)}><Pencil className="h-4 w-4" />Edit</button><button className="btn-ghost !py-1 text-signal-red" onClick={() => setRemove(b)}><Trash2 className="h-4 w-4" />Delete</button></div>
          </article>))}</div>}
      {editing && <BrandDialog initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={Boolean(remove)} danger title="Delete brand?" confirmLabel="Delete" message={`${remove?.name} will be deleted. Brands used by uploaded videos cannot be deleted.`} onConfirm={doRemove} onClose={() => setRemove(null)} />
    </>
  );
}

function BrandDialog({ initial, onClose, onSaved }: { initial: { id?: string; form: Form }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(initial.form);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const handle = (k: keyof Form['socialHandles']) => (e: { target: { value: string } }) => setF({ ...f, socialHandles: { ...f.socialHandles, [k]: e.target.value } });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { ...f, keywords: csv(f.keywords), forbiddenWords: csv(f.forbiddenWords), colors: csv(f.colors), logoUrl: f.logoUrl || undefined };
    try { initial.id ? await put(`/brands/${initial.id}`, body) : await post('/brands', body); toast.success('Brand saved'); onSaved(); }
    catch (x) { setErr(errMessage(x)); setBusy(false); }
  };
  return (
    <Modal open wide title={initial.id ? 'Edit brand' : 'New brand'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand name" htmlFor="b-name"><input id="b-name" className="input" required value={f.name} onChange={set('name')} /></Field>
        <Field label="Website" htmlFor="b-web"><input id="b-web" className="input" value={f.website} onChange={set('website')} /></Field>
        <div className="sm:col-span-2"><Field label="Company description" htmlFor="b-desc"><textarea id="b-desc" className="input" rows={3} value={f.description} onChange={set('description')} /></Field></div>
        <Field label="Industry" htmlFor="b-ind"><input id="b-ind" className="input" value={f.industry} onChange={set('industry')} /></Field>
        <Field label="Target audience" htmlFor="b-aud"><input id="b-aud" className="input" value={f.targetAudience} onChange={set('targetAudience')} /></Field>
        <Field label="Country" htmlFor="b-country"><input id="b-country" className="input" value={f.country} onChange={set('country')} /></Field>
        <Field label="City" htmlFor="b-city"><input id="b-city" className="input" value={f.city} onChange={set('city')} /></Field>
        <Field label="Brand tone" htmlFor="b-tone" hint="For example warm, reassuring, plain language."><input id="b-tone" className="input" value={f.tone} onChange={set('tone')} /></Field>
        <Field label="Preferred CTA" htmlFor="b-cta"><input id="b-cta" className="input" value={f.preferredCta} onChange={set('preferredCta')} /></Field>
        <Field label="Brand keywords" htmlFor="b-kw" hint="Comma separated."><input id="b-kw" className="input" value={f.keywords} onChange={set('keywords')} /></Field>
        <Field label="Forbidden words" htmlFor="b-fw" hint="The quality check fails content that uses these."><input id="b-fw" className="input" value={f.forbiddenWords} onChange={set('forbiddenWords')} /></Field>
        <Field label="Instagram handle" htmlFor="b-ig"><input id="b-ig" className="input" value={f.socialHandles.instagram ?? ''} onChange={handle('instagram')} /></Field>
        <Field label="Facebook page" htmlFor="b-fb"><input id="b-fb" className="input" value={f.socialHandles.facebook ?? ''} onChange={handle('facebook')} /></Field>
        <Field label="Logo URL" htmlFor="b-logo"><input id="b-logo" className="input" value={f.logoUrl ?? ''} onChange={set('logoUrl')} /></Field>
        <Field label="Brand colors" htmlFor="b-col" hint="Hex values, comma separated, for example #0E2A2B, #E9A63A."><input id="b-col" className="input" value={f.colors} onChange={set('colors')} /></Field>
        {err && <p role="alert" className="rounded-lg bg-signal-redbg p-2 text-sm text-signal-red sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save brand</button></div>
      </form>
    </Modal>
  );
}
