/* ============================================================
   TOURNAMENT — Toda a lógica de regras, formato, estado, cálculos.
   Sem React. Funções puras. Importado por App.jsx e views/*.
   ============================================================ */

/* --- Times oficiais da Copa 2026 (sorteio 5/dez/2025 + repescagens mar/2026) --- */
const WC2026_GROUPS = [
  { letter: 'A', teams: [
    { name: 'México',             flag: '🇲🇽', pot: 1, eaRating: 77 },
    { name: 'Coreia do Sul',      flag: '🇰🇷', pot: 2, eaRating: 76 },
    { name: 'África do Sul',      flag: '🇿🇦', pot: 3, eaRating: 70 },
    { name: 'República Tcheca',   flag: '🇨🇿', pot: 4, eaRating: 73 },
  ]},
  { letter: 'B', teams: [
    { name: 'Canadá',             flag: '🇨🇦', pot: 1, eaRating: 75 },
    { name: 'Suíça',              flag: '🇨🇭', pot: 2, eaRating: 76 },
    { name: 'Catar',              flag: '🇶🇦', pot: 3, eaRating: 69 },
    { name: 'Bósnia e Herzegovina', flag: '🇧🇦', pot: 4, eaRating: 73 },
  ]},
  { letter: 'C', teams: [
    { name: 'Brasil',             flag: '🇧🇷', pot: 1, eaRating: 82 },
    { name: 'Marrocos',           flag: '🇲🇦', pot: 2, eaRating: 79 },
    { name: 'Escócia',            flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', pot: 3, eaRating: 74 },
    { name: 'Haiti',              flag: '🇭🇹', pot: 4, eaRating: 65 },
  ]},
  { letter: 'D', teams: [
    { name: 'Estados Unidos',     flag: '🇺🇸', pot: 1, eaRating: 76 },
    { name: 'Austrália',          flag: '🇦🇺', pot: 2, eaRating: 72 },
    { name: 'Paraguai',           flag: '🇵🇾', pot: 3, eaRating: 73 },
    { name: 'Turquia',            flag: '🇹🇷', pot: 4, eaRating: 75 },
  ]},
  { letter: 'E', teams: [
    { name: 'Alemanha',           flag: '🇩🇪', pot: 1, eaRating: 83 },
    { name: 'Equador',            flag: '🇪🇨', pot: 2, eaRating: 75 },
    { name: 'Costa do Marfim',    flag: '🇨🇮', pot: 3, eaRating: 76 },
    { name: 'Curaçao',            flag: '🇨🇼', pot: 4, eaRating: 65 },
  ]},
  { letter: 'F', teams: [
    { name: 'Países Baixos',      flag: '🇳🇱', pot: 1, eaRating: 83 },
    { name: 'Japão',              flag: '🇯🇵', pot: 2, eaRating: 78 },
    { name: 'Tunísia',            flag: '🇹🇳', pot: 3, eaRating: 73 },
    { name: 'Suécia',             flag: '🇸🇪', pot: 4, eaRating: 78 },
  ]},
  { letter: 'G', teams: [
    { name: 'Bélgica',            flag: '🇧🇪', pot: 1, eaRating: 81 },
    { name: 'Irã',                flag: '🇮🇷', pot: 2, eaRating: 73 },
    { name: 'Egito',              flag: '🇪🇬', pot: 3, eaRating: 75 },
    { name: 'Nova Zelândia',      flag: '🇳🇿', pot: 4, eaRating: 68 },
  ]},
  { letter: 'H', teams: [
    { name: 'Espanha',            flag: '🇪🇸', pot: 1, eaRating: 85 },
    { name: 'Uruguai',            flag: '🇺🇾', pot: 2, eaRating: 80 },
    { name: 'Arábia Saudita',     flag: '🇸🇦', pot: 3, eaRating: 70 },
    { name: 'Cabo Verde',         flag: '🇨🇻', pot: 4, eaRating: 66 },
  ]},
  { letter: 'I', teams: [
    { name: 'França',             flag: '🇫🇷', pot: 1, eaRating: 85 },
    { name: 'Senegal',            flag: '🇸🇳', pot: 2, eaRating: 78 },
    { name: 'Noruega',            flag: '🇳🇴', pot: 3, eaRating: 78 },
    { name: 'Iraque',             flag: '🇮🇶', pot: 4, eaRating: 69 },
  ]},
  { letter: 'J', teams: [
    { name: 'Argentina',          flag: '🇦🇷', pot: 1, eaRating: 83 },
    { name: 'Áustria',            flag: '🇦🇹', pot: 2, eaRating: 76 },
    { name: 'Argélia',            flag: '🇩🇿', pot: 3, eaRating: 74 },
    { name: 'Jordânia',           flag: '🇯🇴', pot: 4, eaRating: 67 },
  ]},
  { letter: 'K', teams: [
    { name: 'Portugal',           flag: '🇵🇹', pot: 1, eaRating: 84 },
    { name: 'Colômbia',           flag: '🇨🇴', pot: 2, eaRating: 77 },
    { name: 'Uzbequistão',        flag: '🇺🇿', pot: 3, eaRating: 68 },
    { name: 'RD Congo',           flag: '🇨🇩', pot: 4, eaRating: 70 },
  ]},
  { letter: 'L', teams: [
    { name: 'Inglaterra',         flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', pot: 1, eaRating: 84 },
    { name: 'Croácia',            flag: '🇭🇷', pot: 2, eaRating: 79 },
    { name: 'Gana',               flag: '🇬🇭', pot: 3, eaRating: 73 },
    { name: 'Panamá',             flag: '🇵🇦', pot: 4, eaRating: 69 },
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
  fifa: 'FIFA — amarelos zeram no mata-mata e antes das semifinais',
  resetKnockout: 'Amarelos zeram apenas no início do mata-mata',
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

/* Quais stages causam reset de amarelos, dada a regra escolhida e o formato do torneio.
   Retorna a lista de "chaves de stage" onde os yellows são zerados ao iniciar aquele stage. */
function getCardResetStages(cardRule, state) {
  if (cardRule === 'never' || cardRule === 'noSuspension') return [];

  const knockoutOrder = ['r32', 'r16', 'qf', 'sf', 'final'];
  const firstKO = knockoutOrder.find((s) => state?.matches?.some((m) => m.stage === s));
  const hasSf = state?.matches?.some((m) => m.stage === 'sf');

  if (cardRule === 'fifa') {
    /* Regra FIFA oficial: amarelos zeram (1) ao entrar no mata-mata e (2) antes das semis.
       Suspensões pendentes continuam valendo. */
    const resets = [];
    if (firstKO && firstKO !== 'sf' && firstKO !== 'final') resets.push(firstKO);
    if (hasSf) resets.push('sf');
    return resets;
  }
  if (cardRule === 'resetKnockout') {
    /* Legacy: apenas um reset no primeiro stage do mata-mata */
    return firstKO ? [firstKO] : [];
  }
  return [];
}

/* Retorna { suspended, reason }
   teamId/playerName: quem checar
   upToStageKey: pra qual jogo (NÃO incluir o próprio jogo) */
export function getPlayerCardStatus(state, teamId, playerName, upToStageKey) {
  const cardRule = state.rules?.cardRule || 'fifa';
  if (cardRule === 'noSuspension') return { suspended: false, reason: '' };

  const upToIdx = STAGE_ORDER_INDEX[upToStageKey] ?? 999;
  const resetStages = getCardResetStages(cardRule, state);
  const resetIndices = resetStages
    .map((s) => STAGE_ORDER_INDEX[s])
    .filter((idx) => typeof idx === 'number' && idx <= upToIdx)
    .sort((a, b) => a - b);

  return reEvaluateSuspension(state, teamId, playerName, upToIdx, resetIndices);
}

function reEvaluateSuspension(state, teamId, playerName, upToIdx, resetIndices) {
  /* Simula cronologicamente cada jogo:
     - Antes de processar cada jogo, se seu stage >= algum reset ainda não aplicado → zera yellows
       (mas MANTÉM suspensão pendente — resets zeram só cartões, não cumprimento)
     - Se suspenso e o jogo é REAL (não autoPlayed) → cumpre a suspensão nesse jogo
     - Auto-empates NÃO cumprem suspensão nem contam eventos
     - 2 amarelos acumulados → suspende próximo jogo, zera yellows
     - Vermelho → suspende próximo jogo */
  const previous = state.matches
    .filter((m) => m.played && (STAGE_ORDER_INDEX[matchStageKey(m)] ?? 999) < upToIdx)
    .sort((x, y) => (STAGE_ORDER_INDEX[matchStageKey(x)] ?? 0) - (STAGE_ORDER_INDEX[matchStageKey(y)] ?? 0));

  let yellows = 0;
  let suspendThisGame = false;
  let lastReason = '';
  const appliedResets = new Set();

  for (const m of previous) {
    const thisIdx = STAGE_ORDER_INDEX[matchStageKey(m)] ?? 999;

    /* Aplica todos os resets que caem antes ou nesse stage e ainda não foram aplicados */
    for (const rIdx of resetIndices) {
      if (thisIdx >= rIdx && !appliedResets.has(rIdx)) {
        yellows = 0;
        appliedResets.add(rIdx);
      }
    }

    const isTeamMatch = m.homeTeamId === teamId || m.awayTeamId === teamId;
    if (!isTeamMatch) continue;

    /* Auto-empate: não cumpre suspensão nem gera eventos.
       O jogador continua suspenso pro próximo jogo real. */
    if (m.autoPlayed) continue;

    /* Se estava suspenso, esse jogo real cumpre a suspensão */
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
  }

  /* Reset final: se algum stage de reset cai entre o último jogo e o jogo atual,
     zera yellows (irrelevante pra suspended aqui — só afeta yellows, e essa
     variável não é retornada). Mantido pra completude. */
  for (const rIdx of resetIndices) {
    if (!appliedResets.has(rIdx)) {
      yellows = 0;
      appliedResets.add(rIdx);
    }
  }

  return { suspended: suspendThisGame, reason: lastReason };
}

/* ============================================================
   TABELA DE SUSPENSOS
   Lista todos os jogadores atualmente suspensos, com próximo jogo do time.
   ============================================================ */
export function computeAllSuspended(state) {
  const result = [];
  const teams = getAllTeams(state);

  for (const team of teams) {
    /* Próximo jogo real (não autoPlayed) do time */
    const nextMatch = state.matches
      .filter((m) => !m.played && !m.autoPlayed &&
                     (m.homeTeamId === team.id || m.awayTeamId === team.id))
      .sort((a, b) =>
        (STAGE_ORDER_INDEX[matchStageKey(a)] ?? 999) - (STAGE_ORDER_INDEX[matchStageKey(b)] ?? 999))[0];

    if (!nextMatch) continue;

    const nextStageKey = matchStageKey(nextMatch);
    const roster = state.teamRosters?.[team.id] || [];

    for (const playerName of roster) {
      const status = getPlayerCardStatus(state, team.id, playerName, nextStageKey);
      if (status.suspended) {
        const oppId = nextMatch.homeTeamId === team.id ? nextMatch.awayTeamId : nextMatch.homeTeamId;
        const opponent = getTeamById(state, oppId);
        result.push({
          teamId: team.id,
          teamName: team.name,
          teamFlag: team.flag,
          owner: team.owner,
          playerName,
          reason: status.reason,
          nextMatch,
          opponent,
        });
      }
    }
  }

  /* Ordena por dono → time → jogador */
  return result.sort((a, b) => {
    if (a.owner !== b.owner) return (a.owner || '').localeCompare(b.owner || '');
    if (a.teamName !== b.teamName) return a.teamName.localeCompare(b.teamName);
    return a.playerName.localeCompare(b.playerName);
  });
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

  /* Times que já estão jogando em slots com resultado — não pode duplicar */
  const usedInPlayedSlots = new Set();
  for (const m of koFirstStage) {
    if (m.played) {
      if (m.homeTeamId) usedInPlayedSlots.add(m.homeTeamId);
      if (m.awayTeamId) usedInPlayedSlots.add(m.awayTeamId);
    }
  }

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
    const isLeg2 = m.leg === 2;
    let expectedHome = isLeg2 ? slot.away : slot.home;
    let expectedAway = isLeg2 ? slot.home : slot.away;
    /* Só sobrescreve se este match específico ainda NÃO foi jogado */
    if (m.played) return m;
    /* PROTEÇÃO ANTI-DUPLICATA: se o time esperado já está em um slot jogado,
       não coloca aqui — deixa null pro usuário resolver via swap manual */
    if (expectedHome && usedInPlayedSlots.has(expectedHome)) expectedHome = null;
    if (expectedAway && usedInPlayedSlots.has(expectedAway)) expectedAway = null;
    /* Não sobrescreve match já com times atribuídos (caso de swap manual anterior).
       Só preenche se o slot está vazio (null). */
    if (m.homeTeamId != null && m.awayTeamId != null) return m;
    if (m.homeTeamId !== expectedHome || m.awayTeamId !== expectedAway) {
      changed = true;
      return {
        ...m,
        homeTeamId: m.homeTeamId ?? expectedHome,
        awayTeamId: m.awayTeamId ?? expectedAway,
      };
    }
    return m;
  });
  return { matches: newMatches, changed };
}

/* ============================================================
   REPARO DE CHAVEAMENTO
   Detecta e limpa times duplicados no primeiro stage do mata-mata.
   Mantém jogos jogados intactos, limpa duplicatas em slots não jogados.
   ============================================================ */
export function repairKnockoutBracket(state) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) return { matches: state.matches, cleared: 0, duplicates: [] };
  if (!format.knockoutStages || format.knockoutStages.length === 0) {
    return { matches: state.matches, cleared: 0, duplicates: [] };
  }
  const firstStage = format.knockoutStages[0];
  const firstStageMatches = state.matches.filter((m) => m.stage === firstStage && !m.isExtra);

  /* Coleta times em slots jogados (source of truth) */
  const usedInPlayed = new Set();
  for (const m of firstStageMatches) {
    if (m.played) {
      if (m.homeTeamId) usedInPlayed.add(m.homeTeamId);
      if (m.awayTeamId) usedInPlayed.add(m.awayTeamId);
    }
  }

  /* Também coleta duplicatas em slots NÃO jogados */
  const seenInPending = new Set();
  const duplicates = new Set();
  for (const m of firstStageMatches) {
    if (m.played) continue;
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if (!tid) continue;
      if (usedInPlayed.has(tid) || seenInPending.has(tid)) duplicates.add(tid);
      seenInPending.add(tid);
    }
  }

  if (duplicates.size === 0) {
    return { matches: state.matches, cleared: 0, duplicates: [] };
  }

  /* Limpa duplicatas apenas em slots NÃO jogados */
  let cleared = 0;
  const seen = new Set(usedInPlayed);
  const newMatches = state.matches.map((m) => {
    if (m.stage !== firstStage || m.isExtra) return m;
    if (m.played) return m;
    let newHome = m.homeTeamId;
    let newAway = m.awayTeamId;
    if (newHome && seen.has(newHome)) { newHome = null; cleared++; }
    else if (newHome) seen.add(newHome);
    if (newAway && seen.has(newAway)) { newAway = null; cleared++; }
    else if (newAway) seen.add(newAway);
    if (newHome !== m.homeTeamId || newAway !== m.awayTeamId) {
      return { ...m, homeTeamId: newHome, awayTeamId: newAway };
    }
    return m;
  });

  return {
    matches: newMatches,
    cleared,
    duplicates: [...duplicates],
  };
}

