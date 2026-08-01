import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeInitialState,
  makeGroupMatches,
  makeKnockoutMatches,
  recalcKnockoutSeeding,
  reshuffleSameOwnerKnockout,
  getSameOwnerKnockoutSwapOptions,
  propagateKnockoutWinners,
  R32_PATTERN_WC2026,
  computeOwnerMetrics,
  computeTeamMetrics,
  computePlayersByPosition,
  computeGoalkeeperRankings,
  computePlayerStats,
  computePowerRankingPlayers,
  computeBestXI,
  PLAYER_MATCH_STAGE_WEIGHT,
} from '../src/lib/tournament.js';
import {
  getWc2026ThirdPlaceAssignments,
  validateWc2026ThirdPlaceTable,
  WC2026_THIRD_PLACE_COMBINATION_COUNT,
} from '../src/lib/wc2026ThirdPlaceTable.js';
import { mergeTournamentStates } from '../src/lib/syncMerge.js';

function completeWc2026GroupsWithBestThirds(groupLetters) {
  const state = makeInitialState('wc2026');
  state.setupComplete = true;
  state.rulesComplete = true;
  state.teamsComplete = true;
  state.matches = makeGroupMatches(state.groups, state.rules).map((match) => {
    const group = state.groups.find((item) => item.letter === match.group);
    const home = group.teams.find((team) => team.id === match.homeTeamId);
    const away = group.teams.find((team) => team.id === match.awayTeamId);

    let homeScore;
    let awayScore;
    if (home.pot === 3 && away.pot === 4) {
      homeScore = groupLetters.includes(match.group) ? 5 : 1;
      awayScore = 0;
    } else if (home.pot < away.pot) {
      homeScore = 2;
      awayScore = 0;
    } else {
      homeScore = 0;
      awayScore = 2;
    }

    return { ...match, homeScore, awayScore, played: true };
  });
  return state;
}

test('a tabela da FIFA contém todas as 495 combinações possíveis', () => {
  assert.equal(WC2026_THIRD_PLACE_COMBINATION_COUNT, 495);
  assert.equal(validateWc2026ThirdPlaceTable(), true);
});

