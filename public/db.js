// طبقة البيانات: كل التواصل مع Firebase موجود هون.
import { firebaseConfig, vapidKey } from './firebase-config.js';
const V = '10.12.2';
const SDK = n => import(`https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`);

export async function connect() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('PASTE')) throw new Error('CONFIG');
  const { initializeApp } = await SDK('app');
  const { getAuth, signInAnonymously } = await SDK('auth');
  const fs = await SDK('firestore');
  const app = initializeApp(firebaseConfig);
  const cred = await signInAnonymously(getAuth(app));   // كل جهاز بياخد هوية مجهولة بدون حساب
  const uid = cred.user.uid;
  const db = fs.getFirestore(app);
  const col = fs.collection(db, 'orders');
  const pub = id => fs.doc(db, 'orders', id);
  const priv = id => fs.doc(db, 'orders', id, 'private', 'contact');   // أرقام التلفون: بس لصاحب الطلب وللمرسل

  return {
    uid,
    listen(onData, onErr) {
      const q = fs.query(col, fs.orderBy('createdAt', 'desc'), fs.limit(100));
      return fs.onSnapshot(q, s => onData(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);
    },
    // صاحب الطلب بينشر: الطلب العام + رقم تلفونه بمكان خاص، بخطوة وحدة
    async add(order, contact) {
      const ref = fs.doc(col);
      const b = fs.writeBatch(db);
      b.set(ref, order);
      b.set(priv(ref.id), { phone: contact.phone || '', courierPhone: '' });
      await b.commit();
    },
    async contact(id) {
      const s = await fs.getDoc(priv(id));
      return s.exists() ? s.data() : {};
    },
    // أول مرسل بيقبل بياخد الطلب: Transaction بتضمن إنه ما يقدر مرسلين ياخدوا نفس الطلب
    take(id, profile) {
      return fs.runTransaction(db, async t => {
        const snap = await t.get(pub(id));
        if (!snap.exists() || snap.data().status !== 'open') return false;
        t.update(pub(id), { status: 'taken', courier: uid, courierName: profile.name || '', takenAt: Date.now() });
        t.update(priv(id), { courierPhone: profile.phone || '' });
        return true;
      });
    },
    step(id, status) { return fs.updateDoc(pub(id), { status, [status + 'At']: Date.now() }); },
    async del(id) {
      const b = fs.writeBatch(db);
      b.delete(priv(id));
      b.delete(pub(id));
      await b.commit();
    },
    // إشعارات للمرسل حتى لو التطبيق مسكّر
    async enablePush() {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
      const { getMessaging, getToken, isSupported, onMessage } = await SDK('messaging');
      if (!(await isSupported())) return 'unsupported';
      if (!vapidKey || vapidKey.startsWith('PASTE')) return 'noKey';
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return 'denied';
      const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js?c=' + encodeURIComponent(JSON.stringify(firebaseConfig)));
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
      await fs.setDoc(fs.doc(db, 'tokens', uid), { token, role: 'courier', updatedAt: Date.now() });
      onMessage(messaging, () => {});   // التطبيق مفتوح: الصفحة نفسها بترن
      return 'ok';
    },
    async disablePush() { await fs.deleteDoc(fs.doc(db, 'tokens', uid)); }
  };
}
