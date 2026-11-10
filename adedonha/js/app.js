import { config } from "./config.js";
import { ApiClient, ApiError } from "./api.js";
import { auth } from "./auth.js";
import { storage } from "./storage.js";
import { loadRules, canonicalLocale, localScores } from "./rules.js";
import { RoomState, RoomClient } from "./state.js";
import { Realtime, Drafts } from "./realtime.js";
import { el, button, heading, field, task, toast, explain } from "./ui/dom.js";
import { confirm, dialog } from "./ui/dialogs.js";
import { home } from "./ui/home.js";
import { setup } from "./ui/setup.js";
import { letterSelection } from "./ui/letter-wheel.js";
import { gameplay } from "./ui/gameplay.js";
import { review } from "./ui/review.js";
import { results } from "./ui/results.js";
import { lobby, join } from "./ui/lobby.js";
import { friends } from "./ui/friends.js";
import { premium } from "./ui/premium.js";

const screen = document.querySelector("#screen");
const state = new RoomState(),
  api = new ApiClient(config.apiBase, (force) => auth.token(force)),
  client = new RoomClient(api, state);
let mounted,
  renderGeneration = 0,
  authGeneration = 0,
  pendingRoom = "",
  profileReady = false;
const ctx = {
  config,
  auth,
  api,
  state,
  client,
  bundle: null,
  profile: null,
  entitlements: null,
  lang: "pt",
  local: storage.get("localGame"),
  route: "",
  go,
  render,
  startLocal,
  saveLocal,
  confirmLocalLetter,
  stopLocal,
  nextLocal,
  createRoom,
  joinRoom,
  leaveRoom,
  updateBadge,
  isGolden: () =>
    !!auth.user &&
    ctx.entitlements?.golden_wheel === true &&
    !ctx.entitlements.revoked,
};
const realtime = new Realtime({
  auth,
  state,
  client,
  onError: () => {},
  onConnection: connection,
});
const drafts = new Drafts({
  client,
  state,
  auth,
  onStatus: (text) => {
    if (mounted?.status) mounted.status.textContent = text;
  },
  onError: (error) => toast(explain(error), true),
});
ctx.drafts = drafts;
function connection(text) {
  const node = document.querySelector("#connection");
  node.hidden = !text;
  node.textContent = text;
}
function go(route) {
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}
function saveLocal() {
  storage.set("localGame", ctx.local);
}
function startLocal(settings) {
  ctx.local = {
    ...settings,
    id: crypto.randomUUID(),
    status: "letter_selection",
    round: 1,
    used: [],
    selected_letter: "",
    letter: "",
    answers: settings.categories.map(() => ""),
    scores: [],
    total: 0,
    deadline: null,
  };
  saveLocal();
  go("local-game");
}
function confirmLocalLetter(letter) {
  const room = ctx.local;
  if (
    !letter ||
    room.status !== "letter_selection" ||
    room.used.includes(letter)
  )
    return;
  room.letter = letter;
  room.used.push(letter);
  room.status = "playing";
  room.started_at = Date.now();
  room.deadline = room.timer ? Date.now() + room.timer * 1000 : null;
  saveLocal();
  render();
}
function stopLocal() {
  const room = ctx.local;
  if (room?.status !== "playing") return;
  room.scores = localScores(
    room.letter,
    room.answers,
    room.lang,
    ctx.bundle.rules,
  );
  room.total += room.scores.reduce((a, b) => a + b, 0);
  room.status =
    room.round >= room.rounds ||
    room.used.length >= Array.from(room.letters).length
      ? "finished"
      : "results";
  saveLocal();
  render();
}
function nextLocal() {
  const room = ctx.local;
  if (room?.status !== "results") return;
  room.round++;
  room.selected_letter = "";
  room.letter = "";
  room.answers = room.categories.map(() => "");
  room.status = "letter_selection";
  room.deadline = null;
  saveLocal();
  render();
}
async function account() {
  if (!auth.user) throw new ApiError("AUTH_REQUIRED");
  if (!profileReady) {
    await loadAccount(auth.user);
    if (!profileReady) throw new ApiError("BACKEND_UNAVAILABLE");
  }
  ctx.entitlements = await api.get("/me/entitlements");
}
async function createRoom(settings) {
  await account();
  const room = await api.mutate("/rooms", { settings });
  await enter(room);
}
async function ticket(code) {
  const status = await api.get(
    `/tickets/status?room_code=${encodeURIComponent(code)}`,
  );
  if (status.ticket?.verified || status.room_ad_free || ctx.isGolden()) return;
  if (!status.free_available)
    throw new ApiError(
      "ADS_UNAVAILABLE",
      "Nenhum provedor web de anúncios está integrado.",
    );
  const intent = await api.mutate("/tickets/intent", { room_code: code });
  if (!intent.free_available) throw new ApiError("ADS_UNAVAILABLE");
  await api.mutate("/tickets/redeem", { intent_id: intent.id, source: "free" });
  const issued = await api.get(`/tickets/${encodeURIComponent(code)}`);
  if (!issued.verified) throw new ApiError("TICKET_REQUIRED");
}
async function joinRoom(code, version) {
  await account();
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 0))
    throw new Error("A versão do convite deve ser um inteiro não negativo.");
  await ticket(code);
  try {
    const room = await api.mutate(
      `/rooms/${code}/join`,
      version === undefined ? {} : { version },
    );
    await enter(room);
  } catch (error) {
    if (error.code === "STALE_VERSION")
      throw new ApiError(
        "STALE_VERSION",
        "Peça ao líder um convite recém-copiado com a versão atual.",
      );
    throw error;
  }
}
async function enter(room) {
  realtime.stop();
  client.reset();
  drafts.reset();
  state.apply(room, { replace: true });
  storage.set(`user:${auth.user.uid}:room`, room.code);
  if (room.status === "playing") await drafts.restore();
  realtime.start();
  go("room");
}
async function reconnect() {
  if (pendingRoom || !auth.user) return;
  const code = state.room?.code || storage.get(`user:${auth.user.uid}:room`);
  if (!code) return;
  pendingRoom = code;
  realtime.stop();
  client.reset();
  api.cancel();
  try {
    await auth.token(true);
    await api.mutate(`/rooms/${code}/join`, {});
    const room = await api.get(`/rooms/${code}/game`);
    state.apply(room, { replace: true });
    if (room.status === "playing") await drafts.restore();
    realtime.start();
    connection("");
    await render();
  } catch (error) {
    connection(
      `${explain(error)} Use Reconectar no perfil ou volte ao modo local.`,
    );
  } finally {
    pendingRoom = "";
  }
}
async function leaveRoom() {
  if (!state.room) return go("home");
  if (
    !(await confirm(
      "Sair da sala?",
      "O líder pode ser transferido. Durante a partida sua identidade, respostas e votos permanecem no servidor.",
    ))
  )
    return;
  await task(null, async () => {
    if (!["closed", "finished"].includes(state.room.status))
      await client.mutate("leave");
    clearRoom();
    go("home");
  });
}
function clearRoom() {
  realtime.stop();
  client.reset();
  drafts.reset();
  if (auth.user) storage.remove(`user:${auth.user.uid}:room`);
  state.clear();
}
async function loadAccount(user) {
  const generation = authGeneration;
  const profile = await api.get("/me");
  const synced =
    profile.synced === false
      ? await api.mutate("/me/sync", { name: user.displayName || "Jogador" })
      : profile;
  const entitlement = await api.get("/me/entitlements");
  if (generation !== authGeneration || user.uid !== auth.user?.uid) return;
  ctx.profile = synced;
  ctx.entitlements = entitlement;
  profileReady = true;
  await updateBadge();
}
async function updateBadge() {
  const uid = auth.user?.uid;
  if (!uid) return;
  const result = await api.get("/friends/requests/count");
  if (auth.user?.uid !== uid) return;
  const badge = document.querySelector("#friends-badge");
  badge.hidden = result.count < 1;
  badge.textContent = String(result.count);
}
async function loginView() {
  const node = el(
    "section",
    { class: "narrow" },
    heading(
      "BORA JOGAR JUNTOS",
      "A turma está a um login.",
      "Use sua conta Google para salas, amigos e benefícios do aplicativo.",
    ),
    el(
      "div",
      { class: "panel stack" },
      el(
        "p",
        {},
        auth.error || "Entre com a mesma conta do aplicativo Adedonha — STOP.",
      ),
      button(
        "Entrar com Google",
        (event) => task(event.currentTarget, () => auth.login()),
        "primary",
        { disabled: !auth.sdk },
      ),
      button("Jogar local de graça", () => go("local"), "ghost"),
    ),
  );
  return { node };
}
async function profile() {
  await account();
  const stats = await api.get("/me/stats");
  const name = el("input", { value: ctx.profile.name, maxlength: 40 }),
    color = el("input", {
      type: "color",
      value: ctx.profile.color || "#6c5ce7",
    });
  const saved = storage.get(`user:${auth.user.uid}:room`);
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        "SEU LUGAR NA TURMA",
        ctx.profile.name,
        `Código de amizade: ${ctx.profile.friend_code}`,
      ),
      el(
        "div",
        { class: "panel stack" },
        el(
          "div",
          { class: "stat-grid" },
          [
            ["Partidas", stats.games],
            ["Vitórias", stats.wins],
            ["Recorde", stats.best],
          ].map(([label, value]) =>
            el("div", { class: "stat" }, el("strong", {}, value), label),
          ),
        ),
        field("Nome no jogo", name),
        field("Sua cor", color),
        button(
          "Salvar perfil",
          (event) =>
            task(event.currentTarget, async () => {
              ctx.profile = await api.mutate("/me/sync", {
                name: name.value,
                color: color.value,
              });
              toast("Perfil atualizado.");
              render();
            }),
          "secondary",
        ),
        saved &&
          button(
            `Reconectar à sala ${saved}`,
            (event) =>
              task(event.currentTarget, async () => {
                await reconnect();
                if (state.room) go("room");
              }),
            "ghost",
          ),
        state.room && button("Voltar à sala", () => go("room"), "primary"),
        button(
          "Sair da conta",
          (event) =>
            task(event.currentTarget, async () => {
              if (
                !(await confirm(
                  "Sair da conta?",
                  "Os dados privados deste usuário serão removidos deste navegador.",
                ))
              )
                return;
              const uid = auth.user.uid;
              api.cancel();
              realtime.stop();
              client.reset();
              drafts.reset();
              storage.clearUser(uid);
              await auth.logout();
              go("home");
            }),
          "ghost",
        ),
      ),
    ),
  };
}
async function history() {
  await account();
  const list = el("div");
  let cursor;
  const more = button(
    "Carregar mais",
    (event) => task(event.currentTarget, () => load()),
    "ghost",
  );
  async function load() {
    const page = await api.get(
      `/me/history?limit=30${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!page.items.length && !cursor)
      list.append(
        el(
          "p",
          { class: "empty" },
          "Suas partidas online concluídas aparecerão aqui.",
        ),
      );
    page.items.forEach((item) =>
      list.append(
        el(
          "div",
          { class: "player" },
          el(
            "div",
            { class: "player-main" },
            el("strong", {}, `Sala ${item.room_code}`),
            el(
              "small",
              {},
              `${new Date(item.finished_at).toLocaleDateString("pt-BR")} · ${item.rounds} rodadas ${item.won ? "· vitória" : ""}`,
            ),
          ),
          el("strong", {}, `${item.score} pts`),
        ),
      ),
    );
    cursor = page.next_cursor;
    more.hidden = !cursor;
  }
  await load();
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        "PALAVRAS QUE FICARAM",
        "Histórico de partidas",
        "Partidas online concluídas, ordenadas pelo identificador do servidor.",
      ),
      el("div", { class: "panel" }, list, more),
    ),
  };
}
function rulesView() {
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        "UMA LETRA. UM DESAFIO.",
        "Como jogar",
        "O clássico de papel e caneta, com a sua turma em qualquer tela.",
      ),
      el(
        "div",
        { class: "panel stack" },
        ...[
          [
            "01 / Escolha o seu jeito",
            "Jogue localmente de graça ou entre com Google para criar uma sala e convidar a turma.",
          ],
          [
            "02 / Gire e confirme",
            "Escolha uma letra da roda. Só a confirmação inicia a rodada. As letras já usadas saem da roda.",
          ],
          [
            "03 / Encontre as palavras",
            "Escreva uma resposta para cada categoria começando com a letra. No chinês, as regras oficiais não exigem a inicial. Quando terminar, peça STOP!",
          ],
          [
            "04 / Confira em conjunto",
            "No online, todos votam 0, 5 ou 10 em cada resposta, inclusive nas vazias. A palavra é aprovada quando todos concordam. Cada participante confirma o fim da revisão.",
          ],
          [
            "05 / Some boas histórias",
            "Respostas plausíveis únicas sugerem 10 pontos; repetidas, 5; inválidas, 0. No online, o servidor consolida as notas aprovadas.",
          ],
        ].map(([title, text]) =>
          el("div", {}, el("h2", {}, title), el("p", { class: "muted" }, text)),
        ),
        el(
          "p",
          { class: "notice" },
          "Após STOP, o online mantém uma janela de 8 segundos para o envio final. Voz, anúncios e checkout web ainda não estão disponíveis.",
        ),
        button("Vamos jogar", () => go("local"), "primary"),
      ),
    ),
  };
}
async function online() {
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        "MESA ABERTA",
        "Chame a turma.",
        "Crie uma sala ou entre com um convite. Sem anúncio fictício: o backend oferece bilhetes gratuitos enquanto não houver provedor.",
      ),
      el(
        "div",
        { class: "two-column" },
        el(
          "div",
          { class: "panel stack" },
          el("h2", {}, "A rodada é sua."),
          el(
            "p",
            { class: "muted" },
            "Escolha as categorias e compartilhe o convite.",
          ),
          button("Criar sala", () => go("create"), "primary"),
        ),
        el(
          "div",
          { class: "panel stack" },
          el("h2", {}, "Já tem convite?"),
          el("p", { class: "muted" }, "Encontre a sala com o código da turma."),
          button("Entrar em sala", () => go("join"), "secondary"),
        ),
      ),
    ),
  };
}
async function roomView() {
  const room = state.room;
  if (!room)
    return {
      node: el(
        "section",
        { class: "narrow" },
        heading(
          "RETOME A PARTIDA",
          "Nenhuma sala conectada.",
          "Use o perfil para reconectar à sua última sala ou entre com um convite.",
        ),
        button("Abrir perfil", () => go("profile"), "primary"),
      ),
    };
  switch (room.status) {
    case "lobby":
      return lobby(ctx, room);
    case "letter_selection":
      return letterSelection(ctx, room);
    case "playing": {
      if (drafts.key !== `${room.game_id}:${room.round_id}` || !drafts.ready)
        await drafts.restore();
      return gameplay(ctx, state.room, false);
    }
    case "review":
      return review(ctx, room);
    case "results":
    case "finished": {
      const result = await api.get(`/rooms/${room.code}/results`);
      if (result.game_id !== room.game_id || result.round_id !== room.round_id)
        throw new ApiError("STALE_ROUND");
      return results(ctx, { ...room, ...result });
    }
    case "closed":
      realtime.stop();
      return {
        node: el(
          "section",
          { class: "narrow" },
          heading(
            "ATÉ A PRÓXIMA",
            "Esta sala foi encerrada.",
            "Crie outra sala para começar uma nova partida.",
          ),
          button(
            "Voltar ao início",
            () => {
              clearRoom();
              go("home");
            },
            "primary",
          ),
        ),
      };
    default:
      throw new Error("Estado de sala incompatível.");
  }
}
async function render() {
  const generation = ++renderGeneration;
  const route =
    location.hash.slice(1) ||
    (new URLSearchParams(location.search).has("room") ? "join" : "home");
  ctx.route = route;
  mounted?.cleanup?.();
  mounted = null;
  screen.replaceChildren(
    el("p", { class: "loading" }, "Preparando a próxima jogada…"),
  );
  let view;
  try {
    if (!ctx.bundle) {
      if (["home", "rules"].includes(route))
        view = route === "home" ? home(ctx) : rulesView();
      else
        view = {
          node: el(
            "section",
            { class: "narrow" },
            heading(
              "REGRAS INDISPONÍVEIS",
              "Vamos tentar de novo?",
              "Não foi possível carregar as regras públicas da API. Não usamos listas inventadas.",
            ),
            button(
              "Tentar novamente",
              (event) =>
                task(event.currentTarget, async () => {
                  await bootRules();
                  render();
                }),
              "primary",
            ),
          ),
        };
    } else if (
      [
        "profile",
        "friends",
        "history",
        "create",
        "room-settings",
        "room",
      ].includes(route) &&
      !auth.user
    )
      view = await loginView();
    else {
      switch (route) {
        case "home":
          view = home(ctx);
          break;
        case "local":
          view = await setup(ctx, "local");
          break;
        case "settings":
          view = await setup(ctx);
          break;
        case "create":
          view = await setup(ctx, "online");
          break;
        case "room-settings":
          await account();
          if (
            state.room?.host !== auth.user.uid ||
            state.room?.status !== "lobby"
          )
            throw new ApiError("HOST_REQUIRED");
          view = await setup(ctx, "room-settings");
          break;
        case "local-game": {
          if (!ctx.local) {
            view = await setup(ctx, "local");
            break;
          }
          if (ctx.local.status === "letter_selection")
            view = letterSelection(ctx, ctx.local, true);
          else if (ctx.local.status === "playing")
            view = gameplay(ctx, ctx.local, true);
          else view = results(ctx, ctx.local, true);
          break;
        }
        case "online":
          view = await online();
          break;
        case "join":
          view = auth.user ? join(ctx) : await loginView();
          break;
        case "profile":
          view = await profile();
          break;
        case "history":
          view = await history();
          break;
        case "friends":
          await account();
          view = await friends(ctx);
          break;
        case "premium":
          view = await premium(ctx);
          break;
        case "rules":
          view = rulesView();
          break;
        case "room":
          view = await roomView();
          break;
        default:
          view = home(ctx);
      }
    }
  } catch (error) {
    view = {
      node: el(
        "section",
        { class: "narrow" },
        heading(
          "PAUSA PARA RESPIRAR",
          "Não deu para continuar.",
          explain(error),
        ),
        button("Tentar novamente", () => render(), "primary"),
        button("Voltar ao início", () => go("home"), "ghost"),
      ),
    };
  }
  if (generation !== renderGeneration) {
    view.cleanup?.();
    return;
  }
  if (route !== "home")
    screen.replaceChildren(
      button("← Início", () => go("home"), "ghost small back"),
      view.node,
    );
  else screen.replaceChildren(view.node);
  mounted = view;
  if (route === "room")
    mounted.roomIdentity = `${state.room?.room_id}:${state.room?.game_id}:${state.room?.round_id}:${state.room?.status}:${state.room?.host}`;
  screen.focus({ preventScroll: true });
}
state.addEventListener("change", () => {
  if (ctx.route !== "room" || !state.room) return;
  const room = state.room,
    identity = `${room.room_id}:${room.game_id}:${room.round_id}:${room.status}:${room.host}`;
  if (identity === mounted?.roomIdentity && mounted.update)
    mounted.update(room);
  else render();
});
async function bootRules() {
  ctx.bundle = await loadRules(api);
  const lang = canonicalLocale(
    storage.get("preferences", {}).lang || navigator.language,
  );
  ctx.lang = ctx.bundle.locales.includes(lang) ? lang : "en";
  if (ctx.bundle.cached)
    connection(
      "Usando regras oficiais em cache, versão conhecida. Tente atualizar a conexão.",
    );
}
document
  .querySelector("#friends-nav")
  .addEventListener("click", () => go("friends"));
document
  .querySelector("#profile-nav")
  .addEventListener("click", () => go("profile"));
window.addEventListener("hashchange", () => render());
window.addEventListener("online", () => {
  if (state.room) reconnect();
  else connection("");
});
window.addEventListener("offline", () =>
  connection(
    "Sem rede. O modo local continua disponível com regras já carregadas.",
  ),
);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.room) reconnect();
  else if (
    document.hidden &&
    ctx.route === "room" &&
    state.room?.status === "playing"
  )
    drafts.flush().catch(() => {});
});
window.addEventListener("pagehide", () => {
  realtime.stop();
  if (ctx.local) saveLocal();
});
await task(null, bootRules);
await auth.init(async (user) => {
  const previousUid = ctx.profile?.uid;
  authGeneration++;
  profileReady = false;
  api.cancel();
  realtime.stop();
  client.reset();
  drafts.reset();
  if (previousUid && previousUid !== user?.uid) storage.clearUser(previousUid);
  state.clear();
  ctx.profile = null;
  ctx.entitlements = null;
  document.querySelector("#friends-badge").hidden = true;
  if (user) await task(null, () => loadAccount(user));
  await render();
});
await render();
