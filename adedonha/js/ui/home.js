import { el, button } from "./dom.js";
import { Wheel } from "./wheel.js";
export const menuItems = [
  { label: "Jogar local", icon: "✎", route: "local", color: "#FF6B6B" },
  { label: "Jogar online", icon: "⌘", route: "online", color: "#6C5CE7" },
  { label: "Configurar", icon: "⚙", route: "settings", color: "#FFB84C" },
  { label: "Histórico", icon: "◷", route: "history", color: "#4D96FF" },
  { label: "Como jogar", icon: "?", route: "rules", color: "#FF7EB6" },
  { label: "Roda Dourada", icon: "✧", route: "premium", color: "#2EC4B6" },
];
export function home(ctx) {
  const wheel = new Wheel(menuItems, {
    menu: true,
    golden:
      ctx.entitlements?.golden_wheel === true && !ctx.entitlements?.revoked,
    onSelect: (item) => ctx.go(item.route),
  });
  const node = el(
    "section",
    { class: "home" },
    el(
      "div",
      { class: "home-copy" },
      el(
        "div",
        { class: "pill" },
        el("span", { class: "dot" }),
        "O SEU PRÓXIMO STOP COMEÇA AQUI",
      ),
      el(
        "h1",
        {},
        "Uma letra.",
        el("br"),
        "Mil ideias.",
        el("br"),
        el("em", {}, "Valendo!"),
      ),
      el(
        "p",
        { class: "intro" },
        "Aquele jogo que todo mundo conhece, com uma nova volta. Gire a roda, encontre as palavras e reúna a turma.",
      ),
      el(
        "div",
        { class: "actions" },
        button("Vamos jogar  ↗", () => ctx.go("local"), "primary"),
        button("Entrar em sala", () => ctx.go("join"), "ghost"),
      ),
      el(
        "div",
        { class: "home-guide" },
        el("span", { class: "mini-letter" }, "A"),
        el(
          "div",
          {},
          el("strong", {}, "Pense rápido. Divirta-se muito."),
          "Jogue sozinho de graça ou desafie os amigos.",
        ),
      ),
    ),
    el(
      "div",
      { class: "wheel-stage" },
      el(
        "p",
        { class: "eyebrow stage-eyebrow" },
        "ESCOLHA A SUA PRÓXIMA JOGADA",
      ),
      wheel.node,
      el(
        "p",
        { class: "wheel-caption" },
        el("strong", {}, "Arraste para girar."),
        " Toque para escolher.",
      ),
      el(
        "button",
        { class: "gold-link", onClick: () => ctx.go("premium") },
        el("span", {}, "✦"),
        "Conheça a Roda Dourada",
        " ↗",
      ),
    ),
  );
  return { node, cleanup: () => wheel.destroy() };
}
