import { el, button, heading, task } from "./dom.js";
import { Wheel, colors } from "./wheel.js";
export function letterSelection(ctx, room, local = false) {
  const allowed = local || room.host === ctx.auth.user?.uid;
  const letters = Array.from(room.letters).filter(
    (letter) => !room.used.includes(letter),
  );
  const selected = el(
    "span",
    { class: "selected-letter" },
    room.selected_letter || "?",
  );
  let selection = room.selected_letter;
  const paintSelection = () =>
    selected.style.setProperty(
      "--selected",
      colors[Math.max(0, letters.indexOf(selection)) % colors.length],
    );
  paintSelection();
  const choose = async (item, index) => {
    if (!allowed) return;
    await task(null, async () => {
      if (local) {
        room.selected_letter = item.label;
        ctx.saveLocal();
      } else
        await ctx.client.mutate(
          "letters/select",
          { letter: item.label },
          {
            round: true,
            valid: (r) =>
              r.status === "letter_selection" && r.host === ctx.auth.user.uid,
            applied: (r) => r.selected_letter === item.label,
          },
        );
      selection = local ? room.selected_letter : ctx.state.room.selected_letter;
      selected.textContent = selection;
      selected.style.setProperty("--selected", colors[index % colors.length]);
      confirm.disabled = !selection;
    });
  };
  const wheel = new Wheel(
    letters.map((label, i) => ({ label, color: colors[i % colors.length] })),
    {
      disabled: !allowed,
      golden: ctx.isGolden(),
      center: "?",
      onSelect: choose,
      onHold: allowed
        ? () => {
            const random = new Uint32Array(1);
            crypto.getRandomValues(random);
            wheel.choose(random[0] % letters.length);
          }
        : null,
    },
  );
  const confirm = button(
    "Confirmar letra",
    (event) =>
      task(event.currentTarget, async () => {
        const confirmedLetter = selection;
        if (local) ctx.confirmLocalLetter(confirmedLetter);
        else
          await ctx.client.mutate(
            "letters/confirm",
            { letter: confirmedLetter },
            {
              round: true,
              valid: (r) =>
                r.status === "letter_selection" &&
                r.selected_letter === confirmedLetter,
              applied: (r) =>
                r.status === "playing" && r.letter === confirmedLetter,
            },
          );
      }),
    "primary",
    { disabled: !allowed || !selection },
  );
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        `RODADA ${room.round} DE ${room.rounds}`,
        "Qual vai ser a letra?",
        allowed
          ? "Toque para escolher ou segure o centro por 3 segundos para sortear. Confirme para começar."
          : "O líder está escolhendo a letra desta rodada.",
      ),
      el(
        "div",
        { class: "history", "aria-label": "Letras já jogadas" },
        room.used.length
          ? room.used.map((letter) => el("span", {}, letter))
          : "Nenhuma letra jogada ainda",
      ),
      letters.length
        ? wheel.node
        : el("p", { class: "notice" }, "Todas as letras foram jogadas."),
      el("div", { class: "letter-confirm" }, selected, confirm),
    ),
    cleanup: () => wheel.destroy(),
    update(next) {
      selection = next.selected_letter;
      paintSelection();
      selected.textContent = selection || "?";
      confirm.disabled = !allowed || !selection;
    },
  };
}
