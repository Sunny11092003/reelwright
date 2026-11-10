import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAsync } from '../hooks';
import { errMessage, get, post } from '../services/api';
import { PLATFORM_LABELS, type ConnectedAccount, type GeneratedContent, type Platform, type UserSettings } from '../types';
import { browserTimezone, formatDateTime, zonedTimeToUtcIso, timezones } from '../utils/format';
import { Modal, Skeleton } from './ui';

function excerpt(c: GeneratedContent, p: Platform): string {
  if (p === 'instagram') return [c.content.instagram?.hook, c.content.instagram?.caption].filter(Boolean).join('\n');
  if (p === 'facebook') return c.content.facebook?.caption ?? '';
  return c.content.website?.seoTitle ?? '';
}

export function PublishDialog({ content, mode, onClose, onDone }: { content: GeneratedContent; mode: 'publish' | 'schedule'; onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const accounts = useAsync(() => get<ConnectedAccount[]>('/accounts'), []);
  const settings = useAsync(() => get<UserSettings>('/settings'), []);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(content.platforms.map((p) => [p, true])));
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [wpStatus, setWpStatus] = useState<'publish' | 'draft'>('publish');
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState('19:30');
  const [tz, setTz] = useState(browserTimezone());
  const [busy, setBusy] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  const byPlatform = useMemo(() => {
    const m: Record<string, ConnectedAccount[]> = {};
    (accounts.data ?? []).filter((a) => a.status === 'connected').forEach((a) => { (m[a.platform] ??= []).push(a); });
    return m;
  }, [accounts.data]);
  const accountFor = (p: Platform): ConnectedAccount | undefined => byPlatform[p]?.find((a) => a.id === chosen[p]) ?? byPlatform[p]?.[0];
  const targets = content.platforms.filter((p) => selected[p]).map((p) => ({ platform: p, accountId: accountFor(p)?.id ?? '' }));
  const missing = targets.filter((t) => !t.accountId).map((t) => PLATFORM_LABELS[t.platform]);
  const scheduledAtIso = (() => { try { return zonedTimeToUtcIso(date, time, tz); } catch { return ''; } })();
  const scheduleInvalid = mode === 'schedule' && (!scheduledAtIso || new Date(scheduledAtIso).getTime() < Date.now() + 60_000);
  const canContinue = targets.length > 0 && missing.length === 0 && !scheduleInvalid;

  const submit = async () => {
    setBusy(true);
    try {
      const options = selected.website ? { wordpressStatus: wpStatus } : {};
      if (mode === 'publish') {
        await post('/publish', { contentId: content.id, targets, options });
        toast.success('Publishing started. Track progress on the Publishing page.');
        nav('/publishing');
      } else {
        await post('/publish/schedule', { contentId: content.id, targets, scheduledAt: scheduledAtIso, timezone: tz, options });
        toast.success(`Scheduled for ${formatDateTime(scheduledAtIso, tz)}`);
        nav('/scheduled');
      }
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(errMessage(e));
      setBusy(false);
    }
  };

  const title = mode === 'publish' ? 'Publish' : 'Schedule';
  return (
    <Modal open title={confirmStep ? `Confirm ${title.toLowerCase()}` : `${title} “${content.title}”`} onClose={onClose} wide
      footer={confirmStep ? (<>
        <button className="btn-secondary" onClick={() => setConfirmStep(false)} disabled={busy}>Back</button>
        <button className="btn-accent" onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'publish' ? 'Publish now' : 'Schedule'}</button>
      </>) : (<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => setConfirmStep(true)} disabled={!canContinue}>Review</button>
      </>)}>
      {accounts.loading || settings.loading ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : confirmStep ? (
        <div className="space-y-4">
          {content.needsReview && <p className="rounded-lg bg-signal-amberbg p-3 text-sm text-signal-amber">This content was flagged by the quality check. Make sure you reviewed the issues before posting.</p>}
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <img src={content.thumbnailUrl} alt="Video thumbnail" className="aspect-video w-full rounded-lg object-cover" />
            <dl className="text-sm">
              <dt className="font-semibold">Video</dt><dd className="mb-2 text-ink-soft">{content.title}</dd>
              <dt className="font-semibold">When</dt><dd className="text-ink-soft">{mode === 'publish' ? 'Immediately' : `${formatDateTime(scheduledAtIso, tz)} (${tz})`}</dd>
            </dl>
          </div>
          {targets.map((t) => (
            <div key={t.platform} className="rounded-lg border border-ink-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{PLATFORM_LABELS[t.platform]}</strong><span className="text-ink-soft">{accountFor(t.platform)?.name}{t.platform === 'website' ? ` · ${wpStatus === 'draft' ? 'save as draft' : 'publish'}` : ''}</span></div>
              <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-ink-soft">{excerpt(content, t.platform)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="sr-only">Platforms</legend>
            {content.platforms.map((p) => (
              <div key={p} className="rounded-lg border border-ink-line p-3">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-harbor-700" checked={Boolean(selected[p])} onChange={(e) => setSelected({ ...selected, [p]: e.target.checked })} />{PLATFORM_LABELS[p]}</label>
                {selected[p] && (byPlatform[p]?.length ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div><label className="label" htmlFor={`acc-${p}`}>Account</label>
                      <select id={`acc-${p}`} className="input" value={accountFor(p)?.id} onChange={(e) => setChosen({ ...chosen, [p]: e.target.value })}>{byPlatform[p].map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                    {p === 'website' && <div><label className="label" htmlFor="wp-status">Post status</label>
                      <select id="wp-status" className="input" value={wpStatus} onChange={(e) => setWpStatus(e.target.value as 'publish' | 'draft')}><option value="publish">Publish</option><option value="draft">Save as draft</option></select></div>}
                  </div>
                ) : <p className="mt-2 text-sm text-signal-red">No connected {PLATFORM_LABELS[p]} account. Connect one on the Connected accounts page.</p>)}
              </div>
            ))}
          </fieldset>
          {mode === 'schedule' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="label" htmlFor="s-date">Date</label><input id="s-date" type="date" className="input" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><label className="label" htmlFor="s-time">Time</label><input id="s-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
              <div><label className="label" htmlFor="s-tz">Timezone</label><select id="s-tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)}>{timezones().map((z) => <option key={z}>{z}</option>)}</select></div>
              {scheduleInvalid && <p className="text-sm text-signal-red sm:col-span-3">Pick a time at least one minute in the future.</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
