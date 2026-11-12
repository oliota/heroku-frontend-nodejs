import { el, button, heading, task } from "./dom.js";
import { Wheel, colors } from "./wheel.js";

export function letterSelection(ctx, room, local = false) {
  const spinner = () => room.spinner_uid || room.host;
  const allowed = () => local || spinner() === ctx.auth.user?.uid;
  const letters = Array.from(room.letters).filter((letter) => !room.used.includes(letter));
  const selected = el("span", { class: "selected-letter" }, allowed() ? room.selected_letter || "?" : "?");
  const caption = el("p", { class: "note spinner-caption" });
  const transfer = el("div", { class: "spinner-transfer" });
  let selection = allowed() ? room.selected_letter : "";
  let animationFrame = 0;
  const paintSelection = () =>
    selected.style.setProperty("--selected", colors[Math.max(0, letters.indexOf(selection)) % colors.length]);
  paintSelection();
  const choose = async (item, index) => {
    if (!allowed()) return;
    await task(null, async () => {
      if (local) {
        room.selected_letter = item.label;
        ctx.saveLocal();
      } else {
        await ctx.client.mutate("letters/select", { letter: item.label }, {
          round: true,
          valid: (r) => r.status === "letter_selection" && (r.spinner_uid || r.host) === ctx.auth.user.uid,
          applied: (r) => r.selected_letter === item.label,
        });
      }
      selection = local ? room.selected_letter : ctx.state.room.selected_letter;
      selected.textContent = selection;
      selected.style.setProperty("--selected", colors[index % colors.length]);
      confirm.disabled = !selection;
    });
  };
  const wheel = new Wheel(
    letters.map((label, i) => ({ label, color: colors[i % colors.length] })),
    {
      disabled: !allowed(),
      golden: ctx.isGolden(),
      center: "?",
      onSelect: choose,
      onHold: () => {
        if (!allowed() || !letters.length) return;
        const random = new Uint32Array(1);
        crypto.getRandomValues(random);
        wheel.choose(random[0] % letters.length);
      },
    },
  );
  const confirm = button("Confirmar letra", (event) =>
    task(event.currentTarget, async () => {
      const letter = selection;
      if (local) return ctx.confirmLocalLetter(letter);
      await ctx.client.mutate("letters/confirm", { letter }, {
        round: true,
        valid: (r) => r.status === "letter_selection" && (r.spinner_uid || r.host) === ctx.auth.user.uid && r.selected_letter === letter,
        applied: (r) => r.status === "playing" && r.letter === letter,
      });
    }), "primary", { disabled: !allowed() || !selection });

  function refresh(next) {
    room = next;
    const isSpinner = allowed();
    wheel.disabled = !isSpinner;
    wheel.labels.forEach((label) => { label.disabled = !isSpinner; });
    wheel.hub.disabled = !isSpinner;
    selection = isSpinner ? next.selected_letter : "";
    selected.textContent = selection || "?";
    confirm.disabled = !isSpinner || !selection;
    paintSelection();
    caption.textContent = local ? "Escolha a letra." : isSpinner
      ? "Você decide a letra. Pode girar ou passar a vez abaixo."
      : `${next.players[spinner()]?.name?.split("@")[0] || "Outro jogador"} está girando a roleta…`;
    transfer.replaceChildren();
    if (!local && isSpinner && next.participants.length > 1) {
      transfer.append(el("strong", {}, "Quem vai girar?"));
      const grid = el("div", { class: "spinner-transfer-grid" });
      next.participants.forEach((id) => grid.append(button(
        id === ctx.auth.user.uid ? "Eu giro" : next.players[id]?.name?.split("@")[0] || "Jogador",
        (event) => task(event.currentTarget, () => ctx.client.mutate("spinner", { spinner_uid: id }, {
          round: true,
          valid: (r) => r.status === "letter_selection" && (r.spinner_uid || r.host) === ctx.auth.user.uid,
          applied: (r) => r.spinner_uid === id,
        })),
        id === ctx.auth.user.uid ? "secondary" : "ghost",
        { disabled: id === ctx.auth.user.uid },
      )));
      transfer.append(grid);
    }
  }

  const animate = () => {
    if (wheel.destroyed) return;
    if (!allowed() && !local && room.status === "letter_selection") {
      wheel.angle = (wheel.angle + (matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.1 : 0.65)) % 360;
      wheel.draw();
    }
    animationFrame = requestAnimationFrame(animate);
  };
  refresh(room);
  animationFrame = requestAnimationFrame(animate);
  return {
    node: el("section", { class: "narrow" },
      heading(`RODADA ${room.round} DE ${room.rounds}`, "Qual vai ser a letra?", "A letra só será revelada quando quem gira confirmar."),
      el("div", { class: "history", "aria-label": "Letras já jogadas" },
        room.used.length ? room.used.map((letter) => el("span", {}, letter)) : "Nenhuma letra jogada ainda"),
      letters.length ? wheel.node : el("p", { class: "notice" }, "Todas as letras foram jogadas."),
      caption,
      el("div", { class: "letter-confirm" }, selected, confirm),
      transfer,
    ),
    cleanup() { cancelAnimationFrame(animationFrame); wheel.destroy(); },
    update: refresh,
  };
}
