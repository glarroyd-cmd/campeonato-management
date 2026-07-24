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
