// بيستقبل الإشعارات لما التطبيق مسكّر
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
const cfg = JSON.parse(new URL(self.location).searchParams.get('c') || '{}');
firebase.initializeApp(cfg);
const messaging = firebase.messaging();
messaging.onBackgroundMessage(p => {
  const n = p.notification || {};
  self.registration.showNotification(n.title || 'Rido', { body: n.body || '', icon: 'icon.svg', badge: 'icon.svg', tag: (p.data && p.data.orderId) || 'rido', renotify: true, vibrate: [200, 100, 200] });
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow('./?role=drv');
  }));
});
