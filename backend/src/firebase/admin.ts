import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { env } from '../config/env';

if (getApps().length === 0) {
  const hasInline = env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY;
  initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    credential: hasInline
      ? cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL!,
          privateKey: env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        })
      : applicationDefault(),
  });
}

export const auth = getAuth();
export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export { FieldValue };
