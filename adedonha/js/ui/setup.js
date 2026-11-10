import { el, button, heading, field, task, toast } from "./dom.js";
import { loadLocale } from "../rules.js";
import { storage } from "../storage.js";
export async function setup(ctx, mode = "settings") {
  const prefs = storage.get("preferences", {}),
    room = mode === "room-settings" ? ctx.state.room : null;
  let lang = room?.lang || prefs.lang || ctx.lang;
  let current = await loadLocale(ctx.api, lang, ctx.bundle);
  let selected = new Set(
    room?.categories ||
      (prefs.lang === lang && prefs.categories) ||
      current.categories,
  );
  const rules = ctx.bundle.rules;
  const language = el(
    "select",
    { "aria-label": "Idioma" },
    ctx.bundle.locales.map((locale) =>
      el(
        "option",
        { value: locale, ...(locale === lang ? { selected: "" } : {}) },
        new Intl.DisplayNames(["pt"], { type: "language" }).of(
          locale.replace("_", "-"),
        ) || locale,
      ),
    ),
  );
  const rounds = el(
    "select",
    {},
    rules.round_options.map((value) =>
      el(
        "option",
        {
          value,
          ...(value === (room?.rounds || prefs.rounds || 5)
            ? { selected: "" }
            : {}),
        },
        value,
      ),
    ),
  );
  const timer = el(
    "select",
    {},
    rules.timer_options.map((value) =>
      el(
        "option",
        {
          value,
          ...(value === (room?.timer ?? prefs.timer ?? 90)
            ? { selected: "" }
            : {}),
        },
        value ? `${value} segundos` : "Sem cronômetro",
      ),
    ),
  );
  const categories = el("div", { class: "check-list" }),
    count = el("p", { class: "note" });
  const letters = el("input", {
    value:
      room?.letters ||
      (prefs.lang === lang && prefs.letters) ||
      current.letters,
    required: "",
    "aria-label": "Letras disponíveis",
  });
  function showCategories() {
    const options = [
      ...new Set([
        ...current.categories,
        ...(current.suggested_categories || []),
        ...selected,
      ]),
    ];
    categories.replaceChildren(
      ...options.map((value) => {
        const input = el("input", {
          type: "checkbox",
          checked: selected.has(value),
          onChange: () => {
            input.checked ? selected.add(value) : selected.delete(value);
            count.textContent = `${selected.size} categorias · escolha de ${rules.categories.min} a ${rules.categories.max}`;
          },
        });
        return el("label", { class: "check-item" }, input, value);
      }),
    );
    count.textContent = `${selected.size} categorias · escolha de ${rules.categories.min} a ${rules.categories.max}`;
  }
  showCategories();
  let localeRequest = 0;
  language.addEventListener("change", async () => {
    const request = ++localeRequest;
    start.disabled = true;
    await task(null, async () => {
      const next = await loadLocale(ctx.api, language.value, ctx.bundle);
      if (request !== localeRequest) return;
      current = next;
      lang = next.locale;
      selected = new Set(next.categories);
      letters.value = next.letters;
      showCategories();
      start.disabled = false;
    });
  });
  const custom = el("input", {
    maxlength: rules.categories.max_length,
    placeholder: "Sua categoria",
    "aria-label": "Nova categoria",
  });
  const customAdd = button(
    "Adicionar",
    () => {
      const value = custom.value.trim().toUpperCase();
      if (
        !value ||
        Array.from(value).length > rules.categories.max_length ||
        selected.size >= rules.categories.max
      )
        return toast("Confira o nome e o limite de categorias.", true);
      selected.add(value);
      custom.value = "";
      showCategories();
    },
    "ghost small",
  );
  const start = button(
    mode === "online"
      ? "Criar sala online  ↗"
      : mode === "local"
        ? "Escolher a letra  ↗"
        : "Salvar configurações",
    (event) =>
      task(event.currentTarget, async () => {
        if (
          selected.size < rules.categories.min ||
          selected.size > rules.categories.max
        )
          throw new Error(
            `Selecione entre ${rules.categories.min} e ${rules.categories.max} categorias.`,
          );
        const chosenLetters = letters.value.trim().toUpperCase();
        if (
          !chosenLetters ||
          new Set(chosenLetters).size !== Array.from(chosenLetters).length ||
          !Array.from(chosenLetters).every((c) => current.alphabet.includes(c))
        )
          throw new Error("Escolha letras únicas do alfabeto deste idioma.");
        const settings = {
          lang,
          categories: [...selected],
          letters: chosenLetters,
          rounds: Number(rounds.value),
          timer: Number(timer.value),
        };
        if (mode === "online") return ctx.createRoom(settings);
        if (mode === "room-settings") {
          await ctx.client.mutate(
            "settings",
            { settings },
            {
              method: "PATCH",
              valid: (r) =>
                r.status === "lobby" && r.host === ctx.auth.user.uid,
            },
          );
          return ctx.go("room");
        }
        storage.set("preferences", settings);
        ctx.lang = lang;
        if (mode === "local") ctx.startLocal(settings);
        else {
          toast("Configurações salvas.");
          ctx.go("home");
        }
      }),
    "primary",
  );
  return {
    node: el(
      "section",
      { class: "narrow" },
      heading(
        mode === "online" ? "REÚNA A TURMA" : "DO SEU JEITO",
        mode === "local"
          ? "Vamos de STOP?"
          : mode === "online"
            ? "Sua sala, suas regras."
            : "Configurações",
        "Escolha o idioma das palavras, as categorias e o ritmo da partida.",
      ),
      el(
        "div",
        { class: "panel stack" },
        el(
          "div",
          { class: "two-column" },
          field("Idioma das palavras", language),
          field("Rodadas", rounds),
        ),
        field("Tempo por rodada", timer),
        el("div", {}, el("h2", {}, "Categorias"), count, categories),
        el("div", { class: "inline-list" }, custom, customAdd),
        field("Letras da roda", letters),
        el("p", { class: "note" }, `Alfabeto: ${current.alphabet}`),
        start,
      ),
    ),
  };
}
