import { el, button, heading, task, toast } from "./dom.js";
import { reviewItem, allApproved } from "../state.js";
import { confirm, dialog } from "./dialogs.js";
export function review(ctx, room) {
  let viewing = room.review.category;
  const list = el("div"),
    tabs = el("div", {
      class: "category-tabs",
      "aria-label": "Categorias da revisão",
    }),
    controls = el("div", { class: "actions" }),
    progress = el("p", { class: "note" }),
    title = el("h2");
  const uid = ctx.auth.user.uid;
  let current = room,
    waitingDialog = false,
    missing = false;
  async function act(action, extra = {}, options = {}) {
    await ctx.client.mutate(`review/${action}`, extra, {
      round: true,
      valid: (r) => r.status === "review",
      ...options,
    });
  }
  function draw(next) {
    current = next;
    if (viewing > next.review.category) viewing = next.review.category;
    const displayedCategory = viewing;
    const active = viewing === next.review.category,
      host = next.host === uid;
    title.textContent = next.categories[viewing];
    tabs.replaceChildren(
      ...next.categories.map((category, i) =>
        button(
          `${i + 1}. ${category}`,
          () => {
            viewing = i;
            draw(current);
          },
          i === viewing ? "active" : "",
          { disabled: i > next.review.category },
        ),
      ),
    );
    list.replaceChildren(
      ...next.participants.map((id) => {
        const item = reviewItem(next, id, viewing),
          player = next.players[id];
        const ownVote = next.review.votes?.[uid]?.[item.key],
          hostVote = next.review.votes?.[next.host]?.[item.key];
        const hostMissing =
          missing && !item.approved && (!hostVote || hostVote.e !== item.epoch);
        const score = button(
          item.approved
            ? `${item.score}`
            : ownVote?.e === item.epoch
              ? `${ownVote.v}`
              : "?",
          () => {
            list
              .querySelectorAll(".vote-tray")
              .forEach((node) => node.remove());
            const tray = el(
              "div",
              {
                class: "vote-tray",
                role: "group",
                "aria-label": "Escolha sua pontuação",
              },
              [0, 5, 10].map((value) =>
                button(
                  value,
                  (event) =>
                    task(event.currentTarget, async () => {
                      tray.remove();
                      await act(
                        "votes",
                        { votes: { [item.key]: { v: value, e: item.epoch } } },
                        {
                          method: "PUT",
                          valid: (r) =>
                            r.status === "review" &&
                            r.review.category === displayedCategory &&
                            reviewItem(r, id, displayedCategory).epoch ===
                              item.epoch &&
                            !reviewItem(r, id, displayedCategory).approved,
                          applied: (r) => {
                            const vote = r.review.votes?.[uid]?.[item.key];
                            return vote?.v === value && vote.e === item.epoch;
                          },
                        },
                      );
                    }),
                  "",
                  { "aria-label": `Votar ${value} em ${player.name}` },
                ),
              ),
            );
            card.append(tray);
            tray.querySelector("button")?.focus();
          },
          "score-button",
          {
            disabled: item.approved || !active || !!next.review.done?.[uid],
            "aria-label": `Pontuação de ${player.name}`,
          },
        );
        const voteDetails = next.participants
          .map((voter) => {
            const vote = next.review.votes?.[voter]?.[item.key];
            return `${next.players[voter]?.name || voter}: ${vote?.e === item.epoch ? vote.v : "aguardando"}`;
          })
          .join(" · ");
        const card = el(
          "article",
          {
            class: `review-card ${id === uid ? "own" : ""} ${hostMissing ? "missing-vote" : ""}`,
            "data-review-key": item.key,
          },
          el(
            "div",
            { class: "review-meta" },
            el(
              "strong",
              {},
              player.name,
              id === uid && el("span", { class: "tag" }, "VOCÊ"),
            ),
            el(
              "span",
              { class: "tag" },
              item.approved
                ? "✓ APROVADA"
                : item.votes.length === next.participants.length
                  ? "VOTOS DIVERGENTES"
                  : `${item.votes.length}/${next.participants.length} votos`,
            ),
          ),
          el(
            "div",
            { class: "review-meta" },
            el(
              "div",
              {},
              el(
                "p",
                { class: "review-word" },
                next.answers[id]?.[viewing] || "— resposta vazia —",
              ),
              el(
                "p",
                { class: "note" },
                `Sugestão: ${next.suggested[id]?.[viewing] ?? 0} pontos · época ${item.epoch}`,
              ),
            ),
            score,
          ),
          el("div", { class: "votes" }, voteDetails),
          item.approved &&
            host &&
            button(
              "Reabrir palavra",
              (event) =>
                task(event.currentTarget, async () => {
                  if (
                    await confirm(
                      "Reabrir esta palavra?",
                      "Os votos antigos e todas as confirmações de conclusão serão invalidados.",
                    )
                  )
                    await act(
                      "reopen",
                      { key: item.key },
                      {
                        applied: (r) =>
                          reviewItem(r, id, displayedCategory).epoch >
                          item.epoch,
                      },
                    );
                }),
              "ghost small",
            ),
        );
        return card;
      }),
    );
    const approved = Object.keys(next.review.approved || {}).length,
      total = next.participants.length * next.categories.length;
    progress.textContent = `${approved}/${total} palavras aprovadas · ${Object.values(next.review.done || {}).filter(Boolean).length}/${next.participants.length} jogadores terminaram`;
    controls.replaceChildren();
    if (host && active) {
      const categoryApproved = next.participants.every(
        (id) => reviewItem(next, id, viewing).approved,
      );
      if (viewing < next.categories.length - 1)
        controls.append(
          button(
            "Próxima categoria →",
            (event) =>
              task(event.currentTarget, () =>
                act(
                  "next",
                  {},
                  {
                    applied: (r) => r.review.category > displayedCategory,
                    valid: (r) =>
                      r.status === "review" &&
                      r.review.category === displayedCategory,
                  },
                ),
              ),
            "secondary",
            { disabled: !categoryApproved },
          ),
        );
      if (!categoryApproved)
        controls.append(
          button(
            "Forçar conclusão da revisão",
            (event) =>
              task(event.currentTarget, async () => {
                if (
                  !(await confirm(
                    "Forçar esta categoria?",
                    "O servidor aplicará o seu voto explícito em cada palavra pendente. Notas aprovadas serão preservadas. Todos ainda precisarão confirmar a conclusão da revisão.",
                  ))
                )
                  return;
                try {
                  await act(
                    "force",
                    {},
                    {
                      valid: (r) =>
                        r.status === "review" &&
                        r.review.category === displayedCategory,
                      applied: (r) =>
                        r.status === "review" &&
                        r.review.category > displayedCategory,
                    },
                  );
                  missing = false;
                } catch (error) {
                  if (error.code === "HOST_VOTE_MISSING") {
                    missing = true;
                    draw(current);
                  }
                  throw error;
                }
              }),
            "ghost",
          ),
        );
    }
    controls.append(
      button(
        next.review.done?.[uid]
          ? "Ainda não terminei, quero revisar mais um pouco..."
          : "Terminei de revisar",
        (event) =>
          task(event.currentTarget, async () => {
            if (current.review.done?.[uid]) {
              await act(
                "unlock",
                {},
                { applied: (r) => !r.review.done?.[uid] },
              );
              return;
            }
            await act(
              "complete",
              {},
              {
                applied: (r) =>
                  !!r.review.done?.[uid] || r.status === "results",
              },
            );
            if (ctx.state.room.status === "review") showWaiting();
          }),
        "primary",
        { disabled: !allApproved(next) && !next.review.done?.[uid] },
      ),
    );
    if (waitingDialog && !next.review.done?.[uid]) {
      document.querySelector("#dialog").close();
      waitingDialog = false;
    }
  }
  async function showWaiting() {
    if (waitingDialog) return;
    waitingDialog = true;
    const undo = await dialog(
      "Revisão concluída por você",
      "Você terminou sua revisão. Aguardando os outros jogadores validarem e finalizarem.",
      [
        { label: "Aguardar", value: false },
        {
          label: "Ainda não terminei, quero revisar mais um pouco...",
          value: true,
          variant: "ghost",
        },
      ],
    );
    waitingDialog = false;
    if (undo && ctx.state.room?.status === "review")
      await task(null, () =>
        act("unlock", {}, { applied: (r) => !r.review.done?.[uid] }),
      );
  }
  draw(room);
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        "TODO MUNDO TEM VOZ",
        "Vamos conferir?",
        "Vote em todas as palavras, inclusive nas vazias e nas suas. A pontuação só é aprovada por unanimidade.",
      ),
      progress,
      tabs,
      title,
      list,
      controls,
      el(
        "p",
        { class: "note" },
        "Microfone indisponível. Combine as notas com a turma pelos votos.",
      ),
    ),
    update(next) {
      if (next.review.category !== current.review.category)
        viewing = next.review.category;
      draw(next);
    },
    cleanup() {
      if (waitingDialog) document.querySelector("#dialog").close();
    },
  };
}
