/* TeamOps service worker — web push only.
 *
 * Served from /sw.js so its scope is the whole origin. Kept dependency-free
 * and framework-free: this file is not part of the Vite bundle and never sees
 * the app's modules.
 */

// Take over as soon as possible so a coach who just granted permission does
// not have to close every tab before notifications start arriving.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  // A push with no payload is legal, and some services send one to wake the
  // worker. Fall back rather than throwing inside the event handler.
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { title: 'TeamOps', body: event.data.text() }
    }
  }

  const title = payload.title || 'TeamOps'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/badge-96.png',
    // Collapses repeats of the same task instead of stacking duplicates.
    tag: payload.tag || 'teamops',
    renotify: Boolean(payload.tag),
    requireInteraction: false,
    data: {
      url: payload.url || '/',
      taskId: payload.taskId || null,
    },
  }

  // waitUntil keeps the worker alive until the notification is actually shown.
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab on this origin rather than opening a duplicate.
        for (const client of clientList) {
          if ('focus' in client) {
            if ('navigate' in client && new URL(client.url).pathname !== target) {
              return client.navigate(target).then((c) => c && c.focus())
            }
            return client.focus()
          }
        }
        return self.clients.openWindow(target)
      }),
  )
})

// Chrome rotates subscriptions occasionally. Without this the old endpoint
// goes stale and the user silently stops receiving anything.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then((subscription) =>
        // The app re-syncs on next load; this just re-establishes the browser
        // side so nothing is lost in the meantime.
        self.clients.matchAll().then((clients) =>
          clients.forEach((c) =>
            c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription }),
          ),
        ),
      ),
  )
})