/* ============================================================
   REGENERAR MATA-MATA (emergência)
   Apaga TODOS os jogos do mata-mata (perde placares/eventos) e
   recria o bracket usando as standings atuais dos grupos.
   ============================================================ */
export function regenerateKnockoutBracket(state) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) return state.matches;
  const groupMatches = state.matches.filter((m) => m.stage === 'group');
  const freshKO = makeKnockoutMatches(state);
  const combined = [...groupMatches, ...freshKO];
  const { matches: seeded } = recalcKnockoutSeeding({ ...state, matches: combined });
  return seeded;
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
/* ============================================================
   HELPERS DE PRORROGAÇÃO
   Prorrogação (isExtra) NÃO é um jogo separado — é uma
   continuação do último leg do confronto. Estas funções
   ajudam a agregar dados do main leg + prorrogação.
   ============================================================ */

/* Encontra a prorrogação associada a este main match.
   Retorna null se não houver, ou se este não for o último leg do confronto. */
function findExtraForMainMatch(state, mainMatch) {
  if (mainMatch.isExtra) return null;
  const legs = state.matches.filter((m) =>
    m.stage === mainMatch.stage && m.koIndex === mainMatch.koIndex && !m.isExtra);
  if (legs.length === 0) return null;
  const maxLeg = Math.max(...legs.map((l) => l.leg || 1));
  const currentLeg = mainMatch.leg || 1;
  if (currentLeg < maxLeg) return null; // prorrogação pertence ao último leg
  const extra = state.matches.find((m) =>
    m.stage === mainMatch.stage && m.koIndex === mainMatch.koIndex && m.isExtra);
  if (!extra || !extra.played) return null;
  return extra;
}

