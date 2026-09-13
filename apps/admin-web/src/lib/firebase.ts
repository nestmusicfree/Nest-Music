declare const firebase: any;

export const firebaseConfig = {
  apiKey: 'AIzaSyB-a6FWyTL6S5Ch6Fd5V9kuZ7bEH37jdEY',
  authDomain: 'jokefi.firebaseapp.com',
  databaseURL: 'https://jokefi-default-rtdb.firebaseio.com',
  projectId: 'jokefi',
  storageBucket: 'jokefi.firebasestorage.app',
  messagingSenderId: '968982416863',
  appId: '1:968982416863:web:c33622a88d6b71321a086a',
  measurementId: 'G-GBGZTBYV04'
};

const fb = (window as any).firebase;
if (!fb.apps.length) {
  fb.initializeApp(firebaseConfig);
}

export const firebaseApp = fb;
export const db = fb.database();
export const auth = fb.auth();
export const serverTimestamp = () => fb.database.ServerValue.TIMESTAMP;

export function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } as Record<string, string>)[m]
  );
}

export type Track = {
  id: string;
  title?: string;
  artist?: string;
  creator?: string;
  category?: string;
  status?: string;
  isPinned?: boolean;
  downloadsCount?: number;
  isExplicit?: boolean | string;
  coverBase64?: string;
  uploaderUsername?: string;
  uploaderUid?: string;
};

export type NestUser = {
  uid: string;
  name?: string;
  email?: string;
  username?: string;
  isVerified?: boolean;
  autoNotifyEnabled?: boolean;
};
