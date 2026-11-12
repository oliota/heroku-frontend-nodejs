const key = (uid) => `user:${uid}:room`;
const terminalStatuses = new Set(["finished", "closed"]);
const recentKey = (uid) => `user:${uid}:recent-rooms`;

export function recentRooms(storage, uid) {
  if (!uid) return [];
  const items = storage.get(recentKey(uid), []);
  return Array.isArray(items) ? items.filter((item) => /^[A-Z0-9]{5}$/.test(item?.code || "")).slice(0, 20) : [];
}

export function trackRoom(storage, uid, room) {
  if (!uid || !room?.code) return;
  const latest = {
    code: room.code,
    room_id: room.room_id,
    status: room.status,
    round: room.round,
    updated_at: Date.now(),
  };
  storage.set(recentKey(uid), [latest, ...recentRooms(storage, uid).filter((item) => item.code !== room.code)].slice(0, 20));
}

export function markRecentRoom(storage, uid, code, status) {
  if (!uid || !code) return;
  storage.set(recentKey(uid), recentRooms(storage, uid).map((item) =>
    item.code === code ? { ...item, status, updated_at: Date.now() } : item));
}

const terminalErrors = new Set([
  "ROOM_NOT_FOUND",
  "NOT_ROOM_MEMBER",
  "ROOM_MIGRATION_REQUIRED",
  "ROOM_CLOSED",
]);

export function savedRoom(storage, uid) {
  if (!uid) return null;
  const value = storage.get(key(uid));
  const saved = typeof value === "string" ? { code: value } : value;
  if (!saved || !/^[A-Z0-9]{5}$/.test(saved.code || "")) return null;
  return saved;
}

export function forgetRoom(storage, uid) {
  if (uid) storage.remove(key(uid));
}

export function rememberRoom(storage, uid, room) {
  if (!uid || !room?.code) return;
  trackRoom(storage, uid, room);
  if (terminalStatuses.has(room.status)) return forgetRoom(storage, uid);
  storage.set(key(uid), {
    code: room.code,
    room_id: room.room_id,
    game_id: room.game_id,
    round_id: room.round_id,
    saved_at: Date.now(),
  });
}

export function roomCanResume(room, saved, uid) {
  return !!room && !terminalStatuses.has(room.status) &&
    !!room.players?.[uid] && (!saved.room_id || room.room_id === saved.room_id);
}

export const isExpiredRoom = (error) => terminalErrors.has(error?.code);

export async function recoverSavedRoom(storage, uid, api, isCurrent = () => true) {
  const saved = savedRoom(storage, uid);
  if (!saved) return null;
  try {
    let room = await api.get(`/rooms/${saved.code}/game`);
    if (!isCurrent()) return null;
    if (!roomCanResume(room, saved, uid)) {
      forgetRoom(storage, uid);
      return null;
    }
    if (room.players[uid].present === false) {
      await api.mutate(`/rooms/${saved.code}/join`, {});
      room = await api.get(`/rooms/${saved.code}/game`);
      if (!isCurrent()) return null;
      if (!roomCanResume(room, saved, uid)) {
        forgetRoom(storage, uid);
        return null;
      }
    }
    rememberRoom(storage, uid, room);
    return room;
  } catch (error) {
    if (isExpiredRoom(error)) forgetRoom(storage, uid);
    throw error;
  }
}
