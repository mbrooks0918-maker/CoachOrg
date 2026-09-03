import { supabase } from './supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export type PushState =
  | 'needs-install' // iOS: push only exists once the app is on the Home Screen
  | 'unsupported' // no service worker or no Push API
  | 'insecure' // needs https (localhost counts as secure)
  | 'denied' // user blocked notifications in the browser
  | 'default' // not asked yet
  | 'subscribed'

/**
 * The push API wants the VAPID key as a Uint8Array of the raw EC point, but it
 * travels as base64url. atob only speaks standard base64, so the alphabet has
 * to be translated and the padding restored first.
 */
function urlBase64ToUint8Array(base64UrlString: string): Uint8Array {
  const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4)
  const base64 = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * True on iPhone and iPad, including iPadOS, which reports itself as a Mac and
 * is only given away by the touch points.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** True when running from the Home Screen rather than inside a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Registers /sw.js. Safe to call on every load -- the browser dedupes. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (err) {
    console.warn('Service worker registration failed:', err)
    return null
  }
}

export async function getPushState(): Promise<PushState> {
  // Safari on iOS hides the Notification and Push APIs entirely until the site
  // is added to the Home Screen. Reporting that as 'unsupported' sent people
  // looking for a browser setting that does not exist.
  if (!pushSupported()) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  // Push requires a secure context. localhost is treated as secure.
  if (!window.isSecureContext) return 'insecure'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.getRegistration()
  const existing = await registration?.pushManager.getSubscription()
  if (existing) return 'subscribed'

  return Notification.permission === 'granted' ? 'default' : 'default'
}

/**
 * Prompts for permission, subscribes, and stores the subscription.
 *
 * Stored with ignoreDuplicates, which compiles to ON CONFLICT DO NOTHING: the
 * same browser re-subscribing yields an identical row that the unique
 * constraint would otherwise reject on every visit. DO NOTHING needs only the
 * INSERT policy, whereas a real upsert would also require UPDATE.
 */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) {
    return {
      ok: false,
      message:
        isIOS() && !isStandalone()
          ? 'On iPhone, add TeamOps to your Home Screen first, then turn notifications on from there.'
          : 'This browser does not support web push.',
    }
  }
  if (!window.isSecureContext) {
    return { ok: false, message: 'Notifications need a secure (https) connection.' }
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, message: 'VITE_VAPID_PUBLIC_KEY is not configured.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      message:
        permission === 'denied'
          ? 'Notifications are blocked. Re-enable them in your browser settings.'
          : 'Notification permission was dismissed.',
    }
  }

  const registration =
    (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker())
  if (!registration) {
    return { ok: false, message: 'Could not register the service worker.' }
  }
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      // Web push mandates this: every message must be shown to the user.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, subscription: subscription.toJSON() },
    { onConflict: 'user_id,subscription', ignoreDuplicates: true },
  )

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Notifications are on for this device.' }
}

/** Unsubscribes this browser and removes the stored row. */
export async function disablePush(): Promise<{ ok: boolean; message: string }> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return { ok: true, message: 'Notifications were already off.' }

  const json = subscription.toJSON()
  await subscription.unsubscribe()

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (userId) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('subscription', json)
  }

  return { ok: true, message: 'Notifications are off for this device.' }
}
