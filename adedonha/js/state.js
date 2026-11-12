import { operationKey } from "./api.js";
export class RoomState extends EventTarget {
  room = null;
  apply(room, { replace = false } = {}) {
    if (!room || !Number.isSafeInteger(room.version)) return false;
    if (
      !replace &&
      this.room &&
      (room.code !== this.room.code ||
        room.room_id !== this.room.room_id ||
        room.version <= this.room.version)
    )
      return false;
    this.room = room;
    this.dispatchEvent(new Event("change"));
    return true;
  }
  clear() {
    this.room = null;
    this.dispatchEvent(new Event("change"));
  }
}
export function reviewItem(room, uid, category) {
  const key = `${uid}:${category}`,
    review = room.review;
  const epoch = review.epochs?.[key] ?? 0; // The API explicitly defines a missing epoch as zero.
  const votes = room.participants
    .map((id) => ({ uid: id, vote: review.votes?.[id]?.[key] }))
    .filter(({ vote }) => vote?.e === epoch);
  return {
    key,
    epoch,
    votes,
    approved: Object.hasOwn(review.approved || {}, key),
    score: review.approved?.[key],
    unanimous:
      votes.length === room.participants.length &&
      new Set(votes.map((v) => v.vote.v)).size === 1,
  };
}
export function allApproved(room) {
  return room.participants.every((uid) =>
    room.categories.every((_, i) =>
      Object.hasOwn(room.review.approved || {}, `${uid}:${i}`),
    ),
  );
}
export class RoomClient {
  constructor(api, state) {
    this.api = api;
    this.state = state;
    this.queue = Promise.resolve();
    this.generation = 0;
  }
  reset() {
    this.generation++;
    this.queue = Promise.resolve();
    this.unresolved = null;
  }
  refresh() {
    const current = this.state.room;
    return this.api.get(`/rooms/${current.code}/game`).then((room) => {
      this.state.apply(room);
      return this.state.room;
    });
  }
  mutate(
    action,
    extra = {},
    {
      method = "POST",
      round = false,
      valid = () => true,
      applied = () => false,
    } = {},
  ) {
    const generation = this.generation,
      origin = this.state.room;
    const intent = JSON.stringify({ action, extra, method });
    const run = async () => {
      if (
        generation !== this.generation ||
        !origin ||
        this.state.room?.room_id !== origin.room_id
      )
        throw Object.assign(new Error("Operação cancelada."), {
          code: "CANCELLED",
        });
      if (this.unresolved) {
        const previous = this.unresolved;
        try {
          const result = await this.api.mutate(
            previous.path,
            previous.body,
            previous.method,
            { key: previous.key },
          );
          if (generation !== this.generation) return result;
          this.unresolved = null;
          this.state.apply(result);
          if (previous.intent === intent) return result;
        } catch (error) {
          if (error.code !== "STALE_VERSION") throw error;
          this.unresolved = null;
          await this.refresh();
          if (previous.intent !== intent) throw error;
        }
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const room = this.state.room;
        if (
          generation !== this.generation ||
          !room ||
          room.room_id !== origin.room_id ||
          (round &&
            (room.game_id !== origin.game_id ||
              room.round_id !== origin.round_id))
        )
          throw Object.assign(new Error("A rodada mudou. Atualize sua ação."), {
            code: "STALE_ROUND",
          });
        if (applied(room)) return room;
        if (!valid(room))
          throw Object.assign(new Error("A ação não está mais disponível."), {
            code: "INVALID_STATE",
          });
        const body = {
          version: room.version,
          ...(round ? { game_id: room.game_id, round_id: room.round_id } : {}),
          ...extra,
        };
        const operation = {
          path: `/rooms/${room.code}/${action}`,
          body: action === "heartbeat" ? {} : body,
          method,
          key: operationKey(),
          intent,
        };
        try {
          const result = await this.api.mutate(
            operation.path,
            operation.body,
            method,
            { key: operation.key },
          );
          if (generation !== this.generation) return result;
          this.state.apply(result);
          return result;
        } catch (error) {
          if (
            (error.code === "NETWORK_ERROR" || error.status >= 500) &&
            generation === this.generation
          )
            this.unresolved = operation;
          if (error.code !== "STALE_VERSION") throw error;
          await this.refresh();
          if (attempt === 2) throw error;
        }
      }
    };
    const next = this.queue.then(async () => {
      const blocking = ["start", "rounds", "letters/confirm", "stop", "review/complete", "review/force", "review/next"].includes(action);
      if (blocking) this.onBusy?.(true, "Sincronizando com a sala…");
      try {
        return await run();
      } finally {
        if (blocking) this.onBusy?.(false);
      }
    });
    this.queue = next.catch(() => {});
    return next;
  }
}
