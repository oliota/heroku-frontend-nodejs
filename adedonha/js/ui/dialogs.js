import { el, button } from "./dom.js";
export function dialog(
  title,
  content,
  actions = [{ label: "Entendi", value: true }],
) {
  const node = document.querySelector("#dialog");
  if (node.open) node.close();
  const previous = document.activeElement;
  return new Promise((resolve) => {
    let value = false;
    node.replaceChildren(
      el("h2", { id: "dialog-title" }, title),
      typeof content === "string" ? el("p", {}, content) : content,
      el(
        "div",
        { class: "dialog-actions" },
        actions.map((action) =>
          button(
            action.label,
            () => {
              value = action.value;
              node.close();
            },
            action.variant || "",
          ),
        ),
      ),
    );
    node.addEventListener(
      "close",
      () => {
        resolve(value);
        previous?.focus();
      },
      { once: true },
    );
    node.showModal();
  });
}
export const confirm = (title, text) =>
  dialog(title, text, [
    { label: "Cancelar", value: false, variant: "ghost" },
    { label: "Confirmar", value: true },
  ]);
