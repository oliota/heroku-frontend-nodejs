import { config } from "./config.js";
import { ApiError } from "./api.js";
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new ApiError("FIREBASE_UNAVAILABLE")),
          12000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const auth = {
  user: null,
  sdk: null,
  app: null,
  db: null,
  error: "",
  async init(onChange) {
    const settings = config.firebase;
    if (
      !settings.apiKey ||
      settings.projectId !== "adedonha-stop"
    ) {
      this.error =
        "O login online aguarda a configuração Firebase do projeto adedonha-stop. O modo local é gratuito e não precisa de login.";
      return;
    }
    try {
      const [appSDK, authSDK, firestoreSDK] = await bounded(
        Promise.all([
          import("https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js"),
          import("https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js"),
        ]),
      );
      this.app = appSDK.initializeApp(settings, "adedonha-stop-web");
      this.sdk = authSDK;
      this.firestore = firestoreSDK;
      this.instance = authSDK.getAuth(this.app);
      await authSDK.setPersistence(this.instance, authSDK.browserLocalPersistence);
      this.db = firestoreSDK.getFirestore(this.app);
      this.unsubscribe = authSDK.onAuthStateChanged(this.instance, (user) => {
        this.user = user;
        onChange(user);
      });
    } catch {
      this.error =
        "Firebase indisponível. Verifique a configuração e a conexão. O modo local continua disponível.";
    }
  },
  async guest() {
    if (!this.sdk) throw new ApiError("FIREBASE_UNAVAILABLE", this.error);
    if (this.user) return this.user;
    const result = await this.sdk.signInAnonymously(this.instance);
    this.user = result.user;
    return result.user;
  },
  async login() {
    if (!this.sdk) throw new ApiError("FIREBASE_UNAVAILABLE", this.error);
    const provider = new this.sdk.GoogleAuthProvider();
    if (this.user?.isAnonymous) {
      try {
        await this.sdk.linkWithPopup(this.user, provider);
        return;
      } catch (error) {
        if (!["auth/credential-already-in-use", "auth/email-already-in-use"].includes(error.code)) throw error;
      }
    }
    await this.sdk.signInWithPopup(this.instance, provider);
  },
  async logout() {
    if (this.instance) await this.sdk.signOut(this.instance);
  },
  async token(force = false) {
    return this.user ? this.user.getIdToken(force) : null;
  },
  watch(path, next, error) {
    const sdk = this.firestore;
    return sdk.onSnapshot(
      sdk.doc(this.db, path),
      (snapshot) => {
        if (snapshot.exists()) next(snapshot.data());
      },
      error,
    );
  },
  watchRequests(uid, next, error) {
    const sdk = this.firestore;
    return sdk.onSnapshot(
      sdk.collection(this.db, "users", uid, "friend_requests"),
      next,
      error,
    );
  },
  async draft(code, uid) {
    const sdk = this.firestore;
    const snapshot = await bounded(
      sdk.getDoc(sdk.doc(this.db, `rooms/${code}/players/${uid}`)),
    );
    return snapshot.exists() ? snapshot.data() : null;
  },
};
