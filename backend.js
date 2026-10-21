/* Connects the exam app to Firebase (free Spark plan).
   Exposes window.BACKEND = { init(), login(name, password) }.
   The admin name is turned into a hidden e-mail "<name>@octs-exam.app" for Firebase sign-in. */
(function () {
  const wrapSnap = s => ({ id: s.id, exists: s.exists, data: () => s.data() });

  function makeDb(fs) {
    const doc = path => {
      const r = fs.doc(path);
      return {
        get: async () => wrapSnap(await r.get()),
        set: async d => { await r.set(d); },
        delete: async () => { await r.delete(); },
        // one-time lock: succeeds only if the document does not exist yet
        acquire: async o => {
          try {
            await fs.runTransaction(async t => {
              const s = await t.get(r);
              if (s.exists) throw new Error("held");
              t.set(r, { holder: String(o.holder), at: Date.now() });
            });
            return { acquired: true };
          } catch (e) {
            if (e && e.message === "held") return { acquired: false };
            throw e;
          }
        }
      };
    };
    const coll = (name, q) => {
      q = q || fs.collection(name);
      return {
        where: (f, op, v) => coll(name, q.where(f, op, v)),
        orderBy: (f, d) => coll(name, q.orderBy(f, d)),
        get: async () => { const s = await q.get(); return { empty: s.empty, docs: s.docs.map(wrapSnap) }; }
      };
    };
    return { doc, collection: n => coll(n) };
  }

  const downloads = {
    save: async ({ filename, data }) => {
      const u = URL.createObjectURL(data), a = document.createElement("a");
      a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    }
  };

  let auth = null;
  window.BACKEND = {
    async init() {
      const c = window.FIREBASE_CONFIG;
      if (!c || !c.projectId || c.projectId === "PASTE_HERE") { console.warn("Firebase is not configured."); return null; }
      firebase.initializeApp(c);
      auth = firebase.auth();
      return { db: makeDb(firebase.firestore()), downloads };
    },
    async login(name, password) {
      await auth.signInWithEmailAndPassword(name.trim().toLowerCase() + "@octs-exam.app", password);
    }
  };
})();