test('a chave estrutural da Copa 2026 preserva a rota oficial até a final', () => {
  assert.deepEqual(
    R32_PATTERN_WC2026.map((match) => match.id),
    [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  );
});

test('a Copa 2026 gera confrontos fixos e melhores terceiros corretamente', () => {
  const selectedThirdGroups = 'ABCDEFGH';
  const state = completeWc2026GroupsWithBestThirds(selectedThirdGroups);
  const knockout = makeKnockoutMatches(state);
  const r32 = knockout.filter((match) => match.stage === 'r32' && match.leg === 1);
  const byOfficialNumber = Object.fromEntries(r32.map((match) => [match.officialMatchNumber, match]));

  assert.deepEqual(
    [byOfficialNumber[78].homeTeamId, byOfficialNumber[78].awayTeamId],
    ['E2', 'I2'],
  );
  assert.deepEqual(
    [byOfficialNumber[75].homeTeamId, byOfficialNumber[75].awayTeamId],
    ['F1', 'C2'],
  );
  assert.deepEqual(
    [byOfficialNumber[76].homeTeamId, byOfficialNumber[76].awayTeamId],
    ['C1', 'F2'],
  );

  const assignments = getWc2026ThirdPlaceAssignments([...selectedThirdGroups]);
  const matchByWinnerSlot = {
    '1A': 79,
    '1B': 85,
    '1D': 81,
    '1E': 74,
    '1G': 82,
    '1I': 77,
    '1K': 87,
    '1L': 80,
  };
  for (const [winnerSlot, matchNumber] of Object.entries(matchByWinnerSlot)) {
    assert.equal(byOfficialNumber[matchNumber].homeTeamId, `${winnerSlot.slice(1)}1`);
    assert.equal(byOfficialNumber[matchNumber].awayTeamId, `${assignments[winnerSlot]}3`);
  }

  const r16 = knockout.filter((match) => match.stage === 'r16' && match.leg === 1);
  const sourceNumbers = r16.map((match) => [
    r32[match.feedHome.koIndex].officialMatchNumber,
    r32[match.feedAway.koIndex].officialMatchNumber,
  ]);
  assert.deepEqual(sourceNumbers, [
    [74, 77],
    [73, 75],
    [83, 84],
    [81, 82],
    [76, 78],
    [79, 80],
    [86, 88],
    [85, 87],
  ]);
});

test('o sorteio de adversários retorna o formato correto e inverte o mando na volta', () => {
  const state = makeInitialState('ko8');
  state.rules.knockoutReturn = true;
  state.koTeams = state.koTeams.map((team, index) => ({
    ...team,
    owner: index < 2 ? 'p1' : index < 4 ? 'p2' : index % 2 === 0 ? 'p1' : 'p2',
  }));
  state.matches = makeKnockoutMatches(state);

  const untouchedBefore = state.matches
    .filter((match) => match.stage === 'qf' && [2, 3].includes(match.koIndex))
    .map((match) => ({ ...match }));

  const result = reshuffleSameOwnerKnockout(state);
  assert.equal(result.swappedPairs, 1);
  assert.ok(Array.isArray(result.matches));

  const qf0 = result.matches.filter((match) => match.stage === 'qf' && match.koIndex === 0);
  const qf1 = result.matches.filter((match) => match.stage === 'qf' && match.koIndex === 1);

  assert.deepEqual(
    qf0.map((match) => [match.leg, match.homeTeamId, match.awayTeamId]),
    [[1, 'KO1', 'KO3'], [2, 'KO3', 'KO1']],
  );
  assert.deepEqual(
    qf1.map((match) => [match.leg, match.homeTeamId, match.awayTeamId]),
    [[1, 'KO2', 'KO4'], [2, 'KO4', 'KO2']],
  );
  assert.ok([...qf0, ...qf1].every((match) => match.manuallyOverridden === true));
  assert.deepEqual(
    result.matches.filter((match) => match.stage === 'qf' && [2, 3].includes(match.koIndex)),
    untouchedBefore,
  );
});


test('torneios existentes migram para a chave correta sem recriação', () => {
  const state = completeWc2026GroupsWithBestThirds('ABCDEFGH');
  state.matches = [...state.matches, ...makeKnockoutMatches(state)];

  const corrupted = state.matches.map((match) => (
    match.stage === 'r32' && match.officialMatchNumber === 78
      ? { ...match, homeTeamId: 'E2', awayTeamId: 'F2', officialMatchNumber: null }
      : match
  ));
  const result = recalcKnockoutSeeding({ ...state, matches: corrupted });
  const fixed = result.matches.find((match) => match.stage === 'r32' && match.koIndex === 9 && match.leg === 1);

  assert.equal(result.changed, true);
  assert.deepEqual(
    [fixed.officialMatchNumber, fixed.homeTeamId, fixed.awayTeamId],
    [78, 'E2', 'I2'],
  );
});

test('o recálculo preserva o segundo jogo do mesmo confronto após a ida', () => {
  const state = completeWc2026GroupsWithBestThirds('ABCDEFGH');
  state.rules.knockoutReturn = true;
  const knockout = makeKnockoutMatches(state);
  const firstLeg = knockout.find((match) => match.stage === 'r32' && match.koIndex === 0 && match.leg === 1);
  firstLeg.played = true;
  firstLeg.homeScore = 1;
  firstLeg.awayScore = 0;
  state.matches = [...state.matches, ...knockout];

  const result = recalcKnockoutSeeding(state);
  const secondLeg = result.matches.find((match) => match.stage === 'r32' && match.koIndex === 0 && match.leg === 2);
  assert.ok(secondLeg.homeTeamId);
  assert.ok(secondLeg.awayTeamId);
  assert.equal(secondLeg.homeTeamId, firstLeg.awayTeamId);
  assert.equal(secondLeg.awayTeamId, firstLeg.homeTeamId);
});


test('a chave oficial não migra automaticamente depois que o mata-mata começou', () => {
  const state = completeWc2026GroupsWithBestThirds('ABCDEFGH');
  const knockout = makeKnockoutMatches(state);
  const firstPlayed = knockout.find((match) => match.stage === 'r32' && match.leg === 1);
  firstPlayed.played = true;
  firstPlayed.homeScore = 1;
  firstPlayed.awayScore = 0;

  const target = knockout.find((match) => match.stage === 'r32' && match.officialMatchNumber === 78);
  target.homeTeamId = 'E2';
  target.awayTeamId = 'F2';
  target.officialMatchNumber = null;
  state.matches = [...state.matches, ...knockout];

  const result = recalcKnockoutSeeding(state);
  const preserved = result.matches.find((match) => match.id === target.id);
  assert.equal(result.changed, false);
  assert.deepEqual(
    [preserved.officialMatchNumber, preserved.homeTeamId, preserved.awayTeamId],
    [null, 'E2', 'F2'],
  );
});

test('o sorteio funciona nas semifinais e altera somente confrontos de mesmo dono', () => {
  const state = makeInitialState('ko8');
  const owners = {
    KO1: 'p1', KO2: 'p2',
    KO3: 'p1', KO4: 'p2',
    KO5: 'p2', KO6: 'p1',
    KO7: 'p2', KO8: 'p1',
  };
  state.koTeams = state.koTeams.map((team) => ({ ...team, owner: owners[team.id] }));
  state.matches = makeKnockoutMatches(state).map((match) => {
    if (match.stage !== 'qf') return match;
    return { ...match, played: true, homeScore: 1, awayScore: 0 };
  });
  state.matches = propagateKnockoutWinners(state.matches).matches;

  const beforeQuarterfinals = state.matches
    .filter((match) => match.stage === 'qf')
    .map((match) => ({ ...match }));
  const options = getSameOwnerKnockoutSwapOptions(state, 'sf');
  assert.equal(options.swappable, 1);

  const result = reshuffleSameOwnerKnockout(state, 'sf');
  assert.equal(result.stage, 'sf');
  assert.equal(result.swappedPairs, 1);
  assert.deepEqual(
    result.matches.filter((match) => match.stage === 'qf'),
    beforeQuarterfinals,
  );

  const semis = result.matches.filter((match) => match.stage === 'sf' && !match.isExtra);
  for (const semi of semis) {
    const homeOwner = state.koTeams.find((team) => team.id === semi.homeTeamId)?.owner;
    const awayOwner = state.koTeams.find((team) => team.id === semi.awayTeamId)?.owner;
    assert.notEqual(homeOwner, awayOwner);
    assert.equal(semi.manuallyOverridden, true);
  }
});

test('um jogo já concluído nunca recebe outros participantes pela propagação', () => {
  const state = makeInitialState('ko8');
  state.matches = makeKnockoutMatches(state).map((match) => {
    if (match.stage !== 'qf') return match;
    return { ...match, played: true, homeScore: 1, awayScore: 0 };
  });
  state.matches = propagateKnockoutWinners(state.matches).matches;
  state.matches = state.matches.map((match) => {
    if (match.stage !== 'sf') return match;
    return { ...match, played: true, homeScore: 1, awayScore: 0 };
  });
  state.matches = propagateKnockoutWinners(state.matches).matches;

  const final = state.matches.find((match) => match.stage === 'final');
  final.played = true;
  final.homeScore = 2;
  final.awayScore = 0;
  const originalFinalTeams = [final.homeTeamId, final.awayTeamId];

  const changedSemi = state.matches.find((match) => match.stage === 'sf' && match.koIndex === 0);
  [changedSemi.homeScore, changedSemi.awayScore] = [0, 3];
  const propagated = propagateKnockoutWinners(state.matches).matches;
  const preservedFinal = propagated.find((match) => match.id === final.id);

  assert.deepEqual(
    [preservedFinal.homeTeamId, preservedFinal.awayTeamId],
    originalFinalTeams,
  );
  assert.deepEqual([preservedFinal.homeScore, preservedFinal.awayScore], [2, 0]);
});

test('o merge de sincronização preserva inputs remotos diante de uma aba local antiga', () => {
  const base = makeInitialState('ko8');
  base.matches = makeKnockoutMatches(base);
  const local = structuredClone(base);
  const remote = structuredClone(base);

  local.tournamentName = 'Nome alterado localmente';
  remote.matches[0].homeScore = 3;
  remote.matches[0].awayScore = 1;
  remote.matches[0].played = true;

  const merged = mergeTournamentStates(base, local, remote);
  assert.equal(merged.state.tournamentName, 'Nome alterado localmente');
  assert.deepEqual(
    [merged.state.matches[0].homeScore, merged.state.matches[0].awayScore, merged.state.matches[0].played],
    [3, 1, true],
  );
  assert.equal(merged.conflicts.length, 0);
});

test('o merge combina resultados preenchidos em jogos diferentes', () => {
  const base = makeInitialState('ko8');
  base.matches = makeKnockoutMatches(base);
  const local = structuredClone(base);
  const remote = structuredClone(base);

  local.matches[0] = { ...local.matches[0], homeScore: 2, awayScore: 0, played: true };
  remote.matches[1] = { ...remote.matches[1], homeScore: 1, awayScore: 0, played: true };

  const merged = mergeTournamentStates(base, local, remote);
  assert.deepEqual(
    [merged.state.matches[0].homeScore, merged.state.matches[0].awayScore, merged.state.matches[0].played],
    [2, 0, true],
  );
  assert.deepEqual(
    [merged.state.matches[1].homeScore, merged.state.matches[1].awayScore, merged.state.matches[1].played],
    [1, 0, true],
  );
  assert.equal(merged.conflicts.length, 0);
});


test('o vencedor de um confronto customizado continua avançando normalmente', () => {
  const state = makeInitialState('ko8');
  const owners = {
    KO1: 'p1', KO2: 'p2',
    KO3: 'p1', KO4: 'p2',
    KO5: 'p2', KO6: 'p1',
    KO7: 'p2', KO8: 'p1',
  };
  state.koTeams = state.koTeams.map((team) => ({ ...team, owner: owners[team.id] }));
  state.matches = makeKnockoutMatches(state).map((match) => (
    match.stage === 'qf'
      ? { ...match, played: true, homeScore: 1, awayScore: 0 }
      : match
  ));
  state.matches = propagateKnockoutWinners(state.matches).matches;
  state.matches = reshuffleSameOwnerKnockout(state, 'sf').matches;

  const semifinalWinners = [];
  state.matches = state.matches.map((match) => {
    if (match.stage !== 'sf') return match;
    semifinalWinners.push(match.awayTeamId);
    return { ...match, played: true, homeScore: 0, awayScore: 2 };
  });
  state.matches = propagateKnockoutWinners(state.matches).matches;
  const final = state.matches.find((match) => match.stage === 'final');

  assert.deepEqual([final.homeTeamId, final.awayTeamId], semifinalWinners);
});


test('estatísticas avançadas são agregadas por usuário sem misturar dados ausentes', () => {
  const state = makeInitialState('ko8');
  state.player1Name = 'Ana';
  state.player2Name = 'Bruno';
  state.koTeams = state.koTeams.map((team, index) => ({
    ...team,
    owner: index === 0 ? 'p1' : index === 1 ? 'p2' : team.owner,
  }));
  state.matches = [{
    id: 'advanced-1',
    stage: 'qf',
    koIndex: 0,
    leg: 1,
    played: true,
    autoPlayed: false,
    isExtra: false,
    homeTeamId: 'KO1',
    awayTeamId: 'KO2',
    homeScore: 2,
    awayScore: 1,
    events: [],
    ratings: {},
    teamStats: {
      KO1: { possession: '58', shots: '14', xG: '1.75' },
      KO2: { possession: '42', shots: '7', xG: '0.80' },
    },
  }];

  const rows = computeOwnerMetrics(state);
  const p1 = rows.find((row) => row.owner === 'p1');
  const p2 = rows.find((row) => row.owner === 'p2');

  assert.equal(p1.name, 'Ana');
  assert.equal(p1.possessionAvg, 58);
  assert.equal(p1.shotsSum, 14);
  assert.equal(p1.shotsAgainstAvg, 7);
  assert.equal(p1.xGSum, 1.75);
  assert.equal(p1.xGDiff, 0.25);
  assert.equal(p1.xGAgainstAvg, 0.80);
  assert.equal(p1.goalsAgainstAvg, 1);
  assert.ok(Math.abs(p1.goalsAgainstXGDiff - 0.2) < 1e-9);
  assert.equal(p2.name, 'Bruno');
  assert.equal(p2.possessionAvg, 42);
  assert.equal(p2.shotsAvg, 7);
  assert.equal(p2.shotsAgainstAvg, 14);
  assert.ok(Math.abs(p2.xGDiff - 0.2) < 1e-9);
  assert.equal(p2.xGAgainstAvg, 1.75);
  assert.equal(p2.goalsAgainstAvg, 2);
  assert.equal(p2.goalsAgainstXGDiff, 0.25);
});

test('estatísticas avançadas somam xG e finalizações da prorrogação e ponderam a posse', () => {
  const state = makeInitialState('ko8');
  state.player1Name = 'Ana';
  state.player2Name = 'Bruno';
  state.koTeams = state.koTeams.map((team, index) => ({
    ...team,
    owner: index === 0 ? 'p1' : index === 1 ? 'p2' : team.owner,
  }));
  state.matches = [
    {
      id: 'advanced-main',
      stage: 'qf',
      koIndex: 0,
      leg: 1,
      totalLegs: 1,
      played: true,
      autoPlayed: false,
      isExtra: false,
      homeTeamId: 'KO2',
      awayTeamId: 'KO1',
      homeScore: 1,
      awayScore: 1,
      events: [],
      ratings: {},
      teamStats: {
        KO1: { possession: '60', shots: '10', xG: '1.20' },
        KO2: { possession: '40', shots: '6', xG: '0.70' },
      },
    },
    {
      id: 'advanced-extra',
      stage: 'qf',
      koIndex: 0,
      leg: 1,
      totalLegs: 1,
      played: true,
      autoPlayed: false,
      isExtra: true,
      homeTeamId: 'KO1',
      awayTeamId: 'KO2',
      homeScore: 1,
      awayScore: 0,
      events: [],
      ratings: {},
      teamStats: {
        KO1: { possession: '55', shots: '4', xG: '0.60' },
        KO2: { possession: '45', shots: '2', xG: '0.20' },
      },
    },
  ];

  const teams = computeTeamMetrics(state);
  const ko1 = teams.find((row) => row.teamId === 'KO1');
  const ko2 = teams.find((row) => row.teamId === 'KO2');

  assert.equal(ko1.shotsSum, 14);
  assert.equal(ko1.shotsCount, 1);
  assert.equal(ko1.shotsAgainstSum, 8);
  assert.equal(ko1.shotsAgainstAvg, 8);
  assert.ok(Math.abs(ko1.xGSum - 1.8) < 1e-9);
  assert.equal(ko1.xGCount, 1);
  assert.equal(ko1.goals, 2);
  assert.ok(Math.abs(ko1.xGDiff - 0.2) < 1e-9);
  assert.ok(Math.abs(ko1.xGAgainstSum - 0.9) < 1e-9);
  assert.ok(Math.abs(ko1.xGAgainstAvg - 0.9) < 1e-9);
  assert.equal(ko1.goalsAgainst, 1);
  assert.equal(ko1.goalsAgainstAvg, 1);
  assert.ok(Math.abs(ko1.goalsAgainstXGDiff - 0.1) < 1e-9);
  assert.equal(ko1.possessionAvg, 58.75);
  assert.equal(ko1.possessionCount, 1);

  assert.equal(ko2.shotsSum, 8);
  assert.equal(ko2.shotsAgainstSum, 14);
  assert.equal(ko2.shotsAgainstAvg, 14);
  assert.ok(Math.abs(ko2.xGSum - 0.9) < 1e-9);
  assert.equal(ko2.goals, 1);
  assert.ok(Math.abs(ko2.xGDiff - 0.1) < 1e-9);
  assert.ok(Math.abs(ko2.xGAgainstSum - 1.8) < 1e-9);
  assert.ok(Math.abs(ko2.xGAgainstAvg - 1.8) < 1e-9);
  assert.equal(ko2.goalsAgainst, 2);
  assert.equal(ko2.goalsAgainstAvg, 2);
  assert.ok(Math.abs(ko2.goalsAgainstXGDiff - 0.2) < 1e-9);
  assert.equal(ko2.possessionAvg, 41.25);

  const owners = computeOwnerMetrics(state);
  const p1 = owners.find((row) => row.owner === 'p1');
  const p2 = owners.find((row) => row.owner === 'p2');
  assert.equal(p1.shotsSum, 14);
  assert.equal(p1.shotsAgainstAvg, 8);
  assert.ok(Math.abs(p1.xGSum - 1.8) < 1e-9);
  assert.ok(Math.abs(p1.xGAgainstAvg - 0.9) < 1e-9);
  assert.equal(p1.goalsAgainstAvg, 1);
  assert.equal(p1.possessionAvg, 58.75);
  assert.equal(p2.shotsSum, 8);
  assert.equal(p2.shotsAgainstAvg, 14);
  assert.ok(Math.abs(p2.xGSum - 0.9) < 1e-9);
  assert.ok(Math.abs(p2.xGAgainstAvg - 1.8) < 1e-9);
  assert.equal(p2.goalsAgainstAvg, 2);
  assert.equal(p2.possessionAvg, 41.25);
});

test('o quadro de goleiros em melhores por posição usa a mesma fórmula do ranking de goleiros', () => {
  const state = makeInitialState('ko8');
  state.koTeams = state.koTeams.map((team, index) => ({
    ...team,
    owner: index === 0 ? 'p1' : index === 1 ? 'p2' : team.owner,
  }));
  state.playerPositions = { 'KO1|Goleiro A': 'GOL' };
  state.matches = [{
    id: 'gk-1',
    stage: 'qf',
    koIndex: 0,
    leg: 1,
    played: true,
    autoPlayed: false,
    isExtra: false,
    homeTeamId: 'KO1',
    awayTeamId: 'KO2',
    homeScore: 2,
    awayScore: 1,
    events: [
      { id: 's1', teamId: 'KO1', type: 'save', playerName: 'Goleiro A' },
      { id: 's2', teamId: 'KO1', type: 'save', playerName: 'Goleiro A' },
      { id: 's3', teamId: 'KO1', type: 'save', playerName: 'Goleiro A' },
      { id: 's4', teamId: 'KO1', type: 'save', playerName: 'Goleiro A' },
    ],
    ratings: { KO1: { 'Goleiro A': '7.5' } },
    teamStats: {},
  }];

  const positionRow = computePlayersByPosition(state, 'GOL', 10)[0];
  const goalkeeperRow = computeGoalkeeperRankings(state)[0];

  assert.equal(positionRow.goalsAgainst, 1);
  assert.equal(positionRow.saves, 4);
  assert.equal(positionRow.posScore, goalkeeperRow.gkScore);
  assert.ok(Math.abs(positionRow.posScore - 69.565) < 1e-9);
});

test('a média individual dá mais peso às atuações nas fases decisivas', () => {
  const state = makeInitialState('ko8');
  state.matches = [
    {
      id: 'weighted-group', stage: 'group', group: 'A', round: 1,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO1', awayTeamId: 'KO2', homeScore: 1, awayScore: 0,
      events: [],
      ratings: { KO1: { 'Craque do início': '10', 'Craque decisivo': '6' } },
      teamStats: {},
    },
    {
      id: 'weighted-final', stage: 'final', koIndex: 0, leg: 1,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO1', awayTeamId: 'KO2', homeScore: 1, awayScore: 0,
      events: [],
      ratings: { KO1: { 'Craque do início': '6', 'Craque decisivo': '10' } },
      teamStats: {},
    },
  ];

  assert.equal(PLAYER_MATCH_STAGE_WEIGHT.group, 1);
  assert.equal(PLAYER_MATCH_STAGE_WEIGHT.final, 2.75);

  const stats = computePlayerStats(state);
  const early = stats.find((row) => row.playerName === 'Craque do início');
  const decisive = stats.find((row) => row.playerName === 'Craque decisivo');

  assert.equal(early.ratingSum / early.ratingCount, 8);
  assert.equal(decisive.ratingSum / decisive.ratingCount, 8);
  assert.ok(decisive.weightedAvg > early.weightedAvg);
  assert.ok(Math.abs(early.weightedAvg - ((10 + 6 * 2.75) / 3.75)) < 1e-9);
  assert.ok(Math.abs(decisive.weightedAvg - ((6 + 10 * 2.75) / 3.75)) < 1e-9);

  const power = computePowerRankingPlayers(state);
  assert.equal(power[0].playerName, 'Craque decisivo');
});

test('a campanha tem influência progressiva e maior que o simples volume de jogos', () => {
  const state = makeInitialState('ko8');
  state.playerPositions = {
    'KO1|Jogador finalista': 'ATA',
    'KO2|Jogador com volume': 'ATA',
    'KO3|Jogador eliminado cedo': 'ATA',
  };
  state.matches = [
    {
      id: 'ranking-final', stage: 'final', koIndex: 0, leg: 1,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO1', awayTeamId: 'KO4', homeScore: 1, awayScore: 0,
      events: [], ratings: { KO1: { 'Jogador finalista': '7.0' } }, teamStats: {},
    },
    {
      id: 'ranking-volume-a', stage: 'group', group: 'A', round: 1,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO2', awayTeamId: 'KO5', homeScore: 0, awayScore: 0,
      events: [], ratings: { KO2: { 'Jogador com volume': '7.0' } }, teamStats: {},
    },
    {
      id: 'ranking-volume-b', stage: 'group', group: 'A', round: 2,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO2', awayTeamId: 'KO6', homeScore: 0, awayScore: 0,
      events: [], ratings: { KO2: { 'Jogador com volume': '7.0' } }, teamStats: {},
    },
    {
      id: 'ranking-r32', stage: 'r32', koIndex: 1, leg: 1,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO3', awayTeamId: 'KO7', homeScore: 0, awayScore: 1,
      events: [], ratings: { KO3: { 'Jogador eliminado cedo': '8.0' } }, teamStats: {},
    },
  ];

  const ranking = computePlayersByPosition(state, 'ATA', 10);
  const finalist = ranking.find((row) => row.playerName === 'Jogador finalista');
  const volume = ranking.find((row) => row.playerName === 'Jogador com volume');
  const early = ranking.find((row) => row.playerName === 'Jogador eliminado cedo');

  assert.ok(finalist.contextBonus > early.contextBonus);
  assert.ok(finalist.campaignMultiplier > early.campaignMultiplier);
  assert.ok(early.campaignMultiplier > volume.campaignMultiplier);
  assert.ok(finalist.posScore > early.posScore);
  assert.ok(finalist.posScore > volume.posScore);
});

test('um finalista consistente supera uma grande atuação isolada nas primeiras fases na seleção do campeonato', () => {
  const state = makeInitialState('ko8');
  state.playerPositions = {
    'KO1|Finalista consistente': 'ATA',
    'KO2|Destaque precoce': 'ATA',
  };
  state.matches = [
    {
      id: 'selection-final', stage: 'final', koIndex: 0, leg: 1,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO1', awayTeamId: 'KO4', homeScore: 1, awayScore: 0,
      events: [], ratings: { KO1: { 'Finalista consistente': '7.5' } }, teamStats: {},
    },
    {
      id: 'selection-r32', stage: 'r32', koIndex: 1, leg: 1,
      played: true, autoPlayed: false, isExtra: false,
      homeTeamId: 'KO2', awayTeamId: 'KO5', homeScore: 0, awayScore: 1,
      events: [], ratings: { KO2: { 'Destaque precoce': '9.5' } }, teamStats: {},
    },
  ];

  const bestXI = computeBestXI(state);
  assert.equal(bestXI.ATA[0].playerName, 'Finalista consistente');

  const power = computePowerRankingPlayers(state);
  assert.ok(
    power.find((row) => row.playerName === 'Finalista consistente').powerScore
      > power.find((row) => row.playerName === 'Destaque precoce').powerScore,
  );
});