/* Retorna versão "consolidada" do main match:
   - homeScore/awayScore: main leg + prorrogação
   - events: main + prorrogação juntos
   - ratings: NÃO consolida aqui (usar getConsolidatedRatings pra ratings) */
function getConsolidatedMatch(state, mainMatch) {
  const extra = findExtraForMainMatch(state, mainMatch);
  if (!extra) return mainMatch;
  return {
    ...mainMatch,
    homeScore: (mainMatch.homeScore ?? 0) + (extra.homeScore ?? 0),
    awayScore: (mainMatch.awayScore ?? 0) + (extra.awayScore ?? 0),
    events: [...(mainMatch.events || []), ...(extra.events || [])],
  };
}

/* Retorna ratings consolidados: por jogador, média entre notas do main + prorrogação.
   Formato: { teamId → { playerName → avgRating } } */
function getConsolidatedRatings(state, mainMatch) {
  const extra = findExtraForMainMatch(state, mainMatch);
  const gather = {}; // teamId|playerName → { sum, count, teamId, playerName }
  const add = (teamId, pname, rating) => {
    if (rating == null || rating === '') return;
    const r = parseFloat(rating);
    if (isNaN(r)) return;
    const key = `${teamId}|${pname}`;
    if (!gather[key]) gather[key] = { sum: 0, count: 0, teamId, playerName: pname };
    gather[key].sum += r;
    gather[key].count++;
  };
  for (const teamId of Object.keys(mainMatch.ratings || {})) {
    for (const [pname, r] of Object.entries(mainMatch.ratings[teamId] || {})) {
      add(teamId, pname, r);
    }
  }
  if (extra) {
    for (const teamId of Object.keys(extra.ratings || {})) {
      for (const [pname, r] of Object.entries(extra.ratings[teamId] || {})) {
        add(teamId, pname, r);
      }
    }
  }
  const result = {};
  for (const { teamId, playerName, sum, count } of Object.values(gather)) {
    if (!result[teamId]) result[teamId] = {};
    result[teamId][playerName] = sum / count;
  }
  return result;
}

