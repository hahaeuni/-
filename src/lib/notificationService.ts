export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

const PUSH_ENABLED_KEY = 'hallym_taxi_push_enabled';
const PUSH_PROMPT_DISMISSED_KEY = 'hallym_taxi_push_prompt_dismissed';
const NOTIFIED_EVENTS_KEY = 'hallym_taxi_notified_events';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): BrowserNotificationPermission {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export function isPushEnabledPreference(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(PUSH_ENABLED_KEY) !== 'false';
}

export function setPushEnabledPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function isPushPromptDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === 'true';
}

export function dismissPushPrompt(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, 'true');
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!isNotificationSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    setPushEnabledPreference(true);
  }
  return result;
}

function readNotifiedMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(NOTIFIED_EVENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pruned: Record<string, number> = {};
    Object.entries(parsed).forEach(([k, ts]) => {
      if (typeof ts === 'number' && ts >= cutoff) {
        pruned[k] = ts;
      }
    });
    return pruned;
  } catch {
    return {};
  }
}

export function hasNotifiedEvent(eventKey: string): boolean {
  const map = readNotifiedMap();
  return Boolean(map[eventKey]);
}

export function markEventNotified(eventKey: string): void {
  if (typeof window === 'undefined') return;
  const map = readNotifiedMap();
  map[eventKey] = Date.now();
  try {
    window.localStorage.setItem(NOTIFIED_EVENTS_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors
  }
}

export async function showBrowserPushNotification(params: {
  title: string;
  body: string;
  tag: string;
  roomId?: string;
}): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  if (!isPushEnabledPreference()) return false;

  const options: NotificationOptions = {
    body: params.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: params.tag,
    data: { roomId: params.roomId },
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (registration && 'showNotification' in registration) {
        await registration.showNotification(params.title, options);
        return true;
      }
    } catch {
      // Fallback to Window Notification below
    }
  }

  try {
    new Notification(params.title, options);
    return true;
  } catch {
    return false;
  }
}
