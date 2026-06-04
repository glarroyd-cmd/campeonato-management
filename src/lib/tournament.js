/* ============================================================
   TOURNAMENT — Toda a lógica de regras, formato, estado, cálculos.
   Sem React. Funções puras. Importado por App.jsx e views/*.
   ============================================================ */

/* --- Times oficiais da Copa 2026 (sorteio 5/dez/2025 + repescagens mar/2026) --- */
const WC2026_GROUPS = [
  { letter: 'A', teams: [
    { name: 'México',             flag: '🇲🇽', pot: 1 },
    { name: 'Coreia do Sul',      flag: '🇰🇷', pot: 2 },
    { name: 'África do Sul',      flag: '🇿🇦', pot: 3 },
    { name: 'República Tcheca',   flag: '🇨🇿', pot: 4 },
  ]},
  { letter: 'B', teams: [
    { name: 'Canadá',             flag: '🇨🇦', pot: 1 },
    { name: 'Suíça',              flag: '🇨🇭', pot: 2 },
    { name: 'Catar',              flag: '🇶🇦', pot: 3 },
    { name: 'Bósnia e Herzegovina', flag: '🇧🇦', pot: 4 },
  ]},
  { letter: 'C', teams: [
    { name: 'Brasil',             flag: '🇧🇷', pot: 1 },
    { name: 'Marrocos',           flag: '🇲🇦', pot: 2 },
    { name: 'Escócia',            flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', pot: 3 },
    { name: 'Haiti',              flag: '🇭🇹', pot: 4 },
  ]},
  { letter: 'D', teams: [
    { name: 'Estados Unidos',     flag: '🇺🇸', pot: 1 },
    { name: 'Austrália',          flag: '🇦🇺', pot: 2 },
    { name: 'Paraguai',           flag: '🇵🇾', pot: 3 },
    { name: 'Turquia',            flag: '🇹🇷', pot: 4 },
  ]},
  { letter: 'E', teams: [
    { name: 'Alemanha',           flag: '🇩🇪', pot: 1 },
    { name: 'Equador',            flag: '🇪🇨', pot: 2 },
    { name: 'Costa do Marfim',    flag: '🇨🇮', pot: 3 },
    { name: 'Curaçao',            flag: '🇨🇼', pot: 4 },
  ]},
  { letter: 'F', teams: [
    { name: 'Países Baixos',      flag: '🇳🇱', pot: 1 },
    { name: 'Japão',              flag: '🇯🇵', pot: 2 },
    { name: 'Tunísia',            flag: '🇹🇳', pot: 3 },
    { name: 'Suécia',             flag: '🇸🇪', pot: 4 },
  ]},
  { letter: 'G', teams: [
    { name: 'Bélgica',            flag: '🇧🇪', pot: 1 },
    { name: 'Irã',                flag: '🇮🇷', pot: 2 },
    { name: 'Egito',              flag: '🇪🇬', pot: 3 },
    { name: 'Nova Zelândia',      flag: '🇳🇿', pot: 4 },
  ]},
  { letter: 'H', teams: [
    { name: 'Espanha',            flag: '🇪🇸', pot: 1 },
    { name: 'Uruguai',            flag: '🇺🇾', pot: 2 },
    { name: 'Arábia Saudita',     flag: '🇸🇦', pot: 3 },
    { name: 'Cabo Verde',         flag: '🇨🇻', pot: 4 },
  ]},
  { letter: 'I', teams: [
    { name: 'França',             flag: '🇫🇷', pot: 1 },
    { name: 'Senegal',            flag: '🇸🇳', pot: 2 },
    { name: 'Noruega',            flag: '🇳🇴', pot: 3 },
    { name: 'Iraque',             flag: '🇮🇶', pot: 4 },
  ]},
  { letter: 'J', teams: [
    { name: 'Argentina',          flag: '🇦🇷', pot: 1 },
    { name: 'Áustria',            flag: '🇦🇹', pot: 2 },
    { name: 'Argélia',            flag: '🇩🇿', pot: 3 },
    { name: 'Jordânia',           flag: '🇯🇴', pot: 4 },
  ]},
  { letter: 'K', teams: [
    { name: 'Portugal',           flag: '🇵🇹', pot: 1 },
    { name: 'Colômbia',           flag: '🇨🇴', pot: 2 },
    { name: 'Uzbequistão',        flag: '🇺🇿', pot: 3 },
    { name: 'RD Congo',           flag: '🇨🇩', pot: 4 },
  ]},
  { letter: 'L', teams: [
    { name: 'Inglaterra',         flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', pot: 1 },
    { name: 'Croácia',            flag: '🇭🇷', pot: 2 },
    { name: 'Gana',               flag: '🇬🇭', pot: 3 },
    { name: 'Panamá',             flag: '🇵🇦', pot: 4 },
  ]},
];

/* --- Helper pra gerar grupos genéricos pros outros presets --- */
function makeGenericGroups(count, size = 4) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: count }, (_, i) => ({
    letter: letters[i],
    teams: Array.from({ length: size }, (_, j) => ({
      name: `Time ${letters[i]}${j + 1}`,
      flag: '🏳️',
      pot: j + 1,
    })),
  }));
}

