import { storage } from "./storage.js";
export function normalize(text, rules) {
  let output = "";
  for (const char of text.trim().toLowerCase())
    for (const c of rules.normalization.accents[char] ?? char) {
      if (" -\t".includes(c)) {
        if (output && !output.endsWith(" ")) output += " ";
      } else if (
        /\p{Nd}/u.test(c) ||
        c.toLowerCase() !== c.toUpperCase() ||
        c.codePointAt(0) >= 0x2e80
      )
        output += c;
    }
  return output.trim();
}
export function localScores(letter, answers, lang, rules) {
  return answers.map((answer) => {
    const value = normalize(answer, rules);
    return (
      rules.languages[lang].checks_initial
        ? Array.from(value).length >= 2 &&
          Array.from(value)[0] === normalize(letter, rules)
        : value.length > 0
    )
      ? rules.points.unique
      : rules.points.invalid;
  });
}
export const canonicalLocale = (value) =>
  value === "pt_PT" || value.toLowerCase() === "pt-pt"
    ? "pt_pt"
    : value === "pt_BR" || value.toLowerCase().startsWith("pt-br")
      ? "pt"
      : value.split("-")[0].toLowerCase();
export async function loadRules(api) {
  try {
    const [config, rules, locales] = await Promise.all(
      ["/config", "/rules", "/locales"].map((path) =>
        api.get(path, { public: true }),
      ),
    );
    if (
      !rules.schema_version ||
      !rules.languages ||
      !Array.isArray(locales.locales)
    )
      throw new Error("Invalid rules");
    const bundle = {
      config,
      rules,
      locales: locales.locales,
      fetchedAt: Date.now(),
    };
    storage.set("rules", bundle);
    return bundle;
  } catch (error) {
    const cached = storage.get("rules");
    if (
      cached?.rules?.schema_version === 1 &&
      cached.rules.languages &&
      cached.config &&
      Array.isArray(cached.locales) &&
      Date.now() - cached.fetchedAt < 86400000
    )
      return { ...cached, cached: true };
    throw error;
  }
}
export async function loadLocale(api, lang, bundle) {
  try {
    const [categories, letters] = await Promise.all([
      api.get(`/categories?locale=${encodeURIComponent(lang)}`, {
        public: true,
      }),
      api.get(`/letters?locale=${encodeURIComponent(lang)}`, { public: true }),
    ]);
    if (
      !Array.isArray(categories.categories) ||
      typeof letters.letters !== "string"
    )
      throw new Error("Invalid locale response");
    return { ...categories, ...letters };
  } catch (error) {
    if (!bundle.cached) throw error;
    const data = bundle.rules.languages[lang];
    if (!data) throw error;
    return { locale: lang, categories: data.default_categories, ...data };
  }
}
