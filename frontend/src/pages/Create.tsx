import { FileVideo, Loader2, RotateCcw, UploadCloud, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PipelineStrip } from '../components/PipelineStrip';
import { ErrorState, Field, PageHeader, ProgressBar, Spinner } from '../components/ui';
import { MAX_UPLOAD_MB } from '../config/firebase';
import { useToast } from '../contexts/ToastContext';
import { useAsync, useDoc } from '../hooks';
import { errMessage, get, post } from '../services/api';
import { uploadVideo, validateVideoFile, type UploadHandle } from '../services/upload';
import { PLATFORM_LABELS, PLATFORMS, type Brand, type GeneratedContent, type Platform, type SEOAnalysis, type UserSettings, type VideoAnalysis, type VideoDoc } from '../types';
import { formatBytes, formatDuration } from '../utils/format';

export function Create() {
  const [params, setParams] = useSearchParams();
  const videoId = params.get('video');
  const seoId = params.get('seo');
  const contentId = params.get('content');
  const nav = useNavigate();
  const toast = useToast();
  const brands = useAsync(() => get<Brand[]>('/brands'), []);
  const settings = useAsync(() => get<UserSettings>('/settings'), []);
  const video = useDoc<VideoDoc>('videos', videoId);
  const analysis = useDoc<VideoAnalysis>('videoAnalysis', video.data?.analysisId);
  const seo = useDoc<SEOAnalysis>('seoAnalyses', seoId);
  const content = useDoc<GeneratedContent>('content', contentId);
  const [brandId, setBrandId] = useState<string>('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!brandId && settings.data?.defaultBrandId) setBrandId(settings.data.defaultBrandId);
  }, [settings.data, brandId]);
  useEffect(() => { if (content.data?.status === 'ready') nav(`/content/${content.data.id}`, { replace: true }); }, [content.data, nav]);

  const setParam = useCallback((k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const step = !videoId ? 0 : video.data?.status === 'analyzed' ? (!seoId || seo.data?.status !== 'ready' ? 2 : 3) : 1;
  const busy = video.data?.status === 'analyzing' || seo.data?.status === 'pending' || content.data?.status === 'generating';
  const failedAt = video.data?.status === 'failed' ? 1 : seo.data?.status === 'failed' ? 2 : content.data?.status === 'failed' ? 3 : undefined;

  const analyze = async () => {
    setStarting(true);
    try { await post('/videos/analyze', { videoId }); } catch (e) { toast.error(errMessage(e)); } finally { setStarting(false); }
  };

  return (
    <>
      <PageHeader title="Create content" description="Upload one video. The agent analyzes it, researches keywords and drafts posts for each channel." />
      <PipelineStrip current={step} busy={busy} failedAt={failedAt} />
      <div className="mt-6">
        {step === 0 && <UploadStep brands={brands.data ?? []} brandId={brandId} setBrandId={setBrandId} onUploaded={(v) => setParam('video', v.id)} />}
        {videoId && video.loading && <Spinner label="Loading video" />}
        {videoId && !video.loading && !video.data && <ErrorState message="Video not found." onRetry={() => setParams({})} />}
        {video.data && (
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <VideoCard v={video.data} />
            <div className="space-y-6">
              {(video.data.status === 'uploaded' || video.data.status === 'failed') && (
                <div className="panel p-5">
                  {video.data.status === 'failed' && video.data.error && <div className="mb-4"><ErrorState message={`Analysis failed: ${video.data.error.errorMessage} (${video.data.error.errorCode})`} /></div>}
                  <h2 className="font-display text-lg font-bold">Analyze the video</h2>
                  <p className="mt-1 text-sm text-ink-soft">The AI watches the video and listens to the audio to extract the transcript, scenes, on-screen text, brands, location and intent. This usually takes one to three minutes.</p>
                  <button className="btn-primary mt-4" onClick={analyze} disabled={starting}>{starting && <Loader2 className="h-4 w-4 animate-spin" />}{video.data.status === 'failed' ? 'Retry analysis' : 'Analyze video'}</button>
                </div>
              )}
              {video.data.status === 'analyzing' && <div className="panel p-5"><Spinner label="Analyzing video. You can leave this page; progress is saved." /></div>}
              {analysis.data && <AnalysisCard a={analysis.data} />}
              {video.data.status === 'analyzed' && analysis.data && (seo.data?.status !== 'ready') && (
                <SeoStep video={video.data} analysis={analysis.data} brands={brands.data ?? []} settings={settings.data} seo={seo.data} brandId={brandId || video.data.brandId || ''} onStarted={(id) => setParam('seo', id)} />
              )}
              {seo.data?.status === 'ready' && <SeoResult seo={seo.data} />}
              {seo.data?.status === 'ready' && (
                <GenerateStep videoId={video.data.id} seo={seo.data} content={content.data} settings={settings.data} onStarted={(id) => setParam('content', id)} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function UploadStep({ brands, brandId, setBrandId, onUploaded }: { brands: Brand[]; brandId: string; setBrandId: (s: string) => void; onUploaded: (v: VideoDoc) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const handle = useRef<UploadHandle | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const problem = validateVideoFile(f);
    setError(problem);
    setFile(problem ? null : f);
  };
  const start = async () => {
    if (!file) return;
    setUploading(true); setError(null); setProgress(0);
    handle.current = uploadVideo(file, brandId || null, setProgress);
    try { onUploaded(await handle.current.promise); }
    catch (e) { if ((e as Error).name !== 'AbortError') setError(errMessage(e)); }
    finally { setUploading(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        {!file ? (
          <label htmlFor="video-input" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${drag ? 'border-marigold-500 bg-marigold-100' : 'border-ink-line bg-white hover:border-harbor-500'}`}>
            <UploadCloud className="h-10 w-10 text-harbor-500" aria-hidden />
            <span className="mt-3 font-display text-lg font-bold">Drop a video here, or choose a file</span>
            <span className="mt-1 text-sm text-ink-soft">MP4, MOV, WebM, MKV or AVI · up to {MAX_UPLOAD_MB} MB · 3 seconds to 20 minutes</span>
            <input id="video-input" type="file" accept="video/*,.mkv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            <span className="btn-primary mt-5">Choose video</span>
          </label>
        ) : (
          <div className="panel overflow-hidden">
            <video src={preview ?? undefined} controls className="max-h-[26rem] w-full bg-black" aria-label="Video preview" />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><FileVideo className="h-5 w-5 shrink-0 text-harbor-500" /><span className="truncate text-sm font-semibold">{file.name}</span></div><span className="text-sm text-ink-soft">{formatBytes(file.size)}</span></div>
              {uploading && <ProgressBar value={progress} label="Upload progress" />}
              {uploading && <p className="text-sm text-ink-soft" role="status">{progress < 100 ? `Uploading ${progress}%` : 'Finishing up'}</p>}
              <div className="flex gap-2">
                {uploading ? <button className="btn-secondary" onClick={() => handle.current?.cancel()}><X className="h-4 w-4" />Cancel upload</button> : <>
                  <button className="btn-primary" onClick={start}>{error ? <><RotateCcw className="h-4 w-4" />Retry upload</> : 'Upload video'}</button>
                  <button className="btn-ghost" onClick={() => { setFile(null); setError(null); }}>Choose another</button></>}
              </div>
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-3 rounded-lg bg-signal-redbg p-3 text-sm text-signal-red">{error}</p>}
      </div>
      <div className="panel h-fit p-4">
        <Field label="Brand profile" htmlFor="brand" hint="The AI uses this profile's tone, audience, keywords and forbidden words.">
          <select id="brand" className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={uploading}>
            <option value="">No brand profile</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        {brands.length === 0 && <p className="hint">No brands yet. <Link to="/brands" className="text-harbor-700 underline">Create one</Link> for better results.</p>}
      </div>
    </div>
  );
}

function VideoCard({ v }: { v: VideoDoc }) {
  return (
    <div className="panel h-fit overflow-hidden">
      <video src={v.url} poster={v.thumbnailUrl} controls preload="metadata" className="aspect-video w-full bg-black" aria-label="Uploaded video" />
      <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
        <div className="col-span-2"><dt className="text-ink-faint">Filename</dt><dd className="truncate font-medium">{v.filename}</dd></div>
        <div><dt className="text-ink-faint">Duration</dt><dd className="font-medium">{formatDuration(v.durationSeconds)}</dd></div>
        <div><dt className="text-ink-faint">Size</dt><dd className="font-medium">{formatBytes(v.bytes)}</dd></div>
        <div><dt className="text-ink-faint">Resolution</dt><dd className="font-medium">{v.width}×{v.height}</dd></div>
        <div><dt className="text-ink-faint">Upload</dt><dd className="font-medium">Complete</dd></div>
      </dl>
    </div>
  );
}

function AnalysisCard({ a }: { a: VideoAnalysis }) {
  const row = (k: string, v: string) => v ? <div><dt className="text-ink-faint">{k}</dt><dd className="font-medium">{v}</dd></div> : null;
  return (
    <section className="panel p-5" aria-labelledby="an">
      <h2 id="an" className="font-display text-lg font-bold">{a.titleSuggestion}</h2>
      <p className="mt-1 text-sm text-ink-soft">{a.summary}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{row('Topic', a.topic)}{row('Audience', a.audience)}{row('Location', a.location)}{row('Intent', a.intent)}{row('Brand mentions', a.brandMentions.join(', '))}{row('Call to action in video', a.callToAction)}</dl>
      {a.keywords.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{a.keywords.map((k) => <span key={k} className="rounded-full bg-harbor-50 px-2.5 py-0.5 text-xs text-harbor-700">{k}</span>)}</div>}
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Transcript and scenes</summary>
        <p className="mt-2 whitespace-pre-line text-ink-soft">{a.transcript || 'No speech detected.'}</p>
        <ul className="mt-3 space-y-1.5">{a.scenes.map((s, i) => <li key={i} className="text-ink-soft"><span className="font-mono text-xs text-ink-faint">{formatDuration(s.startSeconds)}–{formatDuration(s.endSeconds)}</span> {s.description}{s.onScreenText ? ` (text: “${s.onScreenText}”)` : ''}</li>)}</ul>
      </details>
    </section>
  );
}

function SeoStep({ video, analysis, brands, settings, seo, brandId, onStarted }: { video: VideoDoc; analysis: VideoAnalysis; brands: Brand[]; settings: UserSettings | null; seo: SEOAnalysis | null; brandId: string; onStarted: (id: string) => void }) {
  const toast = useToast();
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const [ctx, setCtx] = useState({ brand: '', country: '', city: '', audience: '', industry: '', language: 'en', goal: '' });
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !settings) return;
    seeded.current = true;
    setCtx({
      brand: brand?.name ?? analysis.brandMentions[0] ?? '', country: brand?.country || settings.defaultCountry, city: brand?.city || analysis.location,
      audience: brand?.targetAudience || analysis.audience, industry: brand?.industry ?? '', language: settings.defaultLanguage || analysis.language || 'en', goal: settings.seo.goal,
    });
  }, [settings, brand, analysis]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof ctx) => (e: { target: { value: string } }) => setCtx({ ...ctx, [k]: e.target.value });
  const run = async () => {
    setBusy(true);
    try { const r = await post<{ seoId: string }>('/seo/analyze', { videoId: video.id, context: { ...ctx, brandId: brandId || null } }); onStarted(r.seoId); }
    catch (e) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };
  if (seo?.status === 'pending') return <div className="panel p-5"><Spinner label="Researching keywords and search intent" /></div>;
  return (
    <section className="panel p-5" aria-labelledby="seo">
      <h2 id="seo" className="font-display text-lg font-bold">SEO context</h2>
      <p className="mt-1 text-sm text-ink-soft">Pre-filled from your brand and the video. Adjust anything before the keyword research runs.</p>
      {seo?.status === 'failed' && seo.error && <div className="mt-3"><ErrorState message={`SEO analysis failed: ${seo.error.errorMessage}`} /></div>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Brand" htmlFor="c-brand"><input id="c-brand" className="input" value={ctx.brand} onChange={set('brand')} /></Field>
        <Field label="Industry" htmlFor="c-ind"><input id="c-ind" className="input" value={ctx.industry} onChange={set('industry')} /></Field>
        <Field label="Country" htmlFor="c-country"><input id="c-country" className="input" value={ctx.country} onChange={set('country')} /></Field>
        <Field label="City" htmlFor="c-city"><input id="c-city" className="input" value={ctx.city} onChange={set('city')} /></Field>
        <Field label="Target audience" htmlFor="c-aud"><input id="c-aud" className="input" value={ctx.audience} onChange={set('audience')} /></Field>
        <Field label="Content language" htmlFor="c-lang" hint="Language name or code, for example English or hi."><input id="c-lang" className="input" value={ctx.language} onChange={set('language')} /></Field>
        <div className="sm:col-span-2"><Field label="SEO goal" htmlFor="c-goal"><input id="c-goal" className="input" value={ctx.goal} onChange={set('goal')} /></Field></div>
      </div>
      <button className="btn-primary mt-5" onClick={run} disabled={busy || !ctx.language}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Run SEO analysis</button>
    </section>
  );
}

function SeoResult({ seo }: { seo: SEOAnalysis }) {
  const chips = (label: string, items: string[]) => items.length ? <div><dt className="mb-1 text-ink-faint">{label}</dt><dd className="flex flex-wrap gap-1.5">{items.map((k) => <span key={k} className="rounded-full bg-harbor-50 px-2.5 py-0.5 text-xs text-harbor-700">{k}</span>)}</dd></div> : null;
  return (
    <section className="panel p-5" aria-labelledby="seor">
      <h2 id="seor" className="font-display text-lg font-bold">SEO plan</h2>
      <p className="mt-1 text-sm"><strong>{seo.primaryKeyword}</strong> <span className="text-ink-soft">· {seo.searchIntent} intent</span></p>
      <p className="mt-1 text-sm text-ink-soft">{seo.contentAngle}</p>
      <dl className="mt-4 space-y-3 text-sm">{chips('Secondary', seo.secondaryKeywords)}{chips('Long-tail', seo.longTailKeywords)}{chips('Questions', seo.questionKeywords)}{chips('Location', seo.locationKeywords)}{chips('Hashtags', seo.hashtags)}</dl>
    </section>
  );
}

function GenerateStep({ videoId, seo, content, settings, onStarted }: { videoId: string; seo: SEOAnalysis; content: GeneratedContent | null; settings: UserSettings | null; onStarted: (id: string) => void }) {
  const toast = useToast();
  const [platforms, setPlatforms] = useState<Platform[]>(settings?.publishing.defaultPlatforms ?? ['instagram', 'facebook', 'website']);
  const [busy, setBusy] = useState(false);
  if (content?.status === 'generating') return <div className="panel p-5"><Spinner label="Writing platform-specific content and running quality checks" /></div>;
  const toggle = (p: Platform) => setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  const run = async () => {
    setBusy(true);
    try { const r = await post<{ contentId: string }>('/content/generate', { videoId, seoId: seo.id, brandId: seo.brandId, platforms }); onStarted(r.contentId); }
    catch (e) { toast.error(errMessage(e)); } finally { setBusy(false); }
  };
  return (
    <section className="panel p-5" aria-labelledby="gen">
      <h2 id="gen" className="font-display text-lg font-bold">Generate content</h2>
      {content?.status === 'failed' && content.error && <div className="my-3"><ErrorState message={`Generation failed: ${content.error.errorMessage}`} /></div>}
      <fieldset className="mt-3 flex flex-wrap gap-4"><legend className="sr-only">Platforms</legend>
        {PLATFORMS.map((p) => <label key={p} className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-harbor-700" checked={platforms.includes(p)} onChange={() => toggle(p)} />{PLATFORM_LABELS[p]}</label>)}
      </fieldset>
      <button className="btn-accent mt-4" onClick={run} disabled={busy || platforms.length === 0}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Generate content</button>
    </section>
  );
}
