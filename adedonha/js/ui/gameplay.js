import { el, button, heading, task } from "./dom.js";
export function gameplay(ctx, room, local = false) {
  const clock = el("span", { class: "clock", "aria-label": "Tempo restante" }),
    status = el("span", { class: "save-state", role: "status" });
  const drafts = local ? null : ctx.drafts;
  const inputs = room.categories.map((category, index) => {
    const input = el("input", {
      type: "text",
      maxlength: ctx.bundle.rules.answer_max_length,
      autocomplete: "off",
      autocapitalize: "words",
      enterkeyhint: index === room.categories.length - 1 ? "done" : "next",
      value: local ? room.answers[index] || "" : drafts.answers[index] || "",
      disabled: !local && (!drafts.ready || drafts.final),
      "data-answer": index,
      onInput: () => {
        input.value = Array.from(input.value)
          .slice(0, ctx.bundle.rules.answer_max_length)
          .join("");
        if (local) {
          room.answers[index] = input.value;
          ctx.saveLocal();
          status.textContent = "Salvo neste navegador";
        } else drafts.edit(index, input.value);
      },
      onKeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          inputs[index + 1]?.focus();
        }
      },
      onBlur: () => { if (!local) drafts.flush().catch(drafts.onError); },
      onFocus: () =>
        setTimeout(
          () =>
            input.isConnected &&
            input.scrollIntoView({ block: "nearest", behavior: "smooth" }),
          250,
        ),
    });
    return input;
  });
  const stop = button(
    "STOP!",
    (event) =>
      task(event.currentTarget, async () => {
        if (local) return ctx.stopLocal();
        await drafts.stopNow();
      }),
    "stop-button",
  );

  const retry = button(
    "Tentar salvar novamente",
    (event) => task(event.currentTarget, () => drafts.flush()),
    "ghost small",
    { hidden: local },
  );
  const grace = el("p", { class: "notice", hidden: true });
  const grid = el("div", { class: "answers-grid" },
    room.categories.map((category, i) => el("article", { class: "answer-card" },
      el("header", { class: "answer-card-header" }, `${String(i + 1).padStart(2, "0")} / ${category}`),
      el("div", { class: "answer-card-body" }, inputs[i]),
      el("footer", { class: "answer-card-footer" }, "Uma palavra por categoria"))));
  const resizeGrid = () => {
    const width = grid.clientWidth || window.innerWidth - 48;
    const columns = Math.min(12, room.categories.length, Math.max(1, Math.floor(width / 210)));
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  };
  const gridObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeGrid) : null;
  gridObserver?.observe(grid);
  window.addEventListener("resize", resizeGrid);
  let last = room;
  let destroyed = false;
  function tick() {
    const seconds = last.deadline
      ? Math.max(0, Math.ceil((last.deadline - Date.now()) / 1000))
      : null;
    clock.textContent = seconds === null
      ? "∞"
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (local && last.deadline && Date.now() >= last.deadline && last.status === "playing")
      ctx.stopLocal();
    if (!local && last.stop_at) {
      grace.hidden = false;
      grace.textContent = "STOP! Rodada encerrada. Conferindo os rascunhos já salvos.";
      inputs.forEach((input) => { input.disabled = true; });
    }
  }
  function update(next) {
    last = next;
    stop.disabled = !!next.stop_at || (!local && !drafts.ready);
    if (!local) {
      retry.hidden = drafts.final || (drafts.savedRevision === drafts.revision && !drafts.pendingSubmission);
      status.textContent = drafts.final
        ? "Respostas finais recebidas"
        : status.textContent || "Sincronizado";
      inputs.forEach(
        (input) => (input.disabled = !!next.stop_at || !drafts.ready || drafts.final),
      );
    }
    tick();
  }
  update(room);
  queueMicrotask(resizeGrid);
  const timer = setInterval(tick, 250);
  return {
    node: el(
      "section",
      { class: "gameplay-screen" },
      heading(
        local ? "MODO LOCAL" : `SALA ${room.code}`,
        `Rodada ${room.round} de ${room.rounds}`,
        "Uma palavra por categoria. Quem termina primeiro pede STOP!",
      ),
      el(
        "div",
        { class: "game-header" },
        el(
          "div",
          {},
          el("small", {}, "LETRA DA VEZ"),
          el("span", { class: "game-letter" }, room.letter),
        ),
        clock,
        stop,
      ),
      grace,
      grid,
      el("footer", { class: "gameplay-footer" }, status, retry,
        !local && el("span", { class: "note" }, "Microfone indisponível")),

    ),
    cleanup: () => {
      destroyed = true;
      clearInterval(timer);
      gridObserver?.disconnect();
      window.removeEventListener("resize", resizeGrid);
    },
    update,
    status,
  };
}
