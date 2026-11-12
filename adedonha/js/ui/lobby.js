import { el, button, heading, field, task, toast } from "./dom.js";
import { confirm } from "./dialogs.js";
import { storage } from "../storage.js";
export function join(ctx) {
  const params = new URLSearchParams(location.search);
  const code = el("input", {
    value: params.get("room") || "",
    maxlength: ctx.bundle.rules.online.room_code_length,
    placeholder: "ABCDE",
    autocomplete: "off",
    autocapitalize: "characters",
    required: "",
    pattern: `[${ctx.bundle.rules.online.code_alphabet}]{5}`,
  });
  const nickname = el("input", {
    value: storage.get("guestNickname", ""),
    maxlength: 24,
    placeholder: "Ex.: Ana",
    autocomplete: "nickname",
  });
  code.addEventListener("input", () => {
    code.value = code.value.toUpperCase();
  });
  const submit = button(
    "Entrar na sala  ↗",
    (event) =>
      task(event.currentTarget, async () => {
        if (
          !new RegExp(
            `^[${ctx.bundle.rules.online.code_alphabet}]{${ctx.bundle.rules.online.room_code_length}}$`,
          ).test(code.value)
        )
          throw new Error("Confira o código de 5 caracteres da sala.");
        await ctx.joinRoom(code.value, nickname.value);
      }),
    "primary",
  );
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        "A TURMA ESTÁ ESPERANDO",
        "Qual é a sala?",
        "Use o código ou abra o link enviado pelo líder.",
      ),
      el(
        "div",
        { class: "panel stack" },
        field("Código da sala", code),
        (!ctx.auth.user || ctx.auth.user.isAnonymous) && field("Seu apelido", nickname),
        ctx.auth.user && !ctx.auth.user.isAnonymous && el("p", { class: "note" }, `Participar como ${ctx.auth.user.email}`),
        submit,
        (!ctx.auth.user || ctx.auth.user.isAnonymous) && button("Usar Google (opcional)", (event) => task(event.currentTarget, () => ctx.loginGoogle()), "ghost", { disabled: !ctx.auth.sdk }),
      ),
    ),
  };
}
export function lobby(ctx, room) {
  const host = room.host === ctx.auth.user.uid;
  const invite = () =>
    `${location.origin}/adedonha?room=${encodeURIComponent(ctx.state.room.code)}#join`;
  const players = el("div"),
    details = el("div"),
    status = el("p", { class: "notice" });
  const render = (next) => {
    players.replaceChildren(
      ...Object.entries(next.players).map(([id, player]) =>
        el(
          "div",
          { class: "player" },
          el(
            "span",
            { class: "avatar" },
            player.name.slice(0, 1).toUpperCase(),
          ),
          el(
            "div",
            { class: "player-main" },
            el(
              "strong",
              {},
              player.name,
              id === ctx.auth.user.uid && el("span", { class: "tag" }, "VOCÊ"),
            ),
            el(
              "small",
              {},
              id === next.host ? "Líder atual" : "Participante",
              id === next.owner ? " · Criador da sala" : "",
            ),
          ),
          el(
            "span",
            { class: "presence" },
            player.present && Date.now() - player.last_seen < 60000
              ? "● Presente"
              : "○ Ausente",
          ),
        ),
      ),
    );
    details.replaceChildren(
      el(
        "p",
        {},
        `${next.rounds} rodadas · ${next.timer ? `${next.timer}s` : "sem cronômetro"} · ${next.lang}`,
      ),
      el("p", { class: "note" }, next.categories.join(" · ")),
    );
    status.textContent = next.premium.ad_free
      ? "✦ Benefício compartilhado ativo nesta sala até o fim da partida, mesmo se o criador sair."
      : "Acesso online com bilhete do servidor. Anúncios indisponíveis nesta versão.";
  };
  render(room);
  return {
    node: el(
      "section",
      {},
      heading(
        "REÚNA A TURMA",
        "Todo mundo pronto?",
        "Compartilhe o convite e prepare as palavras. Até 10 pessoas podem jogar.",
      ),
      el(
        "div",
        { class: "two-column" },
        el(
          "div",
          { class: "panel stack" },
          el("p", { class: "eyebrow" }, "CÓDIGO DA SALA"),
          el("div", { class: "code" }, room.code),
          el(
            "div",
            { class: "actions" },
            button(
              "Copiar código",
              (event) =>
                task(event.currentTarget, async () => {
                  await navigator.clipboard.writeText(room.code);
                  toast("Código copiado.");
                }),
              "ghost",
            ),
            button(
              "Copiar convite",
              (event) =>
                task(event.currentTarget, async () => {
                  await navigator.clipboard.writeText(invite());
                  toast("Convite copiado.");
                }),
              "secondary",
            ),
          ),
          status,
          details,
          host &&
            button(
              "Editar configurações",
              () => ctx.go("room-settings"),
              "ghost",
            ),
          el(
            "div",
            { class: "actions" },
            host &&
              button(
                "Começar partida  ↗",
                (event) =>
                  task(event.currentTarget, () =>
                    ctx.client.mutate(
                      "start",
                      {},
                      {
                        valid: (r) => r.status === "lobby",
                        applied: (r) => r.status !== "lobby",
                      },
                    ),
                  ),
                "primary",
              ),
            button("Sair da sala", () => ctx.leaveRoom(), "ghost"),
            host &&
              button(
                "Encerrar sala",
                (event) =>
                  task(event.currentTarget, async () => {
                    if (
                      await confirm(
                        "Encerrar esta sala?",
                        "A sala será fechada para todos. Esta ação não registra uma partida concluída.",
                      )
                    )
                      await ctx.client.mutate(
                        "close",
                        {},
                        { applied: (r) => r.status === "closed" },
                      );
                  }),
                "ghost small",
              ),
          ),
          el(
            "p",
            { class: "note" },
            "Microfone indisponível: ainda não existe transmissão de voz integrada.",
          ),
        ),
        el("div", { class: "panel" }, el("h2", {}, "Na sala"), players),
      ),
    ),
    update(next) {
      if ((next.host === ctx.auth.user.uid) !== host) ctx.render();
      else render(next);
    },
  };
}
