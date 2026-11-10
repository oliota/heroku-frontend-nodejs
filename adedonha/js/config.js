const runtime = globalThis.ADEDONHA_CONFIG || {};
export const config = {
  apiBase:
    runtime.apiBase ||
    (["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)
      ? "http://localhost:3002/api/v1/adedonha"
      : "https://heroku-backend-nodejs-fd16668acdd6.herokuapp.com/api/v1/adedonha"),
  firebase: runtime.firebase || {},
  feedbackUrl: /^https:\/\//.test(runtime.feedbackUrl || "")
    ? runtime.feedbackUrl
    : "",
};
