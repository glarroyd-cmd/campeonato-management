/* ============================================================
   Histórico local de torneios visitados/criados neste navegador.
   Não substitui o Supabase — só lembra QUAIS códigos esse usuário
   já viu, pra exibir no Home como atalhos.
   ============================================================ */

const KEY = 'cm-tournament-history';
const MAX_ITEMS = 30;

function safeGet() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeSet(items) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // quota cheia ou modo privado
  }
}

export function getLocalHistory() {
  return safeGet().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

export function getLocalCodes() {
  return getLocalHistory().map((h) => h.code);
}

export function rememberTournament({ code, role = 'visitor' }) {
  if (!code) return;
  const items = safeGet();
  const idx = items.findIndex((x) => x.code === code);
  const now = Date.now();
  if (idx >= 0) {
    items[idx] = { ...items[idx], lastSeen: now };
    if (role === 'creator') items[idx].role = 'creator';
  } else {
    items.unshift({ code, role, lastSeen: now });
  }
  safeSet(items.slice(0, MAX_ITEMS));
}

export function forgetTournament(code) {
  safeSet(safeGet().filter((x) => x.code !== code));
}
