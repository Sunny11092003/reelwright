import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';
import { ALLOWED_VIDEO_EXTENSIONS } from '../../shared/constants';
import { AppError } from '../../utils/errors';
import { fetchWithTimeout, sleep } from '../../utils/http';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const userFolder = (userId: string) => `${env.CLOUDINARY_UPLOAD_FOLDER}/${userId}`;

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
  uploadUrl: string;
  maxBytes: number;
}

/** Signed parameters so the browser can upload directly to Cloudinary without ever seeing the API secret. */
export function signUpload(userId: string): UploadSignature {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = userFolder(userId);
  const allowedFormats = ALLOWED_VIDEO_EXTENSIONS.join(',');
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder, allowed_formats: allowedFormats }, env.CLOUDINARY_API_SECRET);
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    allowedFormats,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/video/upload`,
    maxBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  };
}

export interface CloudinaryVideo {
  publicId: string;
  url: string;
  format: string;
  bytes: number;
  duration: number;
  width: number;
  height: number;
}

export async function getVideoResource(userId: string, publicId: string, clientDuration?: number): Promise<CloudinaryVideo> {
  if (!publicId.startsWith(`${userFolder(userId)}/`)) {
    throw new AppError('FORBIDDEN', 'This upload does not belong to your account', 403);
  }
  type R = { public_id: string; secure_url: string; format: string; bytes: number; duration?: number; width?: number; height?: number };
  let r: R | null = null;
  for (let i = 0; i < 6; i++) {
    try {
      r = (await cloudinary.api.resource(publicId, { resource_type: 'video' })) as R;
    } catch (e) {
      const err = e as { error?: { http_code?: number; message?: string } };
      if (err.error?.http_code === 404 && i < 5) { await new Promise((res) => setTimeout(res, 2000)); continue; }
      if (err.error?.http_code === 404) throw new AppError('CLOUDINARY_FAILURE', 'Upload not found in Cloudinary. Upload the video again.', 404);
      throw new AppError('CLOUDINARY_FAILURE', err.error?.message ?? 'Cloudinary request failed', 502, undefined, true);
    }
    if (r.duration && r.duration > 0) break;
    await new Promise((res) => setTimeout(res, 2000));
  }
  if (!r) throw new AppError('CLOUDINARY_FAILURE', 'Cloudinary did not return the uploaded video', 502, undefined, true);
  const duration = r.duration && r.duration > 0 ? r.duration : clientDuration && clientDuration > 0 ? clientDuration : 0;
  if (!duration) throw new AppError('INVALID_VIDEO', 'Cloudinary could not read a video stream from this file. Try an H.264 MP4.', 422);
  return { publicId: r.public_id, url: r.secure_url, format: r.format, bytes: r.bytes, duration, width: r.width ?? 0, height: r.height ?? 0 };
}

export function thumbnailUrl(publicId: string, width = 640): string {
  return cloudinary.url(publicId, {
    resource_type: 'video', secure: true, format: 'jpg',
    transformation: [{ start_offset: '1', width, crop: 'limit', quality: 'auto' }],
  });
}

export async function deleteVideo(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
  } catch (e) {
    throw new AppError('CLOUDINARY_FAILURE', `Could not delete the video from Cloudinary: ${(e as Error).message}`, 502, undefined, true);
  }
}

/**
 * Returns a URL that Meta accepts for Reels/video (H.264 MP4). Non-MP4 sources are transcoded by Cloudinary
 * on demand; we wait until the derived asset is ready (Cloudinary answers 423 while transcoding).
 */
export async function publishableMp4Url(publicId: string, format: string, originalUrl: string): Promise<string> {
  if (format.toLowerCase() === 'mp4') return originalUrl;
  const url = cloudinary.url(publicId, {
    resource_type: 'video', secure: true, format: 'mp4',
    transformation: [{ video_codec: 'h264', audio_codec: 'aac' }],
  });
  for (let i = 0; i < 60; i++) {
    const res = await fetchWithTimeout(url, { method: 'HEAD', timeoutMs: 20_000 }).catch(() => null);
    if (res?.ok) return url;
    if (res && res.status !== 423 && res.status !== 404) {
      throw new AppError('CLOUDINARY_FAILURE', `Cloudinary could not convert the video to MP4 (HTTP ${res.status})`, 502);
    }
    await sleep(5000);
  }
  throw new AppError('CLOUDINARY_FAILURE', 'Timed out waiting for Cloudinary to convert the video to MP4', 504, undefined, true);
}
