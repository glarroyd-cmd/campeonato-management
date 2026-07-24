/* ============================================================
   MERGE DE SINCRONIZAÇÃO

   Faz um merge de três vias entre:
   - base: última versão confirmada pelo servidor;
   - local: versão atualmente aberta/editada neste dispositivo;
   - remote: nova versão recebida do Supabase.

   O objetivo principal é impedir que uma aba antiga apague dados preenchidos
   (placares, eventos, notas, participantes etc.) apenas por salvar um snapshot
   desatualizado. Alterações independentes são combinadas automaticamente.
   ============================================================ */

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyInput(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function arrayKeyForPath(path) {
  const key = path[path.length - 1];
  if (key === 'matches' || key === 'events' || key === 'koTeams' || key === 'teams') return 'id';
  if (key === 'groups') return 'letter';
  return null;
}

function orderedKeys(base, local, remote, keyName) {
  const result = [];
  const seen = new Set();
  for (const arr of [local, remote, base]) {
    for (const item of (arr || [])) {
      const key = item?.[keyName];
      if (key === null || key === undefined || seen.has(key)) continue;
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

function mergeKeyedArray(base, local, remote, path, conflicts, keyName) {
  const toMap = (arr) => new Map((arr || []).map((item) => [item?.[keyName], item]));
  const baseMap = toMap(base);
  const localMap = toMap(local);
  const remoteMap = toMap(remote);
  const result = [];

  for (const key of orderedKeys(base, local, remote, keyName)) {
    const merged = mergeValue(
      baseMap.get(key),
      localMap.get(key),
      remoteMap.get(key),
      [...path, String(key)],
      conflicts,
    );
    if (merged !== undefined) result.push(merged);
  }
  return result;
}

function mergeObject(base, local, remote, path, conflicts) {
  const result = {};
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(local || {}),
    ...Object.keys(remote || {}),
  ]);

  for (const key of keys) {
    /* Metadados pertencem ao servidor e não representam conteúdo do torneio. */
    if (key === '_meta') {
      if (remote?.[key] !== undefined) result[key] = clone(remote[key]);
      else if (local?.[key] !== undefined) result[key] = clone(local[key]);
      continue;
    }

    const merged = mergeValue(
      base?.[key],
      local?.[key],
      remote?.[key],
      [...path, key],
      conflicts,
    );
    if (merged !== undefined) result[key] = merged;
  }
  return result;
}

function mergeValue(base, local, remote, path, conflicts) {
  /* Casos sem conflito. */
  if (jsonEqual(local, remote)) return clone(local);
  if (jsonEqual(local, base)) return clone(remote);
  if (jsonEqual(remote, base)) return clone(local);

  /* Arrays identificáveis são combinados item a item. */
  if (Array.isArray(local) && Array.isArray(remote)) {
    const keyName = arrayKeyForPath(path);
    if (keyName) {
      return mergeKeyedArray(
        Array.isArray(base) ? base : [],
        local,
        remote,
        path,
        conflicts,
        keyName,
      );
    }
  }

  /* Objetos como matches, ratings e escalações são combinados campo a campo. */
  if (isPlainObject(local) && isPlainObject(remote)) {
    return mergeObject(isPlainObject(base) ? base : {}, local, remote, path, conflicts);
  }

  const field = path[path.length - 1];

  /* Quando uma versão contém dado e a outra está vazia, o dado preenchido vence.
     Isso protege placares 0, eventos, notas, IDs de times e demais inputs. */
  if (isEmptyInput(local) && !isEmptyInput(remote)) return clone(remote);
  if (isEmptyInput(remote) && !isEmptyInput(local)) return clone(local);

  /* Em um conflito real de preenchimento, a edição local permanece visível,
     mas o conflito é informado para que o usuário escolha conscientemente. */
  conflicts.push({
    path: path.join('.'),
    field,
    local: clone(local),
    remote: clone(remote),
  });
  return clone(local);
}

export function mergeTournamentStates(base, local, remote) {
  const conflicts = [];
  const state = mergeValue(base || {}, local || {}, remote || {}, [], conflicts);
  return { state, conflicts };
}
