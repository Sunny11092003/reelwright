import { ALLOWED_VIDEO_EXTENSIONS } from '../shared/constants';
import { MAX_UPLOAD_MB } from '../config/firebase';
import { post } from './api';
import type { VideoDoc } from '../types';

interface Signature { cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string; allowedFormats: string; uploadUrl: string; maxBytes: number }

export function validateVideoFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return `Unsupported format .${ext || '?'}. Use ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}.`;
  if (!file.type.startsWith('video/') && file.type !== '') return 'This file is not a video.';
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `File is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_UPLOAD_MB} MB.`;
  if (file.size === 0) return 'The file is empty.';
  return null;
}

export interface UploadHandle { promise: Promise<VideoDoc>; cancel: () => void }

/** Direct browser -> Cloudinary upload with signed params from our backend; then registers the video. */
export function uploadVideo(file: File, brandId: string | null, onProgress: (pct: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  let cancelled = false;
  const promise = (async () => {
    const sig = await post<Signature>('/videos/upload-signature');
    if (cancelled) throw new DOMException('Upload cancelled', 'AbortError');
    const uploaded = await new Promise<{ publicId: string; duration?: number }>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sig.apiKey);
      form.append('timestamp', String(sig.timestamp));
      form.append('signature', sig.signature);
      form.append('folder', sig.folder);
      form.append('allowed_formats', sig.allowedFormats);
      xhr.open('POST', sig.uploadUrl);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let body: { public_id?: string; duration?: number; error?: { message?: string } } = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && body.public_id) resolve({ publicId: body.public_id, duration: body.duration });
        else reject(new Error(body.error?.message ?? `Upload failed (HTTP ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload. Check your connection and retry.'));
      xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
      xhr.send(form);
    });
    onProgress(100);
    return post<VideoDoc>('/videos/upload', { publicId: uploaded.publicId, filename: file.name, brandId, duration: uploaded.duration });
  })();
  return { promise, cancel: () => { cancelled = true; xhr.abort(); } };
}