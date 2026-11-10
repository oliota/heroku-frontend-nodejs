import { el, button, heading, field, task, toast } from "./dom.js";
import { confirm } from "./dialogs.js";
import { storage } from "../storage.js";
export async function friends(ctx) {
  const uid = ctx.auth.user.uid,
    cached = storage.get(`user:${uid}:friends`, []);
  let accepted = [...cached],
    pending = [],
    nextFriends = null,
    nextRequests = null;
  const inbox = el("section"),
    list = el("section"),
    state = el("p", { class: "note" }, "Atualizando…");
  const count = async () => {
    await ctx.updateBadge();
  };
  const load = async (append = false, kind = "both") => {
    if (ctx.auth.user?.uid !== uid) return;
    const responses = await Promise.all([
      kind !== "requests"
        ? ctx.api.get(
            `/friends?limit=30${append && nextFriends ? `&after=${encodeURIComponent(nextFriends)}` : ""}`,
          )
        : null,
      kind !== "friends"
        ? ctx.api.get(
            `/friends/requests?limit=30${append && nextRequests ? `&after=${encodeURIComponent(nextRequests)}` : ""}`,
          )
        : null,
    ]);
    if (ctx.auth.user?.uid !== uid) return;
    if (responses[0]) {
      accepted = append
        ? [
            ...new Map(
              [...accepted, ...responses[0].items].map((item) => [
                item.id,
                item,
              ]),
            ).values(),
          ]
        : responses[0].items;
      nextFriends = responses[0].next_cursor;
      storage.set(`user:${uid}:friends`, accepted);
    }
    if (responses[1]) {
      pending = append
        ? [
            ...new Map(
              [...pending, ...responses[1].items].map((item) => [
                item.id,
                item,
              ]),
            ).values(),
          ]
        : responses[1].items;
      nextRequests = responses[1].next_cursor;
    }
    state.textContent = "Atualizado";
    draw();
    await count();
  };
  async function change(path, name, description, method = "POST") {
    if (!(await confirm(name, description))) return;
    await ctx.api.mutate(path, {}, method);
    await load();
  }
  function draw() {
    inbox.hidden = !pending.length;
    inbox.replaceChildren(
      el(
        "div",
        {},
        el("h2", {}, "Pendentes de aprovação"),
        ...pending.map((request) =>
          el(
            "div",
            { class: "friend-row" },
            el(
              "div",
              { class: "player-main" },
              el("strong", {}, request.from_name || request.from),
            ),
            el(
              "div",
              { class: "list-actions" },
              button(
                "Aceitar",
                (event) =>
                  task(event.currentTarget, () =>
                    change(
                      `/friends/requests/${encodeURIComponent(request.id)}/accept`,
                      "Aceitar amizade?",
                      `Aceitar a solicitação de ${request.from_name}?`,
                    ),
                  ),
                "small secondary",
              ),
              button(
                "Rejeitar",
                (event) =>
                  task(event.currentTarget, () =>
                    change(
                      `/friends/requests/${encodeURIComponent(request.id)}/reject`,
                      "Rejeitar solicitação?",
                      `Rejeitar a solicitação de ${request.from_name}?`,
                    ),
                  ),
                "small ghost",
              ),
            ),
          ),
        ),
        nextRequests &&
          button(
            "Mais solicitações",
            (event) => task(event.currentTarget, () => load(true, "requests")),
            "ghost small",
          ),
      ),
    );
    list.replaceChildren(
      el(
        "div",
        {},
        el("h2", {}, "Meus amigos"),
        accepted.length
          ? accepted.map((friend) =>
              el(
                "div",
                { class: "friend-row" },
                el(
                  "span",
                  { class: "avatar" },
                  friend.name?.slice(0, 1) || "?",
                ),
                el("strong", { class: "player-main" }, friend.name),
                button(
                  "Remover",
                  (event) =>
                    task(event.currentTarget, () =>
                      change(
                        `/friends/${encodeURIComponent(friend.uid)}`,
                        "Remover amizade?",
                        `Remover ${friend.name} da sua lista de amigos?`,
                        "DELETE",
                      ),
                    ),
                  "small ghost",
                ),
              ),
            )
          : el(
              "p",
              { class: "empty" },
              "Sua próxima turma de STOP começa aqui.",
            ),
        nextFriends &&
          button(
            "Mais amigos",
            (event) => task(event.currentTarget, () => load(true, "friends")),
            "ghost small",
          ),
      ),
    );
  }
  const code = el("input", {
    maxlength: ctx.bundle.rules.online.friend_code_length,
    placeholder: "ABC234",
    autocapitalize: "characters",
  });
  draw();
  const node = el(
    "section",
    { class: "narrow" },
    heading(
      "MELHOR COM A TURMA",
      "Amigos",
      `Seu código de amizade: ${ctx.profile.friend_code}`,
    ),
    el(
      "div",
      { class: "panel stack" },
      field("Adicionar pelo código de amizade", code),
      button(
        "Enviar solicitação",
        (event) =>
          task(event.currentTarget, async () => {
            const value = code.value.trim().toUpperCase();
            if (
              !new RegExp(
                `^[${ctx.bundle.rules.online.code_alphabet}]{6}$`,
              ).test(value)
            )
              throw new Error(
                "Informe um código de amizade válido de 6 caracteres.",
              );
            if (
              !(await confirm(
                "Enviar solicitação?",
                `Enviar um pedido de amizade para ${value}?`,
              ))
            )
              return;
            await ctx.api.mutate("/friends/requests", { friend_code: value });
            code.value = "";
            toast("Solicitação enviada.");
            await load();
          }),
        "secondary",
      ),
      state,
      button(
        "Atualizar listas",
        (event) => task(event.currentTarget, () => load()),
        "ghost small",
      ),
      inbox,
      list,
    ),
  );
  await task(null, () => load());
  let unsubscribe;
  if (ctx.auth.db)
    unsubscribe = ctx.auth.watchRequests(
      uid,
      () => task(null, () => load()),
      () => {
        state.textContent =
          "Atualização em tempo real indisponível. Use Atualizar listas.";
      },
    );
  return { node, cleanup: () => unsubscribe?.() };
}