/* --- Helper pra gerar lista de times pra mata-mata direto --- */
function makeGenericKnockoutTeams(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Time ${i + 1}`,
    flag: '🏳️',
    pot: 1,
    seed: i + 1,
  }));
}

/* ============================================================
   FORMATOS DISPONÍVEIS
   ============================================================ */
export const FORMATS = [
  {
    id: 'wc2026',
    name: 'Copa do Mundo 2026',
    description: '48 times, 12 grupos de 4, R32 com 8 melhores 3ºs, mata-mata.',
    teams: 48,
    hasGroups: true,
    groups: { count: 12, size: 4 },
    bestThirds: 8,
    knockoutStages: ['r32', 'r16', 'qf', 'sf', 'final'],
    hasThirdPlace: true,
    initialGroups: WC2026_GROUPS,
  },
  {
    id: 'wc-classic',
    name: 'Copa do Mundo Clássica',
    description: '32 times, 8 grupos de 4, oitavas → final.',
    teams: 32,
    hasGroups: true,
    groups: { count: 8, size: 4 },
    bestThirds: 0,
    knockoutStages: ['r16', 'qf', 'sf', 'final'],
    hasThirdPlace: true,
    initialGroups: makeGenericGroups(8, 4),
  },
  {
    id: 'euro',
    name: 'Eurocopa (24 times)',
    description: '6 grupos de 4, R16 com 4 melhores 3ºs.',
    teams: 24,
    hasGroups: true,
    groups: { count: 6, size: 4 },
    bestThirds: 4,
    knockoutStages: ['r16', 'qf', 'sf', 'final'],
    hasThirdPlace: false,
    initialGroups: makeGenericGroups(6, 4),
  },
  {
    id: 'ko32',
    name: 'Mata-mata direto (32)',
    description: '32 times, sem fase de grupos.',
    teams: 32,
    hasGroups: false,
    knockoutStages: ['r32', 'r16', 'qf', 'sf', 'final'],
    hasThirdPlace: true,
    initialKoTeams: makeGenericKnockoutTeams(32),
  },
  {
    id: 'ko16',
    name: 'Mata-mata direto (16)',
    description: '16 times, sem fase de grupos.',
    teams: 16,
    hasGroups: false,
    knockoutStages: ['r16', 'qf', 'sf', 'final'],
    hasThirdPlace: true,
    initialKoTeams: makeGenericKnockoutTeams(16),
  },
  {
    id: 'ko8',
    name: 'Mata-mata direto (8)',
    description: '8 times, quartas → final.',
    teams: 8,
    hasGroups: false,
    knockoutStages: ['qf', 'sf', 'final'],
    hasThirdPlace: true,
    initialKoTeams: makeGenericKnockoutTeams(8),
  },
];

export function getFormat(id) {
  return FORMATS.find((f) => f.id === id) || FORMATS[0];
}

export const STAGE_LABELS = {
  r32: 'Rodada de 32',
  r16: 'Oitavas',
  qf: 'Quartas',
  sf: 'Semifinais',
  final: 'Final',
  third: '3º Lugar',
};

export const STAGE_ORDER_INDEX = {
  'group-1': 1, 'group-2': 2, 'group-3': 3,
  'group-4': 1.5, 'group-5': 2.5, 'group-6': 3.5, // ida e volta
  r32: 4, r16: 5, qf: 6, sf: 7, third: 8, final: 8,
};

export function matchStageKey(m) {
  if (m.stage === 'group') return `group-${m.round}`;
  return m.stage;
}

/* ============================================================
   CRITÉRIOS DE DESEMPATE
   ============================================================ */
export const TIEBREAKERS = {
  points:    { id: 'points',    label: 'Pontos',                       always: true },
  goalDiff:  { id: 'goalDiff',  label: 'Saldo de gols geral' },
  goalsFor:  { id: 'goalsFor',  label: 'Gols pró geral' },
  h2hPoints: { id: 'h2hPoints', label: 'Pontos no confronto direto' },
  h2hGoalDiff: { id: 'h2hGoalDiff', label: 'Saldo de gols no confronto direto' },
  fairPlay:  { id: 'fairPlay',  label: 'Fair play (menos cartões)' },
};

export const DEFAULT_TIEBREAKERS = ['points', 'goalDiff', 'goalsFor', 'h2hPoints', 'fairPlay'];

/* ============================================================
   REGRAS PADRÃO
   ============================================================ */
export function defaultRules() {
  return {
    groupReturn: false,
    knockoutReturn: false,
    tiebreakers: DEFAULT_TIEBREAKERS,
    drawMode: 'fifa',           // 'fifa' bracket fixo | 'random'
    extraTime: 'newMatch',      // 'newMatch' (sempre — placar dedicado)
    cardRule: 'fifa',           // 'fifa' | 'resetKnockout' | 'never' | 'noSuspension'
  };
}

export const CARD_RULE_LABELS = {
  fifa: 'FIFA — amarelos zeram antes das semifinais',
  resetKnockout: 'Amarelos zeram no início do mata-mata',
  never: 'Amarelos nunca zeram (só limpam após cumprir suspensão)',
  noSuspension: 'Sem suspensões',
};

/* ============================================================
   ESTADO INICIAL
   ============================================================ */
export function makeInitialState(formatId = 'wc2026') {
  const format = getFormat(formatId);
  return {
    tournamentName: 'Novo torneio',
    player1Name: 'Jogador 1',
    player2Name: 'Jogador 2',
    player1Color: '#06b6d4', // cyan-500 default
    player2Color: '#f59e0b', // amber-500 default
    formatId,
    rules: defaultRules(),
    setupComplete: false,
    rulesComplete: false,
    teamsComplete: false,
    knockoutGenerated: false,
    knockoutSeedingMap: null,
    groups: format.hasGroups ? cloneGroups(format.initialGroups) : null,
    koTeams: !format.hasGroups ? cloneKoTeams(format.initialKoTeams) : null,
    matches: [],
    teamRosters: {}, // { teamId: [playerName, ...] } — escalação persistente
    playerPositions: {}, // { 'teamId|playerName': 'GOL'|'ZAG'|'LAT'|'MEI'|'ATA' }
  };
}

function cloneGroups(groups) {
  return groups.map((g) => ({
    letter: g.letter,
    teams: g.teams.map((t, i) => ({
      ...t,
      id: `${g.letter}${i + 1}`,
      owner: null,
    })),
  }));
}

function cloneKoTeams(teams) {
  return teams.map((t, i) => ({
    ...t,
    id: `KO${i + 1}`,
    owner: null,
  }));
}

/* ============================================================
   GERAÇÃO DE PARTIDAS
   ============================================================ */

/* Confrontos por pote dentro de um grupo de 4
   (6 jogos: cada par único; round = rodada da fase de grupos) */
const GROUP_FIXTURES_4 = [
  { home: 1, away: 2, round: 1 },
  { home: 3, away: 4, round: 1 },
  { home: 1, away: 3, round: 2 },
  { home: 4, away: 2, round: 2 },
  { home: 4, away: 1, round: 3 },
  { home: 2, away: 3, round: 3 },
];

/* Gera todas as partidas da fase de grupos baseado em formato + rules */
export function makeGroupMatches(groups, rules) {
  const matches = [];
  let mid = 0;
  for (const group of groups) {
    const pots = {};
    group.teams.forEach((t) => { pots[t.pot] = t; });

    for (const fix of GROUP_FIXTURES_4) {
      const home = pots[fix.home];
      const away = pots[fix.away];
      if (!home || !away) continue;
      const sameOwner = home.owner && away.owner && home.owner === away.owner;
      matches.push({
        id: `g-${group.letter}-${++mid}`,
        stage: 'group',
        group: group.letter,
        round: fix.round,
        leg: 1,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: sameOwner ? 0 : null,
        awayScore: sameOwner ? 0 : null,
        played: sameOwner ? true : false,
        autoPlayed: sameOwner,
        events: [],
        ratings: { [home.id]: {}, [away.id]: {} },
      });
    }
    /* Ida e volta — replica invertendo mando */
    if (rules.groupReturn) {
      for (const fix of GROUP_FIXTURES_4) {
        const home = pots[fix.away]; // invertido
        const away = pots[fix.home];
        if (!home || !away) continue;
        const sameOwner = home.owner && away.owner && home.owner === away.owner;
        matches.push({
          id: `g-${group.letter}-r-${++mid}`,
          stage: 'group',
          group: group.letter,
          round: fix.round + 3,
          leg: 2,
          homeTeamId: home.id,
          awayTeamId: away.id,
          homeScore: sameOwner ? 0 : null,
          awayScore: sameOwner ? 0 : null,
          played: sameOwner ? true : false,
          autoPlayed: sameOwner,
          events: [],
          ratings: { [home.id]: {}, [away.id]: {} },
        });
      }
    }
  }
  return matches;
}

/* ============================================================
   CLASSIFICAÇÃO COM CRITÉRIOS DE DESEMPATE CONFIGURÁVEIS
   ============================================================ */
export function computeGroupStanding(state, groupLetter) {
  const group = state.groups?.find((g) => g.letter === groupLetter);
  if (!group) return [];

  const rows = group.teams.map((t) => ({
    id: t.id, name: t.name, flag: t.flag, pot: t.pot, owner: t.owner,
    P: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, Pts: 0,
    cards: 0, // amarelos + 3*vermelhos
  }));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  const groupMatches = state.matches.filter(
    (m) => m.stage === 'group' && m.group === groupLetter && m.played
  );

  for (const m of groupMatches) {
    const h = byId[m.homeTeamId];
    const a = byId[m.awayTeamId];
    if (!h || !a) continue;
    h.P++; a.P++;
    h.GP += m.homeScore; h.GC += m.awayScore;
    a.GP += m.awayScore; a.GC += m.homeScore;
    if (m.homeScore > m.awayScore) { h.V++; h.Pts += 3; a.D++; }
    else if (m.homeScore < m.awayScore) { a.V++; a.Pts += 3; h.D++; }
    else { h.E++; a.E++; h.Pts += 1; a.Pts += 1; }

    /* Cartões pra fair-play */
    for (const ev of (m.events || [])) {
      const isHome = ev.teamId === m.homeTeamId;
      const target = isHome ? h : a;
      if (ev.type === 'yellow') target.cards += 1;
      else if (ev.type === 'red') target.cards += 3;
    }
  }
  rows.forEach((r) => { r.SG = r.GP - r.GC; });

  const tiebreakers = state.rules?.tiebreakers || DEFAULT_TIEBREAKERS;
  rows.sort(compareWithTiebreakers(state, groupMatches, tiebreakers));
  return rows;
}

function compareWithTiebreakers(state, allMatches, tiebreakers) {
  return (a, b) => {
    for (const tb of tiebreakers) {
      const diff = compareTiebreaker(tb, a, b, allMatches);
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name);
  };
}

function compareTiebreaker(tb, a, b, matches) {
  if (tb === 'points')   return b.Pts - a.Pts;
  if (tb === 'goalDiff') return b.SG - a.SG;
  if (tb === 'goalsFor') return b.GP - a.GP;
  if (tb === 'fairPlay') return a.cards - b.cards; // menos cartões = melhor
  if (tb === 'h2hPoints' || tb === 'h2hGoalDiff') {
    const direct = matches.filter(
      (m) =>
        (m.homeTeamId === a.id && m.awayTeamId === b.id) ||
        (m.homeTeamId === b.id && m.awayTeamId === a.id)
    );
    let aPts = 0, bPts = 0, aGP = 0, bGP = 0;
    for (const m of direct) {
      const aIsHome = m.homeTeamId === a.id;
      const aSc = aIsHome ? m.homeScore : m.awayScore;
      const bSc = aIsHome ? m.awayScore : m.homeScore;
      aGP += aSc; bGP += bSc;
      if (aSc > bSc) aPts += 3;
      else if (aSc < bSc) bPts += 3;
      else { aPts++; bPts++; }
    }
    if (tb === 'h2hPoints')   return bPts - aPts;
    if (tb === 'h2hGoalDiff') return (bGP - aGP) - (aGP - bGP); /* dif a vs b */
  }
  return 0;
}

/* ============================================================
   SUSPENSÃO POR CARTÕES
   ============================================================ */

/* Quais stages causam reset de amarelos, dada a regra escolhida. */
function getCardResetStages(cardRule) {
  if (cardRule === 'fifa') return ['sf']; // amarelos zeram ANTES das semis
  if (cardRule === 'resetKnockout') return ['r32', 'r16', 'qf', 'sf', 'final']; // o primeiro stage do mata-mata existente
  if (cardRule === 'never' || cardRule === 'noSuspension') return [];
  return ['sf'];
}

/* Retorna { suspended, reason }
   teamId/playerName: quem checar
   upToStageKey: pra qual jogo (NÃO incluir o próprio jogo) */
export function getPlayerCardStatus(state, teamId, playerName, upToStageKey) {
  const cardRule = state.rules?.cardRule || 'fifa';
  if (cardRule === 'noSuspension') return { suspended: false, reason: '' };

  const upToIdx = STAGE_ORDER_INDEX[upToStageKey] ?? 999;
  const resetStages = getCardResetStages(cardRule);

  /* Acha o primeiro stage de reset que existe nas matches geradas
     e que vem ANTES do jogo atual */
  let resetIdx = -1;
  for (const r of resetStages) {
    const exists = state.matches.some((m) => m.stage === r);
    if (exists) {
      const idx = STAGE_ORDER_INDEX[r] ?? 999;
      if (idx < upToIdx) resetIdx = idx;
      break; // pega o primeiro da lista
    }
  }

  return reEvaluateSuspension(state, teamId, playerName, upToIdx, resetIdx);
}

function reEvaluateSuspension(state, teamId, playerName, upToIdx, resetIdx) {
  /* Implementação canônica:
     - yellows = amarelos acumulados (zera por reset OU por cumprir suspensão)
     - se chega a 2 amarelos => ficar suspenso por 1 jogo (próximo do mesmo jogador)
       após cumprir esse jogo, yellows volta a 0
     - vermelho => suspenso 1 jogo, depois libera
     Retorna { suspended, reason } para o jogo upToIdx
  */
  const previous = state.matches
    .filter((m) => m.played && (STAGE_ORDER_INDEX[matchStageKey(m)] ?? 999) < upToIdx)
    .sort((x, y) => (STAGE_ORDER_INDEX[matchStageKey(x)] ?? 0) - (STAGE_ORDER_INDEX[matchStageKey(y)] ?? 0));

  /* Próximo jogo desse jogador é o upToIdx jogo. Vamos simular cronologicamente:
     - track yellows count and pendingSuspensionGame (true/false)
     - quando aparece amarelo => yellows++
     - quando yellows == 2 => marca suspendNextMatch = true; reset yellows = 0
     - quando aparece vermelho => suspendNextMatch = true
     - depois do próximo jogo do MESMO jogador, suspendNextMatch volta pra false
     Mas como contamos jogos do mesmo jogador? Considerando que "próximo jogo" é qualquer jogo do time dele.
     Vou considerar: suspendNextMatch = true => o próximo jogo do TIME do jogador o jogador fica de fora.
     Se um jogo passa, suspendNextMatch volta pra false.
  */
  let yellows = 0;
  let suspendThisGame = false;
  let resetApplied = false;
  let lastReason = '';
  let lastStageProcessed = -1;

  for (const m of previous) {
    const thisIdx = STAGE_ORDER_INDEX[matchStageKey(m)] ?? 999;

    /* Reset stage de amarelos: zerar yellows antes de processar este jogo */
    if (!resetApplied && resetIdx >= 0 && thisIdx >= resetIdx) {
      yellows = 0;
      resetApplied = true;
    }

    const isTeamMatch = m.homeTeamId === teamId || m.awayTeamId === teamId;
    if (!isTeamMatch) continue;

    /* Se entrou neste jogo suspendThisGame=true, considera-se que ele cumpriu a suspensão neste jogo
       (não computamos eventos dele neste jogo, mas a suspensão "queima") */
    if (suspendThisGame) {
      suspendThisGame = false;
      lastReason = '';
    }

    for (const ev of (m.events || [])) {
      if (ev.teamId !== teamId || ev.playerName !== playerName) continue;
      if (ev.type === 'yellow') {
        yellows++;
        if (yellows >= 2) {
          suspendThisGame = true;
          yellows = 0;
          lastReason = '2 amarelos acumulados';
        }
      } else if (ev.type === 'red') {
        suspendThisGame = true;
        lastReason = 'expulso no jogo anterior';
      }
    }
    lastStageProcessed = thisIdx;
  }

  return { suspended: suspendThisGame, reason: lastReason };
}

/* ============================================================
   GERAÇÃO DO MATA-MATA
   ============================================================ */

/* Padrão R32 da Copa 2026 — 16 jogos.
   home/away referem-se a slots: 1A, 2A, ..., 3rd[1..N] */
const R32_PATTERN_WC2026 = [
  { id: 1,  home: '1A',  away: '3rd' },
  { id: 2,  home: '1B',  away: '3rd' },
  { id: 3,  home: '1C',  away: '3rd' },
  { id: 4,  home: '1D',  away: '3rd' },
  { id: 5,  home: '1E',  away: '3rd' },
  { id: 6,  home: '1F',  away: '3rd' },
  { id: 7,  home: '1G',  away: '3rd' },
  { id: 8,  home: '1H',  away: '3rd' },
  { id: 9,  home: '1I',  away: '2J' },
  { id: 10, home: '1J',  away: '2I' },
  { id: 11, home: '1K',  away: '2L' },
  { id: 12, home: '1L',  away: '2K' },
  { id: 13, home: '2A',  away: '2B' },
  { id: 14, home: '2C',  away: '2D' },
  { id: 15, home: '2E',  away: '2F' },
  { id: 16, home: '2G',  away: '2H' },
];

/* R16 padrão pra 32 times (Copa antiga) */
const R16_PATTERN_WC_CLASSIC = [
  { id: 1, home: '1A', away: '2B' },
  { id: 2, home: '1C', away: '2D' },
  { id: 3, home: '1E', away: '2F' },
  { id: 4, home: '1G', away: '2H' },
  { id: 5, home: '1B', away: '2A' },
  { id: 6, home: '1D', away: '2C' },
  { id: 7, home: '1F', away: '2E' },
  { id: 8, home: '1H', away: '2G' },
];

/* R16 pra Euro 24 — 4 melhores 3ºs */
const R16_PATTERN_EURO = [
  { id: 1, home: '1A', away: '2C' },
  { id: 2, home: '1B', away: '3rd' },
  { id: 3, home: '1C', away: '3rd' },
  { id: 4, home: '1D', away: '2E' },
  { id: 5, home: '1E', away: '3rd' },
  { id: 6, home: '1F', away: '3rd' },
  { id: 7, home: '2A', away: '2B' },
  { id: 8, home: '2D', away: '2F' },
];

function getFirstKnockoutPattern(format) {
  if (format.id === 'wc2026') return { stage: 'r32', pattern: R32_PATTERN_WC2026 };
  if (format.id === 'wc-classic') return { stage: 'r16', pattern: R16_PATTERN_WC_CLASSIC };
  if (format.id === 'euro') return { stage: 'r16', pattern: R16_PATTERN_EURO };
  return null;
}

/* Quantos confrontos por stage subsequente. Vencedores se conectam ordenadamente */
function getKnockoutChain(format) {
  const stages = format.knockoutStages;
  const counts = {
    r32: 16, r16: 8, qf: 4, sf: 2, final: 1, third: 1,
  };
  return stages.map((s) => ({ stage: s, count: counts[s] }));
}

/* Gera os matches da fase de mata-mata.
   Para formatos com grupos: usa as classificações resolvidas em slotToTeam.
   Para mata-mata direto: usa os times ordenados (com seeding fixo ou random).
   rules.knockoutReturn => ida e volta no mata-mata.
   
   IMPORTANTE: aceita estado com fase de grupos PARCIAL — slots que não puderem
   ser preenchidos ficam null (e o app re-tenta quando os jogos forem atualizados). */
export function makeKnockoutMatches(state) {
  const format = getFormat(state.formatId);
  const rules = state.rules;
  const matches = [];
  const stages = format.knockoutStages;

  let firstStageSlots; // teamId em cada slot do primeiro stage

  if (format.hasGroups) {
    const standings = format.initialGroups.map((g) => ({
      letter: g.letter, rows: computeGroupStanding(state, g.letter),
    }));
    const slotToTeam = {};
    for (const s of standings) {
      slotToTeam[`1${s.letter}`] = s.rows[0]?.id || null;
      slotToTeam[`2${s.letter}`] = s.rows[1]?.id || null;
    }
    /* Melhores 3ºs */
    if (format.bestThirds > 0) {
      const thirds = standings
        .map((s) => ({ ...s.rows[2], group: s.letter }))
        .filter((t) => t && t.id)
        .sort(compareWithTiebreakers(state, state.matches.filter(m => m.played), state.rules.tiebreakers || DEFAULT_TIEBREAKERS));
      const bestThirds = thirds.slice(0, format.bestThirds);
      let i = 0;
      const firstStagePattern = getFirstKnockoutPattern(format).pattern;
      firstStageSlots = firstStagePattern.map((p) => {
        const resolve = (slotName) => {
          if (slotName === '3rd') return bestThirds[i++]?.id || null;
          return slotToTeam[slotName] || null;
        };
        return { home: resolve(p.home), away: resolve(p.away) };
      });
    } else {
      const firstStagePattern = getFirstKnockoutPattern(format).pattern;
      firstStageSlots = firstStagePattern.map((p) => ({
        home: slotToTeam[p.home] || null, away: slotToTeam[p.away] || null,
      }));
    }

    /* Random draw: embaralha todos os times do primeiro stage,
       tentando evitar pares de mesmo dono */
    if (rules.drawMode === 'random') {
      const allTeams = firstStageSlots.flatMap((s) => [s.home, s.away]).filter(Boolean);
      const teamOwnerOf = (id) => getTeamById(state, id)?.owner || null;
      const shuffled = shuffleAvoidingSameOwner(allTeams, teamOwnerOf);
      firstStageSlots = [];
      for (let i = 0; i < shuffled.length; i += 2) {
        firstStageSlots.push({ home: shuffled[i], away: shuffled[i + 1] || null });
      }
    }
  } else {
    /* Mata-mata direto: usa koTeams */
    let teamsList = (state.koTeams || []).map((t) => t.id);
    if (rules.drawMode === 'random') {
      const teamOwnerOf = (id) => getTeamById(state, id)?.owner || null;
      teamsList = shuffleAvoidingSameOwner(teamsList, teamOwnerOf);
    }
    firstStageSlots = [];
    for (let i = 0; i < teamsList.length; i += 2) {
      firstStageSlots.push({ home: teamsList[i], away: teamsList[i + 1] || null });
    }
  }

  /* Gera o primeiro stage */
  const firstStage = stages[0];
  const stageMatches = firstStageSlots.map((s, idx) => {
    const legs = rules.knockoutReturn ? 2 : 1;
    const legMatches = [];
    for (let leg = 1; leg <= legs; leg++) {
      const isLeg2 = leg === 2;
      legMatches.push({
        id: `k-${firstStage}-${idx + 1}-l${leg}`,
        stage: firstStage,
        koIndex: idx,
        leg, totalLegs: legs,
        homeTeamId: isLeg2 ? s.away : s.home,
        awayTeamId: isLeg2 ? s.home : s.away,
        homeScore: null, awayScore: null,
        played: false,
        events: [],
        ratings: {},
        extra: null,
        penaltyWinner: null,
      });
    }
    return legMatches;
  });
  matches.push(...stageMatches.flat());

  /* Gera stages seguintes (sem teams, vão sendo preenchidos pela propagação) */
  for (let i = 1; i < stages.length; i++) {
    const stage = stages[i];
    const prevStage = stages[i - 1];
    const chain = getKnockoutChain(format);
    const count = chain.find((c) => c.stage === stage)?.count || 1;
    for (let idx = 0; idx < count; idx++) {
      const legs = rules.knockoutReturn ? 2 : 1;
      const feedHomeIdx = idx * 2;
      const feedAwayIdx = idx * 2 + 1;
      for (let leg = 1; leg <= legs; leg++) {
        matches.push({
          id: `k-${stage}-${idx + 1}-l${leg}`,
          stage,
          koIndex: idx,
          leg, totalLegs: legs,
          feedHome: { stage: prevStage, koIndex: feedHomeIdx, type: 'winner' },
          feedAway: { stage: prevStage, koIndex: feedAwayIdx, type: 'winner' },
          homeTeamId: null,
          awayTeamId: null,
          homeScore: null, awayScore: null,
          played: false,
          events: [],
          ratings: {},
          extra: null,
          penaltyWinner: null,
        });
      }
    }
  }

  /* Jogo de 3º lugar — perdedores das semis */
  if (format.hasThirdPlace) {
    matches.push({
      id: `k-third-1-l1`,
      stage: 'third',
      koIndex: 0,
      leg: 1, totalLegs: 1,
      feedHome: { stage: 'sf', koIndex: 0, type: 'loser' },
      feedAway: { stage: 'sf', koIndex: 1, type: 'loser' },
      homeTeamId: null, awayTeamId: null,
      homeScore: null, awayScore: null,
      played: false,
      events: [],
      ratings: {},
      extra: null,
      penaltyWinner: null,
    });
  }

  return matches;
}

/* Recalcula os times dos slots do primeiro stage do KO com base nas standings ATUAIS.
   Só sobrescreve slots cujos jogos correspondentes AINDA NÃO foram jogados — pra não
   destruir progresso. Retorna { matches, changed }. */
export function recalcKnockoutSeeding(state) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) return { matches: state.matches, changed: false };
  if (state.rules?.drawMode === 'random') {
    /* No modo aleatório, o sorteio é feito uma vez só — não re-shuffles */
    return { matches: state.matches, changed: false };
  }

  const firstStage = format.knockoutStages[0];
  const koFirstStage = state.matches.filter((m) => m.stage === firstStage && !m.isExtra);
  if (koFirstStage.length === 0) return { matches: state.matches, changed: false };

  /* Calcula slots ideais agora */
  const standings = format.initialGroups.map((g) => ({
    letter: g.letter, rows: computeGroupStanding(state, g.letter),
  }));
  const slotToTeam = {};
  for (const s of standings) {
    slotToTeam[`1${s.letter}`] = s.rows[0]?.id || null;
    slotToTeam[`2${s.letter}`] = s.rows[1]?.id || null;
  }
  let firstStageSlots;
  if (format.bestThirds > 0) {
    const thirds = standings
      .map((s) => ({ ...s.rows[2], group: s.letter }))
      .filter((t) => t && t.id)
      .sort(compareWithTiebreakers(state, state.matches.filter(m => m.played), state.rules.tiebreakers || DEFAULT_TIEBREAKERS));
    const bestThirds = thirds.slice(0, format.bestThirds);
    let i = 0;
    const firstStagePattern = getFirstKnockoutPattern(format).pattern;
    firstStageSlots = firstStagePattern.map((p) => {
      const resolve = (slotName) => {
        if (slotName === '3rd') return bestThirds[i++]?.id || null;
        return slotToTeam[slotName] || null;
      };
      return { home: resolve(p.home), away: resolve(p.away) };
    });
  } else {
    const firstStagePattern = getFirstKnockoutPattern(format).pattern;
    firstStageSlots = firstStagePattern.map((p) => ({
      home: slotToTeam[p.home] || null, away: slotToTeam[p.away] || null,
    }));
  }

  let changed = false;
  const newMatches = state.matches.map((m) => {
    if (m.stage !== firstStage || m.isExtra) return m;
    const slot = firstStageSlots[m.koIndex];
    if (!slot) return m;
    /* Para legs 1 vs 2 — leg 1 usa home original, leg 2 invertido */
    const isLeg2 = m.leg === 2;
    const expectedHome = isLeg2 ? slot.away : slot.home;
    const expectedAway = isLeg2 ? slot.home : slot.away;
    /* Só sobrescreve se este match específico ainda NÃO foi jogado */
    if (m.played) return m;
    if (m.homeTeamId !== expectedHome || m.awayTeamId !== expectedAway) {
      changed = true;
      return { ...m, homeTeamId: expectedHome, awayTeamId: expectedAway };
    }
    return m;
  });
  return { matches: newMatches, changed };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* Shuffle que tenta evitar pares de mesmo dono.
   Faz vários shuffles e fica com o que tiver menos conflitos.
   Depois aplica greedy swaps pra reduzir os restantes. */
function shuffleAvoidingSameOwner(teamIds, getOwner) {
  if (teamIds.length < 2) return [...teamIds];
  const countConflicts = (arr) => {
    let c = 0;
    for (let i = 0; i < arr.length; i += 2) {
      const o1 = getOwner(arr[i]);
      const o2 = getOwner(arr[i + 1]);
      if (o1 && o2 && o1 === o2) c++;
    }
    return c;
  };
  let best = [...teamIds];
  let bestConflicts = countConflicts(best);
  for (let attempt = 0; attempt < 50 && bestConflicts > 0; attempt++) {
    const trial = shuffle([...teamIds]);
    const c = countConflicts(trial);
    if (c < bestConflicts) {
      best = trial;
      bestConflicts = c;
    }
  }
  /* Greedy swaps: pra cada conflito, tenta trocar com outro par sem criar novo conflito */
  if (bestConflicts > 0) {
    for (let i = 0; i < best.length; i += 2) {
      const o1 = getOwner(best[i]);
      const o2 = getOwner(best[i + 1]);
      if (!o1 || !o2 || o1 !== o2) continue;
      /* tenta trocar best[i+1] com algum elemento de outro par sem conflito */
      for (let j = 0; j < best.length; j += 2) {
        if (j === i) continue;
        const jo1 = getOwner(best[j]);
        const jo2 = getOwner(best[j + 1]);
        if (jo1 === jo2) continue; // outro par tb com conflito? pula
        /* tenta trocar best[i+1] <-> best[j] */
        const ni = getOwner(best[i]) === getOwner(best[j]); // novo i tem conflito?
        const nj = getOwner(best[i + 1]) === getOwner(best[j + 1]); // novo j tem conflito?
        if (!ni && !nj) {
          [best[i + 1], best[j]] = [best[j], best[i + 1]];
          break;
        }
        /* tenta trocar best[i+1] <-> best[j+1] */
        const ni2 = getOwner(best[i]) === getOwner(best[j + 1]);
        const nj2 = getOwner(best[j]) === getOwner(best[i + 1]);
        if (!ni2 && !nj2) {
          [best[i + 1], best[j + 1]] = [best[j + 1], best[i + 1]];
          break;
        }
      }
    }
  }
  return best;
}

/* ============================================================
   PROPAGAÇÃO DE VENCEDORES NO MATA-MATA
   Considerando ida-e-volta (agregado), prorrogação, pênaltis.
   ============================================================ */
export function getMatchOutcome(matches, stage, koIndex) {
  /* Retorna { winner, loser, decided, aggregateHome, aggregateAway, regulationDraw, etDraw }
     para um confronto (todos os legs + et + pen) */
  const legs = matches.filter((m) => m.stage === stage && m.koIndex === koIndex && !m.isExtra);
  if (legs.length === 0) return { decided: false };
  const allLegsPlayed = legs.every((m) => m.played);
  if (!allLegsPlayed) return { decided: false };

  /* Vou identificar quais são "os dois times" do confronto */
  const sample = legs[0];
  if (!sample.homeTeamId || !sample.awayTeamId) return { decided: false };

  /* Agregado: soma de gols MARCADOS por cada time em todos os legs */
  const teamA = sample.homeTeamId;
  const teamB = sample.awayTeamId;
  let aggA = 0, aggB = 0;
  for (const m of legs) {
    if (m.homeTeamId === teamA) {
      aggA += m.homeScore; aggB += m.awayScore;
    } else {
      aggA += m.awayScore; aggB += m.homeScore;
    }
  }

  if (aggA > aggB) return { decided: true, winner: teamA, loser: teamB, aggA, aggB };
  if (aggB > aggA) return { decided: true, winner: teamB, loser: teamA, aggA, aggB };

  /* Agregado empatou => precisa de prorrogação (jogo extra) */
  const et = matches.find((m) => m.stage === stage && m.koIndex === koIndex && m.isExtra);
  if (!et || !et.played) return { decided: false, regulationDraw: true, aggA, aggB };

  /* Prorrogação jogada */
  let etA = 0, etB = 0;
  if (et.homeTeamId === teamA) { etA = et.homeScore; etB = et.awayScore; }
  else                          { etA = et.awayScore; etB = et.homeScore; }

  if (etA > etB) return { decided: true, winner: teamA, loser: teamB, etA, etB, aggA, aggB };
  if (etB > etA) return { decided: true, winner: teamB, loser: teamA, etA, etB, aggA, aggB };

  /* Prorrogação empatou => pênaltis */
  if (et.penaltyWinner) {
    const winner = et.penaltyWinner;
    const loser = winner === teamA ? teamB : teamA;
    return { decided: true, winner, loser, etDraw: true, viaPenalties: true, aggA, aggB };
  }
  return { decided: false, regulationDraw: true, etDraw: true, aggA, aggB };
}

export function propagateKnockoutWinners(matches) {
  const newMatches = matches.map((m) => ({ ...m }));
  /* Resolver outcomes de cada confronto */
  const outcomes = new Map(); // key: stage|koIndex
  const stagesPresent = [...new Set(newMatches.filter((m) => !m.isExtra).map((m) => m.stage))];
  for (const stage of stagesPresent) {
    const indices = [...new Set(newMatches.filter((m) => m.stage === stage && !m.isExtra).map((m) => m.koIndex))];
    for (const idx of indices) {
      const out = getMatchOutcome(newMatches, stage, idx);
      outcomes.set(`${stage}|${idx}`, out);
    }
  }
  /* Preencher feeds */
  let changed = false;
  for (const m of newMatches) {
    if (m.isExtra) continue;
    const feedHome = m.feedHome;
    const feedAway = m.feedAway;
    if (!feedHome && !feedAway) continue;

    const outHome = feedHome ? outcomes.get(`${feedHome.stage}|${feedHome.koIndex}`) : null;
    const outAway = feedAway ? outcomes.get(`${feedAway.stage}|${feedAway.koIndex}`) : null;

    const pickFromOutcome = (o, type) => {
      if (!o || !o.decided) return null;
      return type === 'winner' ? o.winner : o.loser;
    };
    const newHome = outHome ? pickFromOutcome(outHome, feedHome.type) : m.homeTeamId;
    const newAway = outAway ? pickFromOutcome(outAway, feedAway.type) : m.awayTeamId;

    /* Mas e ida e volta? Os dois legs precisam ter os mesmos times. Leg 1 = home pattern do feed,
       Leg 2 = invertido. */
    if (newHome !== m.homeTeamId || newAway !== m.awayTeamId) {
      if (m.leg === 1) {
        m.homeTeamId = newHome;
        m.awayTeamId = newAway;
      } else {
        m.homeTeamId = newAway;
        m.awayTeamId = newHome;
      }
      changed = true;
    }
  }
  return { matches: newMatches, changed };
}

/* ============================================================
   AUTO-MARCAR JOGOS DE MESMO DONO COMO EMPATE 0-0
   Quando dono dos times é definido depois (ex: no draft de grupos),
   precisamos atualizar os jogos da fase de grupos.
   ============================================================ */
export function autoFillSameOwnerGroupMatches(state) {
  const newMatches = state.matches.map((m) => {
    if (m.stage !== 'group') return m;
    if (m.played && !m.autoPlayed) return m; // já jogado de verdade
    const team1 = getTeamById(state, m.homeTeamId);
    const team2 = getTeamById(state, m.awayTeamId);
    if (!team1?.owner || !team2?.owner) return m;
    const sameOwner = team1.owner === team2.owner;
    if (sameOwner) {
      return { ...m, homeScore: 0, awayScore: 0, played: true, autoPlayed: true, events: [], ratings: { [m.homeTeamId]: {}, [m.awayTeamId]: {} } };
    } else if (m.autoPlayed) {
      /* Era same owner antes mas mudou — limpa */
      return { ...m, homeScore: null, awayScore: null, played: false, autoPlayed: false };
    }
    return m;
  });
  return newMatches;
}

/* ============================================================
   UTIL — Acessar todos os times planos
   ============================================================ */
export function getAllTeams(state) {
  if (state.groups) return state.groups.flatMap((g) => g.teams);
  return state.koTeams || [];
}

export function getTeamById(state, id) {
  return getAllTeams(state).find((t) => t.id === id);
}

/* ============================================================
   ESTATÍSTICAS DE JOGADORES (artilharia, assistências, etc)
   ============================================================ */
export function computePlayerStats(state) {
  const map = new Map(); // key: teamId|playerName
  const ensure = (teamId, playerName) => {
    const key = `${teamId}|${playerName}`;
    if (!map.has(key)) {
      const team = getTeamById(state, teamId);
      map.set(key, {
        teamId, playerName,
        teamName: team?.name || '',
        teamFlag: team?.flag || '',
        owner: team?.owner || null,
        goals: 0, assists: 0, yellows: 0, reds: 0,
        ratingSum: 0, ratingCount: 0,
        matchesPlayed: 0,
      });
    }
    return map.get(key);
  };

  /* Eventos */
  for (const m of state.matches) {
    if (!m.played || m.autoPlayed) continue;
    for (const ev of (m.events || [])) {
      if (!ev.playerName) continue;
      const stat = ensure(ev.teamId, ev.playerName);
      if (ev.type === 'goal') stat.goals++;
      else if (ev.type === 'assist') stat.assists++;
      else if (ev.type === 'yellow') stat.yellows++;
      else if (ev.type === 'red') stat.reds++;
    }
    /* Ratings */
    for (const teamId of Object.keys(m.ratings || {})) {
      for (const [pname, rating] of Object.entries(m.ratings[teamId] || {})) {
        if (rating == null || rating === '') continue;
        const r = parseFloat(rating);
        if (!isNaN(r)) {
          const stat = ensure(teamId, pname);
          stat.ratingSum += r;
          stat.ratingCount++;
          stat.matchesPlayed++;
        }
      }
    }
  }
  return [...map.values()];
}

/* ============================================================
   MELHORES 3ºs LUGARES (pra Copa 2026 e Eurocopa)
   ============================================================ */
export function computeBestThirds(state) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups || !format.bestThirds || format.bestThirds === 0) return [];
  const standings = format.initialGroups.map((g) => ({
    letter: g.letter, rows: computeGroupStanding(state, g.letter),
  }));
  const tiebreakers = state.rules?.tiebreakers || DEFAULT_TIEBREAKERS;
  const playedMatches = state.matches.filter((m) => m.played);
  const thirds = standings
    .map((s) => s.rows[2] ? { ...s.rows[2], group: s.letter } : null)
    .filter(Boolean)
    .sort(compareWithTiebreakers(state, playedMatches, tiebreakers));
  return thirds.map((t, i) => ({ ...t, rank: i + 1, qualified: i < format.bestThirds }));
}

/* ============================================================
   ESTATÍSTICAS DE TIMES E DONOS
   ============================================================ */
export function computeTeamStats(state) {
  const teamMap = new Map();
  const ensure = (teamId) => {
    if (!teamMap.has(teamId)) {
      const team = getTeamById(state, teamId);
      teamMap.set(teamId, {
        teamId,
        name: team?.name || '',
        flag: team?.flag || '',
        owner: team?.owner || null,
        P: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, Pts: 0,
        yellows: 0, reds: 0,
      });
    }
    return teamMap.get(teamId);
  };

  for (const m of state.matches) {
    if (!m.played || m.autoPlayed) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const h = ensure(m.homeTeamId);
    const a = ensure(m.awayTeamId);
    h.P++; a.P++;
    h.GP += m.homeScore; h.GC += m.awayScore;
    a.GP += m.awayScore; a.GC += m.homeScore;
    if (m.homeScore > m.awayScore)      { h.V++; a.D++; h.Pts += 3; }
    else if (m.homeScore < m.awayScore) { a.V++; h.D++; a.Pts += 3; }
    else                                { h.E++; a.E++; h.Pts += 1; a.Pts += 1; }

    for (const ev of (m.events || [])) {
      const t = teamMap.get(ev.teamId);
      if (!t) continue;
      if (ev.type === 'yellow') t.yellows++;
      else if (ev.type === 'red') t.reds++;
    }
  }
  const rows = [...teamMap.values()];
  rows.forEach((r) => {
    r.SG = r.GP - r.GC;
    r.winPct = r.P > 0 ? Math.round((r.Pts / (r.P * 3)) * 100) : 0;
  });
  return rows;
}

export function computeOwnerStats(state) {
  const own = {
    p1: { id: 'p1', name: state.player1Name, P: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, Pts: 0, yellows: 0, reds: 0, teams: 0 },
    p2: { id: 'p2', name: state.player2Name, P: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, Pts: 0, yellows: 0, reds: 0, teams: 0 },
  };
  const teamStats = computeTeamStats(state);
  for (const t of teamStats) {
    if (!t.owner) continue;
    const o = own[t.owner];
    if (!o) continue;
    o.P += t.P; o.V += t.V; o.E += t.E; o.D += t.D;
    o.GP += t.GP; o.GC += t.GC;
    o.Pts += t.Pts;
    o.yellows += t.yellows; o.reds += t.reds;
  }
  /* Conta times atribuídos */
  for (const t of getAllTeams(state)) {
    if (t.owner === 'p1') own.p1.teams++;
    else if (t.owner === 'p2') own.p2.teams++;
  }
  own.p1.SG = own.p1.GP - own.p1.GC;
  own.p2.SG = own.p2.GP - own.p2.GC;
  own.p1.winPct = own.p1.P > 0 ? Math.round((own.p1.Pts / (own.p1.P * 3)) * 100) : 0;
  own.p2.winPct = own.p2.P > 0 ? Math.round((own.p2.Pts / (own.p2.P * 3)) * 100) : 0;
  return [own.p1, own.p2];
}

/* ============================================================
   POSIÇÕES DOS JOGADORES
   ============================================================ */
export const POSITIONS = [
  { id: 'GOL', label: 'Goleiro',     short: 'GOL', color: '#facc15' },
  { id: 'ZAG', label: 'Zagueiro',    short: 'ZAG', color: '#60a5fa' },
  { id: 'LAT', label: 'Lateral',     short: 'LAT', color: '#38bdf8' },
  { id: 'MEI', label: 'Meio-campo',  short: 'MEI', color: '#a78bfa' },
  { id: 'ATA', label: 'Atacante',    short: 'ATA', color: '#f87171' },
];

export function getPlayerPosition(state, teamId, playerName) {
  const key = `${teamId}|${playerName}`;
  return state.playerPositions?.[key] || null;
}

/* Power score adaptado por posição.
   Goleiros valorizam mais a nota; atacantes mais o gol. */
function getPositionAdjustedScore(s, position, maxStage, isChampionTeam) {
  const stageBonus = (maxStage ?? 0) * 3;
  const champBonus = isChampionTeam ? 6 : 0;
  const matchesBonus = Math.log2(s.ratingCount + 1) * 2;
  const cardPenalty = (s.yellows * 1) + (s.reds * 4);
  const avg = s.avg ?? (s.ratingCount > 0 ? s.ratingSum / s.ratingCount : 0);
  let coreScore;
  switch (position) {
    case 'GOL':
      coreScore = (avg * 12) + (s.assists * 1.5);
      break;
    case 'ZAG':
      coreScore = (avg * 9) + (s.goals * 3) + (s.assists * 1.5);
      break;
    case 'LAT':
      coreScore = (avg * 8) + (s.goals * 3.5) + (s.assists * 2.5);
      break;
    case 'MEI':
      coreScore = (avg * 7) + (s.goals * 3.5) + (s.assists * 3.5);
      break;
    case 'ATA':
      coreScore = (avg * 6) + (s.goals * 5) + (s.assists * 2);
      break;
    default:
      coreScore = (avg * 6) + (s.goals * 4) + (s.assists * 2);
  }
  return coreScore + stageBonus + champBonus + matchesBonus - cardPenalty;
}

/* Computes player stats with position info and position-adjusted score */
export function computePlayersWithPosition(state) {
  const stats = computePlayerStats(state);
  const stageScore = { group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third: 4.5, final: 5 };
  const maxStageByTeam = {};
  for (const m of state.matches) {
    if (m.stage === 'group' || !m.played || !m.homeTeamId || !m.awayTeamId) continue;
    const sScore = stageScore[m.stage] ?? 0;
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if ((maxStageByTeam[tid] ?? -1) < sScore) maxStageByTeam[tid] = sScore;
    }
  }
  const champ = getChampion(state);
  return stats
    .filter((s) => s.ratingCount >= 1 || s.goals > 0 || s.assists > 0)
    .map((s) => {
      const position = getPlayerPosition(state, s.teamId, s.playerName);
      const avg = s.ratingCount > 0 ? s.ratingSum / s.ratingCount : 0;
      const stageReached = maxStageByTeam[s.teamId] ?? 0;
      const isChampionTeam = champ?.id === s.teamId;
      const posScore = position
        ? getPositionAdjustedScore({ ...s, avg }, position, stageReached, isChampionTeam)
        : null;
      return { ...s, avg, position, stageReached, isChampionTeam, posScore };
    });
}

/* Ranking de jogadores por posição (top N) */
export function computePlayersByPosition(state, positionId, limit = 10) {
  return computePlayersWithPosition(state)
    .filter((p) => p.position === positionId && p.posScore != null)
    .sort((a, b) => b.posScore - a.posScore)
    .slice(0, limit);
}

/* Seleciona o time do torneio na formação 4-3-3:
   1 GOL · 2 ZAG · 2 LAT · 3 MEI · 3 ATA */
export function computeBestXI(state) {
  const all = computePlayersWithPosition(state);
  const byPos = {};
  for (const pid of ['GOL', 'ZAG', 'LAT', 'MEI', 'ATA']) {
    byPos[pid] = all
      .filter((p) => p.position === pid && p.posScore != null)
      .sort((a, b) => b.posScore - a.posScore);
  }
  return {
    GOL: byPos.GOL.slice(0, 1),
    ZAG: byPos.ZAG.slice(0, 2),
    LAT: byPos.LAT.slice(0, 2),
    MEI: byPos.MEI.slice(0, 3),
    ATA: byPos.ATA.slice(0, 3),
    available: byPos,
  };
}

/* ============================================================
   HEAD-TO-HEAD DOS JOGADORES
   Soma todos os jogos jogados (não autoPlayed) onde times de
   donos diferentes se enfrentaram.
   ============================================================ */
export function computeHeadToHead(state) {
  const result = {
    p1Wins: 0, p2Wins: 0, draws: 0,
    p1Goals: 0, p2Goals: 0,
    totalMatches: 0,
  };
  for (const m of state.matches) {
    if (!m.played || m.autoPlayed) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const home = getTeamById(state, m.homeTeamId);
    const away = getTeamById(state, m.awayTeamId);
    if (!home?.owner || !away?.owner) continue;
    if (home.owner === away.owner) continue;
    result.totalMatches++;
    const p1IsHome = home.owner === 'p1';
    const p1Score = p1IsHome ? m.homeScore : m.awayScore;
    const p2Score = p1IsHome ? m.awayScore : m.homeScore;
    result.p1Goals += p1Score;
    result.p2Goals += p2Score;
    if (p1Score > p2Score) result.p1Wins++;
    else if (p2Score > p1Score) result.p2Wins++;
    else result.draws++;
  }
  return result;
}

/* ============================================================
   PRÓXIMOS JOGOS PENDENTES (em ordem cronológica do torneio)
   ============================================================ */
export function getUpcomingMatches(state, limit = 5) {
  const pending = state.matches.filter((m) =>
    !m.played && !m.autoPlayed && m.homeTeamId && m.awayTeamId && !m.isExtra
  );
  pending.sort((a, b) => {
    const aIdx = STAGE_ORDER_INDEX[matchStageKey(a)] ?? 999;
    const bIdx = STAGE_ORDER_INDEX[matchStageKey(b)] ?? 999;
    if (aIdx !== bIdx) return aIdx - bIdx;
    if (a.stage === 'group') {
      if (a.group !== b.group) return (a.group || '').localeCompare(b.group || '');
      return a.id.localeCompare(b.id);
    }
    if ((a.koIndex ?? 0) !== (b.koIndex ?? 0)) return (a.koIndex ?? 0) - (b.koIndex ?? 0);
    if ((a.leg ?? 1) !== (b.leg ?? 1)) return (a.leg ?? 1) - (b.leg ?? 1);
    return 0;
  });
  return pending.slice(0, limit);
}

/* ============================================================
   JOGADORES DESTAQUE DE UM TIME (para "ficar de olho")
   Ranqueia os jogadores históricos pelo desempenho até agora.
   Score = média × 10 + gols × 3 + assists × 1.5
   ============================================================ */
export function getNotablePlayersForTeam(state, teamId, limit = 3) {
  const stats = computePlayerStats(state).filter((s) => s.teamId === teamId);
  if (stats.length === 0) return [];
  const ranked = stats
    .map((s) => {
      const avg = s.ratingCount > 0 ? s.ratingSum / s.ratingCount : 0;
      const score = (avg * 10) + (s.goals * 3) + (s.assists * 1.5);
      return { ...s, avg, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

/* ============================================================
   RECORDES DO TORNEIO
   ============================================================ */
export function computeTournamentRecords(state) {
  const real = state.matches.filter((m) => m.played && !m.autoPlayed && m.homeTeamId && m.awayTeamId);
  if (real.length === 0) return null;

  /* Maior goleada (maior diferença) */
  let biggestRout = null;
  let mostGoalsMatch = null;
  let mostCardsMatch = null;
  for (const m of real) {
    const diff = Math.abs(m.homeScore - m.awayScore);
    const total = m.homeScore + m.awayScore;
    const cards = (m.events || []).filter((e) => e.type === 'yellow' || e.type === 'red').length;
    if (!biggestRout || diff > biggestRout.diff) biggestRout = { match: m, diff, total };
    if (!mostGoalsMatch || total > mostGoalsMatch.total) mostGoalsMatch = { match: m, total };
    if (cards > 0 && (!mostCardsMatch || cards > mostCardsMatch.cards)) mostCardsMatch = { match: m, cards };
  }

  /* Mais gols por jogador num jogo só */
  let bestSoloPerformance = null;
  for (const m of real) {
    const goalsByPlayer = {};
    for (const ev of (m.events || [])) {
      if (ev.type !== 'goal' || !ev.playerName) continue;
      const k = `${ev.teamId}|${ev.playerName}`;
      goalsByPlayer[k] = (goalsByPlayer[k] || 0) + 1;
    }
    for (const [k, n] of Object.entries(goalsByPlayer)) {
      if (!bestSoloPerformance || n > bestSoloPerformance.goals) {
        const [teamId, playerName] = k.split('|');
        bestSoloPerformance = { match: m, teamId, playerName, goals: n };
      }
    }
  }

  /* Maior nota individual */
  let bestRating = null;
  for (const m of real) {
    for (const teamId of Object.keys(m.ratings || {})) {
      for (const [pname, rating] of Object.entries(m.ratings[teamId] || {})) {
        const r = parseFloat(rating);
        if (isNaN(r)) continue;
        if (!bestRating || r > bestRating.rating) {
          bestRating = { match: m, teamId, playerName: pname, rating: r };
        }
      }
    }
  }

  return { biggestRout, mostGoalsMatch, mostCardsMatch, bestSoloPerformance, bestRating };
}

/* ============================================================
   CAMINHO DO CAMPEÃO
   Retorna lista de jogos do time campeão em ordem cronológica.
   ============================================================ */
export function getChampionPath(state) {
  const champion = getChampion(state);
  if (!champion) return null;
  const championMatches = state.matches
    .filter((m) => m.played && !m.autoPlayed && (m.homeTeamId === champion.id || m.awayTeamId === champion.id))
    .sort((a, b) => (STAGE_ORDER_INDEX[matchStageKey(a)] ?? 0) - (STAGE_ORDER_INDEX[matchStageKey(b)] ?? 0));
  return { champion, matches: championMatches };
}

/* ============================================================
   POWER RANKING DE TIMES
   Score unificado considerando aproveitamento, saldo, e fase
   máxima alcançada no mata-mata.
   ============================================================ */
export function computePowerRankingTeams(state) {
  const teamStats = computeTeamStats(state);
  /* Identifica a fase máxima atingida por cada time no mata-mata */
  const stageScore = { group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third: 4.5, final: 5 };
  const maxStageByTeam = {};
  for (const m of state.matches) {
    if (m.stage === 'group' || !m.played || !m.homeTeamId || !m.awayTeamId) continue;
    const sScore = stageScore[m.stage] ?? 0;
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if ((maxStageByTeam[tid] ?? -1) < sScore) maxStageByTeam[tid] = sScore;
    }
  }
  const champ = getChampion(state);
  return teamStats
    .filter((t) => t.P > 0)
    .map((t) => {
      const winPct = t.P > 0 ? t.Pts / (t.P * 3) : 0;
      const stageBonus = (maxStageByTeam[t.teamId] ?? 0) * 4;
      const isChampion = champ?.id === t.teamId;
      const score = (winPct * 30) + (t.SG * 1.5) + stageBonus + (isChampion ? 10 : 0);
      return { ...t, stageReached: maxStageByTeam[t.teamId] ?? 0, isChampion, powerScore: score };
    })
    .sort((a, b) => b.powerScore - a.powerScore);
}

/* ============================================================
   POWER RANKING DE JOGADORES EM CAMPO
   Combina notas, gols/assistências, e fase máxima do time.
   ============================================================ */
export function computePowerRankingPlayers(state) {
  const playerStats = computePlayerStats(state);
  /* Fase máxima do time */
  const stageScore = { group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third: 4.5, final: 5 };
  const maxStageByTeam = {};
  for (const m of state.matches) {
    if (m.stage === 'group' || !m.played || !m.homeTeamId || !m.awayTeamId) continue;
    const sScore = stageScore[m.stage] ?? 0;
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if ((maxStageByTeam[tid] ?? -1) < sScore) maxStageByTeam[tid] = sScore;
    }
  }
  const champ = getChampion(state);
  return playerStats
    .filter((s) => s.ratingCount >= 1 || s.goals > 0 || s.assists > 0)
    .map((s) => {
      const avg = s.ratingCount > 0 ? s.ratingSum / s.ratingCount : 0;
      const stageBonus = (maxStageByTeam[s.teamId] ?? 0) * 3;
      const isChampionTeam = champ?.id === s.teamId;
      const cardPenalty = (s.yellows * 1) + (s.reds * 4);
      const score =
        (avg * 6) +
        (s.goals * 4) +
        (s.assists * 2) +
        stageBonus +
        (isChampionTeam ? 6 : 0) +
        Math.log2(s.ratingCount + 1) * 2 -
        cardPenalty;
      return { ...s, avg, stageReached: maxStageByTeam[s.teamId] ?? 0, isChampionTeam, powerScore: score };
    })
    .sort((a, b) => b.powerScore - a.powerScore);
}

/* ============================================================
   TIMELINE — eventos importantes em ordem cronológica reversa
   ============================================================ */
export function computeTimelineEvents(state) {
  const events = [];
  /* Helper pra "tempo" cronológico de um jogo */
  const tOf = (m) => STAGE_ORDER_INDEX[matchStageKey(m)] ?? 0;

  /* 1. Cada jogo jogado vira um evento "match-result" */
  for (const m of state.matches) {
    if (!m.played || m.autoPlayed) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    events.push({
      kind: 'match-result',
      t: tOf(m),
      match: m,
    });
  }
  /* 2. Hat-tricks (3+ gols num jogo) */
  for (const m of state.matches) {
    if (!m.played || m.autoPlayed) continue;
    const goalsByPlayer = {};
    for (const ev of (m.events || [])) {
      if (ev.type !== 'goal' || !ev.playerName) continue;
      const k = `${ev.teamId}|${ev.playerName}`;
      goalsByPlayer[k] = (goalsByPlayer[k] || 0) + 1;
    }
    for (const [k, n] of Object.entries(goalsByPlayer)) {
      if (n >= 3) {
        const [teamId, playerName] = k.split('|');
        events.push({ kind: 'hattrick', t: tOf(m) + 0.1, match: m, teamId, playerName, goals: n });
      }
    }
  }
  /* 3. Eliminação por pênaltis */
  for (const m of state.matches) {
    if (m.stage === 'group') continue;
    if (m.isExtra && m.penaltyWinner) {
      events.push({ kind: 'penalties', t: tOf(m) + 0.2, match: m });
    }
  }
  /* 4. Campeão */
  const champ = getChampion(state);
  if (champ) {
    const finalMatch = state.matches.find((m) => m.stage === 'final' && m.played);
    events.push({ kind: 'champion', t: 10, champion: champ, match: finalMatch });
  }

  events.sort((a, b) => b.t - a.t);
  return events;
}

/* ============================================================
   STATUS DO TORNEIO
   ============================================================ */
export function isTournamentFinished(state) {
  if (!state) return false;
  const finalMatches = state.matches.filter((m) => m.stage === 'final' && !m.isExtra);
  if (finalMatches.length === 0) return false;
  return finalMatches.every((m) => m.played) &&
    /* Aceitamos "decidido" se tem vencedor (não empate aberto) */
    !!getChampion(state);
}

export function getChampion(state) {
  const finals = state.matches.filter((m) => m.stage === 'final' && !m.isExtra);
  if (finals.length === 0 || !finals.every((m) => m.played)) return null;
  const outcome = getMatchOutcome(state.matches, 'final', 0);
  if (!outcome.decided) return null;
  return getTeamById(state, outcome.winner);
}

export function tournamentProgress(state) {
  const total = state.matches.length || 1;
  const played = state.matches.filter((m) => m.played).length;
  return { played, total, pct: Math.round((played / total) * 100) };
}
