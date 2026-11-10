export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on") && typeof value === "function")
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "disabled" || key === "hidden" || key === "checked")
      node[key] = value;
    else if (value !== undefined && value !== null)
      node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined && child !== false)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
export const button = (text, onClick, variant = "", attrs = {}) =>
  el(
    "button",
    { type: "button", class: `button ${variant}`, onClick, ...attrs },
    text,
  );
export const heading = (eyebrow, title, description) =>
  el(
    "div",
    { class: "page-heading" },
    el("p", { class: "eyebrow" }, eyebrow),
    el("h1", {}, title),
    description && el("p", { class: "muted" }, description),
  );
export const field = (label, input) => {
  if (!input.hasAttribute("aria-label"))
    input.setAttribute("aria-label", label);
  return el("label", { class: "field" }, el("span", {}, label), input);
};
export function toast(message, error = false) {
  const area = document.querySelector("#notifications");
  const notice = el(
    "div",
    {
      class: `toast ${error ? "error" : ""}`,
      role: error ? "alert" : "status",
    },
    message,
  );
  area.replaceChildren(notice);
  setTimeout(() => notice.remove(), 7500);
}
const messages = {
  AUTH_REQUIRED: "Entre com Google para jogar online.",
  INVALID_TOKEN: "Sua sessão expirou. Entre novamente com Google.",
  BACKEND_UNAVAILABLE:
    "O backend online está indisponível ou ainda sem credenciais Firebase.",
  FIREBASE_UNAVAILABLE:
    "Firebase indisponível. O modo local continua disponível.",
  STALE_VERSION: "A sala mudou. Atualizamos o estado; tente novamente.",
  STALE_ROUND: "A rodada mudou. A ação anterior foi descartada.",
  ROOM_NOT_FOUND: "Sala não encontrada. Confira o código.",
  INVALID_STATE: "Esta ação não está disponível no estado atual da sala.",
  ROOM_MIGRATION_REQUIRED:
    "Esta sala usa o protocolo antigo do Godot. Crie uma nova sala pela API após a migração do aplicativo.",
  ROOM_FULL: "A sala está lotada.",
  NOT_ROOM_MEMBER: "Você ainda não entrou nesta sala.",
  HOST_REQUIRED: "Somente o líder atual pode executar esta ação.",
  ITEM_LOCKED: "Esta palavra já foi aprovada. Somente o líder pode reabri-la.",
  INVALID_VOTE: "A época do voto mudou. Confira a palavra e vote novamente.",
  HOST_VOTE_MISSING: "Falta o voto explícito do líder nas palavras destacadas.",
  REVIEW_PENDING: "Ainda há palavras ou confirmações pendentes.",
  ANSWERS_FINAL: "Suas respostas finais já foram recebidas.",
  ANSWERS_FROZEN:
    "O prazo de envio terminou. As respostas foram preservadas pelo servidor.",
  STALE_ANSWERS:
    "Há um rascunho mais recente no servidor. Reconecte antes de continuar.",
  TICKET_REQUIRED: "É necessário um bilhete válido para esta sala.",
  ADS_UNAVAILABLE:
    "Anúncios indisponíveis. Use o acesso gratuito quando oferecido pelo servidor.",
  STORE_UNAVAILABLE:
    "A verificação da loja está indisponível. Nenhum benefício foi concedido.",
  FRIEND_CODE_NOT_FOUND: "Código de amizade não encontrado.",
  ALREADY_FRIENDS: "Vocês já são amigos.",
  REQUEST_PENDING: "Já existe uma solicitação pendente entre vocês.",
  SELF_FRIENDSHIP: "Use o código de outra pessoa.",
  NETWORK_ERROR: "Sem conexão com a API. Verifique a rede e tente novamente.",
  CANCELLED: "Operação cancelada.",
  RATE_LIMITED: "Muitas operações. Aguarde um pouco e tente novamente.",
};
export function explain(error) {
  const detail =
    error.code === "STALE_VERSION" && error.message !== error.code
      ? error.message
      : messages[error.code] || error.message || "Não foi possível concluir.";
  return `${detail}${error.code ? ` (${error.code})` : ""}`;
}
export async function task(control, operation) {
  if (control?.disabled) return;
  if (control) {
    control.disabled = true;
    control.setAttribute("aria-busy", "true");
  }
  try {
    return await operation();
  } catch (error) {
    if (error.code !== "CANCELLED") toast(explain(error), true);
  } finally {
    if (control?.isConnected) {
      control.disabled = false;
      control.removeAttribute("aria-busy");
    }
  }
}
