import { el, button, heading, field, task } from "./dom.js";
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
        await drafts.flush();
        await ctx.client.mutate(
          "stop",
          {},
          {
            round: true,
            valid: (r) => r.status === "playing",
            applied: (r) => !!r.stop_at || r.status === "review",
          },
        );
      }),
    "stop-button",
  );
  const final = button(
    "Enviar respostas finais",
    (event) =>
      task(event.currentTarget, async () => {
        inputs.forEach((input) => (input.disabled = true));
        try {
          await drafts.flush(true);
        } finally {
          update(ctx.state.room);
        }
      }),
    "secondary",
    { hidden: true },
  );
  const retry = button(
    "Tentar salvar novamente",
    (event) => task(event.currentTarget, () => drafts.flush()),
    "ghost small",
    { hidden: local },
  );
  const grace = el("p", { class: "notice", hidden: true });
  let last = room;
  function tick() {
    const now = Date.now(),
      deadline = last.stop_at
        ? last.stop_at + ctx.bundle.rules.online.submit_grace_ms
        : last.deadline;
    const seconds = deadline
      ? Math.max(0, Math.ceil((deadline - now) / 1000))
      : null;
    clock.textContent =
      seconds === null
        ? "∞"
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (local && deadline && now >= deadline && last.status === "playing")
      ctx.stopLocal();
    if (!local && last.stop_at) {
      grace.hidden = false;
      grace.textContent = `STOP! Envie suas respostas finais. Janela restante: ${seconds}s.`;
      inputs.forEach(
        (input) =>
          (input.disabled = drafts.final || seconds === 0 || !drafts.ready),
      );
      final.disabled = drafts.final || seconds === 0 || !drafts.ready;
    }
  }
  function update(next) {
    last = next;
    stop.disabled = !!next.stop_at || (!local && !drafts.ready);
    final.hidden = local || !next.stop_at;
    if (!local) {
      status.textContent = drafts.final
        ? "Respostas finais recebidas"
        : status.textContent || "Sincronizado";
      inputs.forEach(
        (input) => (input.disabled = !drafts.ready || drafts.final),
      );
    }
    tick();
  }
  update(room);
  const timer = setInterval(tick, 250);
  return {
    node: el(
      "section",
      { class: "narrow" },
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
      el(
        "div",
        { class: "answers-grid" },
        room.categories.map((category, i) =>
          field(`${String(i + 1).padStart(2, "0")} / ${category}`, inputs[i]),
        ),
      ),
      el("div", { class: "actions" }, status, retry, final),
      !local &&
        el(
          "p",
          { class: "note" },
          "Microfone indisponível: ainda não existe transmissão de voz integrada.",
        ),
    ),
    cleanup: () => clearInterval(timer),
    update,
    status,
  };
}
