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
  const letters = local ? room.used || [] : room.used || (room.letter ? [room.letter] : []);
  const history = el("div", { class: "letter-history", "aria-label": "Letras jogadas" },
    letters.map((letter, index) => el("span", {
      class: `letter-history-chip ${index === letters.length - 1 ? "current" : ""}`,
    }, letter)));
  const ranking = el("div", { class: "ranking-accordion" },
    entries.map(([id, player], index) => {
      const mine = local || id === ctx.auth.user?.uid;
      const playerName = mine ? "EU" : String(player.name || "Jogador").split("@")[0];
      const answers = local ? room.answers : room.answers?.[id] || [];
      const scores = local ? room.scores : room.results?.[id] || [];
      const details = el("details", { class: `rank-entry podium-${index < 3 ? index + 1 : "other"}` },
        el("summary", { class: "rank-summary" },
          el("span", { class: "rank-number" }, String(index + 1).padStart(2, "0")),
          el("strong", { class: "rank-name" }, playerName),
          mine && el("span", { class: "tag" }, "VOCÊ"),
          el("strong", { class: "rank-score" }, `${player.score} pts`)),
        el("div", { class: "rank-details" },
          ...room.categories.map((category, i) =>
            el("div", { class: "rank-answer" },
              el("strong", {}, category),
              el("span", {}, answers[i] || "—"),
              el("strong", {}, `+${scores[i] || 0}`)))),
      );
      return details;
    }));
  const node = el(
    "section",
    { class: "narrow results-screen" },
    heading(
      finished ? "QUE PARTIDA!" : `RODADA ${room.round} DE ${room.rounds}`,
      finished ? "Partida finalizada!" : "Pontos da rodada",
      local ? "Resultado local" : "Classificação consolidada pelo servidor.",
    ),
    !local && !finished && room.host !== ctx.auth.user?.uid && el("div", { class: "waiting-leader", role: "status" },
      el("span", { class: "waiting-orbit", "aria-hidden": "true" }, "●"),
      el("span", {}, "Aguardando o líder iniciar a próxima rodada…")),
    el("div", { class: "result-letter-panel" },
      el("h2", {}, "Histórico de letras"), history),
    ranking,
    el("div", { class: "actions", style: "margin-top:24px" },
      !local && finished && button("Criar nova partida", () => ctx.go("create"), "primary"),
      local ? button(finished ? "Nova partida" : "Próxima rodada →",
        () => finished ? ctx.go("local") : ctx.nextLocal(), "primary")
        : room.host === ctx.auth.user?.uid && !finished
          ? button(room.round >= room.rounds ? "Finalizar partida" : "Próxima rodada →",
            (event) => task(event.currentTarget, () => ctx.client.mutate("rounds", {}, {
              valid: (r) => r.status === "results",
              applied: (r) => r.status !== "results" || r.round_id !== room.round_id,
            })), "primary") : null,
      button("Compartilhar resultado", (event) => task(event.currentTarget, async () => {
        const message = `Adedonha — STOP! ${entries.map(([, p]) => `${p.name}: ${p.score} pontos`).join(" · ")}`;
        if (navigator.share) await navigator.share({ title: "Adedonha — STOP!", text: message });
        else {
          await navigator.clipboard.writeText(message);
          await dialog("Copiado!", "O resultado está pronto para compartilhar.");
        }
      }), "ghost"),
      button(local ? "Voltar ao início" : "Sair da sala",
        () => local ? ctx.go("home") : ctx.leaveRoom(), "ghost"),
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
  return { node, update(next) { if (next.status === "results") return; } };
}
