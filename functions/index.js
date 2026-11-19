// لما صاحب الطلب بينشر طلب جديد: بيبعت إشعار لكل المرسلين اللي شغّلوا الإشعارات
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
initializeApp();

exports.notifyCouriers = onDocumentCreated({ document: 'orders/{id}', region: 'europe-west1' }, async event => {
  const o = event.data && event.data.data();
  if (!o || o.status !== 'open') return;
  const db = getFirestore();
  const snap = await db.collection('tokens').where('role', '==', 'courier').get();
  const items = snap.docs.filter(d => d.id !== o.by).map(d => ({ uid: d.id, token: d.get('token') })).filter(x => x.token);
  if (!items.length) return;
  const title = `📦 طلب جديد · ₪${o.price}`;
  const body = `${o.rest}: ${o.from} ← ${o.to} · ${o.time}`;
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: chunk.map(x => x.token),
      notification: { title, body },
      data: { orderId: event.params.id },
      webpush: { fcmOptions: { link: '/?role=drv' } }
    });
    // نظّف التوكنات اللي ما عادت شغالة
    await Promise.all(res.responses.map((r, k) => !r.success && /registration-token-not-registered|invalid-registration-token/.test((r.error && r.error.code) || '')
      ? db.collection('tokens').doc(chunk[k].uid).delete() : null));
  }
});
