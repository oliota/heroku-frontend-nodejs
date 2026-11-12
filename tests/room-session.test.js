import test from "node:test";
import assert from "node:assert/strict";
import {
  savedRoom,
  rememberRoom,
  forgetRoom,
  recoverSavedRoom,
} from "../adedonha/js/room-session.js";

const memory = () => {
  const values = new Map();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
};

const room = (status = "playing", present = true) => ({
  code: "ABCDE",
  room_id: "room-1",
  game_id: "game-1",
  round_id: "round-2",
  players: { u1: { present } },
  status,
});

test("reloading restores the authenticated user's active room without creating another join", async () => {
  const storage = memory();
  rememberRoom(storage, "u1", room());
  const saved = savedRoom(storage, "u1");
  assert.equal(saved.code, "ABCDE");
  let joined = false;
  const api = {
    get: async () => room(),
    mutate: async () => { joined = true; },
  };
  assert.equal((await recoverSavedRoom(storage, "u1", api)).round_id, "round-2");
  assert.equal(joined, false);
  assert.equal(savedRoom(storage, "u2"), null);
});

test("an absent participant rejoins once and the saved identity stays scoped to the account", async () => {
  const storage = memory();
  rememberRoom(storage, "u1", room());
  let joined = 0;
  const api = {
    get: async () => room("review", joined > 0),
    mutate: async () => { joined++; },
  };
  assert.equal((await recoverSavedRoom(storage, "u1", api)).status, "review");
  assert.equal(joined, 1);
  assert.equal(savedRoom(storage, "u1").round_id, "round-2");
});

test("finished, closed, reused and inaccessible rooms are removed only after server verification", async () => {
  const storage = memory();
  rememberRoom(storage, "u1", room());
  const api = { get: async () => room("finished") };
  assert.equal(await recoverSavedRoom(storage, "u1", api), null);
  assert.equal(savedRoom(storage, "u1"), null);
  rememberRoom(storage, "u1", room());
  api.get = async () => ({ ...room(), room_id: "another" });
  assert.equal(await recoverSavedRoom(storage, "u1", api), null);
  assert.equal(savedRoom(storage, "u1"), null);
  rememberRoom(storage, "u1", room());
  api.get = async () => { throw Object.assign(new Error("not found"), { code: "ROOM_NOT_FOUND" }); };
  await assert.rejects(recoverSavedRoom(storage, "u1", api), { code: "ROOM_NOT_FOUND" });
  assert.equal(savedRoom(storage, "u1"), null);
});

test("a temporary network failure retains the session for the next attempt", async () => {
  const storage = memory();
  rememberRoom(storage, "u1", room());
  await assert.rejects(
    recoverSavedRoom(storage, "u1", {
      get: async () => { throw Object.assign(new Error("offline"), { code: "NETWORK_ERROR" }); },
    }),
    { code: "NETWORK_ERROR" },
  );
  assert.equal(savedRoom(storage, "u1").code, "ABCDE");
  rememberRoom(storage, "u1", room("closed"));
  assert.equal(savedRoom(storage, "u1"), null);
  rememberRoom(storage, "u1", room());
  forgetRoom(storage, "u1");
  assert.equal(savedRoom(storage, "u1"), null);
});

test("legacy room codes are still recognized, without inventing an identity", () => {
  const storage = memory();
  storage.set("user:u1:room", "ABCDE");
  assert.deepEqual(savedRoom(storage, "u1"), { code: "ABCDE" });
});

test("a saved session is discarded when the server no longer lists the authenticated player", async () => {
  const storage = memory();
  rememberRoom(storage, "u1", room());
  const current = { ...room(), players: { u2: { present: true } } };
  assert.equal(await recoverSavedRoom(storage, "u1", { get: async () => current }), null);
  assert.equal(savedRoom(storage, "u1"), null);
});

test("a session cannot be restored after the authenticated account changes", async () => {
  const storage = memory();
  rememberRoom(storage, "u1", room());
  let active = true;
  const api = {
    get: async () => {
      active = false;
      return room();
    },
  };
  assert.equal(await recoverSavedRoom(storage, "u1", api, () => active), null);
  assert.equal(savedRoom(storage, "u1").code, "ABCDE");
});

import { recentRooms, trackRoom, markRecentRoom } from "../adedonha/js/room-session.js";

test("recent rooms survive forgetting an active session and remain scoped to each user", () => {
  const store = memory();
  rememberRoom(store, "u1", room());
  assert.equal(recentRooms(store, "u1")[0].code, "ABCDE");
  forgetRoom(store, "u1");
  assert.equal(savedRoom(store, "u1"), null);
  assert.equal(recentRooms(store, "u1")[0].code, "ABCDE");
  assert.deepEqual(recentRooms(store, "u2"), []);
});

test("recent room status updates on verification without removing the history", () => {
  const store = memory();
  trackRoom(store, "u1", room());
  markRecentRoom(store, "u1", "ABCDE", "closed");
  assert.equal(recentRooms(store, "u1")[0].status, "closed");
});
