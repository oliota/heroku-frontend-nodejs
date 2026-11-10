import test from "node:test";
import assert from "node:assert/strict";
import { ApiClient, ApiError } from "../adedonha/js/api.js";
import {
  RoomState,
  RoomClient,
  reviewItem,
  allApproved,
} from "../adedonha/js/state.js";
import {
  normalize,
  localScores,
  canonicalLocale,
} from "../adedonha/js/rules.js";
import { shortestAngle } from "../adedonha/js/ui/wheel.js";
import { Drafts, Realtime } from "../adedonha/js/realtime.js";
import { readFileSync } from "node:fs";
import { loadRules, loadLocale } from "../adedonha/js/rules.js";
const response = (data, status = 200) =>
  new Response(JSON.stringify(status < 400 ? { data } : { error: data }), {
    status,
  });
const room = (extra = {}) => ({
  code: "ABCDE",
  room_id: "room1",
  game_id: "game1",
  round_id: "round1",
  version: 1,
  status: "playing",
  categories: ["COR", "CARRO", "FRUTA"],
  participants: ["a", "b"],
  review: { category: 0, epochs: {}, votes: {}, approved: {}, done: {} },
  ...extra,
});
test("official locale categories/letters keep API types and known rule cache expires", async (t) => {
  const rules = JSON.parse(
    readFileSync(
      new URL("./fixtures/official-rules.json", import.meta.url),
      "utf8",
    ),
  );
  const previous = globalThis.localStorage,
    values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  t.after(() => (globalThis.localStorage = previous));
  const api = {
    get: async (path) => {
      if (path === "/config") return { api_version: 1 };
      if (path === "/rules") return rules;
      if (path === "/locales") return { locales: Object.keys(rules.languages) };
      const lang = new URL("http://test" + path).searchParams.get("locale"),
        data = rules.languages[lang];
      return path.startsWith("/categories")
        ? { locale: lang, categories: data.default_categories }
        : { locale: lang, letters: data.letters, alphabet: data.alphabet };
    },
  };
  const bundle = await loadRules(api);
  for (const lang of bundle.locales) {
    const data = await loadLocale(api, lang, bundle);
    assert.ok(Array.isArray(data.categories));
    assert.equal(typeof data.letters, "string");
    assert.deepEqual(data.categories, rules.languages[lang].default_categories);
  }
  const unavailable = {
    get: async () => {
      throw new ApiError("NETWORK_ERROR");
    },
  };
  assert.equal((await loadRules(unavailable)).cached, true);
  const cached = JSON.parse(values.get("adedonha:rules"));
  cached.fetchedAt = Date.now() - 86400001;
  values.set("adedonha:rules", JSON.stringify(cached));
  await assert.rejects(loadRules(unavailable), { code: "NETWORK_ERROR" });
});
test("uncertain network retries keep the exact idempotency key, path and JSON body", async () => {
  const calls = [];
  const api = new ApiClient(
    "http://test",
    async () => "firebase-id-token",
    async (path, init) => {
      calls.push({
        path,
        key: init.headers["Idempotency-Key"],
        body: init.body,
        token: init.headers.Authorization,
      });
      if (calls.length === 1) throw new TypeError("response lost");
      return response({ version: 2 });
    },
  );
  await api.mutate("/rooms", { settings: { lang: "pt" } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.match(calls[0].key, /^[\w-]{8,100}$/);
  assert.equal(calls[0].token, "Bearer firebase-id-token");
});
test("401 refreshes the Firebase ID token once, unavailable API never returns fake success", async () => {
  const force = [];
  const api = new ApiClient(
    "http://test",
    async (value) => {
      force.push(value);
      return "token";
    },
    async () => response({ code: "INVALID_TOKEN" }, 401),
  );
  await assert.rejects(api.get("/me"), { code: "INVALID_TOKEN" });
  assert.deepEqual(force, [false, true]);
  const broken = new ApiClient(
    "http://test",
    async () => "token",
    async () => response({ code: "BACKEND_UNAVAILABLE" }, 503),
  );
  await assert.rejects(broken.get("/me", { retries: 0 }), {
    code: "BACKEND_UNAVAILABLE",
  });
});
test("same pending key deduplicates requests and rejects conflicting bodies", async () => {
  let resolve;
  let count = 0;
  const api = new ApiClient(
    "http://test",
    async () => "t",
    async () => {
      count++;
      return new Promise((r) => (resolve = r));
    },
  );
  const first = api.mutate("/rooms", {}, "POST", { key: "operation_1" });
  await new Promise((r) => setTimeout(r, 0));
  const second = api.mutate("/rooms", {}, "POST", { key: "operation_1" });
  await assert.rejects(
    api.mutate("/rooms", { changed: true }, "POST", { key: "operation_1" }),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
  resolve(response({ ok: true }));
  await Promise.all([first, second]);
  assert.equal(count, 1);
});
test("snapshots ignore stale versions and wrong room identities", () => {
  const state = new RoomState();
  assert.equal(state.apply(room()), true);
  assert.equal(state.apply(room()), false);
  assert.equal(state.apply(room({ version: 0 })), false);
  assert.equal(state.apply(room({ room_id: "another", version: 99 })), false);
  assert.equal(state.apply(room({ round_id: "round2", version: 2 })), true);
});
test("stale room writes reconcile and create a fresh operation with new authoritative IDs/version", async () => {
  const state = new RoomState();
  state.apply(room());
  const calls = [];
  const api = {
    get: async () => room({ version: 2 }),
    mutate: async (path, body) => {
      calls.push(body);
      if (calls.length === 1) throw new ApiError("STALE_VERSION");
      return room({ version: 3 });
    },
  };
  await new RoomClient(api, state).mutate("stop", {}, { round: true });
  assert.deepEqual(
    calls.map((call) => call.version),
    [1, 2],
  );
  assert.equal(calls[1].round_id, "round1");
});
test("stale operation already applied is discarded and old-round intents never cross rounds", async () => {
  const state = new RoomState();
  state.apply(room());
  let writes = 0;
  const api = {
    mutate: async () => {
      writes++;
      throw new ApiError("STALE_VERSION");
    },
    get: async () => room({ version: 2, stop_at: 1 }),
  };
  await new RoomClient(api, state).mutate(
    "stop",
    {},
    { round: true, applied: (r) => !!r.stop_at },
  );
  assert.equal(writes, 1);
  api.get = async () => room({ version: 3, round_id: "new-round" });
  await assert.rejects(
    new RoomClient(api, state).mutate(
      "letters/select",
      { letter: "C" },
      { round: true },
    ),
    { code: "STALE_ROUND" },
  );
});
test("review requires current-epoch unanimous votes including self and blank answers", () => {
  const value = room();
  value.answers = { a: [""], b: ["Cinza"] };
  value.review.epochs["a:0"] = 2;
  value.review.votes = {
    a: { "a:0": { v: 0, e: 2 } },
    b: { "a:0": { v: 0, e: 1 } },
  };
  assert.equal(reviewItem(value, "a", 0).votes.length, 1);
  assert.equal(reviewItem(value, "a", 0).unanimous, false);
  value.review.votes.b["a:0"] = { v: 5, e: 2 };
  assert.equal(reviewItem(value, "a", 0).unanimous, false);
  value.review.votes.b["a:0"] = { v: 0, e: 2 };
  assert.equal(reviewItem(value, "a", 0).unanimous, true);
  assert.equal(reviewItem(value, "a", 0).approved, false);
  value.review.approved["a:0"] = 0;
  assert.equal(reviewItem(value, "a", 0).approved, true);
  assert.equal(allApproved(value), false);
  value.review.epochs["a:0"]++;
  delete value.review.approved["a:0"];
  value.review.done = {};
  assert.equal(reviewItem(value, "a", 0).votes.length, 0);
});
test("local scoring follows accent normalization and Chinese initial exception", () => {
  const rules = {
    normalization: { accents: { á: "a", ç: "c", ú: "u" } },
    languages: { pt: { checks_initial: true }, zh: { checks_initial: false } },
    points: { unique: 10, invalid: 0 },
  };
  assert.equal(normalize("  ÁGUA--açúcar! ", rules), "agua acucar");
  assert.deepEqual(
    localScores("A", ["Água", "a", "", "Caju"], "pt", rules),
    [10, 0, 0, 0],
  );
  assert.deepEqual(localScores("A", ["中文", ""], "zh", rules), [10, 0]);
  assert.equal(canonicalLocale("pt_BR"), "pt");
  assert.equal(canonicalLocale("pt-PT"), "pt_pt");
  assert.equal(canonicalLocale("fr-FR"), "fr");
});
test("wheel always takes the shortest angular path in both directions", () => {
  assert.equal(shortestAngle(350, 10), 20);
  assert.equal(shortestAngle(10, 350), -20);
  assert.equal(shortestAngle(-720, 10), 10);
});
test("draft writes are serialized, increasing, restored from server and keep latest text", async () => {
  const state = new RoomState();
  state.apply(room());
  let pending;
  const calls = [],
    statuses = [];
  const drafts = new Drafts({
    state,
    auth: {
      db: {},
      user: { uid: "a" },
      draft: async () => ({
        round_id: "round1",
        sequence: 9,
        answers: ["Cinza", "", ""],
        final: false,
      }),
    },
    client: {
      mutate: async (action, body) => {
        calls.push(body);
        if (calls.length === 1)
          await new Promise((resolve) => (pending = resolve));
      },
    },
    onStatus: (text) => statuses.push(text),
    onError: () => {},
  });
  await drafts.restore();
  assert.equal(drafts.sequence, 9);
  drafts.edit(1, "Corsa");
  const first = drafts.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  drafts.edit(1, "Camaro");
  const second = drafts.flush(true);
  pending();
  await Promise.all([first, second]);
  assert.deepEqual(
    calls.map((value) => value.sequence),
    [10, 11],
  );
  assert.equal(calls[1].answers[1], "Camaro");
  assert.equal(calls[1].final, true);
  assert.equal(drafts.final, true);
  drafts.reset();
});
test("uncertain room operations are replayed byte-for-byte before newer operations", async () => {
  const state = new RoomState();
  state.apply(room());
  const calls = [];
  const api = {
    mutate: async (path, body, method, options) => {
      calls.push({ path, body, method, key: options.key });
      if (calls.length === 1) throw new ApiError("NETWORK_ERROR");
      return room({ version: 3, stop_at: 1 });
    },
  };
  const client = new RoomClient(api, state);
  await assert.rejects(client.mutate("stop", {}, { round: true }), {
    code: "NETWORK_ERROR",
  });
  state.apply(room({ version: 2 }));
  await client.mutate("stop", {}, { round: true });
  assert.deepEqual(calls[0], calls[1]);
});
test("failed drafts retry the original sequence and text before sending newer edits", async () => {
  const state = new RoomState();
  state.apply(room());
  const calls = [];
  const drafts = new Drafts({
    state,
    auth: { db: {}, user: { uid: "a" }, draft: async () => null },
    client: {
      mutate: async (_, body) => {
        calls.push(body);
        if (calls.length === 1) throw new ApiError("NETWORK_ERROR");
      },
    },
    onStatus: () => {},
    onError: () => {},
  });
  await drafts.restore();
  drafts.edit(0, "Caio");
  await assert.rejects(drafts.flush());
  drafts.edit(0, "Carlos");
  await drafts.flush(true);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[2].answers[0], "Carlos");
  assert.equal(calls[2].sequence, calls[0].sequence + 1);
  assert.equal(calls[2].final, true);
  drafts.reset();
});
test("realtime listens read-only, polls timed game, sends 25s heartbeat and cleans up", async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { hidden: false };
  t.after(() => (globalThis.document = previousDocument));
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const state = new RoomState();
  state.apply(room());
  let callback,
    unsubscribed = 0,
    polls = 0;
  const writes = [];
  const realtime = new Realtime({
    state,
    auth: {
      db: {},
      watch: (path, next) => {
        assert.equal(path, "rooms/ABCDE");
        callback = next;
        return () => unsubscribed++;
      },
    },
    client: {
      refresh: async () => {
        polls++;
      },
      mutate: async (...args) => writes.push(args),
    },
    onConnection: () => {},
    onError: () => {},
  });
  realtime.start();
  callback(room({ version: 2 }));
  assert.equal(state.room.version, 2);
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.equal(polls, 1);
  t.mock.timers.tick(24000);
  await Promise.resolve();
  assert.deepEqual(writes, [["heartbeat"]]);
  realtime.stop();
  const count = polls;
  t.mock.timers.tick(100000);
  await Promise.resolve();
  assert.equal(polls, count);
  assert.equal(unsubscribed, 1);
});