/* ============================================================
   ESTATÍSTICAS DE JOGADORES
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

  /* Itera cada MAIN MATCH (leg regular); a prorrogação é "absorvida" pelo main. */
  const mainMatches = state.matches.filter((m) => m.played && !m.autoPlayed && !m.isExtra);

  for (const mainMatch of mainMatches) {
    /* Eventos: soma main + prorrogação */
    const consolidated = getConsolidatedMatch(state, mainMatch);
    for (const ev of (consolidated.events || [])) {
      if (!ev.playerName) continue;
      const stat = ensure(ev.teamId, ev.playerName);
      if (ev.type === 'goal') stat.goals++;
      else if (ev.type === 'assist') stat.assists++;
      else if (ev.type === 'yellow') stat.yellows++;
      else if (ev.type === 'red') stat.reds++;
    }
    /* Ratings: MÉDIA entre nota do main e nota da prorrogação (por jogador).
       Conta como 1 partida só. */
    const ratings = getConsolidatedRatings(state, mainMatch);
    for (const teamId of Object.keys(ratings)) {
      for (const [pname, avg] of Object.entries(ratings[teamId])) {
        const stat = ensure(teamId, pname);
        stat.ratingSum += avg;
        stat.ratingCount++;
        stat.matchesPlayed++;
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

  const mainMatches = state.matches.filter((m) => m.played && !m.autoPlayed && !m.isExtra);
  for (const mainMatch of mainMatches) {
    if (!mainMatch.homeTeamId || !mainMatch.awayTeamId) continue;
    const consolidated = getConsolidatedMatch(state, mainMatch);
    const h = ensure(mainMatch.homeTeamId);
    const a = ensure(mainMatch.awayTeamId);
    h.P++; a.P++;
    h.GP += consolidated.homeScore; h.GC += consolidated.awayScore;
    a.GP += consolidated.awayScore; a.GC += consolidated.homeScore;
    if (consolidated.homeScore > consolidated.awayScore)      { h.V++; a.D++; h.Pts += 3; }
    else if (consolidated.homeScore < consolidated.awayScore) { a.V++; h.D++; a.Pts += 3; }
    else                                                       { h.E++; a.E++; h.Pts += 1; a.Pts += 1; }

    for (const ev of (consolidated.events || [])) {
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
    if (!m.played || m.autoPlayed || m.isExtra) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const home = getTeamById(state, m.homeTeamId);
    const away = getTeamById(state, m.awayTeamId);
    if (!home?.owner || !away?.owner) continue;
    if (home.owner === away.owner) continue;
    const consolidated = getConsolidatedMatch(state, m);
    result.totalMatches++;
    const p1IsHome = home.owner === 'p1';
    const p1Score = p1IsHome ? consolidated.homeScore : consolidated.awayScore;
    const p2Score = p1IsHome ? consolidated.awayScore : consolidated.homeScore;
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
  const mainMatches = state.matches.filter((m) => m.played && !m.autoPlayed && !m.isExtra && m.homeTeamId && m.awayTeamId);
  if (mainMatches.length === 0) return null;

  /* Consolida cada main match com sua prorrogação */
  const real = mainMatches.map((m) => getConsolidatedMatch(state, m));

  /* Maior goleada (maior diferença, desempate por mais gols totais) */
  let biggestRout = null;
  let mostGoalsMatch = null;
  let mostCardsMatch = null;
  for (const m of real) {
    const diff = Math.abs(m.homeScore - m.awayScore);
    const total = m.homeScore + m.awayScore;
    const cards = (m.events || []).filter((e) => e.type === 'yellow' || e.type === 'red').length;
    if (!biggestRout ||
        diff > biggestRout.diff ||
        (diff === biggestRout.diff && total > biggestRout.total)) {
      biggestRout = { match: m, diff, total };
    }
    if (!mostGoalsMatch || total > mostGoalsMatch.total) mostGoalsMatch = { match: m, total };
    if (cards > 0 && (!mostCardsMatch || cards > mostCardsMatch.cards)) mostCardsMatch = { match: m, cards };
  }

  /* Mais gols por jogador num jogo só (soma main + prorrogação) */
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

  /* Maior nota individual do torneio (usa média consolidada do confronto) */
  let bestRating = null;
  for (const mm of mainMatches) {
    const ratings = getConsolidatedRatings(state, mm);
    for (const teamId of Object.keys(ratings)) {
      for (const [pname, r] of Object.entries(ratings[teamId])) {
        if (!bestRating || r > bestRating.rating) {
          bestRating = { match: getConsolidatedMatch(state, mm), teamId, playerName: pname, rating: r };
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
    .filter((m) => m.played && !m.autoPlayed && !m.isExtra &&
                   (m.homeTeamId === champion.id || m.awayTeamId === champion.id))
    .sort((a, b) => (STAGE_ORDER_INDEX[matchStageKey(a)] ?? 0) - (STAGE_ORDER_INDEX[matchStageKey(b)] ?? 0))
    .map((m) => getConsolidatedMatch(state, m));
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
      /* Score combina:
         - Aproveitamento (peso 30)
         - Saldo de gols (peso 1.5)
         - Gols pró (peso 0.5) → desempate quando saldo é igual
         - Bônus por fase atingida no mata-mata
         - Bônus por ser campeão */
      const score = (winPct * 30) + (t.SG * 1.5) + (t.GP * 0.5) + stageBonus + (isChampion ? 10 : 0);
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

  /* 1. Cada CONFRONTO jogado vira um evento "match-result" (usa placar consolidado) */
  for (const mainMatch of state.matches) {
    if (!mainMatch.played || mainMatch.autoPlayed || mainMatch.isExtra) continue;
    if (!mainMatch.homeTeamId || !mainMatch.awayTeamId) continue;
    const m = getConsolidatedMatch(state, mainMatch);
    events.push({
      kind: 'match-result',
      t: tOf(m),
      match: m,
    });
  }
  /* 2. Hat-tricks (3+ gols num jogo — soma main + prorrogação) */
  for (const mainMatch of state.matches) {
    if (!mainMatch.played || mainMatch.autoPlayed || mainMatch.isExtra) continue;
    const m = getConsolidatedMatch(state, mainMatch);
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
   SEQUÊNCIAS (STREAKS)
   Maior sequência de vitórias e maior invencibilidade de cada time
   ============================================================ */
export function computeTeamStreaks(state) {
  /* Reúne jogos por time em ordem cronológica do torneio (main matches apenas) */
  const matchesByTeam = {};
  const mainMatches = state.matches.filter((m) => m.played && !m.autoPlayed && !m.isExtra && m.homeTeamId && m.awayTeamId);
  mainMatches.sort((a, b) => (STAGE_ORDER_INDEX[matchStageKey(a)] ?? 0) - (STAGE_ORDER_INDEX[matchStageKey(b)] ?? 0));
  for (const mainMatch of mainMatches) {
    const m = getConsolidatedMatch(state, mainMatch);
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if (!matchesByTeam[tid]) matchesByTeam[tid] = [];
      const isHome = m.homeTeamId === tid;
      const ownScore = isHome ? m.homeScore : m.awayScore;
      const oppScore = isHome ? m.awayScore : m.homeScore;
      /* Pro mata-mata, considera resultado real (incluindo pênaltis se houver) */
      let result;
      if (m.stage !== 'group') {
        const outcome = getMatchOutcome(state.matches, m.stage, m.koIndex);
        if (outcome.decided) {
          result = outcome.winner === tid ? 'W' : 'L';
        } else {
          result = ownScore > oppScore ? 'W' : ownScore < oppScore ? 'L' : 'D';
        }
      } else {
        result = ownScore > oppScore ? 'W' : ownScore < oppScore ? 'L' : 'D';
      }
      matchesByTeam[tid].push(result);
    }
  }
  /* Computa streaks */
  const streaks = [];
  for (const tid of Object.keys(matchesByTeam)) {
    const team = getTeamById(state, tid);
    if (!team) continue;
    const seq = matchesByTeam[tid];
    let winStreak = 0, currentWinStreak = 0;
    let unbeatenStreak = 0, currentUnbeatenStreak = 0;
    for (const r of seq) {
      if (r === 'W') {
        currentWinStreak++;
        currentUnbeatenStreak++;
      } else if (r === 'D') {
        currentWinStreak = 0;
        currentUnbeatenStreak++;
      } else {
        currentWinStreak = 0;
        currentUnbeatenStreak = 0;
      }
      if (currentWinStreak > winStreak) winStreak = currentWinStreak;
      if (currentUnbeatenStreak > unbeatenStreak) unbeatenStreak = currentUnbeatenStreak;
    }
    streaks.push({
      teamId: tid,
      teamName: team.name,
      teamFlag: team.flag,
      owner: team.owner,
      winStreak,
      unbeatenStreak,
      currentWinStreak,
      currentUnbeatenStreak,
      gamesPlayed: seq.length,
    });
  }
  return streaks;
}

/* ============================================================
   CLEAN SHEETS
   Jogos em que o time não sofreu gols + goleiros atribuídos
   ============================================================ */
export function computeCleanSheets(state) {
  const map = {};
  const mainMatches = state.matches.filter((m) => m.played && !m.autoPlayed && !m.isExtra && m.homeTeamId && m.awayTeamId);
  for (const mainMatch of mainMatches) {
    const m = getConsolidatedMatch(state, mainMatch);
    if (!map[m.homeTeamId]) map[m.homeTeamId] = { teamId: m.homeTeamId, played: 0, cleanSheets: 0, goalsConceded: 0 };
    if (!map[m.awayTeamId]) map[m.awayTeamId] = { teamId: m.awayTeamId, played: 0, cleanSheets: 0, goalsConceded: 0 };
    map[m.homeTeamId].played++;
    map[m.homeTeamId].goalsConceded += m.awayScore;
    if (m.awayScore === 0) map[m.homeTeamId].cleanSheets++;
    map[m.awayTeamId].played++;
    map[m.awayTeamId].goalsConceded += m.homeScore;
    if (m.homeScore === 0) map[m.awayTeamId].cleanSheets++;
  }
  /* Anexa info do time + goleiros atribuídos */
  const result = Object.values(map).map((row) => {
    const team = getTeamById(state, row.teamId);
    if (!team) return null;
    /* Procura goleiros atribuídos no roster do time */
    const goalkeepers = (state.teamRosters?.[row.teamId] || [])
      .filter((name) => state.playerPositions?.[`${row.teamId}|${name}`] === 'GOL');
    return {
      ...row,
      teamName: team.name,
      teamFlag: team.flag,
      owner: team.owner,
      goalkeepers,
    };
  }).filter(Boolean);
  return result.sort((a, b) => b.cleanSheets - a.cleanSheets || a.goalsConceded - b.goalsConceded);
}

/* ============================================================
   DEPENDÊNCIA OFENSIVA
   % dos gols do time em que o jogador participou (gol ou assist)
   ============================================================ */
export function computeOffensiveDependency(state) {
  /* Total de gols por time (apenas gols feitos POR esse time, não contra) */
  const goalsByTeam = {};
  /* Participações (gol + assist) por jogador */
  const participationByPlayer = {}; // 'teamId|playerName' → count
  const goalsByPlayer = {};
  const assistsByPlayer = {};

  const mainMatches = state.matches.filter((m) => m.played && !m.autoPlayed && !m.isExtra);
  for (const mainMatch of mainMatches) {
    const m = getConsolidatedMatch(state, mainMatch);
    goalsByTeam[m.homeTeamId] = (goalsByTeam[m.homeTeamId] || 0) + m.homeScore;
    goalsByTeam[m.awayTeamId] = (goalsByTeam[m.awayTeamId] || 0) + m.awayScore;
    for (const ev of (m.events || [])) {
      if (!ev.playerName || !ev.teamId) continue;
      const k = `${ev.teamId}|${ev.playerName}`;
      if (ev.type === 'goal') {
        goalsByPlayer[k] = (goalsByPlayer[k] || 0) + 1;
        participationByPlayer[k] = (participationByPlayer[k] || 0) + 1;
      } else if (ev.type === 'assist') {
        assistsByPlayer[k] = (assistsByPlayer[k] || 0) + 1;
        participationByPlayer[k] = (participationByPlayer[k] || 0) + 1;
      }
    }
  }
  /* Monta o ranking — só jogadores cujo time fez ao menos 2 gols */
  const result = [];
  for (const k of Object.keys(participationByPlayer)) {
    const [teamId, playerName] = k.split('|');
    const team = getTeamById(state, teamId);
    if (!team) continue;
    const teamGoals = goalsByTeam[teamId] || 0;
    if (teamGoals < 2) continue;
    const participations = participationByPlayer[k];
    const pct = (participations / teamGoals) * 100;
    result.push({
      teamId,
      teamName: team.name,
      teamFlag: team.flag,
      owner: team.owner,
      playerName,
      goals: goalsByPlayer[k] || 0,
      assists: assistsByPlayer[k] || 0,
      participations,
      teamGoals,
      percentage: pct,
    });
  }
  return result.sort((a, b) => b.percentage - a.percentage || b.participations - a.participations);
}

/* ============================================================
   SURPRESA DO TORNEIO
   Times de pote 3 ou 4 que se destacaram (pontuação + fase atingida)
   ============================================================ */
export function computeTournamentSurprises(state) {
  const stats = computeTeamStats(state);
  const stageScore = { group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third: 4.5, final: 5 };
  const maxStageByTeam = {};
  for (const m of state.matches) {
    if (m.stage === 'group' || !m.played || !m.homeTeamId || !m.awayTeamId) continue;
    const sScore = stageScore[m.stage] ?? 0;
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if ((maxStageByTeam[tid] ?? -1) < sScore) maxStageByTeam[tid] = sScore;
    }
  }
  const stageName = { 0: 'Grupos', 1: 'R32', 2: 'R16', 3: 'QF', 4: 'SF', 4.5: '3º lugar', 5: 'Final' };
  return stats
    .filter((t) => t.P > 0)
    .map((t) => {
      const team = getTeamById(state, t.teamId);
      if (!team || (team.pot ?? 1) < 3) return null;
      const stageReached = maxStageByTeam[t.teamId] ?? 0;
      /* Score: pontos por jogo × 5 + fase atingida × 8 + saldo × 1 — favorece times que avançaram */
      const surpriseScore = ((t.Pts / Math.max(1, t.P)) * 5) + (stageReached * 8) + t.SG;
      return {
        ...t,
        pot: team.pot,
        stageReached,
        stageLabel: stageName[stageReached] || 'Grupos',
        surpriseScore,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.surpriseScore - a.surpriseScore);
}

/* ============================================================
   CENÁRIOS DE CLASSIFICAÇÃO (FASE DE GRUPOS)
   Pra um jogo específico, mostra como a classificação fica
   com cada resultado possível + status matemático de cada time
   ============================================================ */
function simulateGroupStandingForScenario(state, groupLetter, simulatedMatches) {
  /* Cria um state "virtual" usando os matches simulados pra esse grupo */
  const otherMatches = state.matches.filter((m) => !(m.stage === 'group' && m.group === groupLetter));
  const virtualState = { ...state, matches: [...otherMatches, ...simulatedMatches] };
  return computeGroupStanding(virtualState, groupLetter);
}

export function computeGroupScenarios(state, matchId) {
  const m = state.matches.find((mm) => mm.id === matchId);
  if (!m || m.stage !== 'group') return null;
  if (m.played) return null; /* já tem resultado, sem cenários */

  const format = getFormat(state.formatId);
  const groupLetter = m.group;
  const home = getTeamById(state, m.homeTeamId);
  const away = getTeamById(state, m.awayTeamId);

  /* Para cada resultado plausível, simula a classificação */
  const scenarios = [
    { key: 'home_wins',  label: `Vitória ${home?.name}`, homeScore: 2, awayScore: 1 },
    { key: 'draw',       label: 'Empate',                 homeScore: 1, awayScore: 1 },
    { key: 'away_wins',  label: `Vitória ${away?.name}`,  homeScore: 1, awayScore: 2 },
  ];

  const allGroupMatches = state.matches.filter((mm) => mm.stage === 'group' && mm.group === groupLetter);
  const firstStage = format.hasGroups ? format.knockoutStages[0] : null;

  const result = scenarios.map((sc) => {
    /* Constrói state virtual com este resultado simulado */
    const simulated = allGroupMatches.map((mm) => {
      if (mm.id === matchId) {
        return { ...mm, played: true, homeScore: sc.homeScore, awayScore: sc.awayScore };
      }
      return mm;
    });
    const otherMatches = state.matches.filter((mm) => !(mm.stage === 'group' && mm.group === groupLetter));
    const virtualState = { ...state, matches: [...otherMatches, ...simulated] };

    const standing = computeGroupStanding(virtualState, groupLetter);

    /* Simula seeding do mata-mata pra esse cenário */
    let matchups = [];
    if (firstStage) {
      const { matches: simSeededMatches } = recalcKnockoutSeeding(virtualState);
      const koLeg1 = simSeededMatches.filter((mm) => mm.stage === firstStage && !mm.isExtra && (mm.leg === 1 || mm.leg == null));
      matchups = standing.map((row, idx) => {
        const ko = koLeg1.find((km) => km.homeTeamId === row.id || km.awayTeamId === row.id);
        let opponent = null;
        let qualified = false;
        if (ko) {
          qualified = true;
          const oppId = ko.homeTeamId === row.id ? ko.awayTeamId : ko.homeTeamId;
          if (oppId) opponent = getTeamById(virtualState, oppId);
        }
        return {
          teamId: row.id,
          teamFlag: row.flag,
          teamName: row.name,
          position: idx + 1,
          qualified,
          opponent,
        };
      });
    }

    return { ...sc, standing, matchups };
  });

  return { match: m, group: groupLetter, scenarios: result };
}

/* ============================================================
   MÍNIMO NECESSÁRIO PARA CLASSIFICAÇÃO
   Foca em top 2 do grupo. Se o time não puder mais ficar em top 2,
   verifica se pode chegar em 3º (com label deixando claro que é
   apenas pra disputar vaga de melhor 3º, sem garantia).
   ============================================================ */
export function computeGroupMinimumNeeds(state, groupLetter, currentMatchId) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) return {};

  const groupObj = state.groups.find((g) => g.letter === groupLetter);
  if (!groupObj) return {};

  const currentMatch = state.matches.find((m) => m.id === currentMatchId);
  if (!currentMatch || currentMatch.played || currentMatch.stage !== 'group') return {};

  const allGroupMatches = state.matches.filter((m) => m.stage === 'group' && m.group === groupLetter);
  const otherMatches = state.matches.filter((mm) => !(mm.stage === 'group' && mm.group === groupLetter));
  const otherPending = allGroupMatches.filter((m) => !m.played && m.id !== currentMatchId);

  /* Limita combinatória: outros pendentes deste grupo ≤ 3 (3^3 = 27 cenários por margem) */
  if (otherPending.length > 3) return {};

  const bestThirdsCount = format.bestThirds || 0;

  /* Retorna posição final do time num cenário simulado */
  const teamPosition = (simulatedGroupMatches, teamId) => {
    const vs = { ...state, matches: [...otherMatches, ...simulatedGroupMatches] };
    const standing = computeGroupStanding(vs, groupLetter);
    return standing.findIndex((r) => r.id === teamId);
  };

  const buildSimulated = (currentHome, currentAway, otherOutcomes) => {
    return allGroupMatches.map((m) => {
      if (m.played) return m;
      if (m.id === currentMatchId) {
        return { ...m, played: true, homeScore: currentHome, awayScore: currentAway };
      }
      const pIdx = otherPending.findIndex((p) => p.id === m.id);
      const outcome = otherOutcomes[pIdx];
      let hs, as;
      if (outcome === 0) { hs = 2; as = 1; }
      else if (outcome === 1) { hs = 1; as = 1; }
      else { hs = 1; as = 2; }
      return { ...m, played: true, homeScore: hs, awayScore: as };
    });
  };

  /* Avalia placar: retorna flags { allTop2, someTop2, someTop3 } sobre todos
     os cenários dos outros pendentes do grupo. top3 = posição ≤ 2 (0-indexed). */
  const evalScore = (teamId, currentHome, currentAway) => {
    let allTop2 = true, someTop2 = false, someTop3 = false;
    const numOther = Math.pow(3, otherPending.length);
    for (let i = 0; i < numOther; i++) {
      let n = i;
      const outcomes = otherPending.map(() => { const r = n % 3; n = Math.floor(n / 3); return r; });
      const simulated = buildSimulated(currentHome, currentAway, outcomes);
      const pos = teamPosition(simulated, teamId);
      if (pos < 2) { someTop2 = true; }
      else { allTop2 = false; }
      if (pos <= 2) someTop3 = true;
    }
    return { allTop2, someTop2, someTop3 };
  };

  const labelForMargin = (m) => {
    if (m >= 4) return 'Vitória por 4+ gols';
    if (m >= 1) return m === 1 ? 'Vitória por 1 gol' : `Vitória por ${m} gols`;
    if (m === 0) return 'Empate';
    if (m === -1) return 'Pode perder por 1 gol';
    return `Pode perder por até ${Math.abs(m)} gols`;
  };

  const determineNeeds = (teamId) => {
    const isHome = teamId === currentMatch.homeTeamId;
    const isAway = teamId === currentMatch.awayTeamId;

    /* === Time NÃO joga o match atual === */
    if (!isHome && !isAway) {
      const allPending = [currentMatch, ...otherPending];
      if (allPending.length > 4) return { type: 'unknown', label: 'Análise indisponível' };
      let allTop2 = true, someTop2 = false, someTop3 = false;
      const numTotal = Math.pow(3, allPending.length);
      for (let i = 0; i < numTotal; i++) {
        let n = i;
        const outcomes = allPending.map(() => { const r = n % 3; n = Math.floor(n / 3); return r; });
        const simulated = allGroupMatches.map((m) => {
          if (m.played) return m;
          const pIdx = allPending.findIndex((p) => p.id === m.id);
          const outcome = outcomes[pIdx];
          let hs, as;
          if (outcome === 0) { hs = 2; as = 1; }
          else if (outcome === 1) { hs = 1; as = 1; }
          else { hs = 1; as = 2; }
          return { ...m, played: true, homeScore: hs, awayScore: as };
        });
        const pos = teamPosition(simulated, teamId);
        if (pos < 2) someTop2 = true; else allTop2 = false;
        if (pos <= 2) someTop3 = true;
      }
      if (allTop2) return { type: 'guaranteed', label: 'Já classificado' };
      if (someTop2) return { type: 'depends_others', label: 'Depende dos outros jogos do grupo' };
      if (someTop3 && bestThirdsCount > 0) return { type: 'third_only', label: 'Só pode disputar vaga de 3º' };
      return { type: 'impossible', label: 'Já eliminado' };
    }

    /* === Time JOGA o match atual: avalia cada margem === */
    const buildScore = (margin) => {
      if (margin > 0) return isHome ? [margin, 0] : [0, margin];
      if (margin < 0) return isHome ? [0, -margin] : [-margin, 0];
      return [1, 1];
    };

    const margins = [4, 3, 2, 1, 0, -1, -2, -3, -4];
    const evaluated = margins.map((margin) => {
      const [hs, as] = buildScore(margin);
      return { margin, hs, as, ...evalScore(teamId, hs, as) };
    });

    /* Caso 1: já classificado em qualquer cenário */
    if (evaluated.every((e) => e.allTop2)) {
      return { type: 'guaranteed', label: 'Já classificado' };
    }

    /* Caso 2: existe margem que GARANTE top 2 */
    const worstAcceptable = [...evaluated]
      .filter((e) => e.allTop2)
      .sort((a, b) => a.margin - b.margin)[0];

    if (worstAcceptable) {
      const m = worstAcceptable.margin;
      const baseLabel = labelForMargin(m);
      const label = m === 0 ? 'Empate basta' : baseLabel;
      return { type: 'needs_min', label, margin: m };
    }

    /* Caso 3: nenhuma margem garante, mas alguma ainda PERMITE top 2 (vence + ajuda) */
    const anyTop2 = evaluated.some((e) => e.someTop2);
    if (anyTop2) {
      const minWinForChance = [...evaluated]
        .filter((e) => e.someTop2 && e.margin > 0)
        .sort((a, b) => a.margin - b.margin)[0];
      if (minWinForChance) {
        const m = minWinForChance.margin;
        const label = m === 1 ? 'Vencer + ajuda' :
                      m >= 4 ? 'Vencer por 4+ gols + ajuda' :
                      `Vencer por ${m}+ gols + ajuda`;
        return { type: 'needs_help', label, margin: m };
      }
      return { type: 'depends_others', label: 'Depende de combinação' };
    }

    /* Caso 4: time já não pode mais pegar top 2 — verifica se pode pegar 3º.
       Só ativa se houver vaga de melhores 3ºs no formato. */
    if (bestThirdsCount > 0) {
      const top3Margins = evaluated.filter((e) => e.someTop3);
      if (top3Margins.length > 0) {
        const worstForThird = [...top3Margins].sort((a, b) => a.margin - b.margin)[0];
        const m = worstForThird.margin;
        const base = labelForMargin(m);
        const label = m === 0 ? `${base} pra disputar 3º` : `${base} pra disputar 3º`;
        return {
          type: 'third_chase',
          label,
          detail: 'Vaga de melhor 3º não é garantida',
          margin: m,
        };
      }
    }

    return { type: 'impossible', label: 'Já eliminado' };
  };

  const result = {};
  for (const team of groupObj.teams) {
    result[team.id] = determineNeeds(team.id);
  }
  return result;
}

/* ============================================================
   VISÃO POR TIME DO GRUPO
   Para cada time, encontra seu próximo jogo pendente e calcula
   o que precisa nele (usando computeGroupMinimumNeeds).
   ============================================================ */
export function computeGroupTeamsOverview(state, groupLetter) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) return [];

  const groupObj = state.groups.find((g) => g.letter === groupLetter);
  if (!groupObj) return [];

  const bestThirdsCount = format.bestThirds || 0;

  const result = [];
  for (const team of groupObj.teams) {
    const teamPending = state.matches
      .filter((m) => m.stage === 'group' && m.group === groupLetter && !m.played &&
                     (m.homeTeamId === team.id || m.awayTeamId === team.id))
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

    if (teamPending.length === 0) {
      /* Time já jogou tudo — status fixo */
      const standing = computeGroupStanding(state, groupLetter);
      const pos = standing.findIndex((r) => r.id === team.id);
      let need;
      if (pos < 2) {
        need = { type: 'guaranteed', label: `Classificado em ${pos === 0 ? '1º' : '2º'} lugar` };
      } else if (pos === 2 && bestThirdsCount > 0) {
        const bt = computeBestThirds(state);
        const me = bt.find((t) => t.id === team.id);
        if (me?.qualified) {
          need = { type: 'third_in', label: 'Provisoriamente nos melhores 3ºs', detail: 'Depende dos demais grupos' };
        } else {
          need = { type: 'third_out', label: 'Fora dos melhores 3ºs', detail: 'Aguarda resultados dos outros grupos' };
        }
      } else {
        need = { type: 'impossible', label: 'Eliminado' };
      }
      result.push({ team, nextMatch: null, opponent: null, need });
      continue;
    }

    const nextMatch = teamPending[0];
    const allNeeds = computeGroupMinimumNeeds(state, groupLetter, nextMatch.id);
    const oppId = nextMatch.homeTeamId === team.id ? nextMatch.awayTeamId : nextMatch.homeTeamId;
    const opponent = getTeamById(state, oppId);
    result.push({ team, nextMatch, opponent, need: allNeeds[team.id] });
  }

  return result;
}

/* Status matemático de cada time num grupo:
   - 'classified': matematicamente classificado (mesmo nos piores cenários)
   - 'eliminated': matematicamente eliminado (mesmo nos melhores cenários)
   - 'in_dispute': ainda em jogo */
export function computeGroupTeamStatus(state, groupLetter) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) return {};

  const allGroupMatches = state.matches.filter((m) => m.stage === 'group' && m.group === groupLetter);
  const groupObj = state.groups.find((g) => g.letter === groupLetter);
  const teamsInGroup = (groupObj?.teams || []).map((t) => t.id);
  const pendingMatches = allGroupMatches.filter((m) => !m.played);
  const status = {};

  /* Função pra contar pontos de um time num cenário de matches simulado */
  const computePoints = (simMatches, teamId) => {
    let pts = 0;
    for (const m of simMatches) {
      if (!m.played || m.autoPlayed) continue;
      if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue;
      const isHome = m.homeTeamId === teamId;
      const own = isHome ? m.homeScore : m.awayScore;
      const opp = isHome ? m.awayScore : m.homeScore;
      if (own > opp) pts += 3;
      else if (own === opp) pts += 1;
    }
    return pts;
  };

  for (const teamId of teamsInGroup) {
    /* Best case: time ganha todos os jogos restantes seus por 3-0,
       todos os outros pendentes acabam empatados */
    const bestSim = allGroupMatches.map((m) => {
      if (m.played) return m;
      if (m.homeTeamId === teamId) return { ...m, played: true, homeScore: 3, awayScore: 0 };
      if (m.awayTeamId === teamId) return { ...m, played: true, homeScore: 0, awayScore: 3 };
      return { ...m, played: true, homeScore: 0, awayScore: 0 };
    });
    /* Worst case: time perde todos por 0-3, outros pendentes os adversários do time ganham */
    const worstSim = allGroupMatches.map((m) => {
      if (m.played) return m;
      if (m.homeTeamId === teamId) return { ...m, played: true, homeScore: 0, awayScore: 3 };
      if (m.awayTeamId === teamId) return { ...m, played: true, homeScore: 3, awayScore: 0 };
      /* outros — assume melhor para os adversários (vitória do mandante) */
      return { ...m, played: true, homeScore: 3, awayScore: 0 };
    });

    const bestStanding = simulateGroupStandingForScenario(state, groupLetter, bestSim);
    const worstStanding = simulateGroupStandingForScenario(state, groupLetter, worstSim);

    const bestPos = bestStanding.findIndex((r) => r.id === teamId) + 1;
    const worstPos = worstStanding.findIndex((r) => r.id === teamId) + 1;

    /* Define quantos do grupo se classificam direto (top 2) */
    const directQualified = 2;

    let s;
    if (worstPos <= directQualified) s = 'classified';  /* mesmo no pior cenário fica no top 2 */
    else if (bestPos > directQualified + (format.bestThirds > 0 ? 1 : 0)) s = 'eliminated';
    else s = 'in_dispute';

    status[teamId] = {
      status: s,
      bestPos,
      worstPos,
      gamesRemaining: pendingMatches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId).length,
    };
  }
  return status;
}

/* ============================================================
   DADOS DE UM TIME (página de detalhe)
   ============================================================ */
export function computeTeamDetail(state, teamId) {
  const team = getTeamById(state, teamId);
  if (!team) return null;

  /* Só jogos main (não isExtra) do time em ordem cronológica */
  const mainMatches = state.matches
    .filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.played && !m.autoPlayed && !m.isExtra)
    .sort((a, b) => (STAGE_ORDER_INDEX[matchStageKey(a)] ?? 0) - (STAGE_ORDER_INDEX[matchStageKey(b)] ?? 0));

  /* Consolida cada main match com sua prorrogação (placar e eventos) */
  const matches = mainMatches.map((m) => getConsolidatedMatch(state, m));

  /* Stats agregados */
  let GP = 0, GC = 0, V = 0, E = 0, D = 0;
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    const own = isHome ? m.homeScore : m.awayScore;
    const opp = isHome ? m.awayScore : m.homeScore;
    GP += own;
    GC += opp;
    if (own > opp) V++;
    else if (own < opp) D++;
    else E++;
  }
  const P = matches.length;
  const Pts = V * 3 + E;
  const SG = GP - GC;
  const winPct = P > 0 ? Math.round((Pts / (P * 3)) * 100) : 0;

  /* Jogadores: nomes do roster + quem apareceu em eventos/ratings (incluindo extra) */
  const playerNames = new Set(state.teamRosters?.[teamId] || []);
  for (const m of matches) {
    for (const ev of (m.events || [])) {
      if (ev.teamId === teamId && ev.playerName) playerNames.add(ev.playerName);
    }
  }
  /* Ratings do main + extra */
  for (const mm of mainMatches) {
    if (mm.ratings && mm.ratings[teamId]) {
      for (const p of Object.keys(mm.ratings[teamId])) playerNames.add(p);
    }
    const extra = findExtraForMainMatch(state, mm);
    if (extra?.ratings && extra.ratings[teamId]) {
      for (const p of Object.keys(extra.ratings[teamId])) playerNames.add(p);
    }
  }

  const playerStats = computePlayerStats(state).filter((p) => p.teamId === teamId);
  const stMap = {};
  for (const ps of playerStats) stMap[ps.playerName] = ps;
  const allPlayers = Array.from(playerNames).map((pname) => {
    const ps = stMap[pname];
    return ps || {
      teamId, teamName: team.name, teamFlag: team.flag, owner: team.owner,
      playerName: pname, goals: 0, assists: 0, yellows: 0, reds: 0,
      ratingSum: 0, ratingCount: 0,
    };
  });

  return { team, matches, P, V, E, D, GP, GC, SG, Pts, winPct, players: allPlayers };
}

/* ============================================================
   RANKINGS DE EQUIPES — melhor ataque/defesa/cartões
   ============================================================ */
export function computeTeamRankings(state) {
  const teamStats = computeTeamStats(state).filter((t) => t.P > 0);

  /* Computa cartões por time agregando os eventos */
  const cardsByTeam = {};
  for (const m of state.matches) {
    if (!m.played || m.autoPlayed) continue;
    for (const ev of (m.events || [])) {
      if (ev.type !== 'yellow' && ev.type !== 'red') continue;
      if (!cardsByTeam[ev.teamId]) cardsByTeam[ev.teamId] = { yellows: 0, reds: 0 };
      if (ev.type === 'yellow') cardsByTeam[ev.teamId].yellows++;
      else cardsByTeam[ev.teamId].reds++;
    }
  }

  const enriched = teamStats.map((t) => {
    const c = cardsByTeam[t.teamId] || { yellows: 0, reds: 0 };
    return { ...t, yellows: c.yellows, reds: c.reds, totalCards: c.yellows + c.reds * 2 };
  });

  return {
    bestAttack:   [...enriched].sort((a, b) => (b.GP / b.P) - (a.GP / a.P) || b.GP - a.GP),
    bestDefense:  [...enriched].sort((a, b) => (a.GC / a.P) - (b.GC / b.P) || a.GC - b.GC),
    mostCards:    [...enriched].filter((t) => t.totalCards > 0).sort((a, b) => b.totalCards - a.totalCards),
    cleanestTeams: [...enriched].sort((a, b) => a.totalCards - b.totalCards || b.P - a.P),
  };
}

/* ============================================================
   RODADAS DISPONÍVEIS DO TORNEIO
   Retorna lista de "etapas" pra navegação (Grupos R1/R2/R3 + mata-mata)
   ============================================================ */
export function getAllRoundKeys(state) {
  const format = getFormat(state.formatId);
  const rounds = [];
  if (format.hasGroups) {
    /* Cada rodada de grupo é uma "rodada" */
    const groupRounds = new Set();
    for (const m of state.matches) {
      if (m.stage === 'group' && m.round) groupRounds.add(m.round);
    }
    const sorted = [...groupRounds].sort((a, b) => a - b);
    for (const r of sorted) {
      rounds.push({ key: `group_r${r}`, label: `Grupos · R${r}`, stage: 'group', round: r });
    }
  }
  for (const ks of (format.knockoutStages || [])) {
    rounds.push({ key: ks, label: STAGE_LABELS[ks] || ks, stage: ks });
  }
  return rounds;
}

/* Filtra MAIN matches que pertencem a uma rodada específica (não isExtra) */
function matchesInRound(state, roundKey) {
  if (roundKey.startsWith('group_r')) {
    const r = parseInt(roundKey.replace('group_r', ''), 10);
    return state.matches.filter((m) => m.stage === 'group' && m.round === r && m.played && !m.autoPlayed && !m.isExtra);
  }
  return state.matches.filter((m) => m.stage === roundKey && !m.isExtra && m.played && !m.autoPlayed);
}

/* Time da rodada (4-3-3) baseado em jogadores que jogaram naquela rodada */
export function computeBestXIForRound(state, roundKey) {
  const mainMatches = matchesInRound(state, roundKey);
  if (mainMatches.length === 0) {
    return { GOL: [], ZAG: [], LAT: [], MEI: [], ATA: [], available: {} };
  }
  /* Pega stats apenas dos eventos+ratings desses matches (com prorrogação consolidada) */
  const playerMap = {}; // 'teamId|playerName' → stats
  for (const mainMatch of mainMatches) {
    const m = getConsolidatedMatch(state, mainMatch);
    /* Eventos (main + prorrogação já consolidados) */
    for (const ev of (m.events || [])) {
      if (!ev.playerName || !ev.teamId) continue;
      const k = `${ev.teamId}|${ev.playerName}`;
      if (!playerMap[k]) playerMap[k] = { teamId: ev.teamId, playerName: ev.playerName, goals: 0, assists: 0, yellows: 0, reds: 0, ratingSum: 0, ratingCount: 0 };
      if (ev.type === 'goal') playerMap[k].goals++;
      else if (ev.type === 'assist') playerMap[k].assists++;
      else if (ev.type === 'yellow') playerMap[k].yellows++;
      else if (ev.type === 'red') playerMap[k].reds++;
    }
    /* Ratings: média entre main e prorrogação (1 nota por jogador POR jogo) */
    const ratings = getConsolidatedRatings(state, mainMatch);
    for (const teamId of Object.keys(ratings)) {
      for (const [pname, avgRating] of Object.entries(ratings[teamId])) {
        const k = `${teamId}|${pname}`;
        if (!playerMap[k]) playerMap[k] = { teamId, playerName: pname, goals: 0, assists: 0, yellows: 0, reds: 0, ratingSum: 0, ratingCount: 0 };
        playerMap[k].ratingSum += avgRating;
        playerMap[k].ratingCount++;
      }
    }
  }
  /* Anexa metadados de time + posição + score adaptado */
  const all = Object.values(playerMap).map((p) => {
    const team = getTeamById(state, p.teamId);
    const position = getPlayerPosition(state, p.teamId, p.playerName);
    const avg = p.ratingCount > 0 ? p.ratingSum / p.ratingCount : 0;
    const owner = team?.owner;
    const teamName = team?.name;
    const teamFlag = team?.flag;
    let posScore = null;
    if (position) {
      const cardPenalty = p.yellows + p.reds * 4;
      const matchesBonus = Math.log2(p.ratingCount + 1) * 1.5;
      let core;
      switch (position) {
        case 'GOL': core = avg * 12 + p.assists * 1.5; break;
        case 'ZAG': core = avg * 9 + p.goals * 3 + p.assists * 1.5; break;
        case 'LAT': core = avg * 8 + p.goals * 3.5 + p.assists * 2.5; break;
        case 'MEI': core = avg * 7 + p.goals * 3.5 + p.assists * 3.5; break;
        case 'ATA': core = avg * 6 + p.goals * 5 + p.assists * 2; break;
        default: core = avg * 6 + p.goals * 4 + p.assists * 2;
      }
      posScore = core + matchesBonus - cardPenalty;
    }
    return { ...p, position, avg, teamName, teamFlag, owner, posScore, isChampionTeam: false };
  });

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
   RESHUFFLE MATA-MATA: troca times de confrontos com mesmo dono
   ============================================================ */
export function reshuffleSameOwnerKnockout(state) {
  const format = getFormat(state.formatId);
  if (!format.knockoutStages || format.knockoutStages.length === 0) return state.matches;
  const firstStage = format.knockoutStages[0];

  /* Pega TODOS os matches do mata-mata pra também atualizar a 2ª "perna" se houver */
  const allKoMatches = state.matches.filter((m) => m.stage !== 'group');

  /* Agrupa confrontos do PRIMEIRO stage (por koIndex) e identifica mesmo dono */
  const firstStageMatches = allKoMatches.filter((m) => m.stage === firstStage && !m.isExtra);
  const byKoIndex = {};
  for (const m of firstStageMatches) {
    const k = m.koIndex;
    if (!byKoIndex[k]) byKoIndex[k] = [];
    byKoIndex[k].push(m);
  }
  /* Pra cada koIndex (que é um confronto), identifica home/away owner */
  const confronts = Object.entries(byKoIndex).map(([koIdx, legs]) => {
    const sample = legs[0];
    const homeTeam = getTeamById(state, sample.homeTeamId);
    const awayTeam = getTeamById(state, sample.awayTeamId);
    const allLegsPending = legs.every((l) => !l.played);
    return {
      koIndex: Number(koIdx),
      homeTeamId: sample.homeTeamId,
      awayTeamId: sample.awayTeamId,
      homeOwner: homeTeam?.owner,
      awayOwner: awayTeam?.owner,
      sameOwner: homeTeam?.owner && awayTeam?.owner && homeTeam.owner === awayTeam.owner,
      ownerKey: homeTeam?.owner === awayTeam?.owner ? homeTeam?.owner : null,
      canSwap: allLegsPending,
    };
  });

  /* Agrupa same-owner por dono */
  const sameP1 = confronts.filter((c) => c.sameOwner && c.ownerKey === 'p1' && c.canSwap);
  const sameP2 = confronts.filter((c) => c.sameOwner && c.ownerKey === 'p2' && c.canSwap);

  /* Embaralha */
  const p1Sh = [...sameP1].sort(() => Math.random() - 0.5);
  const p2Sh = [...sameP2].sort(() => Math.random() - 0.5);

  const swapPairs = Math.min(p1Sh.length, p2Sh.length);
  if (swapPairs === 0) return { matches: state.matches, swappedPairs: 0 };

  /* Pra cada par (P1-P1) ↔ (P2-P2):
     Confronto 1: home=A1(P1), away=A2(P1)
     Confronto 2: home=B1(P2), away=B2(P2)
     Resultado:
     Confronto 1: home=A1(P1), away=B1(P2)
     Confronto 2: home=A2(P1), away=B2(P2)
     Movemos A2 para Confronto 2 (como home_v2) e B1 para Confronto 1 (como away_v1). */
  const swapMap = {}; // koIndex → { newHomeId, newAwayId }
  for (let i = 0; i < swapPairs; i++) {
    const c1 = p1Sh[i]; // P1 vs P1
    const c2 = p2Sh[i]; // P2 vs P2
    swapMap[c1.koIndex] = { newHomeId: c1.homeTeamId, newAwayId: c2.homeTeamId };
    swapMap[c2.koIndex] = { newHomeId: c1.awayTeamId, newAwayId: c2.awayTeamId };
  }

  const newMatches = state.matches.map((m) => {
    if (m.stage !== firstStage || m.isExtra) return m;
    if (m.played) return m;
    const swap = swapMap[m.koIndex];
    if (!swap) return m;
    return { ...m, homeTeamId: swap.newHomeId, awayTeamId: swap.newAwayId };
  });
  /* Propaga os vencedores nos stages seguintes (limpa, já que a base mudou) */
  const propagated = propagateKnockoutWinners(newMatches);
  return { matches: propagated, swappedPairs };
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
