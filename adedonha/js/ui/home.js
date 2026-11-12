import { el } from "./dom.js";
import { Wheel } from "./wheel.js";

export const menuItems = [
  { label: "Jogar local", icon: "✎", route: "local", color: "#FF6B6B" },
  { label: "Jogar online", icon: "⌘", route: "online", color: "#6C5CE7" },
  { label: "Configurar", icon: "⚙", route: "settings", color: "#FFB84C" },
  { label: "Como jogar", icon: "?", route: "rules", color: "#FF7EB6" },
  { label: "Histórico", icon: "◷", route: "history", color: "#4D96FF", authenticated: true },
  { label: "Roda Dourada", icon: "✧", route: "premium", color: "#2EC4B6", authenticated: true },
];

export function home(ctx) {
  const signedIn = !!ctx.auth?.user?.uid;
  const items = menuItems.filter((item) => signedIn || !item.authenticated);
  const wheel = new Wheel(items, {
    menu: true,
    golden: ctx.entitlements?.golden_wheel === true && !ctx.entitlements?.revoked,
    onSelect: (item) => ctx.go(item.route),
  });
  const node = el(
    "section",
    { class: "home home-focused" },
    el("div", { class: "home-main" },
      el("h1", {}, "Adedonha", el("span", {}, " · STOP")),
      el("p", { class: "home-lead" }, "Escolha como quer jogar."),
      el("div", { class: "wheel-stage" }, wheel.node),
      el("p", { class: "wheel-caption" }, "Toque numa opção da roda para começar."),
    ),
  );
  return { node, cleanup: () => wheel.destroy() };
}
