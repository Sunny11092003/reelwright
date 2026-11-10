import { COLLECTIONS } from '../shared/constants';
import { db } from './admin';
import { forbidden, notFound } from '../utils/errors';
import type { ActivityLog } from '../shared/types';
import { createLogger } from '../utils/logger';

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
const log = createLogger('repo');

export const col = (name: CollectionName) => db.collection(name);
export const nowIso = () => new Date().toISOString();
export const newId = (name: CollectionName) => col(name).doc().id;

/** Fetch a document and verify ownership. Throws 404 for missing and 403 for other owners. */
export async function getOwned<T extends { userId: string }>(name: CollectionName, id: string, userId: string): Promise<T> {
  const snap = await col(name).doc(id).get();
  if (!snap.exists) throw notFound(name.replace(/s$/, ''));
  const data = { id: snap.id, ...snap.data() } as unknown as T;
  if (data.userId !== userId) throw forbidden();
  return data;
}

export async function getById<T>(name: CollectionName, id: string): Promise<T | null> {
  const snap = await col(name).doc(id).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as unknown as T) : null;
}

export async function setDoc<T extends object>(name: CollectionName, id: string, data: T): Promise<void> {
  await col(name).doc(id).set(data as FirebaseFirestore.DocumentData);
}

export async function patchDoc(name: CollectionName, id: string, data: Record<string, unknown>): Promise<void> {
  await col(name).doc(id).set({ ...data, updatedAt: nowIso() }, { merge: true });
}

export async function listByUser<T>(name: CollectionName, userId: string, opts: { orderBy?: string; direction?: 'asc' | 'desc'; limit?: number } = {}): Promise<T[]> {
  let q: FirebaseFirestore.Query = col(name).where('userId', '==', userId);
  if (opts.orderBy) q = q.orderBy(opts.orderBy, opts.direction ?? 'desc');
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T);
}

export async function logActivity(
  userId: string,
  action: ActivityLog['action'],
  entityType: string,
  entityId: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const ref = col(COLLECTIONS.activityLogs).doc();
    const entry: Omit<ActivityLog, 'id'> = { userId, action, entityType, entityId, message, metadata, createdAt: nowIso() };
    await ref.set(entry);
  } catch (e) {
    log.error('Failed to write activity log', e);
  }
}

export async function deleteWhere(name: CollectionName, field: string, value: string, userId: string): Promise<number> {
  const snap = await col(name).where('userId', '==', userId).where(field, '==', value).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (!snap.empty) await batch.commit();
  return snap.size;
}
