import { readFileSync } from "node:fs";
export const rules = JSON.parse(
  readFileSync(
    new URL("../fixtures/official-rules.json", import.meta.url),
    "utf8",
  ),
);
// Explicit browser-test fixture only. Production never imports this module.
export async function mockAPI(
  page,
  { online = false, unavailable = false } = {},
) {
  const fixture = {
    room: null,
    calls: [],
    drafts: {},
    friendCount: 1,
    friends: [{ id: "b", uid: "b", name: "Bia" }],
    requests: [{ id: "request1", from: "c", from_name: "Caio" }],
    entitlement: { golden_wheel: false, revoked: false },
    versionConflict: false,
  };
  if (online)
    await page.route("**/adedonha/js/auth.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export const auth = { user:null,sdk:{},db:{},error:'', init:async function(cb){this.cb=cb},login:async function(){this.user={uid:'a',displayName:'Ana',getIdToken:async()=> 'explicit-test-token'};await this.cb(this.user)},logout:async function(){this.user=null;await this.cb(null)},token:async function(){return this.user?'explicit-test-token':null},watch:()=>()=>{},watchRequests:()=>()=>{},draft:async function(code){return fetch('http://localhost:3002/api/v1/adedonha/__draft/'+code).then(r=>r.json()).then(r=>r.data)}};`,
      }),
    );
  await page.route(
    "http://localhost:3002/api/v1/adedonha/**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        pathname = url.pathname.replace("/api/v1/adedonha", ""),
        method = request.method();
      const body = request.postDataJSON() || {};
      fixture.calls.push({
        path: pathname,
        method,
        body,
        headers: request.headers(),
      });
      const ok = (data) => route.fulfill({ json: { data } });
      const fail = (code, status = 409) =>
        route.fulfill({ status, json: { error: { code, message: code } } });
      if (unavailable) return fail("BACKEND_UNAVAILABLE", 503);
      if (pathname === "/config")
        return ok({
          api_version: 1,
          firebase_project_id: "adedonha-stop",
          free_tickets: true,
        });
      if (pathname === "/rules") return ok(rules);
      if (pathname === "/locales")
        return ok({ locales: Object.keys(rules.languages) });
      if (pathname === "/categories" || pathname === "/letters") {
        const lang = url.searchParams.get("locale"),
          language = rules.languages[lang];
        if (!language) return fail("INVALID_LOCALE", 400);
        return ok(
          pathname === "/categories"
            ? {
                locale: lang,
                categories: language.default_categories,
                suggested_categories: language.suggested_categories,
                ...rules.categories,
              }
            : {
                locale: lang,
                letters: language.letters,
                alphabet: language.alphabet,
                checks_initial: language.checks_initial,
              },
        );
      }
      if (!online) return fail("AUTH_REQUIRED", 401);
      if (
        method !== "GET" &&
        !/^[\w-]{8,100}$/.test(request.headers()["idempotency-key"] || "")
      )
        return fail("IDEMPOTENCY_KEY_REQUIRED", 400);
      if (pathname === "/me" || pathname === "/me/sync")
        return ok({
          uid: "a",
          name: "Ana",
          color: "#6c5ce7",
          friend_code: "ABC234",
          games: 0,
          wins: 0,
          best: 0,
        });
      if (["/me/entitlements", "/premium/status"].includes(pathname))
        return ok(fixture.entitlement);
      if (pathname === "/me/stats") return ok({ games: 0, wins: 0, best: 0 });
      if (pathname === "/me/history")
        return ok({ items: [], next_cursor: null });
      if (pathname === "/friends/requests/count")
        return ok({ count: fixture.friendCount });
      if (pathname === "/friends/requests" && method === "GET")
        return ok({ items: fixture.requests, next_cursor: null });
      if (pathname === "/friends" && method === "GET")
        return ok({ items: fixture.friends, next_cursor: null });
      if (pathname === "/friends/requests" && method === "POST")
        return ok({ id: "new-request", ...body });
      if (/\/friends\/requests\/.*\/(accept|reject)/.test(pathname)) {
        fixture.requests = [];
        fixture.friendCount = 0;
        return ok({ status: "accepted" });
      }
      if (pathname.startsWith("/friends/") && method === "DELETE") {
        fixture.friends = [];
        return ok({ removed: true, uid: "b" });
      }
      if (pathname === "/tickets/status")
        return ok({
          room_code: url.searchParams.get("room_code"),
          ticket: null,
          free_available: true,
          ad_available: false,
          room_ad_free: false,
        });
      if (pathname === "/tickets/intent")
        return ok({ id: "intent1", free_available: true });
      if (pathname === "/tickets/redeem" || pathname === "/tickets/ABCDE")
        return ok({ verified: true, source: "free" });
      if (pathname === "/rooms" && method === "POST") {
        fixture.room = {
          ...body.settings,
          schema: 2,
          api_authority: 1,
          code: "ABCDE",
          room_id: "room-1",
          game_id: "game-1",
          round_id: "round-1",
          version: 1,
          host: "a",
          owner: "a",
          status: "lobby",
          round: 1,
          used: [],
          selected_letter: "",
          letter: "",
          players: {
            a: { name: "Ana", score: 0, present: true, last_seen: Date.now() },
            b: { name: "Bia", score: 0, present: true, last_seen: Date.now() },
          },
          participants: ["a", "b"],
          answers: {},
          suggested: {},
          review: {},
          results: {},
          premium: { ad_free: false },
          stop_at: null,
        };
        return ok(fixture.room);
      }
      if (pathname.startsWith("/__draft/")) return ok(fixture.drafts.a || null);
      const room = fixture.room;
      if (!room || !pathname.startsWith("/rooms/ABCDE/"))
        return fail("ROOM_NOT_FOUND", 404);
      const action = pathname.replace("/rooms/ABCDE/", "");
      if (method === "GET") {
        if (action === "results")
          return ok({
            game_id: room.game_id,
            round_id: room.round_id,
            version: room.version,
            players: room.players,
            results: room.results,
            status: room.status,
          });
        return ok(room);
      }
      if (fixture.versionConflict && action !== "heartbeat") {
        fixture.versionConflict = false;
        room.version++;
        return fail("STALE_VERSION");
      }
      if (
        !["heartbeat", "join"].includes(action) &&
        body.version !== room.version
      )
        return fail("STALE_VERSION");
      if (action === "start") room.status = "letter_selection";
      else if (action === "letters/select") room.selected_letter = body.letter;
      else if (action === "letters/confirm") {
        room.letter = body.letter;
        room.used.push(room.letter);
        room.status = "playing";
        room.deadline = null;
      } else if (action === "answers") {
        if (fixture.drafts.a?.final) return fail("ANSWERS_FINAL");
        if (body.sequence <= (fixture.drafts.a?.sequence || -1))
          return fail("STALE_ANSWERS");
        fixture.drafts.a = { ...body };
        room.answers.a = body.answers;
        if (body.final && room.stop_at) {
          room.status = "review";
          room.answers.b = room.categories.map((_, i) => (i ? "" : "Cinza"));
          room.suggested = {
            a: room.categories.map(() => 10),
            b: room.categories.map((_, i) => (i ? 0 : 10)),
          };
          room.review = {
            category: 0,
            epochs: {},
            votes: {},
            approved: {},
            done: {},
          };
        }
      } else if (action === "stop") room.stop_at = Date.now();
      else if (action === "review/votes") {
        for (const [key, vote] of Object.entries(body.votes)) {
          if (Object.hasOwn(room.review.approved, key))
            return fail("ITEM_LOCKED");
          if (vote.e !== (room.review.epochs[key] || 0))
            return fail("INVALID_VOTE");
          room.review.votes.a ||= {};
          room.review.votes.b ||= {};
          room.review.votes.a[key] = vote;
          room.review.votes.b[key] ||= {
            v:
              key.startsWith("b:") && !room.answers.b[Number(key.split(":")[1])]
                ? 0
                : 10,
            e: vote.e,
          };
          const other = room.review.votes.b[key];
          if (other.e === vote.e && other.v === vote.v)
            room.review.approved[key] = vote.v;
        }
        room.review.done.a = false;
      } else if (action === "review/reopen") {
        delete room.review.approved[body.key];
        room.review.epochs[body.key] = (room.review.epochs[body.key] || 0) + 1;
        room.review.done = {};
        room.review.category = Number(body.key.split(":")[1]);
      } else if (action === "review/force" || action === "review/next") {
        for (const id of room.participants) {
          const key = `${id}:${room.review.category}`;
          if (!Object.hasOwn(room.review.approved, key)) {
            if (action === "review/force") {
              const vote = room.review.votes.a?.[key];
              if (!vote || vote.e !== (room.review.epochs[key] || 0))
                return fail("HOST_VOTE_MISSING");
              room.review.approved[key] = vote.v;
            } else return fail("REVIEW_PENDING");
          }
        }
        room.review.category = Math.min(
          room.categories.length - 1,
          room.review.category + 1,
        );
      } else if (action === "review/complete") {
        room.review.done.a = true;
        if (room.review.done.b) {
          room.status = "results";
          room.results = Object.fromEntries(
            room.participants.map((id) => [
              id,
              room.categories.map((_, i) => room.review.approved[`${id}:${i}`]),
            ]),
          );
          for (const id of room.participants)
            room.players[id].score = room.results[id].reduce(
              (a, b) => a + b,
              0,
            );
        }
      } else if (action === "review/unlock") room.review.done.a = false;
      else if (action === "rounds") room.status = "finished";
      else if (action === "leave") {
        room.players.a.present = false;
        room.host = "b";
      } else if (action === "close") room.status = "closed";
      else if (action === "settings") Object.assign(room, body.settings);
      else if (!["heartbeat", "join"].includes(action))
        return fail("NOT_FOUND", 404);
      room.version++;
      return ok(room);
    },
  );
  return fixture;
}
