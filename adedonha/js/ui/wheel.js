import { el } from "./dom.js";
export const colors = [
  "#FF6B6B",
  "#FFC93C",
  "#2EC4B6",
  "#6C5CE7",
  "#FF7EB6",
  "#4D96FF",
];
export const shortestAngle = (from, to) =>
  ((((to - from + 180) % 360) + 360) % 360) - 180;
export class Wheel {
  constructor(
    items,
    {
      onSelect,
      onHold,
      menu = false,
      golden = false,
      disabled = false,
      center = "GO",
    } = {},
  ) {
    this.items = items;
    this.onSelect = onSelect;
    this.onHold = onHold;
    this.menu = menu;
    this.disabled = disabled;
    this.angle = 0;
    this.velocity = 0;
    this.frame = 0;
    this.busy = false;
    this.destroyed = false;
    this.node = el("div", {
      class: `wheel-wrap ${golden ? "golden" : ""} ${menu ? "menu-wheel" : "letter-wheel"}`,
      role: "group",
      "aria-label": menu ? "Roda do menu" : "Roda de letras",
    });
    this.disc = el("div", { class: "wheel-disc" });
    this.labels = [];
    const step = 360 / items.length;
    this.disc.style.background = `conic-gradient(from -${step / 2}deg, ${items.map((item, i) => `${item.color || colors[i % colors.length]} ${i * step}deg ${(i + 1) * step}deg`).join(",")})`;
    items.forEach((item, i) => {
      const a = (i * step * Math.PI) / 180;
      const label = el(
        "button",
        {
          type: "button",
          class: "wheel-label",
          "aria-label": item.label,
          disabled,
          onClick: (event) => {
            if (event.detail === 0) this.choose(i);
          },
        },
        item.icon &&
          el(
            "span",
            { class: "wheel-symbol", "aria-hidden": "true" },
            item.icon,
          ),
        el("span", {}, item.label),
      );
      label.style.left = `${50 + Math.sin(a) * (menu ? 33 : 40)}%`;
      label.style.top = `${50 - Math.cos(a) * (menu ? 33 : 40)}%`;
      this.labels.push(label);
      label.style.color =
        (item.color || colors[i % colors.length]).toUpperCase() === "#6C5CE7"
          ? "#ffffff"
          : "#2D2A4A";
      this.disc.append(label);
    });
    this.hub = el(
      "button",
      {
        type: "button",
        class: "wheel-hub",
        "aria-label": onHold
          ? "Mantenha pressionado por 3 segundos para sortear"
          : "Roda do menu",
        disabled: disabled || !onHold,
        onClick: (event) => {
          if (event.detail === 0 && onHold) onHold();
        },
      },
      center,
    );
    this.node.append(
      el("div", { class: "wheel-pointer", "aria-hidden": "true" }),
      el("div", { class: "wheel-clip" }, this.disc),
      this.hub,
    );
    this.node.addEventListener("pointerdown", (e) => this.down(e));
    this.node.addEventListener("pointermove", (e) => this.move(e));
    this.node.addEventListener("pointerup", (e) => this.up(e));
    this.node.addEventListener("pointercancel", () => this.cancel());
  }
  pointer(event) {
    const r = this.node.getBoundingClientRect();
    return (
      (Math.atan2(
        event.clientY - r.top - r.height / 2,
        event.clientX - r.left - r.width / 2,
      ) *
        180) /
      Math.PI
    );
  }
  draw() {
    this.disc.style.transform = `rotate(${this.angle}deg)`;
    this.labels.forEach((label) => {
      label.style.transform = `translate(-50%, -50%) rotate(${-this.angle}deg)`;
    });
  }
  down(e) {
    if (this.disabled || this.busy || e.button !== 0) return;
    cancelAnimationFrame(this.frame);
    this.disc.style.transition = "";
    this.labels.forEach((label) => (label.style.transition = ""));
    this.press = {
      x: e.clientX,
      y: e.clientY,
      a: this.pointer(e),
      time: performance.now(),
      moved: false,
      held: false,
      hub: e.target.closest(".wheel-hub") !== null,
      index: this.labels.indexOf(e.target.closest(".wheel-label")),
    };
    this.velocity = 0;
    this.node.setPointerCapture(e.pointerId);
    this.holdTimer = setTimeout(() => {
      if (!this.press || this.press.moved) return;
      this.press.held = true;
      if (this.press.hub) this.onHold?.();
      else if (this.press.index >= 0) this.choose(this.press.index);
    }, 3000);
  }
  move(e) {
    if (!this.press) return;
    if (
      Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < 10 &&
      !this.press.moved
    )
      return;
    clearTimeout(this.holdTimer);
    this.press.moved = true;
    const now = performance.now(),
      angle = this.pointer(e),
      delta = shortestAngle(this.press.a, angle);
    this.velocity = (delta / Math.max(8, now - this.press.time)) * 16;
    this.angle += delta;
    this.press.a = angle;
    this.press.time = now;
    this.draw();
  }
  up(e) {
    if (!this.press) return;
    clearTimeout(this.holdTimer);
    const press = this.press;
    this.press = null;
    if (press.held || this.busy) return;
    if (!press.moved) {
      if (press.hub) return;
      const index =
        press.index >= 0
          ? press.index
          : Math.round(
              ((((this.pointer(e) + 90 - this.angle) % 360) + 360) % 360) /
                (360 / this.items.length),
            ) % this.items.length;
      this.choose(index);
      return;
    }
    const coast = () => {
      if (this.destroyed) return;
      this.velocity *= 0.95;
      this.angle += this.velocity;
      this.draw();
      if (Math.abs(this.velocity) > 0.12)
        this.frame = requestAnimationFrame(coast);
      else if (!this.menu && !this.disabled)
        this.choose(
          Math.round(
            (((-this.angle % 360) + 360) % 360) / (360 / this.items.length),
          ) % this.items.length,
        );
    };
    this.frame = requestAnimationFrame(coast);
  }
  choose(index) {
    if (this.busy || this.disabled || this.destroyed) return;
    this.busy = true;
    cancelAnimationFrame(this.frame);
    this.angle += shortestAngle(this.angle, (-index * 360) / this.items.length);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.disc.style.transition = reduced
      ? "none"
      : "transform 380ms cubic-bezier(.22,1,.36,1)";
    this.labels.forEach(
      (label) =>
        (label.style.transition = reduced
          ? "none"
          : "transform 380ms cubic-bezier(.22,1,.36,1)"),
    );
    this.draw();
    this.selectionTimer = setTimeout(
      () => {
        this.busy = false;
        if (!this.destroyed) this.onSelect?.(this.items[index], index);
      },
      reduced ? 0 : 400,
    );
  }
  cancel() {
    clearTimeout(this.holdTimer);
    this.press = null;
  }
  destroy() {
    this.destroyed = true;
    this.cancel();
    clearTimeout(this.selectionTimer);
    cancelAnimationFrame(this.frame);
  }
}
