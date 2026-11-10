import { el, button, heading, task } from "./dom.js";
import { storage } from "../storage.js";
import { dialog } from "./dialogs.js";
export function results(ctx, room, local = false) {
  const localScore = local ? room.scores.reduce((a, b) => a + b, 0) : null;
  const entries = local
    ? [["local", { name: "Você", score: room.total }]]
    : Object.entries(room.players).sort(
        (a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]),
      );
  const finished = room.status === "finished";
  const node = el(
    "section",
    { class: "narrow" },
    heading(
      finished ? "QUE PARTIDA!" : `RODADA ${room.round} DE ${room.rounds}`,
      finished ? "Palavras que valem ouro." : "Essa rodada foi boa!",
      local
        ? "Pontuação local pelas regras públicas. Não é uma classificação online."
        : "Classificação consolidada pelo servidor.",
    ),
    el(
      "ol",
      { class: "ranking" },
      entries.map(([id, player], i) =>
        el(
          "li",
          {},
          el("span", { class: "rank" }, String(i + 1).padStart(2, "0")),
          el(
            "div",
            { class: "player-main" },
            el(
              "strong",
              {},
              player.name,
              (local || id === ctx.auth.user?.uid) &&
                el("span", { class: "tag" }, "VOCÊ"),
            ),
            el(
              "p",
              { class: "note" },
              `Rodada: ${local ? localScore : (room.results[id] || []).reduce((a, b) => a + b, 0)} pontos`,
            ),
          ),
          el("span", { class: "rank-score" }, player.score),
        ),
      ),
    ),
    el(
      "div",
      { class: "panel" },
      el("h2", {}, `A letra foi ${room.letter}`),
      local
        ? room.categories.map((category, i) =>
            el(
              "div",
              { class: "player" },
              el(
                "div",
                { class: "player-main" },
                el("strong", {}, category),
                el("small", {}, room.answers[i] || "—"),
              ),
              `${room.scores[i]} pts`,
            ),
          )
        : room.categories.map((category, i) =>
            el(
              "p",
              { class: "note" },
              `${category}: ${room.participants.map((id) => `${room.players[id].name} ${room.results[id]?.[i] ?? 0}`).join(" · ")}`,
            ),
          ),
    ),
    el(
      "div",
      { class: "actions", style: "margin-top:24px" },
      !local &&
        finished &&
        button("Criar nova partida", () => ctx.go("create"), "primary"),
      local
        ? button(
            finished ? "Nova partida" : "Próxima rodada →",
            () => (finished ? ctx.go("local") : ctx.nextLocal()),
            "primary",
          )
        : room.host === ctx.auth.user?.uid && !finished
          ? button(
              room.round >= room.rounds
                ? "Finalizar partida"
                : "Próxima rodada →",
              (event) =>
                task(event.currentTarget, () =>
                  ctx.client.mutate(
                    "rounds",
                    {},
                    {
                      valid: (r) => r.status === "results",
                      applied: (r) =>
                        r.status !== "results" || r.round_id !== room.round_id,
                    },
                  ),
                ),
              "primary",
            )
          : null,
      button(
        "Compartilhar resultado",
        (event) =>
          task(event.currentTarget, async () => {
            const text = `Adedonha — STOP! ${entries.map(([, p]) => `${p.name}: ${p.score} pontos`).join(" · ")}`;
            if (navigator.share)
              await navigator.share({ title: "Adedonha — STOP!", text });
            else {
              await navigator.clipboard.writeText(text);
              await dialog(
                "Copiado!",
                "O resultado está pronto para compartilhar.",
              );
            }
          }),
        "ghost",
      ),
      button(
        local ? "Voltar ao início" : "Sair da sala",
        () => (local ? ctx.go("home") : ctx.leaveRoom()),
        "ghost",
      ),
    ),
  );
  if (finished) {
    const id = local ? room.id : room.game_id,
      recorded = storage.get("completed", []);
    if (!recorded.includes(id)) {
      const total = storage.get("totalGames", 0) + 1;
      storage.set("totalGames", total);
      storage.set("completed", [...recorded.slice(-49), id]);
      const feedback = el(
        "div",
        { class: "panel", style: "margin-top:24px" },
        el("h2", {}, `Opa! Você já jogou ${total} vezes!`),
        el(
          "p",
          {},
          "Está se divertindo? Gostaria de compartilhar sua avaliação para apoiar o jogo e permitir que mais pessoas também se divirtam? Cada avaliação é muito importante!",
        ),
      );
      if (ctx.config.feedbackUrl)
        feedback.append(
          el(
            "a",
            {
              href: ctx.config.feedbackUrl,
              target: "_blank",
              rel: "noopener",
              class: "button ghost",
            },
            "Compartilhar avaliação",
          ),
        );
      feedback.append(
        button(
          "Agora não",
          () => {
            storage.set(
              "feedbackDismissed",
              storage.get("feedbackDismissed", 0) + 1,
            );
            feedback.remove();
          },
          "ghost small",
        ),
      );
      node.append(feedback);
    }
  }
  return { node };
}
