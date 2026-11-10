import { el, button, heading, task } from "./dom.js";
import { Wheel } from "./wheel.js";
import { menuItems } from "./home.js";
export async function premium(ctx) {
  let status = null;
  if (ctx.auth.user) status = await ctx.api.get("/premium/status");
  const owned = status?.golden_wheel === true && !status.revoked;
  const wheel = new Wheel(menuItems, {
    menu: true,
    golden: true,
    disabled: true,
    center: "✦",
  });
  return {
    node: el(
      "section",
      {},
      heading(
        "UM TOQUE DE OURO",
        "A sua roda, dourada.",
        "Uma compra permanente no aplicativo. Reconhecida aqui pela mesma conta Google.",
      ),
      el(
        "div",
        { class: "two-column" },
        el(
          "div",
          { class: "gold-preview" },
          wheel.node,
          el(
            "p",
            { class: "wheel-caption", style: "text-align:center" },
            "Prévia da personalização · não concede benefícios",
          ),
        ),
        el(
          "div",
          { class: "panel gold-info stack" },
          el(
            "h2",
            {},
            owned
              ? "✦ Sua Roda Dourada está ativa"
              : "Um clássico com um brilho a mais.",
          ),
          el(
            "p",
            {},
            "Borda e divisórias douradas, acesso online sem bilhete e benefício compartilhado para convidados das salas que você criar.",
          ),
          el(
            "p",
            { class: "note" },
            "O benefício compartilhado da sala permanece até a partida terminar, mesmo quando o criador sai. Isso não transfere a compra aos convidados.",
          ),
          el(
            "div",
            { class: "notice" },
            "Ainda não há checkout web. A aquisição e a restauração da compra são feitas no aplicativo nativo com verificação da loja. Nenhum pagamento é processado nesta página.",
          ),
          ctx.auth.user
            ? button(
                "Atualizar licença da conta",
                (event) =>
                  task(event.currentTarget, async () => {
                    ctx.entitlements = await ctx.api.get("/me/entitlements");
                    ctx.render();
                  }),
                "gold",
              )
            : button(
                "Entrar com Google",
                () => task(null, () => ctx.auth.login()),
                "gold",
              ),
        ),
      ),
    ),
    cleanup: () => wheel.destroy(),
  };
}
