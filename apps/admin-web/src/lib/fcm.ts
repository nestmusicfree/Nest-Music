export type FcmResult = {
  ok: boolean;
  sent?: number;
  failed?: number;
  tokenCount?: number;
  cleaned?: number;
  error?: string;
};

export function fcmSendUrl(): string {
  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      return 'https://nest-music.vercel.app/api/fcm-send';
    }
    if (typeof location !== 'undefined' && location.origin && location.origin.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
      return `${location.origin}/api/fcm-send`;
    }
  } catch { /* fall through */ }
  return 'https://nest-music.vercel.app/api/fcm-send';
}

export async function sendFcmByRequestId(requestId: string): Promise<FcmResult> {
  try {
    const res = await fetch(fcmSendUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId })
    });
    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      return {
        ok: false,
        error: j.error || res.statusText || 'FCM sender failed',
        sent: j.sent,
        failed: j.failed,
        tokenCount: j.tokenCount,
        cleaned: j.cleaned
      };
    }
    return {
      ok: true,
      sent: j.sent ?? 0,
      failed: j.failed ?? 0,
      tokenCount: j.tokenCount ?? 0,
      cleaned: j.cleaned ?? 0
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function formatFcmResult(r: FcmResult): string {
  if (r.ok) {
    return `System tray push delivered: ${r.sent ?? 0} sent, ${r.failed ?? 0} failed (${r.tokenCount ?? 0} device tokens).`;
  }
  return `Push queued. FCM sender note: ${r.error || 'unknown error'}. Automatic drain will retry within a few minutes.`;
}
