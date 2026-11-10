export const storage = {
  get(key, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem(`adedonha:${key}`)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`adedonha:${key}`, JSON.stringify(value));
    } catch {
      /* Private browsing and quota failures do not prevent play. */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(`adedonha:${key}`);
    } catch {
      /* Optional persistence. */
    }
  },
  clearUser(uid) {
    try {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(`adedonha:user:${uid}:`))
          localStorage.removeItem(key);
    } catch {
      /* Optional persistence. */
    }
  },
};
