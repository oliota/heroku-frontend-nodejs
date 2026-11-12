import { el, button, heading, task } from "./dom.js";
import { reviewItem } from "../state.js";
import { confirm, dialog } from "./dialogs.js";

const shortName = (name, own) => own ? "EU" : String(name || "Jogador").split("@")[0].slice(0, 24);
const scoreColor = (value) => `score-${Number(value) === 10 ? 10 : Number(value) === 5 ? 5 : 0}`;
const isDisputed = (room, key) => !!room.review.disputed?.[key];
const resolved = (room, key) => !isDisputed(room, key) || Object.hasOwn(room.review.approved || {}, key);

export function review(ctx, initial) {
  const uid = ctx.auth.user.uid;
  const tabs = el("div", { class: "category-tabs review-tabs", "aria-label": "Categorias da revisão" });
  const title = el("h2");
  const progress = el("p", { class: "note review-progress", role: "status" });
  const table = el("div", { class: "review-table-wrap" });
  const desktopBoard = el("div", { class: "review-desktop-board", "aria-label": "Etapas da revisão" });
  const actions = el("div", { class: "actions" });
  let room = initial;
  let viewing = initial.review.category;
  let waitingDialog = false;
  let missingHostVote = false;

  async function mutate(action, extra = {}, options = {}) {
    return ctx.client.mutate(`review/${action}`, extra, {
      round: true,
      valid: (current) => current.status === "review",
      ...options,
    });
  }

  async function vote(key, value, epoch, category) {
    await mutate("votes", { votes: { [key]: { v: value, e: epoch } } }, {
      method: "PUT",
      valid: (r) => r.status === "review" && r.review.category === category &&
        (r.review.epochs?.[key] ?? 0) === epoch &&
        !Object.hasOwn(r.review.approved || {}, key),
    });
  }

  function buildTable(current, category) {
    const active = current.review.category === category;
    const box = el("div", { class: "review-table" },
      el("div", { class: "review-table-head" },
        el("span", {}, "Participante"), el("span", {}, "Palavra"),
        el("span", {}, "Pontos"), el("span", {}, "Estado")));
    current.participants.forEach((id) => {
      const item = reviewItem(current, id, category);
      const playerName = shortName(current.players[id]?.name, id === uid);
      const suggested = Number(current.suggested[id]?.[category] ?? 0);
      const dispute = isDisputed(current, item.key);
      const ownVote = current.review.votes?.[uid]?.[item.key];
      const canVote = active && !item.approved && !current.review.done?.[uid];
      const scoreValue = item.approved ? item.score : dispute && ownVote?.e === item.epoch ? ownVote.v : suggested;
      const score = button(String(scoreValue), () => {}, `score-button ${scoreColor(scoreValue)}`, {
        disabled: !canVote,
        "aria-label": `Alterar pontuação de ${playerName}`,
      });
      const votesCount = dispute ? item.votes.length : 0;
      const status = item.approved ? "✓ Aprovada" : dispute
        ? `${votesCount}/${current.participants.length} votos`
        : "";
      const ballots = current.participants.map((voter) => {
        const ballot = current.review.votes?.[voter]?.[item.key];
        return { name: shortName(current.players[voter]?.name, voter === uid), value: ballot?.e === item.epoch ? Number(ballot.v) : null };
      });
      const divergent = dispute && new Set(ballots.filter((entry) => entry.value !== null).map((entry) => entry.value)).size > 1;
      const card = el("div", { class: `review-table-row ${id === uid ? "own" : ""} ${divergent ? "review-divergent" : ""}` },
        el("div", { class: "review-cell participant-cell" },
          el("strong", {}, playerName),
          null),
        el("div", { class: "review-cell word-cell" },
          el("strong", { class: "review-word compact" }, current.answers[id]?.[category] || "— resposta vazia —")),
        el("div", { class: "review-cell score-cell" }, score),
        el("div", { class: "review-cell votes-cell" },
          status && el("span", { class: `vote-state ${item.approved ? "approved" : "pending"}` }, status),
          dispute && !item.approved && el("div", { class: "vote-comparison" }, ballots.map((entry) =>
            el("span", { class: `vote-pill ${entry.value === null ? "waiting" : scoreColor(entry.value)}` },
              el("strong", {}, entry.name), el("b", {}, entry.value === null ? "…" : String(entry.value))))),
          item.approved && current.host === uid && button("Reabrir", (event) =>
            task(event.currentTarget, async () => {
              if (await confirm("Reabrir esta palavra?", "A categoria precisará de nova aprovação."))
                await mutate("reopen", { key: item.key });
            }), "ghost small")),
      );
      score.onclick = () => {
        if (!canVote) return;
        table.querySelectorAll(".vote-tray").forEach((node) => node.remove());
        const tray = el("div", { class: "vote-tray", role: "group", "aria-label": "Pontuação" },
          [0, 5, 10].map((value) => button(value, (event) => task(event.currentTarget, async () => {
            tray.remove();
            if (!dispute && value === suggested) return;
            await vote(item.key, value, item.epoch, category);
          }), "", { "aria-label": `${value} pontos` })));
        card.append(tray);
        tray.querySelector("button")?.focus();
      };
      box.append(card);
    });
    return box;
  }

  function desktopCategory(current, category) {
    const active = category === current.review.category;
    const completed = category < current.review.category;
    const panel = el("section", {
      class: `desktop-category ${active ? "current" : completed ? "completed" : "future"}`,
      "aria-label": `${category + 1}. ${current.categories[category]}`,
    });
    panel.append(el("header", { class: "desktop-category-title" },
      el("strong", {}, `${category + 1}. ${current.categories[category]}`),
      el("span", {}, completed ? "✓" : active ? "Em revisão" : "A seguir")));
    current.participants.forEach((id) => {
      const item = reviewItem(current, id, category);
      const suggested = Number(current.suggested[id]?.[category] ?? 0);
      const dispute = isDisputed(current, item.key);
      const ownVote = current.review.votes?.[uid]?.[item.key];
      const value = item.approved ? item.score : dispute && ownVote?.e === item.epoch ? ownVote.v : suggested;
      const canVote = active && !item.approved && !current.review.done?.[uid];
      const score = button(String(value), () => {}, `score-button ${scoreColor(value)}`, {
        disabled: !canVote,
        "aria-label": `Pontuação de ${shortName(current.players[id]?.name, id === uid)}`,
      });
      const entry = el("div", { class: `desktop-category-entry ${id === uid ? "own" : ""}` },
        el("span", { class: "desktop-category-player" }, shortName(current.players[id]?.name, id === uid)),
        el("strong", { class: "desktop-category-word" }, current.answers[id]?.[category] || "—"),
        score,
      );
      if (dispute) entry.append(el("span", { class: "desktop-category-votes" },
        `${item.votes.length}/${current.participants.length} votos`));
      score.onclick = () => {
        if (!canVote) return;
        desktopBoard.querySelectorAll(".vote-tray").forEach((node) => node.remove());
        const tray = el("div", { class: "vote-tray", role: "group", "aria-label": "Alterar pontuação" },
          [0, 5, 10].map((points) => button(String(points), (event) => task(event.currentTarget, async () => {
            tray.remove();
            if (!dispute && points === suggested) return;
            await vote(item.key, points, item.epoch, category);
          }), scoreColor(points))));
        entry.append(tray);
      };
      panel.append(entry);
    });
    return panel;
  }

  function sizeDesktopBoard() {
    desktopBoard.style.gridTemplateColumns = `repeat(${room.categories.length}, minmax(220px, 1fr))`;
  }

  function draw(next) {
    room = next;
    if (viewing > next.review.category) viewing = next.review.category;
    const active = viewing === next.review.category;
    const category = next.review.category;
    const keys = next.participants.map((id) => `${id}:${category}`);
    const disputes = keys.filter((key) => isDisputed(next, key));
    const outstanding = disputes.filter((key) => !resolved(next, key));
    const acknowledged = Object.values(next.review.done || {}).filter(Boolean).length;
    const total = next.participants.length;
    title.textContent = `${viewing + 1}. ${next.categories[viewing]} · ${next.letter}`;
    progress.textContent = `${disputes.length ? `${disputes.length} palavra(s) contestada(s)` : "Sugestões automáticas"} · ${outstanding.length} pendente(s) · ${acknowledged}/${total} confirmaram esta categoria`;
    tabs.replaceChildren(
      ...next.categories.map((name, index) => button(`${index + 1}. ${name}`, () => {
        viewing = index;
        draw(room);
      }, index === viewing ? "active" : "", { disabled: index > next.review.category })),
      button("Fim", () => {
        dialog("Etapa final", "A revisão termina automaticamente quando todos confirmam a última categoria.");
      }, "", { disabled: next.review.category < next.categories.length - 1 }),
    );
    table.replaceChildren(buildTable(next, viewing));
    desktopBoard.replaceChildren(...next.categories.map((_, index) => desktopCategory(next, index)));
    queueMicrotask(sizeDesktopBoard);
    actions.replaceChildren();
    if (!active) {
      actions.append(button("Categoria atual", () => {
        viewing = category;
        draw(room);
      }, "secondary"));
    } else if (next.review.done?.[uid]) {
      actions.append(button("Rever esta categoria", (event) =>
        task(event.currentTarget, () => mutate("unlock")), "ghost"));
    } else {
      if (outstanding.length === 0) actions.append(button(
        "Concordar e avançar",
        (event) => task(event.currentTarget, async () => {
          await mutate("complete", {}, {
            applied: (r) => r.status === "results" || !!r.review.done?.[uid] || r.review.category > category,
          });
          if (ctx.state.room?.status === "review" && ctx.state.room.review.category === category)
            await showWaiting();
        }),
        "primary",
      ));
      if (next.host === uid && outstanding.length) {
        actions.append(button("Decidir pela maioria", (event) => task(event.currentTarget, async () => {
          if (!await confirm("Decidir pela maioria?", "A pontuação de cada palavra contestada seguirá a maioria dos votos. Em empate, seu voto desempata.")) return;
          try {
            await mutate("force", { mode: "majority" });
            missingHostVote = false;
          } catch (error) {
            if (error.code === "HOST_VOTE_MISSING") missingHostVote = true;
            draw(room);
            throw error;
          }
        }), "secondary"));
        actions.append(button("Decidir valor final", (event) => task(event.currentTarget, async () => {
          if (!await confirm("Decisão final do líder", "Seu voto valerá como decisão nas palavras contestadas. Defina seu voto em cada palavra antes de continuar.")) return;
          try {
            await mutate("force", { mode: "leader" });
            missingHostVote = false;
          } catch (error) {
            if (error.code === "HOST_VOTE_MISSING") missingHostVote = true;
            draw(room);
            throw error;
          }
        }), "ghost"));
      }
    }
    if (missingHostVote && outstanding.length)
      actions.append(el("p", { class: "review-warning" }, "Escolha seu voto nas palavras contestadas antes de desempatar."));
    if (waitingDialog && (!next.review.done?.[uid] || next.status !== "review")) {
      document.querySelector("#dialog")?.close();
      waitingDialog = false;
    }
  }

  async function showWaiting() {
    if (waitingDialog) return;
    waitingDialog = true;
    const undo = await dialog("Categoria confirmada", "Aguardando os outros confirmarem. A próxima categoria abrirá automaticamente.", [
      { label: "Aguardar", value: false },
      { label: "Rever esta categoria", value: true, variant: "ghost" },
    ]);
    waitingDialog = false;
    if (undo && ctx.state.room?.status === "review")
      await task(null, () => mutate("unlock"));
  }

  window.addEventListener("resize", sizeDesktopBoard);
  draw(initial);
  return {
    node: el("section", { class: "narrow review-screen" },
      heading("VOTAÇÃO ONLINE", "Revisão da rodada", "As sugestões valem por padrão. Toque nos pontos apenas para contestar."),
      tabs, title, progress, table, desktopBoard, actions),
    update(next) {
      if (room.review.category !== next.review.category) viewing = next.review.category;
      draw(next);
    },
    cleanup() {
      if (waitingDialog) document.querySelector("#dialog")?.close();
      window.removeEventListener("resize", sizeDesktopBoard);
    },
  };
}
