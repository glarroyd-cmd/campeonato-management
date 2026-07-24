import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Trophy, Users, Calendar, BarChart3, ChevronRight, ChevronLeft,
  Edit2, Check, X, Plus, AlertTriangle, Award, Target, Camera,
  Loader2, ArrowLeftRight, Star, RefreshCw,
  Goal, Hand, FileText, ArrowRight, ChevronDown, ChevronUp,
  Link2, LogOut, Copy, Home as HomeIcon, ArrowUp, ArrowDown,
  Settings2, Shuffle, Crown, Clock, Zap,
} from 'lucide-react';
import { supabase, clientId, supabaseReady, supabaseConfig } from './lib/supabase.js';
import {
  getLocalHistory, rememberTournament, forgetTournament,
} from './lib/localHistory.js';
import { mergeTournamentStates, jsonEqual } from './lib/syncMerge.js';
import {
  FORMATS, getFormat, STAGE_LABELS, STAGE_ORDER_INDEX, TIEBREAKERS,
  CARD_RULE_LABELS, DEFAULT_TIEBREAKERS, POSITIONS,
  makeInitialState, makeGroupMatches, makeKnockoutMatches,
  computeGroupStanding, getPlayerCardStatus, propagateKnockoutWinners,
  autoFillSameOwnerGroupMatches, getMatchOutcome, recalcKnockoutSeeding,
  repairKnockoutBracket, regenerateKnockoutBracket,
  getAllTeams, getTeamById, computePlayerStats, computeTeamStats, computeOwnerStats,
  computeBestThirds, getPlayerPosition,
  computeHeadToHead, getUpcomingMatches, getNotablePlayersForTeam,
  computeTournamentRecords, getChampionPath,
  computePowerRankingTeams, computePowerRankingPlayers, computeTimelineEvents,
  computePlayersByPosition, computeBestXI,
  computeTeamStreaks, computeCleanSheets, computeOffensiveDependency, computeTournamentSurprises,
  computeGroupScenarios, computeGroupTeamStatus, computeGroupMinimumNeeds,
  computeGroupTeamsOverview, computeAllSuspended,
  computeTeamMetrics, computeGoalkeeperRankings,
  computeTeamDetail, computeTeamRankings, getAllRoundKeys, computeBestXIForRound,
  reshuffleSameOwnerKnockout, getSameOwnerKnockoutSwapOptions,
  isTournamentFinished, getChampion, tournamentProgress, matchStageKey,
} from './lib/tournament.js';

/* ============================================================
   STORAGE — Supabase
   ============================================================ */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function loadTournament(code) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('state, updated_at')
    .eq('code', code)
    .maybeSingle();
  if (error) { console.error(error); return null; }
  return data ? { state: data.state, updatedAt: data.updated_at } : null;
}

async function loadTournamentList(codes) {
  if (!codes || codes.length === 0) return [];
  const { data, error } = await supabase
    .from('tournaments')
    .select('code, state, updated_at')
    .in('code', codes);
  if (error) { console.error(error); return []; }
  return data || [];
}

async function createTournamentRow(name, formatId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const initial = makeInitialState(formatId);
    initial.tournamentName = name;
    initial._meta = { lastUpdater: clientId, updatedAt: Date.now() };
    const { data, error } = await supabase
      .from('tournaments')
      .insert({ code, state: initial })
      .select()
      .single();
    if (!error && data) return code;
    if (error && error.code !== '23505') { console.error(error); return null; }
  }
  return null;
}

async function saveTournament(code, state, expectedUpdatedAt) {
  const stateWithMeta = { ...state, _meta: { lastUpdater: clientId, updatedAt: Date.now() } };
  let query = supabase
    .from('tournaments')
    .update({ state: stateWithMeta })
    .eq('code', code);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);

  const { data, error } = await query
    .select('state, updated_at')
    .maybeSingle();
  if (error) {
    console.error(error);
    return { ok: false, error };
  }
  if (data) return { ok: true, updatedAt: data.updated_at, state: data.state };

  /* Nenhuma linha atualizada: outra pessoa salvou a partir da mesma versão. */
  const latest = await loadTournament(code);
  return { ok: false, conflict: true, remote: latest };
}

/* ============================================================
   UI HELPERS
   ============================================================ */
const cls = (...xs) => xs.filter(Boolean).join(' ');

function Pill({ children, color = 'slate', className = '' }) {
  const colors = {
    slate:   'bg-slate-700/60 text-slate-200 border-slate-600/50',
    green:   'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
    yellow:  'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    red:     'bg-red-900/40 text-red-300 border-red-700/50',
    cyan:    'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
    amber:   'bg-amber-900/40 text-amber-300 border-amber-700/50',
    lime:    'bg-lime-900/40 text-lime-300 border-lime-700/50',
    purple:  'bg-purple-900/40 text-purple-300 border-purple-700/50',
  };
  return (
    <span className={cls('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border', colors[color], className)}>
      {children}
    </span>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={cls('bg-slate-900/60 border border-slate-800 rounded-xl', className)}>
      {children}
    </div>
  );
}

function SyncConflictBanner({ onUseRemote, onKeepLocal, conflictCount = 0 }) {
  return (
    <div className="fixed inset-x-3 top-3 z-[100] max-w-2xl mx-auto p-4 rounded-xl border border-amber-500/60 bg-slate-950/95 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-amber-200">Duas versões foram editadas ao mesmo tempo</p>
          <p className="text-sm text-slate-300 mt-1">
            As alterações independentes já foram combinadas. Existem {conflictCount || 'alguns'} campo(s)
            preenchidos de formas diferentes nos dois dispositivos; escolha qual versão deve prevalecer nesses campos.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <button
              onClick={onUseRemote}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-bold"
            >
              Carregar versão recebida
            </button>
            <button
              onClick={onKeepLocal}
              className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black"
            >
              Manter dados combinados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerBadge({ owner, p1Name, p2Name }) {
  if (!owner) return <Pill color="slate">Sem dono</Pill>;
  if (owner === 'p1') return <Pill color="cyan">{p1Name}</Pill>;
  return <Pill color="amber">{p2Name}</Pill>;
}

/* Pequeno tag colorido com nome do dono.
   Aceita cores customizadas via p1Color/p2Color, ou cai pros defaults. */
function OwnerTag({ owner, p1Name, p2Name, p1Color, p2Color, size = 'sm', fullWidth = false }) {
  if (!owner) return null;
  const name = owner === 'p1' ? p1Name : p2Name;
  const color = owner === 'p1' ? (p1Color || '#06b6d4') : (p2Color || '#f59e0b');
  const sizeCls = size === 'xs'
    ? 'text-[10px] px-1.5 py-0 leading-tight'
    : 'text-[11px] px-2 py-0.5 leading-tight';
  return (
    <span
      className={cls('inline-block rounded font-black tracking-tight text-slate-950 truncate', sizeCls, fullWidth && 'block')}
      style={{ backgroundColor: color, maxWidth: '14rem' }}
      title={name}
    >
      {name}
    </span>
  );
}

/* Helper pra pegar cor do dono dado state + ownerKey */
function getOwnerColor(state, owner) {
  if (owner === 'p1') return state?.player1Color || '#06b6d4';
  if (owner === 'p2') return state?.player2Color || '#f59e0b';
  return '#64748b'; // slate
}

/* ============================================================
   APP — Componente raiz
   ============================================================ */
export default function App() {
  const [code, setCode] = useState(() => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash.replace(/^#/, '').trim().toUpperCase();
    return hash || null;
  });

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('groups');
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [syncConflict, setSyncConflict] = useState(null);
  const stateRef = useRef(null);
  const serverUpdatedAtRef = useRef(null);
  const serverStateRef = useRef(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const localRevisionRef = useRef(0);
  const pendingRemoteRef = useRef(null);
  const syncConflictRef = useRef(false);
  const flushSaveRef = useRef(null);
  const openTeam = useCallback((teamId, fromView) => {
    setActiveTeamId(teamId);
    setView('team');
  }, []);

  /* Combina uma atualização remota com alterações locais sem permitir que
     campos vazios de uma aba antiga apaguem dados já preenchidos. */
  const mergeRemoteIntoLocal = useCallback((remote) => {
    if (!remote?.state) return;
    const base = serverStateRef.current || remote.state;
    const local = stateRef.current || base;
    const merged = mergeTournamentStates(base, local, remote.state);
    const mergedState = merged.state;
    const hasLocalChanges = !jsonEqual(mergedState, remote.state);

    serverStateRef.current = remote.state;
    serverUpdatedAtRef.current = remote.updatedAt;
    stateRef.current = mergedState;
    localRevisionRef.current += 1;
    dirtyRef.current = hasLocalChanges;
    setState(mergedState);

    if (merged.conflicts.length > 0) {
      const pending = { ...remote, mergedState, conflicts: merged.conflicts };
      pendingRemoteRef.current = pending;
      syncConflictRef.current = true;
      setSyncConflict(pending);
      return;
    }

    pendingRemoteRef.current = null;
    syncConflictRef.current = false;
    setSyncConflict(null);
    if (hasLocalChanges) {
      saveQueuedRef.current = true;
      if (!savingRef.current) setTimeout(() => flushSaveRef.current?.(), 0);
    }
  }, []);

  /* Carrega torneio quando code muda */
  useEffect(() => {
    if (!code) { setState(null); return; }
    let channel = null;
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError(null);
      const loadedRow = await loadTournament(code);
      if (cancelled) return;
      if (!loadedRow) {
        setLoadError(`Torneio "${code}" não encontrado.`);
        setLoading(false);
        return;
      }
      const loaded = loadedRow.state;
      serverUpdatedAtRef.current = loadedRow.updatedAt;
      serverStateRef.current = loaded;
      dirtyRef.current = false;
      pendingRemoteRef.current = null;
      syncConflictRef.current = false;
      setSyncConflict(null);

      /* Normaliza silenciosamente a chave ao abrir o torneio. Isso corrige
         duplicatas e migra chaves antigas da Copa 2026 sem recriar o torneio. */
      let normalizedState = loaded;
      let normalizedChanged = false;
      const knockoutStarted = (normalizedState.matches || []).some((m) => m.stage !== 'group' && m.played);

      /* Migra/repara a chave somente antes do primeiro jogo do mata-mata.
         Campeonatos eliminatórios já iniciados ficam integralmente congelados. */
      if (!knockoutStarted) {
        const repaired = repairKnockoutBracket(normalizedState);
        if (repaired.cleared > 0) {
          console.warn(`[Reparo automático] Removi ${repaired.cleared} slot(s) duplicado(s) do mata-mata.`);
          normalizedState = { ...normalizedState, matches: repaired.matches };
          normalizedChanged = true;
        }
        const reseeded = recalcKnockoutSeeding(normalizedState);
        if (reseeded.changed) {
          normalizedState = { ...normalizedState, matches: reseeded.matches };
          normalizedChanged = true;
        }
      }
      const propagated = propagateKnockoutWinners(normalizedState.matches || []);
      if (propagated.changed) {
        normalizedState = { ...normalizedState, matches: propagated.matches };
        normalizedChanged = true;
      }
      if (normalizedChanged) {
        dirtyRef.current = true;
        localRevisionRef.current += 1;
      }

      stateRef.current = normalizedState;
      setState(normalizedState);
      rememberTournament({ code });
      /* Decide view inicial baseado em estado de setup */
      if (!normalizedState.setupComplete) setView('setup');
      else if (!normalizedState.rulesComplete) setView('rules');
      else if (!normalizedState.teamsComplete) setView('teamsSetup');
      else setView('groups');
      setLoading(false);

      channel = supabase
        .channel(`tournament-${code}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `code=eq.${code}` },
          (payload) => {
            const newState = payload.new?.state;
            const newUpdatedAt = payload.new?.updated_at;
            if (!newState) return;
            if (newState._meta && newState._meta.lastUpdater === clientId) {
              if (newUpdatedAt) serverUpdatedAtRef.current = newUpdatedAt;
              serverStateRef.current = newState;
              return;
            }

            const remote = { state: newState, updatedAt: newUpdatedAt };
            if (dirtyRef.current || savingRef.current) {
              mergeRemoteIntoLocal(remote);
              return;
            }

            serverUpdatedAtRef.current = newUpdatedAt;
            serverStateRef.current = newState;
            stateRef.current = newState;
            setState(newState);
          }
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [code, mergeRemoteIntoLocal]);

  /* Mantém uma referência para o snapshot mais recente. */
  useEffect(() => { stateRef.current = state; }, [state]);

  /* Auto-save com debounce + bloqueio otimista por updated_at. */
  const saveTimerRef = useRef(null);
  const flushSave = useCallback(async () => {
    if (!code || loading || !dirtyRef.current || syncConflictRef.current) return;
    if (savingRef.current) {
      saveQueuedRef.current = true;
      return;
    }

    const snapshot = stateRef.current;
    if (!snapshot) return;
    savingRef.current = true;
    const savedRevision = localRevisionRef.current;
    const result = await saveTournament(code, snapshot, serverUpdatedAtRef.current);

    if (result.ok) {
      serverUpdatedAtRef.current = result.updatedAt;
      serverStateRef.current = result.state || snapshot;
      if (localRevisionRef.current === savedRevision) {
        dirtyRef.current = false;
      } else {
        saveQueuedRef.current = true;
      }
    } else if (result.conflict && result.remote) {
      mergeRemoteIntoLocal(result.remote);
    }

    savingRef.current = false;
    if (saveQueuedRef.current && !syncConflictRef.current) {
      saveQueuedRef.current = false;
      setTimeout(() => flushSaveRef.current?.(), 0);
    }
  }, [code, loading, mergeRemoteIntoLocal]);
  flushSaveRef.current = flushSave;

  useEffect(() => {
    if (!state || !code || loading || !dirtyRef.current || syncConflictRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flushSaveRef.current?.(); }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, code, loading, flushSave]);

  /* Sincroniza URL hash */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (code) {
      if (window.location.hash !== `#${code}`) window.history.replaceState(null, '', `#${code}`);
    } else {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    }
  }, [code]);

  const markLocalChange = useCallback(() => {
    dirtyRef.current = true;
    localRevisionRef.current += 1;
  }, []);

  const update = useCallback((partial) => {
    markLocalChange();
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      stateRef.current = next;
      return next;
    });
  }, [markLocalChange]);
  const updateMatches = useCallback((newMatches) => {
    markLocalChange();
    setState((prev) => {
      if (!prev) return prev;
      let intermediate = { ...prev, matches: newMatches };
      /* 1. Recalcula seeding do KO baseado nas standings atuais (só pra slots não jogados) */
      const { matches: afterSeeding } = recalcKnockoutSeeding(intermediate);
      intermediate = { ...intermediate, matches: afterSeeding };
      /* 2. Reparo: remove duplicatas do primeiro stage do KO (proteção contra bugs) */
      const { matches: afterRepair } = repairKnockoutBracket(intermediate);
      intermediate = { ...intermediate, matches: afterRepair };
      /* 3. Propaga vencedores no KO */
      const { matches: afterPropagation } = propagateKnockoutWinners(intermediate.matches);
      const next = { ...intermediate, matches: afterPropagation };
      stateRef.current = next;
      return next;
    });
  }, [markLocalChange]);

  const useRemoteVersion = useCallback(() => {
    const remote = pendingRemoteRef.current;
    if (!remote) return;
    serverUpdatedAtRef.current = remote.updatedAt;
    serverStateRef.current = remote.state;
    dirtyRef.current = false;
    saveQueuedRef.current = false;
    pendingRemoteRef.current = null;
    syncConflictRef.current = false;
    localRevisionRef.current += 1;
    stateRef.current = remote.state;
    setState(remote.state);
    setSyncConflict(null);
  }, []);

  const keepLocalVersion = useCallback(() => {
    const pending = pendingRemoteRef.current;
    if (!pending) return;
    const mergedState = pending.mergedState || stateRef.current;
    serverUpdatedAtRef.current = pending.updatedAt;
    serverStateRef.current = pending.state;
    pendingRemoteRef.current = null;
    syncConflictRef.current = false;
    dirtyRef.current = !jsonEqual(mergedState, pending.state);
    localRevisionRef.current += 1;
    stateRef.current = mergedState;
    setState(mergedState);
    setSyncConflict(null);
    if (dirtyRef.current) setTimeout(() => flushSaveRef.current?.(), 0);
  }, []);

  const leave = useCallback(() => {
    dirtyRef.current = false;
    serverStateRef.current = null;
    serverUpdatedAtRef.current = null;
    pendingRemoteRef.current = null;
    syncConflictRef.current = false;
    setSyncConflict(null);
    setCode(null);
    setState(null);
  }, []);

  const conflictBanner = syncConflict ? (
    <SyncConflictBanner
      onUseRemote={useRemoteVersion}
      onKeepLocal={keepLocalVersion}
      conflictCount={syncConflict.conflicts?.length || 0}
    />
  ) : null;

  if (!code) {
    return <HomeView onOpen={(c) => setCode(c)} initialError={loadError} />;
  }

  if (loading || !state) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-4">
        <Loader2 className="w-8 h-8 text-lime-400 animate-spin" />
        {loadError && (
          <div className="text-center max-w-md">
            <p className="text-red-400 mb-3">{loadError}</p>
            <button onClick={leave} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
              Voltar
            </button>
          </div>
        )}
      </div>
    );
  }

  /* Wizard de setup — sequencial */
  if (!state.setupComplete) {
    return <><SetupPlayersView state={state} update={update} code={code} onLeave={leave} />{conflictBanner}</>;
  }
  if (!state.rulesComplete) {
    return <><RulesSetupView state={state} update={update} code={code} onLeave={leave} />{conflictBanner}</>;
  }
  if (!state.teamsComplete) {
    return <><TeamsSetupView state={state} update={update} updateMatches={updateMatches} code={code} onLeave={leave} />{conflictBanner}</>;
  }

  const allTeams = getAllTeams(state);

  /* Garante que view esteja numa tab válida depois do wizard */
  const validTabs = ['groups', 'matches', 'match', 'knockout', 'stats', 'team'];
  const safeView = validTabs.includes(view) ? view : 'groups';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Header state={state} view={safeView} setView={setView} code={code} onLeave={leave} />
      {conflictBanner}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24">
        {safeView === 'groups'   && <GroupsView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} openTeam={openTeam} />}
        {safeView === 'matches'  && <MatchesView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />}
        {safeView === 'match' && activeMatchId && (
          <MatchDetailView state={state} matchId={activeMatchId} updateMatches={updateMatches} update={update} allTeams={allTeams} onBack={() => setView('matches')} openMatch={(id) => setActiveMatchId(id)} openTeam={openTeam} />
        )}
        {safeView === 'knockout' && <KnockoutView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />}
        {safeView === 'stats'    && <StatsView state={state} allTeams={allTeams} openTeam={openTeam} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />}
        {safeView === 'team' && activeTeamId && (
          <TeamDetailView state={state} teamId={activeTeamId} onBack={() => setView('groups')} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />
        )}
      </main>
    </div>
  );
}

/* ============================================================
   HOME VIEW — Tela inicial
   ============================================================ */
function HomeView({ onOpen, initialError }) {
  const [list, setList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState(initialError || '');

  useEffect(() => {
    (async () => {
      setListLoading(true);
      const hist = getLocalHistory();
      const codes = hist.map((h) => h.code);
      const rows = await loadTournamentList(codes);
      /* Merge com lastSeen do localStorage */
      const merged = rows.map((r) => {
        const local = hist.find((h) => h.code === r.code);
        return { ...r, lastSeen: local?.lastSeen || 0, role: local?.role || 'visitor' };
      });
      merged.sort((a, b) => b.lastSeen - a.lastSeen);
      setList(merged);
      setListLoading(false);
    })();
  }, []);

  const inProgress = list.filter((r) => !isTournamentFinished(r.state));
  const finished   = list.filter((r) =>  isTournamentFinished(r.state));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-20" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div className="max-w-4xl mx-auto pt-8 sm:pt-16">
        <header className="mb-10 text-center">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-lime-400 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-slate-950" />
            </div>
            <h1 className="text-4xl font-black tracking-tight">Campeonato Manager</h1>
          </div>
          <p className="text-slate-400 text-sm">Simulador de campeonatos para dois jogadores de videogame.</p>
        </header>

        {error && (
          <div className="max-w-md mx-auto mb-6 p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto mb-10">
          <button
            onClick={() => setShowCreate(true)}
            className="p-5 bg-lime-500 hover:bg-lime-400 text-slate-950 rounded-xl font-bold flex items-center justify-center gap-2 transition"
          >
            <Plus className="w-5 h-5" />
            Criar novo torneio
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="p-5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-bold flex items-center justify-center gap-2 transition"
          >
            <Link2 className="w-5 h-5" />
            Entrar com código
          </button>
        </div>

        {showCreate && <CreateTournamentModal onCancel={() => setShowCreate(false)} onCreated={onOpen} />}
        {showJoin && <JoinTournamentModal onCancel={() => setShowJoin(false)} onJoined={onOpen} />}

        {listLoading ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
            Carregando torneios...
          </div>
        ) : (
          <>
            <TournamentList
              title="Em andamento"
              titleIcon={<Clock className="w-4 h-4" />}
              titleColor="text-lime-400"
              list={inProgress}
              onOpen={onOpen}
              emptyMsg="Você ainda não tem torneios em andamento."
            />
            <TournamentList
              title="Terminados"
              titleIcon={<Crown className="w-4 h-4" />}
              titleColor="text-amber-400"
              list={finished}
              onOpen={onOpen}
              emptyMsg="Nenhum torneio terminado ainda."
            />
          </>
        )}
      </div>
    </div>
  );
}

function TournamentList({ title, titleIcon, titleColor, list, onOpen, emptyMsg }) {
  if (list.length === 0) {
    return (
      <section className="mb-8">
        <h2 className={cls('text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2', titleColor)}>
          {titleIcon} {title}
        </h2>
        <div className="text-slate-600 text-xs italic py-2">{emptyMsg}</div>
      </section>
    );
  }
  return (
    <section className="mb-8">
      <h2 className={cls('text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2', titleColor)}>
        {titleIcon} {title} <span className="text-slate-600 font-normal normal-case ml-1">({list.length})</span>
      </h2>
      <div className="space-y-2">
        {list.map((row) => (
          <TournamentRow key={row.code} row={row} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function TournamentRow({ row, onOpen }) {
  const { code, state } = row;
  const format = getFormat(state.formatId);
  const progress = tournamentProgress(state);
  const champion = isTournamentFinished(state) ? getChampion(state) : null;
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="group flex items-center gap-3 p-3 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-lg transition">
      <button onClick={() => onOpen(code)} className="flex-1 flex items-center gap-3 text-left">
        <div className="font-mono text-xs font-bold tracking-wider px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-400">
          {code}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate flex items-center gap-2">
            {state.tournamentName || 'Sem nome'}
            {champion && <span className="text-amber-400 text-xs flex items-center gap-1"><Crown className="w-3 h-3" />{champion.flag} {champion.name}</span>}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {format.name} · {state.player1Name || 'Jogador 1'} vs {state.player2Name || 'Jogador 2'}
            {state.teamsComplete && ` · ${progress.played}/${progress.total} (${progress.pct}%)`}
          </div>
        </div>
      </button>
      {confirmRemove ? (
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-400 mr-1">Remover da lista?</span>
          <button
            onClick={() => { forgetTournament(code); window.location.reload(); }}
            className="px-2 py-1 bg-red-900/50 border border-red-800 text-red-300 hover:bg-red-900 rounded"
          >Sim</button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="px-2 py-1 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded"
          >Não</button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmRemove(true)}
          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 p-1.5"
          title="Remover dessa lista (não apaga o torneio)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/* ---------------------- Create / Join modals ---------------------- */
function CreateTournamentModal({ onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [formatId, setFormatId] = useState('wc2026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Dê um nome ao torneio.'); return; }
    setBusy(true); setError('');
    const code = await createTournamentRow(trimmed, formatId);
    setBusy(false);
    if (!code) { setError('Falhou. Confira as envs do Supabase.'); return; }
    rememberTournament({ code, role: 'creator' });
    onCreated(code);
  }

  return (
    <Modal onClose={onCancel} title="Criar novo torneio">
      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-1.5 block">Nome do torneio</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Ex: Copa Galera 2026"
            autoFocus
            maxLength={60}
            className="w-full p-3 bg-slate-900 border-2 border-slate-700 focus:border-lime-400 rounded-lg text-base outline-none"
          />
        </div>
        <div>
          <label className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-1.5 block">Formato</label>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {FORMATS.map((f) => (
              <label
                key={f.id}
                className={cls(
                  'block p-3 rounded-lg border cursor-pointer transition',
                  formatId === f.id
                    ? 'bg-lime-500/10 border-lime-500/50'
                    : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                )}
              >
                <input type="radio" name="format" value={f.id} checked={formatId === f.id} onChange={() => setFormatId(f.id)} className="sr-only" />
                <div className="flex items-start gap-3">
                  <div className={cls('w-4 h-4 rounded-full border-2 mt-1 flex-shrink-0', formatId === f.id ? 'border-lime-400 bg-lime-400' : 'border-slate-600')} />
                  <div>
                    <div className="font-bold">{f.name}</div>
                    <div className="text-xs text-slate-400">{f.description}</div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-bold">Cancelar</button>
          <button onClick={handleCreate} disabled={busy} className="flex-1 p-3 bg-lime-500 hover:bg-lime-400 disabled:opacity-60 text-slate-950 rounded-lg font-bold flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function JoinTournamentModal({ onCancel, onJoined }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) { setError('Digite um código válido.'); return; }
    setBusy(true); setError('');
    const data = await loadTournament(c);
    setBusy(false);
    if (!data) { setError(`Torneio "${c}" não encontrado.`); return; }
    rememberTournament({ code: c });
    onJoined(c);
  }

  return (
    <Modal onClose={onCancel} title="Entrar com código">
      <div className="space-y-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder="ABC123"
          autoFocus
          maxLength={6}
          className="w-full p-4 bg-slate-900 border-2 border-slate-700 focus:border-lime-400 rounded-lg text-center text-2xl font-black tracking-widest outline-none"
        />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-bold">Cancelar</button>
          <button onClick={handleJoin} disabled={busy || code.length < 4} className="flex-1 p-3 bg-lime-500 hover:bg-lime-400 disabled:opacity-60 text-slate-950 rounded-lg font-bold">
            {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Entrar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-950 border border-slate-700 rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   HEADER (com nome, código, navegação)
   ============================================================ */
function Header({ state, view, setView, code, onLeave }) {
  const tabs = [
    { id: 'groups',   label: 'Grupos',       icon: Users    },
    { id: 'matches',  label: 'Jogos',        icon: Calendar },
    { id: 'knockout', label: 'Mata-Mata',    icon: Trophy   },
    { id: 'stats',    label: 'Estatísticas', icon: BarChart3 },
  ];
  const format = getFormat(state.formatId);
  if (!format.hasGroups) {
    tabs.splice(0, 1); // remove "grupos" pra formato sem grupos
  }

  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onLeave} className="text-slate-500 hover:text-lime-400 p-1.5" title="Voltar à lista">
              <HomeIcon className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="font-black text-base leading-none truncate max-w-[14rem] sm:max-w-md">{state.tournamentName}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-0.5">
                {state.player1Name} vs {state.player2Name}
              </div>
            </div>
          </div>
          {code && (
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-xs font-mono font-bold tracking-widest transition"
              title="Copiar link de convite"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-lime-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span className={copied ? 'text-lime-400' : 'text-slate-300'}>{copied ? 'Copiado!' : code}</span>
            </button>
          )}
        </div>
        <nav className="flex items-center gap-1 mt-3 flex-wrap">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = view === t.id || (t.id === 'matches' && view === 'match');
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={cls(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  active ? 'bg-lime-400 text-slate-950' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/* ============================================================
   SETUP — Wizard de 3 passos: jogadores → regras → times
   ============================================================ */
function WizardShell({ step, totalSteps, title, subtitle, code, onLeave, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={onLeave} className="flex items-center gap-1.5 text-slate-500 hover:text-lime-400 text-xs">
            <HomeIcon className="w-3.5 h-3.5" /> Sair
          </button>
          <div className="text-xs text-slate-400 font-mono font-bold">
            Etapa {step} de {totalSteps} · <span className="text-slate-500">{code}</span>
          </div>
        </div>
      </div>
      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight">{title}</h1>
          {subtitle && <p className="text-slate-400 text-sm mt-2">{subtitle}</p>}
        </header>
        {children}
      </main>
    </div>
  );
}

/* ---------------- Etapa 1: nomes dos jogadores ---------------- */
function SetupPlayersView({ state, update, code, onLeave }) {
  const [p1, setP1] = useState(state.player1Name === 'Jogador 1' ? '' : state.player1Name);
  const [p2, setP2] = useState(state.player2Name === 'Jogador 2' ? '' : state.player2Name);
  const [p1Color, setP1Color] = useState(state.player1Color || '#06b6d4');
  const [p2Color, setP2Color] = useState(state.player2Color || '#f59e0b');

  const handleNext = () => {
    update({
      player1Name: p1.trim() || 'Jogador 1',
      player2Name: p2.trim() || 'Jogador 2',
      player1Color: p1Color,
      player2Color: p2Color,
      setupComplete: true,
    });
  };

  return (
    <WizardShell step={1} totalSteps={3} code={code} onLeave={onLeave}
      title="Quem são os jogadores?"
      subtitle="Nome e cor de cada jogador. A cor aparece em todo lugar (tabelas, jogos, mata-mata) pra deixar claro de quem é cada time."
    >
      <Card className="p-5 space-y-5">
        <PlayerField label="Jogador 1" value={p1} onChange={setP1} placeholder="Ex: João" color={p1Color} onColorChange={setP1Color} otherColor={p2Color} />
        <PlayerField label="Jogador 2" value={p2} onChange={setP2} placeholder="Ex: Pedro" color={p2Color} onColorChange={setP2Color} otherColor={p1Color} />
      </Card>
      <div className="mt-6 flex justify-end">
        <button onClick={handleNext} className="px-6 py-3 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded-lg flex items-center gap-2">
          Próximo: regras <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </WizardShell>
  );
}

/* Paleta sugerida — cores claras o suficiente pra texto preto contrastar bem */
const PLAYER_COLOR_PALETTE = [
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f97316', // orange
  '#a855f7', // purple
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#84cc16', // lime
  '#ef4444', // red
  '#3b82f6', // blue
];

function PlayerField({ label, value, onChange, placeholder, color, onColorChange, otherColor }) {
  return (
    <div>
      <label className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </label>
      <div className="space-y-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={30}
          className="w-full p-3 bg-slate-900 border-2 border-slate-700 focus:border-lime-400 rounded-lg outline-none"
        />
        {/* Preview do tag */}
        {value && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Vai aparecer assim:</span>
            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-black text-slate-950" style={{ backgroundColor: color }}>
              {value}
            </span>
          </div>
        )}
        {/* Swatches de cor */}
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_COLOR_PALETTE.map((c) => {
            const isSelected = c.toLowerCase() === color.toLowerCase();
            const isOther = c.toLowerCase() === otherColor.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                disabled={isOther}
                className={cls(
                  'w-7 h-7 rounded transition',
                  isSelected && 'ring-2 ring-white ring-offset-2 ring-offset-slate-950',
                  isOther && 'opacity-30 cursor-not-allowed',
                )}
                style={{ backgroundColor: c }}
                title={isOther ? 'Já usada pelo outro jogador' : c}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Etapa 2: regras ---------------- */
function RulesSetupView({ state, update, code, onLeave }) {
  const [rules, setRules] = useState(state.rules || {});
  const format = getFormat(state.formatId);

  const handleNext = () => {
    update({ rules, rulesComplete: true });
  };

  const setRule = (k, v) => setRules((r) => ({ ...r, [k]: v }));

  const moveTiebreaker = (idx, dir) => {
    const arr = [...(rules.tiebreakers || DEFAULT_TIEBREAKERS)];
    const ni = idx + dir;
    if (ni < 0 || ni >= arr.length) return;
    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    setRule('tiebreakers', arr);
  };
  const toggleTiebreaker = (id) => {
    const arr = [...(rules.tiebreakers || DEFAULT_TIEBREAKERS)];
    if (TIEBREAKERS[id].always) return;
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    setRule('tiebreakers', arr);
  };

  return (
    <WizardShell step={2} totalSteps={3} code={code} onLeave={onLeave}
      title="Defina as regras"
      subtitle={`Formato: ${format.name}. As regras ficam trancadas depois que o torneio começar.`}
    >
      <div className="space-y-4">
        {format.hasGroups && (
          <RuleCard icon={<Calendar className="w-4 h-4" />} title="Fase de grupos">
            <ToggleRow label="Ida e volta na fase de grupos" desc="Cada confronto vira 2 jogos (com mando invertido)." checked={!!rules.groupReturn} onChange={(v) => setRule('groupReturn', v)} />
          </RuleCard>
        )}
        <RuleCard icon={<Trophy className="w-4 h-4" />} title="Mata-mata">
          <ToggleRow label="Ida e volta no mata-mata" desc="Decidido por placar agregado." checked={!!rules.knockoutReturn} onChange={(v) => setRule('knockoutReturn', v)} />
          {format.hasGroups && (
            <RadioRow label="Sorteio do mata-mata" value={rules.drawMode || 'fifa'} onChange={(v) => setRule('drawMode', v)} options={[
              { v: 'fifa',   label: 'Chave fixa (padrão FIFA)', desc: 'Como na Copa: 1º de cada grupo enfrenta um 3º colocado / 2º cruzado, conforme padrão oficial.' },
              { v: 'random', label: 'Sorteio aleatório',         desc: 'Embaralha os classificados em todos os confrontos do primeiro mata-mata.' },
            ]} />
          )}
          <InfoRow text="Empates no mata-mata vão pra prorrogação (jogo dedicado com placar próprio). Se a prorrogação empatar, pênaltis decidem." />
        </RuleCard>

        {format.hasGroups && (
          <RuleCard icon={<Settings2 className="w-4 h-4" />} title="Critérios de desempate dos grupos">
            <div className="text-xs text-slate-400 mb-3">Use as setas pra reordenar. Pontos é sempre o primeiro.</div>
            <TiebreakersEditor
              order={rules.tiebreakers || DEFAULT_TIEBREAKERS}
              onMove={moveTiebreaker}
              onToggle={toggleTiebreaker}
            />
          </RuleCard>
        )}

        <RuleCard icon={<Square className="w-4 h-4" />} title="Cartões e suspensões">
          <RadioRow value={rules.cardRule || 'fifa'} onChange={(v) => setRule('cardRule', v)} options={Object.entries(CARD_RULE_LABELS).map(([k, label]) => ({ v: k, label }))} />
        </RuleCard>
      </div>

      <div className="mt-6 flex justify-between">
        <button onClick={() => update({ setupComplete: false })} className="px-4 py-3 text-slate-400 hover:text-slate-100 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <button onClick={handleNext} className="px-6 py-3 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded-lg flex items-center gap-2">
          Próximo: times <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </WizardShell>
  );
}

function RuleCard({ icon, title, children }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">{icon}{title}</h3>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button type="button" onClick={() => onChange(!checked)} className={cls('mt-0.5 relative w-10 h-6 rounded-full transition-colors flex-shrink-0', checked ? 'bg-lime-400' : 'bg-slate-700')}>
        <span className={cls('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform', checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5')} />
      </button>
      <div className="text-sm">
        <div className="font-medium">{label}</div>
        {desc && <div className="text-xs text-slate-400 mt-0.5">{desc}</div>}
      </div>
    </label>
  );
}

function RadioRow({ label, value, onChange, options }) {
  return (
    <div>
      {label && <div className="text-sm font-medium mb-2">{label}</div>}
      <div className="space-y-2">
        {options.map((o) => (
          <label key={o.v} className={cls('flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition', value === o.v ? 'bg-lime-500/10 border-lime-500/50' : 'bg-slate-900 border-slate-700 hover:border-slate-600')}>
            <input type="radio" checked={value === o.v} onChange={() => onChange(o.v)} className="sr-only" />
            <div className={cls('w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0', value === o.v ? 'border-lime-400 bg-lime-400' : 'border-slate-600')} />
            <div className="text-sm">
              <div className="font-medium">{o.label}</div>
              {o.desc && <div className="text-xs text-slate-400 mt-0.5">{o.desc}</div>}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ text }) {
  return (
    <div className="text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded p-3 flex items-start gap-2">
      <AlertTriangle className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function TiebreakersEditor({ order, onMove, onToggle }) {
  const allIds = Object.keys(TIEBREAKERS);
  const inactive = allIds.filter((id) => !order.includes(id));
  return (
    <div>
      <div className="space-y-1.5">
        {order.map((id, idx) => {
          const tb = TIEBREAKERS[id];
          return (
            <div key={id} className="flex items-center gap-2 p-2 bg-slate-900/80 border border-slate-700 rounded">
              <span className="font-mono text-xs text-slate-500 w-5 text-right">{idx + 1}.</span>
              <span className="flex-1 text-sm">{tb.label}</span>
              <button onClick={() => onMove(idx, -1)} disabled={idx === 0} className="p-1 disabled:opacity-30 hover:bg-slate-800 rounded"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => onMove(idx, 1)} disabled={idx === order.length - 1} className="p-1 disabled:opacity-30 hover:bg-slate-800 rounded"><ArrowDown className="w-3.5 h-3.5" /></button>
              {!tb.always && (
                <button onClick={() => onToggle(id)} className="p-1 text-slate-500 hover:text-red-400" title="Remover"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          );
        })}
      </div>
      {inactive.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <div className="text-xs uppercase font-bold text-slate-500 mb-2">Inativos</div>
          <div className="flex flex-wrap gap-1.5">
            {inactive.map((id) => (
              <button key={id} onClick={() => onToggle(id)} className="text-xs px-2 py-1 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800">
                + {TIEBREAKERS[id].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Inline ArrowLeft pra evitar conflito com ChevronLeft  */
function ArrowLeft(props) { return <ChevronLeft {...props} />; }

/* Inline Square icon for cards */
function Square(props) { return <span {...props}><span className="inline-block w-3 h-4 bg-yellow-500 rounded-sm" /></span>; }

/* ---------------- Etapa 3: Times ---------------- */
function TeamsSetupView({ state, update, updateMatches, code, onLeave }) {
  const format = getFormat(state.formatId);
  const [editing, setEditing] = useState(null); // teamId em edição

  const handleFinish = () => {
    /* Gera as matches da fase de grupos (se aplicável) + já cria a chave do mata-mata
       (com slots vazios — vão sendo preenchidos conforme jogos vão acontecendo) */
    let groupMatches = [];
    if (format.hasGroups) {
      groupMatches = makeGroupMatches(state.groups, state.rules);
    }
    const tempState = { ...state, matches: groupMatches, teamsComplete: true };
    const koMatches = makeKnockoutMatches(tempState);
    update({ teamsComplete: true, knockoutGenerated: true });
    updateMatches([...groupMatches, ...koMatches]);
  };

  if (format.hasGroups) {
    return <TeamsGroupsSetup state={state} update={update} format={format} code={code} onLeave={onLeave} onFinish={handleFinish} />;
  }
  return <TeamsKoSetup state={state} update={update} format={format} code={code} onLeave={onLeave} onFinish={handleFinish} />;
}

function TeamsGroupsSetup({ state, update, format, code, onLeave, onFinish }) {
  const setGroups = (newGroups) => update({ groups: newGroups });
  const updateTeam = (gIdx, tIdx, patch) => {
    const groups = state.groups.map((g, i) => {
      if (i !== gIdx) return g;
      return { ...g, teams: g.teams.map((t, j) => j === tIdx ? { ...t, ...patch } : t) };
    });
    setGroups(groups);
  };
  const setOwner = (gIdx, tIdx, owner) => {
    /* Lógica de draft: ao trocar dono do pote 1, o pote 4 vira do mesmo dono;
       pote 2 e 3 ficam do outro. O usuário pode override manual.
    */
    const groups = state.groups.map((g, i) => {
      if (i !== gIdx) return g;
      const team = g.teams[tIdx];
      const newTeams = g.teams.map((t, j) => j === tIdx ? { ...t, owner } : t);
      if (team.pot === 1 && owner) {
        const other = owner === 'p1' ? 'p2' : 'p1';
        newTeams.forEach((t, j) => {
          if (j === tIdx) return;
          if (t.pot === 4) newTeams[j] = { ...t, owner };
          else newTeams[j] = { ...t, owner: other };
        });
      }
      return { ...g, teams: newTeams };
    });
    setGroups(groups);
  };

  /* Validação: todos os times devem ter dono */
  const allOwned = state.groups.every((g) => g.teams.every((t) => t.owner));
  const totalTeams = state.groups.reduce((acc, g) => acc + g.teams.length, 0);
  const ownedCount = state.groups.reduce((acc, g) => acc + g.teams.filter((t) => t.owner).length, 0);

  return (
    <WizardShell step={3} totalSteps={3} code={code} onLeave={onLeave}
      title="Configure os grupos"
      subtitle={`Edite times e atribua cada um a um jogador. ${ownedCount}/${totalTeams} times atribuídos.`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {state.groups.map((g, gIdx) => (
          <Card key={g.letter} className="p-3">
            <h3 className="font-black text-lg mb-2">Grupo {g.letter}</h3>
            <div className="space-y-1.5">
              {g.teams.map((t, tIdx) => (
                <TeamSetupRow key={t.id} team={t} p1Name={state.player1Name} p2Name={state.player2Name}
                  onUpdate={(patch) => updateTeam(gIdx, tIdx, patch)}
                  onSetOwner={(o) => setOwner(gIdx, tIdx, o)}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-between items-center">
        <button onClick={() => update({ rulesComplete: false })} className="px-4 py-3 text-slate-400 hover:text-slate-100 flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex items-center gap-3">
          {!allOwned && <span className="text-xs text-slate-500">Atribua todos os times pra começar</span>}
          <button onClick={onFinish} disabled={!allOwned} className="px-6 py-3 bg-lime-500 hover:bg-lime-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg flex items-center gap-2">
            Começar campeonato <Trophy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </WizardShell>
  );
}

function TeamSetupRow({ team, p1Name, p2Name, onUpdate, onSetOwner }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(team.name);
  const [draftFlag, setDraftFlag] = useState(team.flag);

  const save = () => {
    onUpdate({ name: draftName.trim() || team.name, flag: draftFlag || '🏳️' });
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 p-1.5 bg-slate-900/60 border border-slate-800 rounded">
      <span className="text-[10px] uppercase font-bold text-slate-500 w-7 text-center">P{team.pot}</span>
      {editing ? (
        <>
          <input value={draftFlag} onChange={(e) => setDraftFlag(e.target.value)} className="w-10 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center" maxLength={4} />
          <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-sm" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button onClick={save} className="text-lime-400"><Check className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <>
          <span className="text-lg">{team.flag}</span>
          <span className="flex-1 text-sm font-medium truncate">{team.name}</span>
          <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-slate-200"><Edit2 className="w-3 h-3" /></button>
        </>
      )}
      <div className="flex gap-1">
        <button onClick={() => onSetOwner(team.owner === 'p1' ? null : 'p1')} className={cls('px-2 py-0.5 rounded text-[10px] font-bold border', team.owner === 'p1' ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700')} title={p1Name}>
          {p1Name.slice(0, 6)}
        </button>
        <button onClick={() => onSetOwner(team.owner === 'p2' ? null : 'p2')} className={cls('px-2 py-0.5 rounded text-[10px] font-bold border', team.owner === 'p2' ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700')} title={p2Name}>
          {p2Name.slice(0, 6)}
        </button>
      </div>
    </div>
  );
}

function TeamsKoSetup({ state, update, format, code, onLeave, onFinish }) {
  const updateTeam = (idx, patch) => {
    const koTeams = state.koTeams.map((t, i) => i === idx ? { ...t, ...patch } : t);
    update({ koTeams });
  };
  const setOwner = (idx, owner) => updateTeam(idx, { owner });

  const allOwned = state.koTeams.every((t) => t.owner);
  const ownedCount = state.koTeams.filter((t) => t.owner).length;

  const handleFinish = () => {
    /* Pra mata-mata direto, criamos as partidas já */
    const matches = makeKnockoutMatches({ ...state, teamsComplete: true });
    update({ teamsComplete: true, matches, knockoutGenerated: true });
  };

  return (
    <WizardShell step={3} totalSteps={3} code={code} onLeave={onLeave}
      title="Configure os times"
      subtitle={`Edite cada time e atribua a um jogador. ${ownedCount}/${state.koTeams.length} atribuídos.`}
    >
      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {state.koTeams.map((t, idx) => (
            <TeamSetupRow key={t.id} team={t} p1Name={state.player1Name} p2Name={state.player2Name}
              onUpdate={(patch) => updateTeam(idx, patch)}
              onSetOwner={(o) => setOwner(idx, o)}
            />
          ))}
        </div>
      </Card>
      <div className="mt-6 flex justify-between items-center">
        <button onClick={() => update({ rulesComplete: false })} className="px-4 py-3 text-slate-400 hover:text-slate-100 flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <button onClick={handleFinish} disabled={!allOwned} className="px-6 py-3 bg-lime-500 hover:bg-lime-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg flex items-center gap-2">
          Começar campeonato <Trophy className="w-4 h-4" />
        </button>
      </div>
    </WizardShell>
  );
}

/* ============================================================
   GROUPS VIEW — visualização da fase de grupos
   ============================================================ */
function GroupsView({ state, update, updateMatches, allTeams, openMatch, openTeam }) {
  const format = getFormat(state.formatId);

  const h2h = useMemo(() => computeHeadToHead(state), [state.matches]);
  const upcoming = useMemo(() => getUpcomingMatches(state, 5), [state.matches]);

  if (!format.hasGroups) {
    return (
      <div className="space-y-4">
        <HeadToHeadCard state={state} h2h={h2h} />
        <UpcomingMatchesCard state={state} upcoming={upcoming} openMatch={openMatch} openTeam={openTeam} />
        <div className="text-center text-slate-500 py-12">Este torneio é mata-mata direto. Use a aba "Mata-Mata".</div>
      </div>
    );
  }

  const bestThirds = useMemo(() => computeBestThirds(state), [state.matches]);
  const thirdsByTeamId = useMemo(() => {
    const map = {};
    for (const t of bestThirds) map[t.id] = t;
    return map;
  }, [bestThirds]);

  return (
    <div className="space-y-4">
      <HeadToHeadCard state={state} h2h={h2h} />
      <UpcomingMatchesCard state={state} upcoming={upcoming} openMatch={openMatch} openTeam={openTeam} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.groups.map((g) => (
          <Card key={g.letter} className="p-4">
            <h3 className="font-black text-xl mb-3">Grupo {g.letter}</h3>
            <StandingTable
              rows={computeGroupStanding(state, g.letter)}
              state={state}
              thirdsByTeamId={thirdsByTeamId}
              bestThirdsCount={format.bestThirds}
              openTeam={openTeam}
            />
          </Card>
        ))}
      </div>

      {format.bestThirds > 0 && bestThirds.length > 0 && (
        <Card className="p-4">
          <h3 className="font-black text-lg mb-1 flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            Melhores 3ºs lugares
            <span className="text-xs font-normal text-slate-500">— {format.bestThirds} se classificam pro mata-mata</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left font-medium pb-1 pr-2">#</th>
                  <th className="text-left font-medium pb-1 pr-2">Time</th>
                  <th className="text-left font-medium pb-1 pr-2">Grupo</th>
                  <th className="text-left font-medium pb-1 pr-2">Dono</th>
                  <th className="font-medium pb-1 px-1">Pts</th>
                  <th className="font-medium pb-1 px-1">SG</th>
                  <th className="font-medium pb-1 px-1">GP</th>
                  <th className="font-medium pb-1 pl-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {bestThirds.map((t, i) => (
                  <tr key={t.id} className={cls(
                    'border-t border-slate-800',
                    t.qualified ? 'bg-emerald-950/40 text-emerald-100' : 'text-slate-500'
                  )}>
                    <td className="py-1.5 pr-2 font-bold tabular-nums">{i + 1}</td>
                    <td className="py-1.5 pr-2"><span className="mr-1">{t.flag}</span>{t.name}</td>
                    <td className="py-1.5 pr-2">{t.group}</td>
                    <td className="py-1.5 pr-2"><OwnerTag owner={t.owner} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} size="xs" /></td>
                    <td className="text-center py-1.5 px-1 tabular-nums font-bold">{t.Pts}</td>
                    <td className="text-center py-1.5 px-1 tabular-nums">{t.SG > 0 ? '+' : ''}{t.SG}</td>
                    <td className="text-center py-1.5 px-1 tabular-nums">{t.GP}</td>
                    <td className="py-1.5 pl-2">
                      {t.qualified ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-300">
                          <Check className="w-3 h-3" /> Classificado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-slate-600">
                          <X className="w-3 h-3" /> Eliminado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* === Painel "O que cada time precisa" pra um grupo (mostrado na aba Grupos) === */
function GroupTeamsNeedsPanel({ state, groupLetter, openMatch }) {
  const overview = useMemo(() => computeGroupTeamsOverview(state, groupLetter), [state, groupLetter]);
  if (overview.length === 0) return null;

  /* Não exibe se todos os times já jogaram tudo (sem informação útil) */
  const someHasPending = overview.some((o) => o.nextMatch);
  if (!someHasPending) return null;

  const styleByType = {
    guaranteed:     { bg: 'bg-emerald-950/40 border-emerald-700/40', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    impossible:     { bg: 'bg-red-950/40 border-red-700/40',         text: 'text-red-300',     dot: 'bg-red-400' },
    needs_min:      { bg: 'bg-amber-950/40 border-amber-700/40',     text: 'text-amber-300',   dot: 'bg-amber-400' },
    needs_help:     { bg: 'bg-orange-950/40 border-orange-700/40',   text: 'text-orange-300',  dot: 'bg-orange-400' },
    third_chase:    { bg: 'bg-yellow-950/40 border-yellow-700/40',   text: 'text-yellow-200',  dot: 'bg-yellow-400' },
    third_only:     { bg: 'bg-yellow-950/40 border-yellow-700/40',   text: 'text-yellow-200',  dot: 'bg-yellow-400' },
    third_in:       { bg: 'bg-emerald-950/30 border-emerald-700/30', text: 'text-emerald-200', dot: 'bg-emerald-400' },
    third_out:      { bg: 'bg-yellow-950/30 border-yellow-700/30',   text: 'text-yellow-300',  dot: 'bg-yellow-400' },
    third_done:     { bg: 'bg-yellow-950/30 border-yellow-700/30',   text: 'text-yellow-300',  dot: 'bg-yellow-400' },
    depends_others: { bg: 'bg-slate-900/60 border-slate-700',        text: 'text-slate-300',   dot: 'bg-slate-400' },
    unknown:        { bg: 'bg-slate-900/60 border-slate-700',        text: 'text-slate-400',   dot: 'bg-slate-500' },
  };

  return (
    <div className="mt-4 pt-3 border-t border-slate-800/60">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">O que cada time precisa</div>
      <div className="space-y-1.5">
        {overview.map(({ team, nextMatch, opponent, need }) => {
          const sty = styleByType[need?.type] || styleByType.unknown;
          const label = need?.label || 'Análise indisponível';
          return (
            <div key={team.id} className={cls('p-2 rounded border text-xs', sty.bg)}>
              <div className="flex items-center gap-1.5 mb-1 truncate">
                <span className="text-sm">{team.flag}</span>
                <span className="font-bold truncate">{team.name}</span>
              </div>
              <div className={cls('flex items-center gap-1.5 text-[11px] font-bold uppercase leading-tight', sty.text)}>
                <span className={cls('w-1.5 h-1.5 rounded-full flex-shrink-0', sty.dot)} />
                <span>{label}</span>
              </div>
              {nextMatch && opponent && (
                <button onClick={() => openMatch?.(nextMatch.id)} className="text-[10px] text-slate-400 mt-0.5 hover:text-slate-200 transition truncate block">
                  Próximo: vs {opponent.flag} {opponent.name}
                </button>
              )}
              {need?.detail && (
                <div className="text-[10px] text-slate-500 mt-0.5 italic">{need.detail}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* === Painel de "Ficar de olho" + "Suspensos" dentro do MatchDetailView === */
function MatchExtrasPanel({ state, match }) {
  const homeNotables = useMemo(() => getNotablePlayersForTeam(state, match.homeTeamId, 3), [state.matches, match.homeTeamId]);
  const awayNotables = useMemo(() => getNotablePlayersForTeam(state, match.awayTeamId, 3), [state.matches, match.awayTeamId]);

  const stageKey = matchStageKey(match);

  const homeSuspended = useMemo(() => {
    const roster = state.teamRosters?.[match.homeTeamId] || [];
    return roster
      .map((name) => ({ name, status: getPlayerCardStatus(state, match.homeTeamId, name, stageKey) }))
      .filter((p) => p.status?.suspended);
  }, [state, match.homeTeamId, stageKey]);

  const awaySuspended = useMemo(() => {
    const roster = state.teamRosters?.[match.awayTeamId] || [];
    return roster
      .map((name) => ({ name, status: getPlayerCardStatus(state, match.awayTeamId, name, stageKey) }))
      .filter((p) => p.status?.suspended);
  }, [state, match.awayTeamId, stageKey]);

  const home = getTeamById(state, match.homeTeamId);
  const away = getTeamById(state, match.awayTeamId);

  const hasNotables = homeNotables.length > 0 || awayNotables.length > 0;
  const hasSuspended = homeSuspended.length > 0 || awaySuspended.length > 0;
  if (!hasNotables && !hasSuspended) return null;

  return (
    <Card className="p-4">
      <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-2">
        <Star className="w-3.5 h-3.5 text-amber-400" /> Antes do jogo
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {/* Coluna do home */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 truncate">{home?.flag} {home?.name}</div>
          {homeNotables.length > 0 && (
            <SidePanel
              title="Ficar de olho"
              titleColor="text-amber-300"
              items={homeNotables.map((p) => ({
                name: p.playerName,
                extras: (
                  <>
                    {p.goals > 0 && <span className="text-emerald-400">⚽{p.goals} </span>}
                    {p.assists > 0 && <span className="text-sky-400">🤝{p.assists} </span>}
                    {p.avg > 0 && <span className="text-yellow-300">⭐{p.avg.toFixed(2)}</span>}
                  </>
                ),
              }))}
            />
          )}
          {homeSuspended.length > 0 && (
            <SidePanel
              title="Suspensos"
              titleColor="text-red-400"
              items={homeSuspended.map((p) => ({ name: p.name, extras: <span className="text-red-300">{p.status.reason}</span> }))}
            />
          )}
          {homeNotables.length === 0 && homeSuspended.length === 0 && (
            <div className="text-[10px] italic text-slate-600">Sem destaques ou suspensos.</div>
          )}
        </div>
        {/* Coluna do away */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 truncate">{away?.flag} {away?.name}</div>
          {awayNotables.length > 0 && (
            <SidePanel
              title="Ficar de olho"
              titleColor="text-amber-300"
              items={awayNotables.map((p) => ({
                name: p.playerName,
                extras: (
                  <>
                    {p.goals > 0 && <span className="text-emerald-400">⚽{p.goals} </span>}
                    {p.assists > 0 && <span className="text-sky-400">🤝{p.assists} </span>}
                    {p.avg > 0 && <span className="text-yellow-300">⭐{p.avg.toFixed(2)}</span>}
                  </>
                ),
              }))}
            />
          )}
          {awaySuspended.length > 0 && (
            <SidePanel
              title="Suspensos"
              titleColor="text-red-400"
              items={awaySuspended.map((p) => ({ name: p.name, extras: <span className="text-red-300">{p.status.reason}</span> }))}
            />
          )}
          {awayNotables.length === 0 && awaySuspended.length === 0 && (
            <div className="text-[10px] italic text-slate-600">Sem destaques ou suspensos.</div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SidePanel({ title, titleColor, items }) {
  return (
    <div>
      <div className={cls('text-[10px] uppercase tracking-wider font-bold mb-1 flex items-center gap-1', titleColor)}>{title}</div>
      <div className="space-y-0.5">
        {items.map((it, i) => (
          <div key={i} className="text-[11px] flex items-baseline justify-between gap-2">
            <span className="font-bold truncate">{it.name}</span>
            <span className="text-[10px] flex-shrink-0">{it.extras}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* === Card de head-to-head dos jogadores === */
function HeadToHeadCard({ state, h2h }) {
  if (h2h.totalMatches === 0) {
    return (
      <Card className="p-4 text-center text-slate-500 text-sm italic">
        Nenhum confronto direto entre {state.player1Name} e {state.player2Name} ainda.
      </Card>
    );
  }
  const p1Color = state.player1Color || '#06b6d4';
  const p2Color = state.player2Color || '#f59e0b';
  const totalGoals = h2h.p1Goals + h2h.p2Goals;
  const p1Pct = totalGoals > 0 ? (h2h.p1Goals / totalGoals) * 100 : 50;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2 uppercase tracking-wider font-bold">
        <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Confronto direto</span>
        <span className="text-slate-500 normal-case tracking-normal font-normal">{h2h.totalMatches} jogos no torneio</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* P1 lado esquerdo */}
        <div className="text-right">
          <div className="font-black text-base truncate" style={{ color: p1Color }}>{state.player1Name}</div>
          <div className="text-3xl font-black tabular-nums leading-none mt-1">{h2h.p1Wins}</div>
          <div className="text-[10px] uppercase text-slate-500 mt-0.5">vitórias</div>
        </div>
        {/* Centro */}
        <div className="text-center">
          <div className="text-xl font-black text-slate-400 tabular-nums leading-none mb-1">{h2h.draws}</div>
          <div className="text-[10px] uppercase text-slate-500">empates</div>
        </div>
        {/* P2 lado direito */}
        <div className="text-left">
          <div className="font-black text-base truncate" style={{ color: p2Color }}>{state.player2Name}</div>
          <div className="text-3xl font-black tabular-nums leading-none mt-1">{h2h.p2Wins}</div>
          <div className="text-[10px] uppercase text-slate-500 mt-0.5">vitórias</div>
        </div>
      </div>
      {/* Barra de gols */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          <span style={{ color: p1Color }} className="font-bold">{h2h.p1Goals} gols</span>
          <span>Gols</span>
          <span style={{ color: p2Color }} className="font-bold">{h2h.p2Goals} gols</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex bg-slate-800">
          <div style={{ width: `${p1Pct}%`, backgroundColor: p1Color }} />
          <div style={{ width: `${100 - p1Pct}%`, backgroundColor: p2Color }} />
        </div>
      </div>
    </Card>
  );
}

/* === Card de próximos jogos com "ficar de olho" === */
function UpcomingMatchesCard({ state, upcoming, openMatch, openTeam }) {
  if (upcoming.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-3 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" /> Próximos jogos
        <span className="text-slate-500 normal-case tracking-normal font-normal">— {upcoming.length} pendentes</span>
      </h3>
      <div className="space-y-3">
        {upcoming.map((m) => (
          <UpcomingMatchRow key={m.id} state={state} match={m} openMatch={openMatch} openTeam={openTeam} />
        ))}
      </div>
    </Card>
  );
}

/* Linha de um jogo pendente com os times clicáveis (perfil) e o "o que cada time precisa" embaixo */
function UpcomingMatchRow({ state, match, openMatch, openTeam }) {
  const home = getTeamById(state, match.homeTeamId);
  const away = getTeamById(state, match.awayTeamId);
  const homeColor = getOwnerColor(state, home?.owner);
  const awayColor = getOwnerColor(state, away?.owner);
  const stageLbl = match.stage === 'group' ? `Grupo ${match.group} · R${match.round}` : (STAGE_LABELS[match.stage] || match.stage);

  /* Necessidade de cada time (só pra jogos de fase de grupos) */
  const minimumNeeds = useMemo(() => {
    if (match.stage !== 'group') return null;
    return computeGroupMinimumNeeds(state, match.group, match.id);
  }, [state, match.stage, match.group, match.id]);

  const homeNeed = minimumNeeds?.[match.homeTeamId];
  const awayNeed = minimumNeeds?.[match.awayTeamId];

  const styleByType = {
    guaranteed:     { text: 'text-emerald-300', dot: 'bg-emerald-400' },
    impossible:     { text: 'text-red-300',     dot: 'bg-red-400' },
    needs_min:      { text: 'text-amber-300',   dot: 'bg-amber-400' },
    needs_help:     { text: 'text-orange-300',  dot: 'bg-orange-400' },
    third_chase:    { text: 'text-yellow-200',  dot: 'bg-yellow-400' },
    third_only:     { text: 'text-yellow-200',  dot: 'bg-yellow-400' },
    depends_others: { text: 'text-slate-300',   dot: 'bg-slate-400' },
    unknown:        { text: 'text-slate-400',   dot: 'bg-slate-500' },
  };

  const handleTeamClick = (e, teamId) => {
    e.stopPropagation();
    openTeam?.(teamId);
  };

  return (
    <div
      onClick={() => openMatch(match.id)}
      className="w-full text-left p-2.5 rounded-lg border-2 border-dashed border-slate-700 hover:border-lime-400 transition cursor-pointer"
      style={{ background: `linear-gradient(90deg, ${homeColor}1F 0%, transparent 50%, ${awayColor}1F 100%)` }}
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">{stageLbl}</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button onClick={(e) => handleTeamClick(e, match.homeTeamId)}
          className="flex items-center gap-1.5 justify-end text-right truncate min-w-0 hover:text-lime-300 transition">
          <div className="flex flex-col items-end gap-0.5 min-w-0 max-w-full">
            <span className="truncate font-bold">{home?.flag} {home?.name}</span>
            <OwnerTag owner={home?.owner} p1Name={state.player1Name} p2Name={state.player2Name}
              p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
          </div>
        </button>
        <div className="text-slate-600 font-mono font-black">×</div>
        <button onClick={(e) => handleTeamClick(e, match.awayTeamId)}
          className="flex items-center gap-1.5 truncate min-w-0 hover:text-lime-300 transition">
          <div className="flex flex-col items-start gap-0.5 min-w-0 max-w-full">
            <span className="truncate font-bold">{away?.flag} {away?.name}</span>
            <OwnerTag owner={away?.owner} p1Name={state.player1Name} p2Name={state.player2Name}
              p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
          </div>
        </button>
      </div>

      {/* O que cada time precisa */}
      {(homeNeed || awayNeed) && (
        <div className="mt-2 pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2">
          <NeedSummary need={homeNeed} styleByType={styleByType} side="left" />
          <NeedSummary need={awayNeed} styleByType={styleByType} side="right" />
        </div>
      )}
    </div>
  );
}

function NeedSummary({ need, styleByType, side }) {
  if (!need) return <div />;
  const sty = styleByType[need.type] || styleByType.unknown;
  return (
    <div className={cls('text-[10px]', side === 'right' && 'text-right')}>
      <div className={cls('flex items-center gap-1.5 leading-tight', side === 'right' && 'justify-end', sty.text)}>
        {side === 'left' && <span className={cls('w-1.5 h-1.5 rounded-full flex-shrink-0', sty.dot)} />}
        <span className="font-bold uppercase tracking-wider truncate">{need.label}</span>
        {side === 'right' && <span className={cls('w-1.5 h-1.5 rounded-full flex-shrink-0', sty.dot)} />}
      </div>
      {need.detail && (
        <div className="text-slate-500 italic mt-0.5 truncate">{need.detail}</div>
      )}
    </div>
  );
}

function NotablePlayers() { return null; /* obsoleto, mantido pra compat */ }

function StandingTable({ rows, state, thirdsByTeamId = {}, bestThirdsCount = 0, openTeam }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500">
        <tr>
          <th className="text-left font-medium pb-1 w-6">#</th>
          <th className="text-left font-medium pb-1">Time</th>
          <th className="text-left font-medium pb-1 px-1">Dono</th>
          <th className="font-medium pb-1 px-1">P</th>
          <th className="font-medium pb-1 px-1">V</th>
          <th className="font-medium pb-1 px-1">E</th>
          <th className="font-medium pb-1 px-1">D</th>
          <th className="font-medium pb-1 px-1">GP</th>
          <th className="font-medium pb-1 px-1">SG</th>
          <th className="font-medium pb-1 px-1">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          let rowCls = '';
          let indicator = null;
          if (i < 2) {
            rowCls = 'bg-emerald-950/50 text-emerald-100 font-medium';
            indicator = <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" title="Classificado" />;
          } else if (i === 2 && bestThirdsCount > 0) {
            const t = thirdsByTeamId[r.id];
            if (t?.qualified) {
              rowCls = 'bg-emerald-950/30 text-emerald-100/90';
              indicator = <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" title="Melhor 3º classificado" />;
            } else {
              rowCls = 'text-amber-300';
              indicator = <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" title="3º em disputa" />;
            }
          } else if (i === 2) {
            rowCls = 'text-amber-300';
          }
          return (
            <tr key={r.id} className={cls('border-t border-slate-800', rowCls)}>
              <td className="py-1.5 tabular-nums">
                <span className="inline-flex items-center">{i + 1}{indicator}</span>
              </td>
              <td className="py-1.5">
                {openTeam ? (
                  <button onClick={() => openTeam(r.id)} className="hover:text-lime-300 transition text-left">
                    <span className="mr-1">{r.flag}</span>{r.name}
                  </button>
                ) : (
                  <><span className="mr-1">{r.flag}</span>{r.name}</>
                )}
              </td>
              <td className="py-1.5 px-1">
                <OwnerTag owner={r.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                  p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
              </td>
              <td className="text-center py-1.5 tabular-nums">{r.P}</td>
              <td className="text-center py-1.5 tabular-nums">{r.V}</td>
              <td className="text-center py-1.5 tabular-nums">{r.E}</td>
              <td className="text-center py-1.5 tabular-nums">{r.D}</td>
              <td className="text-center py-1.5 tabular-nums">{r.GP}</td>
              <td className="text-center py-1.5 tabular-nums">{r.SG > 0 ? '+' : ''}{r.SG}</td>
              <td className="text-center py-1.5 tabular-nums font-bold">{r.Pts}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ============================================================
   MATCHES VIEW — Lista de jogos da fase de grupos
   ============================================================ */
function MatchesView({ state, update, updateMatches, allTeams, openMatch }) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) {
    return <div className="text-center text-slate-500 py-12">Use a aba "Mata-Mata" pra ver os jogos.</div>;
  }
  const groupMatches = state.matches.filter((m) => m.stage === 'group');
  if (groupMatches.length === 0) {
    return <div className="text-center text-slate-500 py-12">Sem jogos gerados ainda.</div>;
  }

  /* Descobre todas as rodadas presentes */
  const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => a - b);

  /* Rodada padrão = primeira com pelo menos um jogo não jogado */
  const defaultRound = useMemo(() => {
    for (const r of rounds) {
      const roundMatches = groupMatches.filter((m) => m.round === r);
      if (roundMatches.some((m) => !m.played)) return r;
    }
    return rounds[rounds.length - 1]; // tudo jogado: mostra última
  }, [rounds.join(','), groupMatches.length, groupMatches.filter((m) => m.played).length]);

  const [currentRound, setCurrentRound] = useState(defaultRound);
  /* Se o usuário não interagiu e o default mudou, segue */
  const [userPicked, setUserPicked] = useState(false);
  useEffect(() => {
    if (!userPicked) setCurrentRound(defaultRound);
  }, [defaultRound]); // eslint-disable-line

  const pickRound = (r) => {
    setUserPicked(true);
    setCurrentRound(r);
  };

  const currentIdx = rounds.indexOf(currentRound);
  const prev = currentIdx > 0 ? rounds[currentIdx - 1] : null;
  const next = currentIdx < rounds.length - 1 ? rounds[currentIdx + 1] : null;

  /* Jogos da rodada atual, agrupados por grupo */
  const roundMatches = groupMatches.filter((m) => m.round === currentRound);
  const byGroup = {};
  for (const m of roundMatches) {
    if (!byGroup[m.group]) byGroup[m.group] = [];
    byGroup[m.group].push(m);
  }
  const groupLetters = Object.keys(byGroup).sort();
  const playedInRound = roundMatches.filter((m) => m.played).length;

  const isReturnLeg = currentRound > 3;
  const labelRound = isReturnLeg
    ? `Rodada ${currentRound - 3} (volta)`
    : `Rodada ${currentRound}`;

  return (
    <div className="space-y-4">
      {/* Header paginação */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-lg p-2">
        <button
          onClick={() => prev && pickRound(prev)}
          disabled={!prev}
          className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Anterior</span>
        </button>
        <div className="text-center">
          <div className="text-base font-black">{labelRound}</div>
          <div className="text-[10px] text-slate-500 tabular-nums">
            {currentIdx + 1} de {rounds.length} · {playedInRound}/{roundMatches.length} jogados
          </div>
        </div>
        <button
          onClick={() => next && pickRound(next)}
          disabled={!next}
          className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md text-sm font-medium"
        >
          <span className="hidden sm:inline">Próxima</span> <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Mini-seletor de rodadas (pílulas pequenas) */}
      <div className="flex flex-wrap gap-1 justify-center">
        {rounds.map((r) => {
          const rMatches = groupMatches.filter((m) => m.round === r);
          const rPlayed = rMatches.filter((m) => m.played).length;
          const allPlayed = rPlayed === rMatches.length;
          const isCurrent = r === currentRound;
          return (
            <button key={r} onClick={() => pickRound(r)} className={cls(
              'text-[10px] font-bold px-2 py-1 rounded border transition',
              isCurrent ? 'bg-lime-400 text-slate-950 border-lime-400'
                : allPlayed ? 'bg-slate-900/60 text-slate-500 border-slate-800 hover:border-slate-600'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
            )}>
              R{r > 3 ? `${r - 3}v` : r}
            </button>
          );
        })}
      </div>

      {/* Jogos da rodada agrupados por grupo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groupLetters.map((letter) => (
          <Card key={letter} className="p-3">
            <h3 className="font-black text-base mb-2 text-slate-300">Grupo {letter}</h3>
            <div className="space-y-2">
              {byGroup[letter].sort((a, b) => a.id.localeCompare(b.id)).map((m) => (
                <MatchRow key={m.id} match={m} state={state} onClick={() => openMatch(m.id)} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MatchRow({ match, state, onClick }) {
  const home = getTeamById(state, match.homeTeamId);
  const away = getTeamById(state, match.awayTeamId);
  if (!home || !away) return null;
  const isAuto = match.autoPlayed;

  const homeColor = getOwnerColor(state, home.owner);
  const awayColor = getOwnerColor(state, away.owner);

  /* Três estados visuais bem distintos */
  let outerCls;
  if (isAuto) {
    outerCls = 'opacity-50 border border-slate-800';
  } else if (match.played) {
    outerCls = 'border-2 border-emerald-700/60 shadow-sm shadow-emerald-900/40 hover:border-emerald-500';
  } else {
    outerCls = 'border-2 border-dashed border-slate-700 hover:border-lime-400';
  }

  /* Faixa de cor sutil em cada lado da linha */
  const bgStyle = isAuto
    ? { background: 'rgb(15 23 42 / 0.5)' }
    : { background: `linear-gradient(90deg, ${homeColor}22 0%, ${homeColor}10 35%, transparent 50%, ${awayColor}10 65%, ${awayColor}22 100%)` };

  return (
    <button onClick={onClick} className={cls('w-full p-2 rounded-lg transition text-sm block', outerCls)} style={bgStyle}>
      {isAuto && (
        <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1 text-center font-bold">Auto-empate (mesmo dono)</div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-1.5 justify-end text-right truncate min-w-0">
          <div className="flex flex-col items-end gap-0.5 min-w-0 max-w-full">
            <span className="truncate font-medium">{home.flag} {home.name}</span>
            <OwnerTag owner={home.owner} p1Name={state.player1Name} p2Name={state.player2Name}
              p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
          </div>
        </div>
        <div className={cls('font-mono font-black tabular-nums px-3 py-1 rounded',
          match.played && !isAuto ? 'bg-slate-950 text-emerald-300 text-base border border-emerald-700/40' :
          isAuto ? 'text-slate-600 text-sm' :
          'text-slate-500 text-base')}>
          {match.played ? `${match.homeScore}–${match.awayScore}` : '—'}
        </div>
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <div className="flex flex-col items-start gap-0.5 min-w-0 max-w-full">
            <span className="truncate font-medium">{away.flag} {away.name}</span>
            <OwnerTag owner={away.owner} p1Name={state.player1Name} p2Name={state.player2Name}
              p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
          </div>
        </div>
      </div>
    </button>
  );
}

/* ============================================================
   MATCH DETAIL VIEW — Detalhe do jogo
   ============================================================ */
function MatchDetailView({ state, matchId, updateMatches, update, allTeams, onBack, openMatch }) {
  const match = state.matches.find((m) => m.id === matchId);
  if (!match) return <div className="text-slate-500">Jogo não encontrado.</div>;

  const home = getTeamById(state, match.homeTeamId);
  const away = getTeamById(state, match.awayTeamId);

  /* Sequência ordenada de jogos pra navegação Anterior/Próximo (pula prorrogações) */
  const orderedMatches = useMemo(() => {
    return state.matches.filter((m) => !m.isExtra).sort((a, b) => {
      const aIdx = STAGE_ORDER_INDEX[matchStageKey(a)] ?? 999;
      const bIdx = STAGE_ORDER_INDEX[matchStageKey(b)] ?? 999;
      if (aIdx !== bIdx) return aIdx - bIdx;
      /* mesma rodada: ordena por grupo / koIndex / leg */
      if (a.stage === 'group') {
        if (a.group !== b.group) return (a.group || '').localeCompare(b.group || '');
        return a.id.localeCompare(b.id);
      }
      if ((a.koIndex ?? 0) !== (b.koIndex ?? 0)) return (a.koIndex ?? 0) - (b.koIndex ?? 0);
      return (a.leg ?? 1) - (b.leg ?? 1);
    });
  }, [state.matches]);

  const currentIdx = orderedMatches.findIndex((m) => m.id === matchId);
  const prevMatch = currentIdx > 0 ? orderedMatches[currentIdx - 1] : null;
  const nextMatch = currentIdx < orderedMatches.length - 1 ? orderedMatches[currentIdx + 1] : null;
  /* Próximo jogo não jogado (atalho útil quando o próximo já está jogado) */
  const nextUnplayed = orderedMatches.slice(currentIdx + 1).find((m) => !m.played && !m.autoPlayed);

  const setMatch = useCallback((updater) => {
    const newMatches = state.matches.map((m) => m.id === matchId ? (typeof updater === 'function' ? updater(m) : updater) : m);
    updateMatches(newMatches); // já faz auto-fill + seeding + propagation
  }, [state.matches, matchId, updateMatches]);

  const setScore = (homeScore, awayScore) => {
    setMatch((m) => {
      const newHome = homeScore === '' ? null : Number(homeScore);
      const newAway = awayScore === '' ? null : Number(awayScore);
      const played = newHome != null && newAway != null && !Number.isNaN(newHome) && !Number.isNaN(newAway);
      return { ...m, homeScore: newHome, awayScore: newAway, played };
    });
  };

  if (!home || !away) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ChevronLeft className="w-4 h-4" /> Voltar</button>
        <Card className="p-6 text-center text-slate-500">
          Aguardando definição dos times deste confronto...
        </Card>
      </div>
    );
  }

  const isKo = match.stage !== 'group';
  const stageLabel = isKo ? (STAGE_LABELS[match.stage] || match.stage) : `Grupo ${match.group} · Rodada ${match.round}`;
  const legLabel = match.totalLegs > 1 ? ` · ${match.leg === 1 ? 'Ida' : 'Volta'}` : '';

  return (
    <div className="space-y-4">
      {/* Barra de navegação topo */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
          <ChevronLeft className="w-4 h-4" /> Lista
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => prevMatch && openMatch(prevMatch.id)}
            disabled={!prevMatch}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <button
            onClick={() => nextMatch && openMatch(nextMatch.id)}
            disabled={!nextMatch}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm font-medium"
          >
            Próximo <ChevronRight className="w-4 h-4" />
          </button>
          {nextUnplayed && nextUnplayed.id !== nextMatch?.id && (
            <button
              onClick={() => openMatch(nextUnplayed.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-lime-500 hover:bg-lime-400 text-slate-950 rounded text-sm font-bold"
            >
              Próximo a jogar <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">{stageLabel}{legLabel}</div>
        <ScoreEntry match={match} home={home} away={away} onChange={setScore} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} />
        <FavoriteBadge state={state} home={home} away={away} />
      </Card>

      {!isKo && !match.played && <GroupScenariosCard state={state} matchId={matchId} />}

      <MatchExtrasPanel state={state} match={match} />

      {isKo && <KnockoutMatchExtras state={state} match={match} home={home} away={away} update={update} updateMatches={updateMatches} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamMatchPanel state={state} match={match} team={home} updateMatches={updateMatches} update={update} allMatches={state.matches} />
        <TeamMatchPanel state={state} match={match} team={away} updateMatches={updateMatches} update={update} allMatches={state.matches} />
      </div>

      {/* Botões de navegação repetidos embaixo */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
        <button
          onClick={() => prevMatch && openMatch(prevMatch.id)}
          disabled={!prevMatch}
          className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <button
          onClick={() => nextMatch && openMatch(nextMatch.id)}
          disabled={!nextMatch}
          className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-sm font-medium"
        >
          Próximo <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ScoreEntry({ match, home, away, onChange, p1Name, p2Name, p1Color, p2Color }) {
  /* Gradiente sutil de cor do dono ao redor do placar */
  const homeColor = home.owner === 'p1' ? p1Color : home.owner === 'p2' ? p2Color : '#475569';
  const awayColor = away.owner === 'p1' ? p1Color : away.owner === 'p2' ? p2Color : '#475569';

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
      <TeamHeader team={home} align="right" p1Name={p1Name} p2Name={p2Name} p1Color={p1Color} p2Color={p2Color} />
      <div
        className="flex items-center gap-1 p-2 rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${homeColor}33 0%, ${awayColor}33 100%)`,
          border: `1px solid ${homeColor}55`,
        }}
      >
        <input
          type="number" min="0"
          value={match.homeScore ?? ''}
          onChange={(e) => onChange(e.target.value, match.awayScore ?? '')}
          className="w-14 p-2 text-center text-2xl font-black bg-slate-950/70 border-2 rounded outline-none tabular-nums"
          style={{ borderColor: `${homeColor}99` }}
        />
        <span className="text-2xl text-slate-200 font-black">×</span>
        <input
          type="number" min="0"
          value={match.awayScore ?? ''}
          onChange={(e) => onChange(match.homeScore ?? '', e.target.value)}
          className="w-14 p-2 text-center text-2xl font-black bg-slate-950/70 border-2 rounded outline-none tabular-nums"
          style={{ borderColor: `${awayColor}99` }}
        />
      </div>
      <TeamHeader team={away} align="left" p1Name={p1Name} p2Name={p2Name} p1Color={p1Color} p2Color={p2Color} />
    </div>
  );
}

function TeamHeader({ team, align = 'left', p1Name, p2Name, p1Color, p2Color }) {
  return (
    <div className={cls('flex items-center gap-2', align === 'right' && 'justify-end flex-row-reverse')}>
      <span className="text-2xl">{team.flag}</span>
      <div className={cls('flex flex-col gap-0.5 min-w-0', align === 'right' && 'items-end')}>
        <span className="font-bold truncate">{team.name}</span>
        {team.owner && <OwnerTag owner={team.owner} p1Name={p1Name} p2Name={p2Name} p1Color={p1Color} p2Color={p2Color} />}
      </div>
    </div>
  );
}

/* === Favorito (baseado no Power Ranking do torneio) === */
function FavoriteBadge({ state, home, away }) {
  const power = useMemo(() => computePowerRankingTeams(state), [state.matches]);
  const homePower = power.find((p) => p.teamId === home.id);
  const awayPower = power.find((p) => p.teamId === away.id);

  /* Nenhum dos dois jogou ainda */
  if (!homePower && !awayPower) {
    return (
      <div className="mt-3 pt-3 border-t border-slate-800 text-center text-[11px] text-slate-500 italic">
        Aguardando primeiros jogos para calcular o favorito.
      </div>
    );
  }
  /* Só um tem histórico — esse é o favorito por default */
  if (!homePower || !awayPower) {
    const fav = homePower ? home : away;
    const other = homePower ? away : home;
    const score = (homePower || awayPower).powerScore;
    return (
      <div className="mt-3 pt-3 border-t border-slate-800">
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-700 text-emerald-50">
            {fav.flag} {fav.name} · Favorito
          </span>
        </div>
        <div className="text-[10px] text-slate-500 text-center mt-1.5 italic">
          {other.name} ainda não tem histórico no torneio · Power Rank {score.toFixed(1)}
        </div>
      </div>
    );
  }

  const hr = homePower.powerScore;
  const ar = awayPower.powerScore;
  const diff = Math.abs(hr - ar);

  /* Diferença muito pequena = equilíbrio */
  if (diff < 0.5) {
    return (
      <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-400 flex-wrap">
        <span className="font-mono tabular-nums">{hr.toFixed(1)}</span>
        <span className="uppercase tracking-wider font-bold">Power Rank</span>
        <span className="font-mono tabular-nums">{ar.toFixed(1)}</span>
        <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold uppercase">Equilíbrio total</span>
      </div>
    );
  }

  const favoredHome = hr > ar;
  const fav = favoredHome ? home : away;
  /* Tiers calibrados pro range típico do Power Rank (geralmente 10-50) */
  const tier =
    diff >= 18 ? { label: 'Carrasco', color: 'bg-red-600 text-white' } :
    diff >= 12 ? { label: 'Favorito firme', color: 'bg-amber-500 text-amber-950' } :
    diff >= 6  ? { label: 'Favorito leve', color: 'bg-emerald-600 text-emerald-50' } :
                 { label: 'Levemente favorecido', color: 'bg-slate-600 text-slate-100' };

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
        <span className={cls('font-mono tabular-nums font-bold', favoredHome ? 'text-emerald-300 text-base' : 'text-slate-500')}>{hr.toFixed(1)}</span>
        <span className="uppercase tracking-wider font-bold text-slate-500">Power Rank</span>
        <span className={cls('font-mono tabular-nums font-bold', !favoredHome ? 'text-emerald-300 text-base' : 'text-slate-500')}>{ar.toFixed(1)}</span>
      </div>
      <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
        <span className={cls('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', tier.color)}>
          {fav?.flag} {fav?.name} · {tier.label}
        </span>
        <span className="text-[10px] text-slate-500">+{diff.toFixed(1)} pts</span>
      </div>
    </div>
  );
}

/* === Cenários de classificação (fase de grupos) === */
function GroupScenariosCard({ state, matchId }) {
  const data = useMemo(() => computeGroupScenarios(state, matchId), [state.matches, state.playerPositions, matchId]);
  const minimumNeeds = useMemo(() => {
    const match = state.matches.find((m) => m.id === matchId);
    if (!match || match.stage !== 'group') return {};
    return computeGroupMinimumNeeds(state, match.group, matchId);
  }, [state.matches, matchId]);

  if (!data) return null;
  const { match, group, scenarios } = data;
  const format = getFormat(state.formatId);
  const bestThirdsCount = format.bestThirds || 0;
  const groupObj = state.groups.find((g) => g.letter === group);
  const teamsInGroup = groupObj?.teams || [];

  /* Configuração visual por tipo de status */
  const styleByType = {
    guaranteed:     { bg: 'bg-emerald-950/50 border-emerald-700/40', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    impossible:     { bg: 'bg-red-950/50 border-red-700/40',         text: 'text-red-300',     dot: 'bg-red-400' },
    needs_min:      { bg: 'bg-amber-950/50 border-amber-700/40',     text: 'text-amber-300',   dot: 'bg-amber-400' },
    needs_help:     { bg: 'bg-orange-950/50 border-orange-700/40',   text: 'text-orange-300',  dot: 'bg-orange-400' },
    third_chase:    { bg: 'bg-yellow-950/50 border-yellow-700/40',   text: 'text-yellow-200',  dot: 'bg-yellow-400' },
    third_only:     { bg: 'bg-yellow-950/50 border-yellow-700/40',   text: 'text-yellow-200',  dot: 'bg-yellow-400' },
    depends_others: { bg: 'bg-slate-900/60 border-slate-700',        text: 'text-slate-300',   dot: 'bg-slate-400' },
  };

  return (
    <Card className="p-4">
      <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5" /> Cenários de classificação · Grupo {group}
      </h3>

      {/* Mínimo necessário pra cada time do grupo */}
      {teamsInGroup.length > 0 && Object.keys(minimumNeeds).length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">O que cada time precisa</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {teamsInGroup.map((team) => {
              const need = minimumNeeds[team.id];
              if (!need) return null;
              const sty = styleByType[need.type] || styleByType.depends_others;
              const isInGame = team.id === match.homeTeamId || team.id === match.awayTeamId;
              return (
                <div key={team.id} className={cls('p-2 rounded border', sty.bg, isInGame && 'ring-1 ring-lime-500/40')}>
                  <div className="flex items-center gap-1.5 text-xs mb-1 truncate">
                    <span>{team.flag}</span>
                    <span className="font-bold truncate">{team.name}</span>
                  </div>
                  <div className={cls('flex items-center gap-1.5 text-[11px] font-bold uppercase', sty.text)}>
                    <span className={cls('w-1.5 h-1.5 rounded-full', sty.dot)} />
                    {need.label}
                  </div>
                  {need.detail && (
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">{need.detail}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cenários: V_home / E / V_away */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {scenarios.map((sc) => (
          <ScenarioColumn
            key={sc.key}
            scenario={sc}
            state={state}
            currentHomeId={match.homeTeamId}
            currentAwayId={match.awayTeamId}
            bestThirdsCount={bestThirdsCount}
          />
        ))}
      </div>

      <div className="text-[10px] text-slate-600 italic mt-3 leading-relaxed">
        Análise foca em classificação direta (top 2). Se o time não puder mais ficar no top 2, mostra o necessário pra disputar vaga de melhor 3º (sem garantia).
      </div>
    </Card>
  );
}

function ScenarioColumn({ scenario, state, currentHomeId, currentAwayId, bestThirdsCount }) {
  const { label, homeScore, awayScore, standing, matchups, key } = scenario;
  const accent =
    key === 'home_wins' ? 'border-emerald-700/40 bg-emerald-950/20' :
    key === 'draw'      ? 'border-slate-700 bg-slate-900/40' :
                          'border-blue-700/40 bg-blue-950/20';
  return (
    <div className={cls('rounded-lg border p-2', accent)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1 truncate">{label}</div>
      <div className="text-xs font-mono font-bold text-center mb-2 text-slate-200">{homeScore}–{awayScore}</div>
      <table className="w-full text-[11px]">
        <thead className="text-slate-600">
          <tr>
            <th className="text-left font-medium pb-1">#</th>
            <th className="text-left font-medium pb-1">Time</th>
            <th className="text-center font-medium pb-1">P</th>
            <th className="text-center font-medium pb-1">SG</th>
          </tr>
        </thead>
        <tbody>
          {standing.map((r, i) => {
            const involved = r.id === currentHomeId || r.id === currentAwayId;
            let rowCls = '';
            if (i < 2) rowCls = 'bg-emerald-950/40 text-emerald-100';
            else if (i === 2 && bestThirdsCount > 0) rowCls = 'text-amber-300';
            return (
              <tr key={r.id} className={cls('border-t border-slate-800/40', rowCls, involved && 'font-bold')}>
                <td className="py-1 tabular-nums">{i + 1}</td>
                <td className="py-1 truncate"><span className="mr-1">{r.flag}</span>{r.name}</td>
                <td className="text-center py-1 tabular-nums font-bold">{r.Pts}</td>
                <td className="text-center py-1 tabular-nums">{r.SG > 0 ? '+' : ''}{r.SG}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Matchups do mata-mata pra cada classificado neste cenário */}
      {matchups && matchups.some((mu) => mu.qualified) && (
        <div className="mt-2 pt-2 border-t border-slate-800/40">
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1 flex items-center gap-1">
            <Trophy className="w-2.5 h-2.5" /> Mata-mata
          </div>
          <div className="space-y-1">
            {matchups.filter((mu) => mu.qualified).map((mu) => {
              const involved = mu.teamId === currentHomeId || mu.teamId === currentAwayId;
              return (
                <div key={mu.teamId} className={cls('flex items-center gap-1 text-[10px] leading-tight', involved && 'font-bold')}>
                  <span className="text-slate-500 tabular-nums w-3">{mu.position}º</span>
                  <span>{mu.teamFlag}</span>
                  <span className="text-slate-600">vs</span>
                  {mu.opponent ? (
                    <>
                      <span>{mu.opponent.flag}</span>
                      <span className="truncate">{mu.opponent.name}</span>
                    </>
                  ) : (
                    <span className="italic text-slate-600 truncate">a definir (outros grupos)</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Mata-mata: botões de prorrogação / pênaltis --- */
function KnockoutMatchExtras({ state, match, home, away, update, updateMatches }) {
  if (match.isExtra) {
    /* Tela de prorrogação: oferece "Foi pra pênaltis" se empate */
    const tied = match.played && match.homeScore === match.awayScore;
    if (!tied) return null;
    const setPenaltyWinner = (teamId) => {
      const newMatches = state.matches.map((m) => m.id === match.id ? { ...m, penaltyWinner: teamId } : m);
      updateMatches(newMatches);
    };
    return (
      <Card className="p-4 border-amber-700/50 bg-amber-900/10">
        <h3 className="font-bold text-amber-300 mb-3 flex items-center gap-2"><Zap className="w-4 h-4" /> Prorrogação empatou — quem ganhou nos pênaltis?</h3>
        <div className="flex gap-2">
          <button onClick={() => setPenaltyWinner(home.id)} className={cls('flex-1 p-3 border rounded-lg font-bold transition', match.penaltyWinner === home.id ? 'bg-lime-500 text-slate-950 border-lime-400' : 'bg-slate-900 border-slate-700 hover:border-slate-500')}>
            {home.flag} {home.name}
          </button>
          <button onClick={() => setPenaltyWinner(away.id)} className={cls('flex-1 p-3 border rounded-lg font-bold transition', match.penaltyWinner === away.id ? 'bg-lime-500 text-slate-950 border-lime-400' : 'bg-slate-900 border-slate-700 hover:border-slate-500')}>
            {away.flag} {away.name}
          </button>
        </div>
      </Card>
    );
  }

  /* Jogo principal: se for o último leg jogado e agregado empate, oferece "Foi pra prorrogação" */
  const allLegs = state.matches.filter((m) => m.stage === match.stage && m.koIndex === match.koIndex && !m.isExtra);
  const allPlayed = allLegs.every((m) => m.played);
  if (!allPlayed) return null;

  /* Calcula agregado */
  const teamA = allLegs[0].homeTeamId;
  const teamB = allLegs[0].awayTeamId;
  let aggA = 0, aggB = 0;
  for (const m of allLegs) {
    if (m.homeTeamId === teamA) { aggA += m.homeScore; aggB += m.awayScore; }
    else                         { aggA += m.awayScore; aggB += m.homeScore; }
  }
  if (aggA !== aggB) return null; // não empatou, propagação já cuida

  const etMatch = state.matches.find((m) => m.stage === match.stage && m.koIndex === match.koIndex && m.isExtra);
  if (etMatch) return null; // já tem prorrogação criada

  const createET = () => {
    const newET = {
      id: `k-${match.stage}-${match.koIndex + 1}-et`,
      stage: match.stage,
      koIndex: match.koIndex,
      isExtra: true,
      leg: 1, totalLegs: 1,
      homeTeamId: teamA,
      awayTeamId: teamB,
      homeScore: null, awayScore: null,
      played: false,
      events: [],
      ratings: {},
      penaltyWinner: null,
    };
    updateMatches([...state.matches, newET]);
  };

  return (
    <Card className="p-4 border-amber-700/50 bg-amber-900/10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-amber-300 flex items-center gap-2"><Zap className="w-4 h-4" /> Agregado empatado ({aggA} × {aggB})</h3>
          <p className="text-xs text-slate-400 mt-1">O confronto precisa de prorrogação pra decidir o vencedor.</p>
        </div>
        <button onClick={createET} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg flex items-center gap-2 flex-shrink-0">
          Foi pra prorrogação <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}

/* --- Team panel: eventos + notas --- */
function TeamMatchPanel({ state, match, team, updateMatches, update, allMatches }) {
  const teamColor = getOwnerColor(state, team.owner);
  const events = (match.events || []).filter((e) => e.teamId === team.id);
  const ratings = match.ratings?.[team.id] || {};

  /* Roster persistente desse time */
  const persistentRoster = useMemo(() => state.teamRosters?.[team.id] || [], [state.teamRosters, team.id]);

  /* Jogadores exibidos: roster + qualquer jogador presente nesse jogo (eventos ou notas) */
  const displayedPlayers = useMemo(() => {
    const fromMatch = new Set([
      ...Object.keys(ratings),
      ...events.map((e) => e.playerName).filter(Boolean),
    ]);
    const combined = [...persistentRoster];
    for (const p of fromMatch) if (!combined.includes(p)) combined.push(p);
    return combined;
  }, [persistentRoster, ratings, events]);

  /* Conta eventos por jogador e tipo */
  const countEv = (player, type) => events.filter((e) => e.playerName === player && e.type === type).length;

  const updateMatch = (updater) => {
    updateMatches(state.matches.map((m) => m.id === match.id ? (typeof updater === 'function' ? updater(m) : updater) : m));
  };

  /* === Ações no roster persistente === */
  const setRoster = (newList) => {
    const newRosters = { ...(state.teamRosters || {}), [team.id]: newList };
    update({ teamRosters: newRosters });
  };
  const addPlayerToRoster = (rawName) => {
    const name = (rawName || '').trim();
    if (!name) return;
    if (persistentRoster.includes(name)) return;
    setRoster([...persistentRoster, name]);
  };
  const removePlayerEverywhere = (name) => {
    /* Remove do roster permanente */
    setRoster(persistentRoster.filter((p) => p !== name));
    /* E remove do jogo atual */
    updateMatch((m) => {
      const newRatings = { ...(m.ratings || {}) };
      const teamR = { ...(newRatings[team.id] || {}) };
      delete teamR[name];
      newRatings[team.id] = teamR;
      const newEvents = (m.events || []).filter((ev) => !(ev.teamId === team.id && ev.playerName === name));
      return { ...m, ratings: newRatings, events: newEvents };
    });
  };
  const renamePlayer = (oldName, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed || trimmed === oldName) return;
    /* Atualiza roster */
    const newRoster = persistentRoster.map((p) => p === oldName ? trimmed : p);
    /* Atualiza match (rename em ratings e events) — junto */
    const newRosters = { ...(state.teamRosters || {}), [team.id]: newRoster };
    update({
      teamRosters: newRosters,
      matches: state.matches.map((m) => {
        if (m.id !== match.id) return m;
        const newRatings = { ...(m.ratings || {}) };
        const teamR = { ...(newRatings[team.id] || {}) };
        if (teamR[oldName] !== undefined) {
          teamR[trimmed] = teamR[oldName];
          delete teamR[oldName];
        }
        newRatings[team.id] = teamR;
        const newEvents = (m.events || []).map((ev) =>
          ev.teamId === team.id && ev.playerName === oldName ? { ...ev, playerName: trimmed } : ev
        );
        return { ...m, ratings: newRatings, events: newEvents };
      }),
    });
  };

  /* === Eventos === */
  const incrementEvent = (player, type) => {
    updateMatch((m) => ({
      ...m,
      events: [...(m.events || []), { id: Math.random().toString(36).slice(2), teamId: team.id, type, playerName: player }],
    }));
  };
  const decrementEvent = (player, type) => {
    updateMatch((m) => {
      const evs = [...(m.events || [])];
      const idx = evs.findIndex((e) => e.teamId === team.id && e.playerName === player && e.type === type);
      if (idx >= 0) evs.splice(idx, 1);
      return { ...m, events: evs };
    });
  };

  /* === Notas === */
  const setRating = (player, val) => {
    updateMatch((m) => {
      const newRatings = { ...(m.ratings || {}) };
      const teamR = { ...(newRatings[team.id] || {}) };
      teamR[player] = val ?? '';
      newRatings[team.id] = teamR;
      return { ...m, ratings: newRatings };
    });
  };

  /* === Adicionar novo jogador (input controlado) === */
  const [newPlayerName, setNewPlayerName] = useState('');
  const handleAddPlayer = () => {
    addPlayerToRoster(newPlayerName);
    setNewPlayerName('');
  };

  /* === Suspensões === */
  const upToStageKey = matchStageKey(match);

  return (
    <Card
      className="p-3"
      style={{
        backgroundColor: `${teamColor}15`, // ~8% opacity em hex
        borderColor: `${teamColor}55`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <TeamHeader team={team} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} />
        <PhotoRatingsButton playerNames={displayedPlayers} onExtracted={(playersWithRatings) => {
          updateMatch((m) => {
            const newRatings = { ...(m.ratings || {}) };
            const teamR = { ...(newRatings[team.id] || {}) };
            for (const { name, rating } of playersWithRatings) {
              if (name && rating != null) teamR[name] = rating;
            }
            newRatings[team.id] = teamR;
            return { ...m, ratings: newRatings };
          });
          /* Adiciona novos jogadores extraídos da foto ao roster */
          const newToAdd = playersWithRatings.map((p) => p.name).filter((n) => n && !persistentRoster.includes(n));
          if (newToAdd.length > 0) setRoster([...persistentRoster, ...newToAdd]);
        }} />
      </div>

      {/* Avisos de suspensão */}
      {displayedPlayers.length > 0 && (
        <SuspensionWarnings state={state} teamId={team.id} players={displayedPlayers} upToStageKey={upToStageKey} />
      )}

      {/* Estatísticas avançadas do time neste jogo */}
      <TeamStatsInputs match={match} teamId={team.id} updateMatch={updateMatch} />

      {/* Tabela de jogadores */}
      <div className="overflow-x-auto -mx-3 px-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
              <th className="text-left pb-1 pr-1">Pos · Jogador</th>
              <th className="pb-1 px-0.5 w-12" title="Gols"><Goal className="w-3.5 h-3.5 text-emerald-400 inline" /></th>
              <th className="pb-1 px-0.5 w-12" title="Assistências"><Hand className="w-3.5 h-3.5 text-sky-400 inline" /></th>
              <th className="pb-1 px-0.5 w-12" title="Defesas (goleiros)"><span className="text-sm">🧤</span></th>
              <th className="pb-1 px-0.5 w-10" title="Amarelos"><span className="inline-block w-2 h-3 bg-yellow-400 rounded-sm" /></th>
              <th className="pb-1 px-0.5 w-10" title="Vermelhos"><span className="inline-block w-2 h-3 bg-red-500 rounded-sm" /></th>
              <th className="pb-1 px-0.5 w-14" title="Nota"><Star className="w-3.5 h-3.5 text-yellow-300 inline" /></th>
              <th className="pb-1 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {displayedPlayers.length === 0 && (
              <tr>
                <td colSpan={8} className="text-slate-600 italic text-center py-2">Sem jogadores cadastrados. Adicione abaixo.</td>
              </tr>
            )}
            {displayedPlayers.map((player) => (
              <PlayerRow
                key={player}
                player={player}
                rating={ratings[player] ?? ''}
                goals={countEv(player, 'goal')}
                assists={countEv(player, 'assist')}
                yellows={countEv(player, 'yellow')}
                reds={countEv(player, 'red')}
                saves={countEv(player, 'save')}
                position={getPlayerPosition(state, team.id, player)}
                onIncrement={(t) => incrementEvent(player, t)}
                onDecrement={(t) => decrementEvent(player, t)}
                onRename={(nn) => renamePlayer(player, nn)}
                onSetRating={(v) => setRating(player, v)}
                onRemove={() => removePlayerEverywhere(player)}
                onSetPosition={(pos) => {
                  const key = `${team.id}|${player}`;
                  const newPos = { ...(state.playerPositions || {}) };
                  if (pos) newPos[key] = pos;
                  else delete newPos[key];
                  update({ playerPositions: newPos });
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Adicionar novo jogador */}
      <div className="mt-2 flex gap-1">
        <input
          value={newPlayerName}
          onChange={(e) => setNewPlayerName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
          placeholder="+ Novo jogador (fica salvo no time)"
          className="flex-1 text-xs bg-slate-950/40 border border-slate-800 focus:border-lime-400 rounded px-2 py-1.5 outline-none"
        />
        <button
          onClick={handleAddPlayer}
          disabled={!newPlayerName.trim()}
          className="px-3 py-1.5 bg-lime-500 hover:bg-lime-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold rounded"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {persistentRoster.length > 0 && (
        <div className="text-[10px] text-slate-500 mt-1">Esses jogadores aparecem em todos os próximos jogos deste time.</div>
      )}
    </Card>
  );
}

/* Linha de jogador na tabela com contadores compactos */
/* Inputs pra estatísticas avançadas do time neste jogo: posse, finalizações, xG */
function TeamStatsInputs({ match, teamId, updateMatch }) {
  const ts = (match.teamStats || {})[teamId] || {};

  const setStat = (field, rawValue) => {
    const value = rawValue === '' ? null : rawValue;
    updateMatch((m) => {
      const newTeamStats = { ...(m.teamStats || {}) };
      const cur = { ...(newTeamStats[teamId] || {}) };
      cur[field] = value;
      newTeamStats[teamId] = cur;
      return { ...m, teamStats: newTeamStats };
    });
  };

  return (
    <div className="mb-2 grid grid-cols-3 gap-2 p-2 rounded bg-slate-950/40 border border-slate-800/60">
      <StatField label="Posse (%)" value={ts.possession ?? ''} step="1" min="0" max="100"
        onChange={(v) => setStat('possession', v)} placeholder="—" />
      <StatField label="Finalizações" value={ts.shots ?? ''} step="1" min="0"
        onChange={(v) => setStat('shots', v)} placeholder="—" integer />
      <StatField label="xG" value={ts.xG ?? ''} step="0.01" min="0"
        onChange={(v) => setStat('xG', v)} placeholder="—" />
    </div>
  );
}

function StatField({ label, value, onChange, placeholder, step, min, max, integer }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px]">
      <span className="uppercase tracking-wider text-slate-500 font-bold">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-900 border border-slate-800 focus:border-lime-400 rounded px-2 py-1 text-xs tabular-nums font-bold outline-none"
      />
    </label>
  );
}

function PlayerRow({ player, rating, goals, assists, yellows, reds, saves, position, onIncrement, onDecrement, onRename, onSetRating, onRemove, onSetPosition }) {
  const [draftName, setDraftName] = useState(player);
  useEffect(() => { setDraftName(player); }, [player]);
  const isGoalkeeper = position === 'GOL';

  return (
    <tr className="border-t border-slate-800/40">
      <td className="pr-1 py-1">
        <div className="flex items-center gap-1">
          <PositionPicker value={position} onChange={onSetPosition} />
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => onRename(draftName)}
            className="w-full bg-transparent text-xs px-1 py-1 rounded border border-transparent hover:border-slate-700 focus:border-lime-400 outline-none"
          />
        </div>
      </td>
      <td className="px-0.5 py-1">
        <Counter value={goals}    onPlus={() => onIncrement('goal')}    onMinus={() => onDecrement('goal')}    color="emerald" />
      </td>
      <td className="px-0.5 py-1">
        <Counter value={assists}  onPlus={() => onIncrement('assist')}  onMinus={() => onDecrement('assist')}  color="sky" />
      </td>
      <td className="px-0.5 py-1">
        {isGoalkeeper ? (
          <Counter value={saves} onPlus={() => onIncrement('save')} onMinus={() => onDecrement('save')} color="yellow" />
        ) : (
          <div className="text-center text-slate-800 text-xs">—</div>
        )}
      </td>
      <td className="px-0.5 py-1">
        <Counter value={yellows}  onPlus={() => onIncrement('yellow')}  onMinus={() => onDecrement('yellow')}  color="yellow" tight />
      </td>
      <td className="px-0.5 py-1">
        <Counter value={reds}     onPlus={() => onIncrement('red')}     onMinus={() => onDecrement('red')}     color="red" tight />
      </td>
      <td className="px-0.5 py-1">
        <input
          type="number" step="0.1" min="0" max="10"
          value={rating}
          onChange={(e) => onSetRating(e.target.value)}
          placeholder="—"
          className="w-full bg-slate-950/40 border border-slate-800 focus:border-lime-400 rounded px-1 py-1 text-xs text-center tabular-nums font-bold outline-none"
        />
      </td>
      <td className="py-1 text-center">
        <button onClick={onRemove} className="text-slate-600 hover:text-red-400 text-xs" title="Remover do time">
          <X className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

/* Seletor de posição compacto — dropdown nativo estilizado */
function PositionPicker({ value, onChange }) {
  const posDef = POSITIONS.find((p) => p.id === value);
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="text-[9px] font-black uppercase tracking-tight rounded px-1 py-0.5 border outline-none cursor-pointer flex-shrink-0"
      style={{
        backgroundColor: posDef ? `${posDef.color}30` : 'rgb(15 23 42 / 0.6)',
        borderColor: posDef ? `${posDef.color}80` : 'rgb(51 65 85)',
        color: posDef ? posDef.color : 'rgb(100 116 139)',
        width: '40px',
      }}
      title="Posição"
    >
      <option value="" className="bg-slate-900 text-slate-500">—</option>
      {POSITIONS.map((p) => (
        <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">{p.short}</option>
      ))}
    </select>
  );
}

/* Contador compacto: clica no número incrementa, segura/shift decrementa.
   Pra usabilidade mobile, dois botões minúsculos um em cima do outro. */
function Counter({ value, onPlus, onMinus, color = 'slate', tight }) {
  const colors = {
    emerald: value > 0 ? 'text-emerald-300 bg-emerald-900/40 border-emerald-700/50' : 'text-slate-500 bg-slate-900/40 border-slate-800',
    sky:     value > 0 ? 'text-sky-300 bg-sky-900/40 border-sky-700/50'             : 'text-slate-500 bg-slate-900/40 border-slate-800',
    yellow:  value > 0 ? 'text-yellow-300 bg-yellow-900/40 border-yellow-700/50'    : 'text-slate-500 bg-slate-900/40 border-slate-800',
    red:     value > 0 ? 'text-red-300 bg-red-900/40 border-red-700/50'             : 'text-slate-500 bg-slate-900/40 border-slate-800',
    slate:                                                                            'text-slate-300 bg-slate-900/40 border-slate-800',
  };
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button onClick={onMinus} disabled={value === 0} className="text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none w-4 h-5 flex items-center justify-center">−</button>
      <span className={cls('inline-block w-6 text-center font-bold tabular-nums border rounded text-xs py-0.5', colors[color])}>
        {value}
      </span>
      <button onClick={onPlus} className="text-slate-500 hover:text-lime-400 text-xs leading-none w-4 h-5 flex items-center justify-center">+</button>
    </div>
  );
}

function SuspensionWarnings({ state, teamId, players, upToStageKey }) {
  const suspended = players.map((p) => {
    const status = getPlayerCardStatus(state, teamId, p, upToStageKey);
    return status.suspended ? { name: p, reason: status.reason } : null;
  }).filter(Boolean);
  if (suspended.length === 0) return null;
  return (
    <div className="mb-3 p-2 bg-red-900/20 border border-red-800/50 rounded text-xs">
      <div className="flex items-center gap-1 text-red-300 font-bold mb-1"><AlertTriangle className="w-3 h-3" /> Suspensos neste jogo</div>
      {suspended.map((s) => (
        <div key={s.name} className="text-red-200">🚫 {s.name} <span className="text-red-400">({s.reason})</span></div>
      ))}
    </div>
  );
}

function PhotoRatingsButton({ playerNames, onExtracted }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const pick = () => ref.current?.click();
  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const b64 = await fileToBase64(file);
      const resp = await fetch('/api/extract-ratings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: b64, mediaType: file.type || 'image/jpeg', playerNames: playerNames || [] }),
      });
      if (!resp.ok) {
        const eb = await resp.json().catch(() => ({}));
        throw new Error(eb.error || `Erro ${resp.status}`);
      }
      const data = await resp.json();
      onExtracted((data.ratings || []).map((p) => ({ name: p.playerName, rating: parseFloat(p.rating) })));
    } catch (e) {
      console.error(e);
      setErr('Falhou — preenche manual.');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return (
    <div className="flex items-center gap-1">
      <button onClick={pick} disabled={busy} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-900/60 border border-purple-700 text-purple-200 hover:bg-purple-800 disabled:opacity-30 flex items-center gap-1" title="Subir foto da tela de notas">
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
        Foto
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
      {err && <span className="text-[10px] text-red-400">{err}</span>}
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ============================================================
   KNOCKOUT VIEW — Mata-mata
   ============================================================ */
function KnockoutView({ state, update, updateMatches, allTeams, openMatch }) {
  const format = getFormat(state.formatId);
  const koMatches = state.matches.filter((m) => m.stage !== 'group');

  /* Se de algum jeito não tem KO gerado, gera agora */
  if (koMatches.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Trophy className="w-8 h-8 mx-auto mb-3 text-lime-400" />
        <h3 className="font-bold mb-2">Mata-mata ainda não foi gerado</h3>
        <button
          onClick={() => {
            const newKo = makeKnockoutMatches(state);
            updateMatches([...state.matches, ...newKo]);
            update({ knockoutGenerated: true });
          }}
          className="mt-2 px-5 py-3 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded-lg"
        >
          Gerar chave do mata-mata
        </button>
      </Card>
    );
  }

  /* Verifica se a fase de grupos ainda está em andamento — pra mostrar aviso */
  const groupMatches = state.matches.filter((m) => m.stage === 'group');
  const groupPlayed = groupMatches.filter((m) => m.played).length;
  const groupTotal = groupMatches.length;
  const groupsInProgress = format.hasGroups && groupPlayed < groupTotal;

  return (
    <div className="space-y-4">
      {groupsInProgress && (
        <div className="bg-amber-900/20 border border-amber-800/50 text-amber-200 text-xs rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Fase de grupos em andamento ({groupPlayed}/{groupTotal} jogos). A chave abaixo mostra a projeção
            atual e <strong>vai mudar</strong> conforme as classificações se definirem.
            Confrontos do mata-mata que já tenham resultado preenchido <strong>não são alterados</strong>.
          </span>
        </div>
      )}
      <KnockoutBracket state={state} koMatches={koMatches} updateMatches={updateMatches} openMatch={openMatch} />
    </div>
  );
}

function KnockoutBracket({ state, koMatches, updateMatches, openMatch }) {
  const [swapTeam, setSwapTeam] = useState(null);
  const [draftKoMatches, setDraftKoMatches] = useState(null);
  const [swapError, setSwapError] = useState('');

  const displayKoMatches = draftKoMatches || koMatches;
  const hasPendingBracketEdits = !!draftKoMatches;
  const groupMatches = state.matches.filter((m) => m.stage === 'group');
  const effectiveState = useMemo(
    () => ({ ...state, matches: [...groupMatches, ...displayKoMatches] }),
    [state, groupMatches, displayKoMatches],
  );

  const allStages = [...new Set(displayKoMatches.filter((m) => !m.isExtra).map((m) => m.stage))];
  const stageOrder = ['r32', 'r16', 'qf', 'sf', 'final'];
  const mainStages = allStages
    .filter((stage) => stage !== 'third')
    .sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));
  const hasThird = allStages.includes('third');

  const groupByConfront = useCallback((stage) => {
    const arr = displayKoMatches.filter((m) => m.stage === stage && !m.isExtra);
    const grouped = {};
    for (const match of arr) {
      const key = match.koIndex;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(match);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, legs]) => legs);
  }, [displayKoMatches]);

  const stageSwapOptions = useMemo(() => (
    mainStages.map((stage) => getSameOwnerKnockoutSwapOptions(effectiveState, stage))
  ), [effectiveState, mainStages]);
  const stageOptionsById = useMemo(
    () => Object.fromEntries(stageSwapOptions.map((option) => [option.stage, option])),
    [stageSwapOptions],
  );

  /* Lida com clique num time: seleciona ou prepara uma troca no rascunho.
     Nada é salvo no campeonato antes do botão de confirmação. */
  const handleTeamClick = useCallback((teamId, stage, koIndex) => {
    if (!teamId) return;
    const stageOptions = getSameOwnerKnockoutSwapOptions(effectiveState, stage);
    if (stageOptions.blockedByLaterResults) {
      setSwapError('Esta fase não pode mais ser editada porque já existem resultados em uma fase posterior.');
      return;
    }

    const clickedLegs = displayKoMatches.filter(
      (m) => m.stage === stage && m.koIndex === koIndex && !m.isExtra,
    );
    if (clickedLegs.some((m) => m.played)) return;

    if (!swapTeam) {
      setSwapError('');
      setSwapTeam({ teamId, stage, koIndex });
      return;
    }
    if (swapTeam.teamId === teamId) {
      setSwapTeam(null);
      setSwapError('');
      return;
    }
    if (swapTeam.stage !== stage) {
      setSwapError('A troca deve ser feita entre dois times da mesma fase.');
      return;
    }

    const selectedLegs = displayKoMatches.filter(
      (m) => m.stage === swapTeam.stage && m.koIndex === swapTeam.koIndex && !m.isExtra,
    );
    if (selectedLegs.some((m) => m.played)) {
      setSwapTeam(null);
      return;
    }

    const A = swapTeam;
    const B = { teamId, stage, koIndex };
    const newMatches = displayKoMatches.map((match) => {
      if (match.played || match.isExtra) return match;
      const inA = match.stage === A.stage && match.koIndex === A.koIndex;
      const inB = match.stage === B.stage && match.koIndex === B.koIndex;
      if (!inA && !inB) return match;
      const swapId = (id) => (
        id === A.teamId ? B.teamId : id === B.teamId ? A.teamId : id
      );
      return {
        ...match,
        homeTeamId: swapId(match.homeTeamId),
        awayTeamId: swapId(match.awayTeamId),
        manuallyOverridden: true,
      };
    });

    const propagated = propagateKnockoutWinners(newMatches);
    setDraftKoMatches(propagated.matches);
    setSwapTeam(null);
    setSwapError('');
  }, [swapTeam, displayKoMatches, effectiveState]);

  const handleReshuffleSameOwner = useCallback((stage) => {
    const result = reshuffleSameOwnerKnockout(effectiveState, stage);
    if (result.swappedPairs > 0) {
      setDraftKoMatches(result.matches.filter((m) => m.stage !== 'group'));
      setSwapTeam(null);
      setSwapError('');
    }
  }, [effectiveState]);

  const confirmBracketEdits = useCallback(() => {
    if (!draftKoMatches) return;
    updateMatches([...groupMatches, ...draftKoMatches]);
    setDraftKoMatches(null);
    setSwapTeam(null);
    setSwapError('');
  }, [draftKoMatches, groupMatches, updateMatches]);

  const cancelBracketEdits = useCallback(() => {
    setDraftKoMatches(null);
    setSwapTeam(null);
    setSwapError('');
  }, []);

  /* Cancela a seleção com ESC. O rascunho permanece até confirmar ou cancelar. */
  useEffect(() => {
    if (!swapTeam) return;
    const handler = (event) => {
      if (event.key === 'Escape') {
        setSwapTeam(null);
        setSwapError('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [swapTeam]);

  const firstStageCount = groupByConfront(mainStages[0])?.length || 0;
  const minHeight = Math.max(420, firstStageCount * 86);

  const handleRegenerateBracket = useCallback(() => {
    const anyKoPlayed = state.matches.some((m) => m.stage !== 'group' && m.played);
    const msg = anyKoPlayed
      ? 'Regerar o mata-mata vai APAGAR todos os placares, eventos e cartões do mata-mata que já foram registrados. Os jogos da fase de grupos ficam intactos. Confirmar?'
      : 'Regerar o mata-mata vai reconstruir o chaveamento com base nas standings atuais dos grupos. Confirmar?';
    if (!window.confirm(msg)) return;
    const newMatches = regenerateKnockoutBracket(state);
    updateMatches(newMatches);
    cancelBracketEdits();
  }, [state, updateMatches, cancelBracketEdits]);

  /* Conta slots confirmados que deixaram de seguir automaticamente a origem. */
  const manualSwapCount = useMemo(() => (
    koMatches.filter((m) => m.manuallyOverridden && !m.played && !m.isExtra).length
  ), [koMatches]);

  const handleRestorePropagate = useCallback(() => {
    if (!window.confirm(`Restaurar a propagação automática dos ${manualSwapCount} slot(s) customizado(s)?`)) return;
    const newMatches = state.matches.map((match) => {
      if (match.stage === 'group' || match.isExtra || match.played || !match.manuallyOverridden) return match;
      /* Fases alimentadas por vencedores voltam a ficar vazias e serão
         preenchidas pela propagação. Na primeira fase, preservamos os times;
         se o mata-mata ainda não começou, o seeding oficial poderá restaurá-los. */
      if (match.feedHome || match.feedAway) {
        return { ...match, manuallyOverridden: false, homeTeamId: null, awayTeamId: null };
      }
      return { ...match, manuallyOverridden: false };
    });
    updateMatches(newMatches);
  }, [state, updateMatches, manualSwapCount]);

  const bracketHasHoles = useMemo(() => {
    const firstStage = mainStages[0];
    if (!firstStage) return false;
    return displayKoMatches.some((m) => (
      m.stage === firstStage && !m.isExtra && !m.played &&
      (!m.homeTeamId || !m.awayTeamId)
    ));
  }, [displayKoMatches, mainStages]);

  return (
    <div className="space-y-4">
      {/* Cada fase recebe seu próprio botão quando existem dois confrontos
          de mesmo dono que realmente podem virar dois confrontos mistos. */}
      {stageSwapOptions.filter((option) => option.swappable > 0).map((option) => (
        <div key={option.stage} className="flex items-center justify-between gap-3 p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-amber-200">
              {STAGE_LABELS[option.stage]}: {option.total} confronto{option.total > 1 ? 's' : ''} com o mesmo dono.
              É possível corrigir {option.swappable * 2} confronto{option.swappable * 2 > 1 ? 's' : ''} sem alterar os demais.
            </span>
          </div>
          <button
            onClick={() => handleReshuffleSameOwner(option.stage)}
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded bg-amber-500 text-amber-950 hover:bg-amber-400 transition flex items-center gap-1"
          >
            <Shuffle className="w-3.5 h-3.5" /> Sortear adversários
          </button>
        </div>
      ))}

      {/* Alterações de chaveamento são locais até a confirmação explícita. */}
      {hasPendingBracketEdits && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-lime-950/30 border border-lime-600/50 rounded-lg text-sm">
          <div className="flex items-center gap-2 text-lime-100">
            <Check className="w-4 h-4 text-lime-400" />
            Revise o novo chaveamento. Ele só será salvo e usado para a propagação dos vencedores após a confirmação.
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelBracketEdits}
              className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold uppercase tracking-wider"
            >
              Cancelar alterações
            </button>
            <button
              onClick={confirmBracketEdits}
              className="px-3 py-1.5 rounded bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-black uppercase tracking-wider"
            >
              Confirmar novo caminho
            </button>
          </div>
        </div>
      )}

      {swapError && (
        <div className="p-2.5 bg-red-950/30 border border-red-700/40 rounded-lg text-xs text-red-200 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {swapError}
        </div>
      )}

      {bracketHasHoles && (
        <div className="flex items-center justify-between gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-red-200">
              Chaveamento com slots vazios. Use a troca manual para completar, ou regenere tudo.
            </span>
          </div>
          <button
            onClick={handleRegenerateBracket}
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded bg-red-500 text-red-950 hover:bg-red-400 transition flex items-center gap-1"
          >
            <Shuffle className="w-3.5 h-3.5" /> Regenerar mata-mata
          </button>
        </div>
      )}

      {manualSwapCount > 0 && !swapTeam && !hasPendingBracketEdits && (
        <div className="flex items-center justify-between gap-3 p-2.5 bg-blue-950/20 border border-blue-700/30 rounded-lg text-xs">
          <div className="flex items-center gap-2 text-blue-200">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {manualSwapCount} slot{manualSwapCount > 1 ? 's' : ''} com caminho customizado e confirmado.
            Os vencedores desses confrontos continuam avançando normalmente.
          </div>
          <button
            onClick={handleRestorePropagate}
            className="font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-blue-700 text-blue-50 hover:bg-blue-600 transition flex items-center gap-1"
          >
            Restaurar propagação
          </button>
        </div>
      )}

      {swapTeam ? (
        <div className="flex items-center justify-between gap-3 p-3 bg-blue-900/30 border border-blue-700/60 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-300" />
            <span className="text-blue-200">
              <strong>{getTeamById(state, swapTeam.teamId)?.name}</strong> selecionado em {STAGE_LABELS[swapTeam.stage]}.
              Clique em outro time da mesma fase para trocar.
            </span>
          </div>
          <button
            onClick={() => { setSwapTeam(null); setSwapError(''); }}
            className="text-blue-400 hover:text-blue-200 text-xs flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Cancelar (ESC)
          </button>
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Use o ícone ao lado de um time para trocar posições dentro da mesma fase. Depois, confirme o novo caminho.
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex gap-3 min-w-full">
          {mainStages.map((stage) => (
            <div key={`${stage}-h`} className="flex-shrink-0 w-[210px] text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-lime-400 pb-2 border-b border-slate-800">
                {STAGE_LABELS[stage] || stage}
              </div>
            </div>
          ))}
        </div>
        <div className="inline-flex gap-3 mt-2 min-w-full" style={{ minHeight: `${minHeight}px` }}>
          {mainStages.map((stage) => {
            const confronts = groupByConfront(stage);
            const canEditStage = !stageOptionsById[stage]?.blockedByLaterResults;
            return (
              <div key={stage} className="flex-shrink-0 w-[210px] flex flex-col justify-around gap-2">
                {confronts.map((legs, confrontIndex) => (
                  <KnockoutConfrontCard
                    key={`${stage}-${confrontIndex}`}
                    state={state}
                    matchesForDisplay={displayKoMatches}
                    legs={legs}
                    openMatch={openMatch}
                    swapTeam={swapTeam}
                    onTeamClick={handleTeamClick}
                    canEdit={canEditStage}
                    bracketDraftActive={hasPendingBracketEdits}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {hasThird && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-2">
            <Award className="w-4 h-4" /> Disputa de 3º lugar
          </h3>
          <div className="max-w-xs">
            {groupByConfront('third').map((legs, confrontIndex) => (
              <KnockoutConfrontCard
                key={`third-${confrontIndex}`}
                state={state}
                matchesForDisplay={displayKoMatches}
                legs={legs}
                openMatch={openMatch}
                swapTeam={swapTeam}
                onTeamClick={handleTeamClick}
                canEdit={!getSameOwnerKnockoutSwapOptions(effectiveState, 'third').blockedByLaterResults}
                bracketDraftActive={hasPendingBracketEdits}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KnockoutConfrontCard({
  state,
  matchesForDisplay,
  legs,
  openMatch,
  swapTeam,
  onTeamClick,
  canEdit,
  bracketDraftActive,
}) {
  legs = [...legs].sort((a, b) => a.leg - b.leg);
  const sample = legs[0];
  const home = getTeamById(state, sample.homeTeamId);
  const away = getTeamById(state, sample.awayTeamId);
  const sameOwner = home?.owner && away?.owner && home.owner === away.owner;
  const outcome = getMatchOutcome(matchesForDisplay, sample.stage, sample.koIndex);
  const isMultiLeg = sample.totalLegs > 1;
  const etMatch = matchesForDisplay.find(
    (m) => m.stage === sample.stage && m.koIndex === sample.koIndex && m.isExtra,
  );

  let homeDisplay = '—';
  let awayDisplay = '—';
  if (legs.every((m) => m.played)) {
    if (isMultiLeg) {
      homeDisplay = String(outcome.aggA ?? 0);
      awayDisplay = String(outcome.aggB ?? 0);
    } else {
      homeDisplay = String(sample.homeScore ?? 0);
      awayDisplay = String(sample.awayScore ?? 0);
    }
  }

  const homeWon = outcome.decided && outcome.winner === sample.homeTeamId;
  const awayWon = outcome.decided && outcome.winner === sample.awayTeamId;
  const confrontPlayed = legs.some((m) => m.played);

  const TeamRow = ({ team, teamId, score, won, isSecond }) => {
    const isSelected = swapTeam?.teamId === teamId;
    const sameSwapStage = !swapTeam || swapTeam.stage === sample.stage;
    const isSwapTarget = !!(
      swapTeam && sameSwapStage && !isSelected && !confrontPlayed && teamId && canEdit
    );
    const ownerColor = getOwnerColor(state, team?.owner);
    const decidedAndLost = outcome.decided && !won && team;

    let bgStyle = {};
    if (isSelected) {
      bgStyle = { background: 'rgb(30 58 138 / 0.5)' };
    } else if (won) {
      bgStyle = { background: `linear-gradient(90deg, rgb(6 78 59 / 0.6) 0%, ${ownerColor}33 100%)` };
    } else if (decidedAndLost) {
      bgStyle = { background: 'rgb(15 23 42 / 0.6)', opacity: 0.5 };
    } else if (team && team.owner) {
      bgStyle = { background: `linear-gradient(90deg, ${ownerColor}28 0%, ${ownerColor}10 100%)` };
    }

    const canSwapThisTeam = !confrontPlayed && !!teamId && canEdit && sameSwapStage;

    return (
      <div
        className={cls(
          'flex items-center gap-1 transition',
          isSecond && 'border-t border-slate-800',
          isSwapTarget && 'ring-1 ring-blue-500/40',
        )}
        style={bgStyle}
      >
        {canSwapThisTeam ? (
          <button
            onClick={() => onTeamClick(teamId, sample.stage, sample.koIndex)}
            className={cls(
              'flex-shrink-0 px-1.5 py-2 transition',
              isSelected
                ? 'text-blue-300'
                : isSwapTarget
                  ? 'text-blue-400 hover:text-blue-200'
                  : 'text-slate-600 hover:text-blue-400',
            )}
            title={isSelected ? 'Selecionado — clique em outro time da fase' : 'Trocar este time de posição'}
          >
            <ArrowLeftRight className="w-3 h-3" />
          </button>
        ) : (
          <div className="w-6 flex-shrink-0" />
        )}

        <button
          onClick={() => {
            if (!bracketDraftActive) openMatch(legs[isMultiLeg && isSecond ? 1 : 0].id);
          }}
          disabled={bracketDraftActive}
          title={bracketDraftActive ? 'Confirme ou cancele o novo chaveamento antes de abrir jogos' : 'Abrir jogo'}
          className={cls(
            'flex-1 grid grid-cols-[1fr_auto] items-center gap-1 pr-2 py-1.5 transition min-w-0',
            bracketDraftActive ? 'cursor-not-allowed' : 'hover:bg-slate-800/40',
          )}
        >
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <span>{team?.flag || '?'}</span>
            <span className={cls(
              'truncate text-xs',
              won && 'font-bold text-emerald-100',
              decidedAndLost && 'line-through text-slate-500',
              !team && 'italic text-slate-600',
            )}>
              {team?.name || 'A definir'}
            </span>
            {team?.owner && (
              <OwnerTag
                owner={team.owner}
                p1Name={state.player1Name}
                p2Name={state.player2Name}
                p1Color={state.player1Color}
                p2Color={state.player2Color}
                size="xs"
              />
            )}
          </div>
          <span className={cls(
            'font-mono font-bold tabular-nums text-xs',
            won ? 'text-emerald-200 text-sm' : decidedAndLost ? 'text-slate-600' : 'text-slate-300',
          )}>
            {score}
          </span>
        </button>
      </div>
    );
  };

  return (
    <Card className={cls('overflow-hidden', sameOwner && 'border-amber-700/60')}>
      {sameOwner && (
        <div className="px-2 py-0.5 bg-amber-900/30 text-[9px] text-amber-300 font-bold flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" /> Mesmo dono
        </div>
      )}

      <TeamRow team={home} teamId={sample.homeTeamId} score={homeDisplay} won={homeWon} isSecond={false} />
      <TeamRow team={away} teamId={sample.awayTeamId} score={awayDisplay} won={awayWon} isSecond />

      {(isMultiLeg || etMatch || outcome.viaPenalties) && (
        <div className="px-2 py-1 bg-slate-950/60 border-t border-slate-800 text-[10px] text-slate-500 text-center space-y-0.5">
          {isMultiLeg && legs.every((m) => m.played) && (
            <div>Ida: {legs[0].homeScore}-{legs[0].awayScore} · Volta: {legs[1].homeScore}-{legs[1].awayScore}</div>
          )}
          {etMatch && (
            <button
              onClick={() => { if (!bracketDraftActive) openMatch(etMatch.id); }}
              disabled={bracketDraftActive}
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 justify-center w-full disabled:cursor-not-allowed"
            >
              <Zap className="w-2.5 h-2.5" />
              Prorrogação {etMatch.played ? `${etMatch.homeScore}-${etMatch.awayScore}` : '(jogar)'}
              {outcome.viaPenalties && ' + pênaltis'}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   STATS VIEW
   ============================================================ */
function StatsView({ state, allTeams, openTeam, openMatch }) {
  const playerStats   = useMemo(() => computePlayerStats(state), [state.matches]);
  const teamStats     = useMemo(() => computeTeamStats(state),   [state.matches]);
  const ownerStats    = useMemo(() => computeOwnerStats(state),  [state.matches]);
  const powerTeams    = useMemo(() => computePowerRankingTeams(state),   [state.matches]);
  const powerPlayers  = useMemo(() => computePowerRankingPlayers(state), [state.matches]);
  const records       = useMemo(() => computeTournamentRecords(state),   [state.matches]);
  const championPath  = useMemo(() => getChampionPath(state),            [state.matches]);
  const timeline      = useMemo(() => computeTimelineEvents(state),      [state.matches]);
  const byPosition    = useMemo(() => {
    const map = {};
    for (const p of POSITIONS) {
      map[p.id] = computePlayersByPosition(state, p.id, 999);
    }
    return map;
  }, [state.matches, state.playerPositions]);

  const streaks       = useMemo(() => computeTeamStreaks(state),         [state.matches]);
  const cleanSheets   = useMemo(() => computeCleanSheets(state),         [state.matches, state.teamRosters, state.playerPositions]);
  const offensiveDep  = useMemo(() => computeOffensiveDependency(state), [state.matches]);
  const surprises     = useMemo(() => computeTournamentSurprises(state), [state.matches]);
  const suspended     = useMemo(() => computeAllSuspended(state),        [state.matches, state.teamRosters, state.rules]);
  const teamMetrics   = useMemo(() => computeTeamMetrics(state),         [state.matches]);
  const goalkeepers   = useMemo(() => computeGoalkeeperRankings(state),  [state.matches, state.playerPositions]);

  const topScorers = [...playerStats].filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
  const topAssists = [...playerStats].filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists);
  const topRated   = [...playerStats].filter((s) => s.ratingCount >= 2).map((s) => ({ ...s, avg: s.ratingSum / s.ratingCount })).sort((a, b) => b.avg - a.avg);
  const mostCards  = [...playerStats].filter((s) => s.yellows + s.reds > 0).sort((a, b) => (b.reds * 10 + b.yellows) - (a.reds * 10 + a.yellows));

  const champion = getChampion(state);
  const noStatsYet = teamStats.every((t) => t.P === 0);

  return (
    <div className="space-y-6">
      {/* Banner do campeão */}
      {champion && (
        <Card className="p-5 border-amber-700/60 bg-gradient-to-br from-amber-900/30 to-yellow-900/10">
          <div className="flex items-center gap-3">
            <Crown className="w-8 h-8 text-amber-400" />
            <div>
              <div className="text-xs uppercase tracking-widest text-amber-300 mb-0.5">Campeão</div>
              <div className="text-2xl font-black">{champion.flag} {champion.name}</div>
              <div className="text-xs text-slate-400 mt-1">
                Dono: {champion.owner === 'p1' ? state.player1Name : state.player2Name}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Trajetória do campeão */}
      {championPath && championPath.matches.length > 0 && <ChampionPathCard state={state} championPath={championPath} />}

      {/* Comparação entre jogadores (donos) */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Comparação dos jogadores
        </h2>
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ownerStats.map((o) => {
              const c = o.id === 'p1' ? (state.player1Color || '#06b6d4') : (state.player2Color || '#f59e0b');
              return (
                <div key={o.id} className="p-3 rounded-lg border" style={{ backgroundColor: `${c}15`, borderColor: `${c}55` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-black text-lg" style={{ color: c }}>{o.name}</div>
                    <span className="text-xs text-slate-400">{o.teams} times</span>
                  </div>
                  {o.P === 0 ? (
                    <div className="text-xs text-slate-500 italic">Sem jogos ainda.</div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <KpiCell label="Jogos" value={o.P} />
                      <KpiCell label="Pontos" value={o.Pts} />
                      <KpiCell label="% Apr." value={`${o.winPct}%`} highlight={o.winPct >= 50} />
                      <KpiCell label="V-E-D" value={`${o.V}-${o.E}-${o.D}`} />
                      <KpiCell label="Gols pró" value={o.GP} />
                      <KpiCell label="Saldo" value={(o.SG > 0 ? '+' : '') + o.SG} highlight={o.SG > 0} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* Power Ranking — Times */}
      {powerTeams.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Power Ranking — Times
            <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">({powerTeams.length} times)</span>
          </h2>
          <Card className="p-3">
            <PowerRankingTeamsList rows={powerTeams} state={state} openTeam={openTeam} />
          </Card>
        </section>
      )}

      {/* Power Ranking — Jogadores em campo */}
      {powerPlayers.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4" /> Power Ranking — Jogadores em campo
            <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">({powerPlayers.length} jogadores)</span>
          </h2>
          <Card className="p-3">
            <PowerRankingPlayersList rows={powerPlayers} state={state} openTeam={openTeam} />
          </Card>
        </section>
      )}

      {/* Time do Torneio (4-3-3) com seletor por rodada */}
      <BestXIByRoundSection state={state} />

      {/* Rankings por posição */}
      {POSITIONS.some((p) => byPosition[p.id].length > 0) && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4" /> Melhores por posição
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {POSITIONS.map((pos) => (
              <PositionRanking key={pos.id} posDef={pos} list={byPosition[pos.id]} state={state} />
            ))}
          </div>
        </section>
      )}

      {/* Estatísticas de equipes */}
      <TeamRankingsSection state={state} openTeam={openTeam} />

      {/* Métricas avançadas de times */}
      {teamMetrics.some((t) => t.possessionCount > 0 || t.shotsCount > 0 || t.xGCount > 0) && (
        <AdvancedTeamMetricsSection state={state} rows={teamMetrics} openTeam={openTeam} />
      )}

      {/* Ranking de goleiros */}
      {goalkeepers.length > 0 && (
        <GoalkeeperRankingSection state={state} rows={goalkeepers} openTeam={openTeam} />
      )}

      {/* Recordes */}
      {records && <RecordsCard state={state} records={records} />}

      {/* Stats individuais de jogadores (clássicas) */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Rankings por categoria
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatsList title="Artilharia" icon={<Goal className="w-4 h-4 text-emerald-400" />} list={topScorers} render={(s) => <span className="tabular-nums font-bold">{s.goals}</span>} state={state} />
          <StatsList title="Assistências" icon={<Hand className="w-4 h-4 text-sky-400" />} list={topAssists} render={(s) => <span className="tabular-nums font-bold">{s.assists}</span>} state={state} />
          <StatsList title="Melhores médias" icon={<Star className="w-4 h-4 text-yellow-400" />} list={topRated} render={(s) => <span className="tabular-nums font-bold">{s.avg.toFixed(2)} <span className="text-slate-500 text-xs">({s.ratingCount}j)</span></span>} state={state} />
          <StatsList title="Mais cartões" icon={<span className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-sm" />} list={mostCards} render={(s) => <span className="tabular-nums text-xs"><span className="text-yellow-400 font-bold">{s.yellows}</span>{s.reds > 0 && <> <span className="text-red-400 font-bold ml-1">{s.reds}</span></>}</span>} state={state} />
        </div>
      </section>

      {/* Suspensos */}
      {suspended.length > 0 && <SuspendedPlayersCard state={state} suspended={suspended} openMatch={openMatch} openTeam={openTeam} />}

      {/* Sequências e Clean Sheets */}
      {streaks.length > 0 && <StreaksAndCleanSheetsCard state={state} streaks={streaks} cleanSheets={cleanSheets} />}

      {/* Dependência ofensiva */}
      {offensiveDep.length > 0 && <OffensiveDependencyCard state={state} list={offensiveDep.slice(0, 10)} />}

      {/* Surpresa do torneio */}
      {surprises.length > 0 && <SurprisesCard state={state} list={surprises.slice(0, 8)} />}

      {/* Timeline */}
      {timeline.length > 0 && <TimelineCard state={state} events={timeline} />}

      {noStatsYet && (
        <Card className="p-4 text-xs text-slate-500 italic text-center">
          Sem jogos contabilizados ainda. Comece a registrar resultados pra desbloquear as estatísticas.
        </Card>
      )}
    </div>
  );
}

/* ========== Trajetória do Campeão ========== */
function ChampionPathCard({ state, championPath }) {
  const { champion, matches } = championPath;
  return (
    <Card className="p-4 border-amber-700/40 bg-amber-950/10">
      <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300 mb-3 flex items-center gap-2">
        <Crown className="w-4 h-4" /> Caminho do campeão — {champion.flag} {champion.name}
      </h3>
      <div className="space-y-1.5">
        {matches.map((m) => {
          const isHome = m.homeTeamId === champion.id;
          const opp = getTeamById(state, isHome ? m.awayTeamId : m.homeTeamId);
          const champScore = isHome ? m.homeScore : m.awayScore;
          const oppScore = isHome ? m.awayScore : m.homeScore;
          const lbl = m.stage === 'group'
            ? `Grupo ${m.group} · R${m.round}`
            : (STAGE_LABELS[m.stage] || m.stage);
          const won = champScore > oppScore;
          const tied = champScore === oppScore;
          return (
            <div key={m.id} className="grid grid-cols-[100px_1fr_auto] items-center gap-2 text-sm border-t border-amber-800/30 pt-1.5 first:border-0 first:pt-0">
              <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold">{lbl}</div>
              <div className="truncate">
                vs <span className="font-bold">{opp?.flag} {opp?.name}</span>
              </div>
              <div className={cls('font-mono font-black tabular-nums text-sm px-2 py-0.5 rounded',
                won ? 'bg-emerald-900/40 text-emerald-200' :
                tied ? 'bg-slate-800 text-slate-300' :
                'bg-slate-800 text-slate-400')}>
                {champScore}–{oppScore}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ========== Power Ranking — Times ========== */
function PowerRankingTeamsList({ rows, state, openTeam, maxHeight = '440px' }) {
  const stageName = { 0: '—', 1: 'R32', 2: 'R16', 3: 'QF', 4: 'SF', 4.5: '3º', 5: 'Final' };
  return (
    <div className="overflow-y-auto pr-1" style={{ maxHeight }}>
      <div className="space-y-1">
        {rows.map((t, i) => {
          const ownerColor = getOwnerColor(state, t.owner);
          return (
            <button
              key={t.teamId}
              onClick={() => openTeam?.(t.teamId)}
              className={cls('w-full flex items-center gap-2 p-2 rounded transition text-left',
                t.isChampion && 'bg-amber-900/30 border border-amber-700/40',
                i === 0 && !t.isChampion && 'bg-emerald-900/20',
                openTeam && 'hover:bg-slate-800/40',
              )}
              style={!t.isChampion && i > 0 ? { background: `linear-gradient(90deg, ${ownerColor}10 0%, transparent 50%)` } : {}}
            >
              <span className={cls('text-sm font-bold tabular-nums w-6 text-center',
                i === 0 ? 'text-amber-400' :
                i < 4 ? 'text-emerald-400' :
                'text-slate-500'
              )}>{i + 1}</span>
              <span className="text-base">{t.flag}</span>
              <div className="flex-1 truncate min-w-0">
                <div className="font-bold truncate flex items-center gap-1.5">
                  {t.name}
                  {t.isChampion && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                </div>
              </div>
              <OwnerTag owner={t.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
              <div className="text-[10px] text-slate-400 tabular-nums text-right hidden sm:block min-w-[80px]">
                {t.P}j · {t.Pts}pt · {t.SG > 0 ? '+' : ''}{t.SG}
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-500 min-w-[28px] text-center">
                {stageName[t.stageReached] || '—'}
              </div>
              <div className="font-mono font-black tabular-nums text-sm text-lime-300 min-w-[50px] text-right">
                {t.powerScore.toFixed(1)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ========== Power Ranking — Jogadores ========== */
function PowerRankingPlayersList({ rows, state, openTeam, maxHeight = '440px' }) {
  return (
    <div className="overflow-y-auto pr-1" style={{ maxHeight }}>
      <div className="space-y-1">
        {rows.map((p, i) => {
          const ownerColor = getOwnerColor(state, p.owner);
          return (
            <div key={`${p.teamId}|${p.playerName}`}
              className={cls('flex items-center gap-2 p-2 rounded transition',
                p.isChampionTeam && 'bg-amber-900/20',
                i === 0 && 'bg-emerald-900/20',
              )}
              style={!p.isChampionTeam && i > 0 ? { background: `linear-gradient(90deg, ${ownerColor}10 0%, transparent 50%)` } : {}}
            >
              <span className={cls('text-sm font-bold tabular-nums w-6 text-center',
                i === 0 ? 'text-amber-400' :
                i < 3 ? 'text-emerald-400' :
                'text-slate-500'
              )}>{i + 1}</span>
              <span className="text-sm">{p.teamFlag}</span>
              <div className="flex-1 truncate min-w-0">
                <div className="font-bold truncate text-sm flex items-center gap-1.5">
                  {p.playerName}
                  {p.isChampionTeam && <Crown className="w-3 h-3 text-amber-400" />}
                </div>
                <button
                  onClick={() => openTeam?.(p.teamId)}
                  className={cls('text-[10px] text-slate-500 truncate text-left', openTeam && 'hover:text-slate-300')}
                >{p.teamName}</button>
              </div>
              <div className="text-[10px] text-slate-400 hidden sm:flex items-center gap-2">
                {p.goals > 0 && <span className="tabular-nums text-emerald-400">⚽{p.goals}</span>}
                {p.assists > 0 && <span className="tabular-nums text-sky-400">🤝{p.assists}</span>}
                {p.avg > 0 && <span className="tabular-nums text-yellow-300">⭐{p.avg.toFixed(2)}</span>}
                {p.yellows > 0 && <span className="tabular-nums text-yellow-500">🟨{p.yellows}</span>}
                {p.reds > 0 && <span className="tabular-nums text-red-400">🟥{p.reds}</span>}
              </div>
              <div className="font-mono font-black tabular-nums text-sm text-lime-300 min-w-[50px] text-right">
                {p.powerScore.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========== Recordes ========== */
function RecordsCard({ state, records }) {
  const { biggestRout, mostGoalsMatch, mostCardsMatch, bestSoloPerformance, bestRating } = records;
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <Award className="w-4 h-4" /> Recordes do torneio
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {biggestRout && (
          <RecordCell title="Maior goleada" emoji="💥"
            primary={`${biggestRout.diff} de diferença`}
            detail={<MatchSummary state={state} match={biggestRout.match} />} />
        )}
        {mostGoalsMatch && (
          <RecordCell title="Jogo mais movimentado" emoji="🔥"
            primary={`${mostGoalsMatch.total} gols`}
            detail={<MatchSummary state={state} match={mostGoalsMatch.match} />} />
        )}
        {bestSoloPerformance && bestSoloPerformance.goals >= 2 && (
          <RecordCell title="Atuação individual" emoji="⚽"
            primary={`${bestSoloPerformance.playerName} fez ${bestSoloPerformance.goals} gols`}
            detail={<MatchSummary state={state} match={bestSoloPerformance.match} />} />
        )}
        {bestRating && (
          <RecordCell title="Maior nota" emoji="⭐"
            primary={`${bestRating.playerName} ${bestRating.rating.toFixed(1)}`}
            detail={<MatchSummary state={state} match={bestRating.match} />} />
        )}
        {mostCardsMatch && (
          <RecordCell title="Jogo mais nervoso" emoji="🟨"
            primary={`${mostCardsMatch.cards} cartões`}
            detail={<MatchSummary state={state} match={mostCardsMatch.match} />} />
        )}
      </div>
    </section>
  );
}

function RecordCell({ title, emoji, primary, detail }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{title}</div>
      <div className="text-base font-bold flex items-center gap-2 mb-1">
        <span className="text-xl">{emoji}</span>
        {primary}
      </div>
      <div className="text-[11px] text-slate-400">{detail}</div>
    </Card>
  );
}

function MatchSummary({ state, match }) {
  const home = getTeamById(state, match.homeTeamId);
  const away = getTeamById(state, match.awayTeamId);
  const lbl = match.stage === 'group' ? `Grupo ${match.group}` : (STAGE_LABELS[match.stage] || match.stage);
  return (
    <span>
      {home?.flag} {home?.name} <span className="font-mono font-bold text-slate-200">{match.homeScore}–{match.awayScore}</span> {away?.name} {away?.flag}
      <span className="text-slate-600"> · {lbl}</span>
    </span>
  );
}

/* ========== Timeline / Feed ========== */
function TimelineCard({ state, events }) {
  /* Limita a 20 eventos mais recentes pra não estourar */
  const display = events.slice(0, 20);
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4" /> Linha do tempo
      </h2>
      <Card className="p-3">
        <div className="space-y-2">
          {display.map((ev, i) => <TimelineEvent key={i} state={state} ev={ev} />)}
        </div>
      </Card>
    </section>
  );
}

function TimelineEvent({ state, ev }) {
  if (ev.kind === 'champion') {
    return (
      <div className="flex items-start gap-2 p-2 bg-amber-900/20 border border-amber-700/40 rounded">
        <Crown className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-bold text-amber-200">{ev.champion.flag} {ev.champion.name} é o campeão!</span>
          <div className="text-xs text-amber-300/70">
            Dono: {ev.champion.owner === 'p1' ? state.player1Name : state.player2Name}
          </div>
        </div>
      </div>
    );
  }
  if (ev.kind === 'hattrick') {
    const match = ev.match;
    return (
      <div className="flex items-start gap-2 p-2 border border-emerald-700/30 rounded">
        <Goal className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs">
          <span className="font-bold text-emerald-300">{ev.playerName}</span> fez {ev.goals === 3 ? 'hat-trick' : `${ev.goals} gols`}
          <div className="text-slate-500 mt-0.5"><MatchSummary state={state} match={match} /></div>
        </div>
      </div>
    );
  }
  if (ev.kind === 'penalties') {
    return (
      <div className="flex items-start gap-2 p-2 border border-amber-700/30 rounded">
        <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs">
          <span className="font-bold text-amber-300">Decidido nos pênaltis</span>
          <div className="text-slate-500 mt-0.5"><MatchSummary state={state} match={ev.match} /></div>
        </div>
      </div>
    );
  }
  /* match-result default */
  const m = ev.match;
  const isUpset = isUpsetResult(m, state);
  return (
    <div className="flex items-start gap-2 p-1.5 text-xs">
      <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
      </div>
      <div className="flex-1">
        <MatchSummary state={state} match={m} />
        {isUpset && <span className="ml-2 text-amber-400 text-[10px] uppercase font-bold">Zebra!</span>}
      </div>
    </div>
  );
}

/* Heurística simples de "zebra": vencedor da fase de grupos com pote 3 ou 4 contra time pote 1 ou 2 */
function isUpsetResult(m, state) {
  if (m.stage !== 'group') return false;
  if (m.homeScore === m.awayScore) return false;
  const winnerTeamId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
  const loserTeamId  = m.homeScore > m.awayScore ? m.awayTeamId : m.homeTeamId;
  const winner = getTeamById(state, winnerTeamId);
  const loser  = getTeamById(state, loserTeamId);
  return winner && loser && winner.pot > 2 && loser.pot < winner.pot;
}

function KpiCell({ label, value, highlight }) {
  return (
    <div className={cls('rounded p-1.5 bg-slate-950/40')}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cls('font-black text-lg tabular-nums', highlight ? 'text-lime-300' : 'text-slate-100')}>{value}</div>
    </div>
  );
}

/* ========== Time do Torneio (formação 4-3-3) ========== */
function BestXIField({ state, bestXI, hideTitle = false }) {
  const total = bestXI.GOL.length + bestXI.ZAG.length + bestXI.LAT.length + bestXI.MEI.length + bestXI.ATA.length;
  if (total === 0) {
    return (
      <section>
        {!hideTitle && (
          <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Time do torneio (4-3-3)
          </h2>
        )}
        <Card className="p-4 text-center text-xs text-slate-500 italic">
          Defina a posição dos jogadores (GOL / ZAG / LAT / MEI / ATA) nos jogos pra desbloquear o time do torneio.
        </Card>
      </section>
    );
  }
  const expected = { GOL: 1, ZAG: 2, LAT: 2, MEI: 3, ATA: 3 };
  const missing = [];
  for (const k of Object.keys(expected)) {
    const have = bestXI[k].length;
    const need = expected[k];
    if (have < need) missing.push(`${need - have} ${POSITIONS.find((p) => p.id === k).label}${need - have > 1 ? 's' : ''}`);
  }

  return (
    <section>
      {!hideTitle && (
        <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Time do torneio (4-3-3)
        </h2>
      )}
      <Card className="p-4 border-emerald-700/40" style={{ background: 'linear-gradient(180deg, rgb(6 78 59 / 0.35), rgb(2 44 34 / 0.5))' }}>
        {/* Campo de futebol */}
        <div className="relative mx-auto" style={{ maxWidth: '420px', aspectRatio: '2 / 3' }}>
          {/* Fundo verde com linhas brancas */}
          <div className="absolute inset-0 rounded-lg overflow-hidden" style={{
            background: 'repeating-linear-gradient(180deg, rgba(34, 197, 94, 0.25) 0px, rgba(34, 197, 94, 0.15) 28px, rgba(34, 197, 94, 0.25) 56px)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
          }}>
            {/* Linha do meio campo */}
            <div className="absolute left-0 right-0 top-1/2 h-px bg-white/25" />
            {/* Círculo central */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" style={{ width: '22%', aspectRatio: '1' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/40" />
            {/* Grande área de cima (ATA) */}
            <div className="absolute left-1/4 right-1/4 top-0 h-[16%] border-2 border-t-0 border-white/20 rounded-b" />
            {/* Pequena área de cima */}
            <div className="absolute left-[37%] right-[37%] top-0 h-[7%] border-2 border-t-0 border-white/20 rounded-b" />
            {/* Grande área de baixo (GOL) */}
            <div className="absolute left-1/4 right-1/4 bottom-0 h-[16%] border-2 border-b-0 border-white/20 rounded-t" />
            <div className="absolute left-[37%] right-[37%] bottom-0 h-[7%] border-2 border-b-0 border-white/20 rounded-t" />
          </div>

          {/* Linhas de jogadores */}
          <div className="absolute inset-0 flex flex-col justify-between py-5 px-2">
            {/* ATA (topo) */}
            <div className="flex justify-around items-center gap-1">
              {bestXI.ATA.map((p, i) => <PlayerPin key={i} player={p} state={state} />)}
              {Array.from({ length: 3 - bestXI.ATA.length }).map((_, i) => <PlayerSlotEmpty key={`ata-${i}`} pos="ATA" />)}
            </div>
            {/* MEI */}
            <div className="flex justify-around items-center gap-1">
              {bestXI.MEI.map((p, i) => <PlayerPin key={i} player={p} state={state} />)}
              {Array.from({ length: 3 - bestXI.MEI.length }).map((_, i) => <PlayerSlotEmpty key={`mei-${i}`} pos="MEI" />)}
            </div>
            {/* DEF: LAT - ZAG - ZAG - LAT */}
            <div className="flex justify-between items-center gap-1 px-1">
              {bestXI.LAT[0] ? <PlayerPin player={bestXI.LAT[0]} state={state} /> : <PlayerSlotEmpty pos="LAT" />}
              {bestXI.ZAG[0] ? <PlayerPin player={bestXI.ZAG[0]} state={state} /> : <PlayerSlotEmpty pos="ZAG" />}
              {bestXI.ZAG[1] ? <PlayerPin player={bestXI.ZAG[1]} state={state} /> : <PlayerSlotEmpty pos="ZAG" />}
              {bestXI.LAT[1] ? <PlayerPin player={bestXI.LAT[1]} state={state} /> : <PlayerSlotEmpty pos="LAT" />}
            </div>
            {/* GOL */}
            <div className="flex justify-center items-center">
              {bestXI.GOL[0] ? <PlayerPin player={bestXI.GOL[0]} state={state} /> : <PlayerSlotEmpty pos="GOL" />}
            </div>
          </div>
        </div>

        {missing.length > 0 && (
          <div className="mt-3 text-[11px] text-amber-300/80 text-center">
            Faltando: {missing.join(', ')}. Defina a posição de mais jogadores para preencher.
          </div>
        )}
      </Card>
    </section>
  );
}

function PlayerPin({ player, state }) {
  const ownerColor = getOwnerColor(state, player.owner);
  const posDef = POSITIONS.find((p) => p.id === player.position);
  return (
    <div className="flex flex-col items-center" style={{ minWidth: '70px', maxWidth: '90px' }}>
      <div className="relative w-9 h-9 rounded-full flex items-center justify-center shadow-lg border-2 border-white" style={{ backgroundColor: ownerColor }}>
        <span className="text-base">{player.teamFlag}</span>
        {posDef && (
          <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-slate-900 text-white px-1 py-0.5 rounded border" style={{ borderColor: posDef.color, color: posDef.color }}>
            {posDef.short}
          </span>
        )}
      </div>
      <div className="mt-1 text-center max-w-full">
        <div className="text-[10px] font-bold text-white truncate leading-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
          {player.playerName}
        </div>
        <div className="text-[9px] text-emerald-100/70 truncate leading-tight">
          {player.avg > 0 && <span>⭐{player.avg.toFixed(2)} </span>}
          {player.goals > 0 && <span className="text-emerald-200">{player.goals}G</span>}
        </div>
      </div>
    </div>
  );
}

function PlayerSlotEmpty({ pos }) {
  const posDef = POSITIONS.find((p) => p.id === pos);
  return (
    <div className="flex flex-col items-center opacity-40" style={{ minWidth: '70px', maxWidth: '90px' }}>
      <div className="w-9 h-9 rounded-full border-2 border-dashed border-white/40" />
      <div className="text-[9px] font-bold text-white/60 mt-1">{posDef?.short || '?'}</div>
    </div>
  );
}

/* Ranking individual de uma posição */
function PositionRanking({ posDef, list, state }) {
  return (
    <Card className="p-3" style={{ borderColor: `${posDef.color}50` }}>
      <h3 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: posDef.color }}>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-black border" style={{ borderColor: posDef.color }}>{posDef.short}</span>
        {posDef.label}
      </h3>
      {list.length === 0 ? (
        <div className="text-xs text-slate-600 italic py-2">Nenhum jogador atribuído a essa posição ainda.</div>
      ) : (
        <div className="overflow-y-auto pr-1" style={{ maxHeight: '300px' }}>
          <div className="space-y-1">
            {list.map((p, i) => (
              <div key={`${p.teamId}|${p.playerName}`} className="flex items-center gap-2 text-sm border-b border-slate-800/60 last:border-0 pb-1 last:pb-0">
                <span className={cls('text-xs font-bold w-5 text-right', i === 0 ? 'text-amber-400' : i < 3 ? 'text-emerald-400' : 'text-slate-500')}>{i + 1}</span>
                <span className="text-sm">{p.teamFlag}</span>
                <div className="flex-1 truncate min-w-0">
                  <div className="font-bold truncate text-sm flex items-center gap-1">
                    {p.playerName}
                    {p.isChampionTeam && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{p.teamName}</div>
                </div>
                <OwnerTag owner={p.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                  p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
                <div className="text-[10px] text-slate-400 hidden sm:flex items-center gap-1.5 min-w-[80px] justify-end">
                  {p.avg > 0 && <span className="tabular-nums">⭐{p.avg.toFixed(2)}</span>}
                  {p.goals > 0 && <span className="tabular-nums text-emerald-400">{p.goals}G</span>}
                </div>
                <div className="font-mono font-black tabular-nums text-xs text-lime-300 min-w-[40px] text-right">
                  {p.posScore.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ========== Suspensos pro próximo jogo ========== */
function SuspendedPlayersCard({ state, suspended, openMatch, openTeam }) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-red-400 mb-3 flex items-center gap-2">
        <span className="inline-block w-2.5 h-3.5 bg-red-500 rounded-sm" />
        Suspensos pro próximo jogo
        <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">({suspended.length})</span>
      </h2>
      <Card className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="text-left pb-1.5 pr-2">Time</th>
                <th className="text-left pb-1.5 pr-2">Dono</th>
                <th className="text-left pb-1.5 pr-2">Jogador</th>
                <th className="text-left pb-1.5 pr-2">Motivo</th>
                <th className="text-left pb-1.5 pl-2">Perde jogo contra</th>
              </tr>
            </thead>
            <tbody>
              {suspended.map((s) => {
                const stageLbl = s.nextMatch.stage === 'group'
                  ? `Grupo ${s.nextMatch.group} · R${s.nextMatch.round}`
                  : (STAGE_LABELS[s.nextMatch.stage] || s.nextMatch.stage);
                return (
                  <tr key={`${s.teamId}|${s.playerName}`} className="border-b border-slate-800/40">
                    <td className="py-1.5 pr-2">
                      {openTeam ? (
                        <button onClick={() => openTeam(s.teamId)} className="hover:text-lime-300 transition text-left">
                          <span className="mr-1">{s.teamFlag}</span>{s.teamName}
                        </button>
                      ) : (<><span className="mr-1">{s.teamFlag}</span>{s.teamName}</>)}
                    </td>
                    <td className="py-1.5 pr-2">
                      <OwnerTag owner={s.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                        p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
                    </td>
                    <td className="py-1.5 pr-2 font-bold">{s.playerName}</td>
                    <td className="py-1.5 pr-2 text-red-300 italic">{s.reason}</td>
                    <td className="py-1.5 pl-2">
                      <button onClick={() => openMatch?.(s.nextMatch.id)} className="text-left hover:text-lime-300 transition">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{stageLbl}</div>
                        <div className="flex items-center gap-1">
                          {s.opponent && (
                            <>
                              <span>{s.opponent.flag}</span>
                              <span className="truncate">{s.opponent.name}</span>
                            </>
                          )}
                        </div>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

/* ========== Sequências e Clean Sheets ========== */
function StreaksAndCleanSheetsCard({ state, streaks, cleanSheets }) {
  const topWinStreaks = [...streaks].filter((s) => s.winStreak >= 2).sort((a, b) => b.winStreak - a.winStreak || b.currentWinStreak - a.currentWinStreak).slice(0, 5);
  const topUnbeaten  = [...streaks].filter((s) => s.unbeatenStreak >= 2).sort((a, b) => b.unbeatenStreak - a.unbeatenStreak || b.currentUnbeatenStreak - a.currentUnbeatenStreak).slice(0, 5);
  const topCleanSheets = [...cleanSheets].filter((c) => c.played >= 2).slice(0, 5);

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4" /> Sequências & Defesa
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Vitórias seguidas */}
        <Card className="p-3">
          <h3 className="text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5 text-emerald-400 font-bold">
            <Trophy className="w-3.5 h-3.5" /> Vitórias seguidas
          </h3>
          {topWinStreaks.length === 0 ? (
            <div className="text-xs text-slate-600 italic">Nenhuma sequência de 2+ vitórias.</div>
          ) : (
            <div className="space-y-1.5">
              {topWinStreaks.map((s) => (
                <div key={s.teamId} className="flex items-center gap-2 text-xs border-b border-slate-800/40 last:border-0 pb-1.5 last:pb-0">
                  <span className="text-sm">{s.teamFlag}</span>
                  <div className="flex-1 truncate">
                    <div className="font-bold truncate">{s.teamName}</div>
                    <div className="text-[10px] text-slate-500">
                      <OwnerTag owner={s.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                        p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-black text-emerald-300 text-base leading-none">{s.winStreak}</div>
                    {s.currentWinStreak >= 2 && s.currentWinStreak === s.winStreak && (
                      <div className="text-[9px] text-emerald-400 uppercase font-bold mt-0.5">Em curso!</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Invencibilidade */}
        <Card className="p-3">
          <h3 className="text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5 text-sky-400 font-bold">
            <Award className="w-3.5 h-3.5" /> Invencibilidade
          </h3>
          {topUnbeaten.length === 0 ? (
            <div className="text-xs text-slate-600 italic">Nenhuma sequência invicta de 2+ jogos.</div>
          ) : (
            <div className="space-y-1.5">
              {topUnbeaten.map((s) => (
                <div key={s.teamId} className="flex items-center gap-2 text-xs border-b border-slate-800/40 last:border-0 pb-1.5 last:pb-0">
                  <span className="text-sm">{s.teamFlag}</span>
                  <div className="flex-1 truncate">
                    <div className="font-bold truncate">{s.teamName}</div>
                    <div className="text-[10px] text-slate-500">
                      <OwnerTag owner={s.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                        p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-black text-sky-300 text-base leading-none">{s.unbeatenStreak}</div>
                    {s.currentUnbeatenStreak >= 2 && s.currentUnbeatenStreak === s.unbeatenStreak && (
                      <div className="text-[9px] text-sky-400 uppercase font-bold mt-0.5">Em curso!</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Clean sheets */}
        <Card className="p-3">
          <h3 className="text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5 text-amber-400 font-bold">
            <Goal className="w-3.5 h-3.5" /> Menos vazados
          </h3>
          {topCleanSheets.length === 0 ? (
            <div className="text-xs text-slate-600 italic">Sem dados ainda.</div>
          ) : (
            <div className="space-y-1.5">
              {topCleanSheets.map((c) => (
                <div key={c.teamId} className="flex items-center gap-2 text-xs border-b border-slate-800/40 last:border-0 pb-1.5 last:pb-0">
                  <span className="text-sm">{c.teamFlag}</span>
                  <div className="flex-1 truncate">
                    <div className="font-bold truncate">{c.teamName}</div>
                    {c.goalkeepers.length > 0 && (
                      <div className="text-[10px] text-yellow-400 truncate">🧤 {c.goalkeepers.join(', ')}</div>
                    )}
                    {c.goalkeepers.length === 0 && (
                      <div className="text-[10px] text-slate-600 italic">Goleiro não definido</div>
                    )}
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-black text-amber-300 text-base leading-none">{c.cleanSheets}/{c.played}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">{c.goalsConceded} gols sofridos</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}

/* ========== Dependência Ofensiva ========== */
function OffensiveDependencyCard({ state, list }) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <Hand className="w-4 h-4" /> Carrega o time
        <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">— % dos gols do time em que o jogador participou</span>
      </h2>
      <Card className="p-3">
        <div className="space-y-2">
          {list.map((p, i) => (
            <div key={`${p.teamId}|${p.playerName}`} className="flex items-center gap-2">
              <span className={cls('text-xs font-bold w-5 text-right', i === 0 ? 'text-amber-400' : i < 3 ? 'text-emerald-400' : 'text-slate-500')}>{i + 1}</span>
              <span className="text-sm">{p.teamFlag}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm truncate">{p.playerName}</span>
                  <span className="text-xs text-slate-500 truncate">{p.teamName}</span>
                  <OwnerTag owner={p.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                    p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
                </div>
                {/* Barra de % */}
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.min(100, p.percentage)}%` }} />
                </div>
              </div>
              <div className="text-right tabular-nums min-w-[80px]">
                <div className="font-black text-emerald-300 text-base leading-none">{p.percentage.toFixed(0)}%</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {p.goals > 0 && <span className="text-emerald-400">⚽{p.goals} </span>}
                  {p.assists > 0 && <span className="text-sky-400">🤝{p.assists}</span>}
                  <span className="text-slate-600"> /{p.teamGoals}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

/* ========== Surpresas do torneio ========== */
function SurprisesCard({ state, list }) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <Star className="w-4 h-4" /> Surpresas do torneio
        <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">— times de pote 3 e 4 que se destacaram</span>
      </h2>
      <Card className="p-3">
        <div className="space-y-1.5">
          {list.map((t, i) => (
            <div key={t.teamId} className="flex items-center gap-2 text-sm">
              <span className={cls('text-xs font-bold w-5 text-right', i === 0 ? 'text-amber-400' : i < 3 ? 'text-emerald-400' : 'text-slate-500')}>{i + 1}</span>
              <span>{t.flag}</span>
              <div className="flex-1 truncate min-w-0">
                <span className="font-bold truncate">{t.name}</span>
                <span className="ml-2 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">POTE {t.pot}</span>
              </div>
              <OwnerTag owner={t.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
              <div className="text-xs text-slate-400 tabular-nums hidden sm:block min-w-[60px] text-right">
                {t.Pts}pt · {t.SG > 0 ? '+' : ''}{t.SG}
              </div>
              <div className="text-[10px] font-bold uppercase text-emerald-400 min-w-[55px] text-center">
                {t.stageLabel}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

/* ========== Página de detalhe do time ========== */
function TeamDetailView({ state, teamId, onBack, openMatch }) {
  const detail = useMemo(() => computeTeamDetail(state, teamId), [state, teamId]);
  if (!detail) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <Card className="p-6 text-center text-slate-500">Time não encontrado.</Card>
      </div>
    );
  }
  const { team, matches, P, V, E, D, GP, GC, SG, Pts, winPct, players } = detail;
  const ownerColor = getOwnerColor(state, team.owner);
  const ratedPlayers = [...players].sort((a, b) => {
    /* Ordena por relevância: gols + assists + presença */
    const score = (p) => p.goals * 3 + p.assists * 2 + p.ratingCount;
    return score(b) - score(a);
  });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      {/* Header do time */}
      <Card className="p-4" style={{ background: `linear-gradient(135deg, ${ownerColor}22 0%, transparent 60%)`, borderColor: `${ownerColor}55` }}>
        <div className="flex items-center gap-4">
          <span className="text-5xl">{team.flag}</span>
          <div>
            <div className="text-3xl font-black">{team.name}</div>
            <div className="mt-1">
              <OwnerTag owner={team.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                p1Color={state.player1Color} p2Color={state.player2Color} />
              {team.pot && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Pote {team.pot}</span>}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mt-4">
          <KpiCell label="Jogos" value={P} />
          <KpiCell label="V" value={V} />
          <KpiCell label="E" value={E} />
          <KpiCell label="D" value={D} />
          <KpiCell label="GP" value={GP} highlight={GP > 0} />
          <KpiCell label="GC" value={GC} />
          <KpiCell label="Saldo" value={(SG > 0 ? '+' : '') + SG} highlight={SG > 0} />
          <KpiCell label="% Apr." value={`${winPct}%`} highlight={winPct >= 50} />
        </div>
      </Card>

      {/* Jogadores do time */}
      <Card className="p-3">
        <h3 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Jogadores
          <span className="text-[10px] font-normal text-slate-500 normal-case tracking-normal">({ratedPlayers.length})</span>
        </h3>
        {ratedPlayers.length === 0 ? (
          <div className="text-xs text-slate-500 italic">Nenhum jogador registrado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="text-left pb-1.5 pr-2">Pos</th>
                  <th className="text-left pb-1.5 pr-2">Jogador</th>
                  <th className="text-center pb-1.5 px-1" title="Gols">⚽</th>
                  <th className="text-center pb-1.5 px-1" title="Assistências">🤝</th>
                  <th className="text-center pb-1.5 px-1" title="Amarelos">🟨</th>
                  <th className="text-center pb-1.5 px-1" title="Vermelhos">🟥</th>
                  <th className="text-center pb-1.5 px-1" title="Notas">⭐ Média</th>
                  <th className="text-center pb-1.5 pl-1">Jogos</th>
                </tr>
              </thead>
              <tbody>
                {ratedPlayers.map((p) => {
                  const pos = getPlayerPosition(state, teamId, p.playerName);
                  const posDef = POSITIONS.find((pp) => pp.id === pos);
                  const avg = p.ratingCount > 0 ? p.ratingSum / p.ratingCount : 0;
                  return (
                    <tr key={p.playerName} className="border-b border-slate-800/50">
                      <td className="py-1.5 pr-2">
                        {posDef ? (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border"
                            style={{ borderColor: posDef.color, color: posDef.color }}>{posDef.short}</span>
                        ) : <span className="text-[10px] text-slate-600">—</span>}
                      </td>
                      <td className="py-1.5 pr-2 font-medium">{p.playerName}</td>
                      <td className="text-center py-1.5 tabular-nums">{p.goals > 0 ? <span className="text-emerald-400 font-bold">{p.goals}</span> : <span className="text-slate-700">0</span>}</td>
                      <td className="text-center py-1.5 tabular-nums">{p.assists > 0 ? <span className="text-sky-400 font-bold">{p.assists}</span> : <span className="text-slate-700">0</span>}</td>
                      <td className="text-center py-1.5 tabular-nums">{p.yellows > 0 ? <span className="text-yellow-400 font-bold">{p.yellows}</span> : <span className="text-slate-700">0</span>}</td>
                      <td className="text-center py-1.5 tabular-nums">{p.reds > 0 ? <span className="text-red-400 font-bold">{p.reds}</span> : <span className="text-slate-700">0</span>}</td>
                      <td className="text-center py-1.5 tabular-nums">{avg > 0 ? <span className="font-bold">{avg.toFixed(2)}</span> : <span className="text-slate-700">—</span>}</td>
                      <td className="text-center py-1.5 tabular-nums text-slate-500">{p.ratingCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Histórico de partidas */}
      <Card className="p-3">
        <h3 className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Histórico de partidas
          <span className="text-[10px] font-normal text-slate-500 normal-case tracking-normal">({matches.length} jogos)</span>
        </h3>
        {matches.length === 0 ? (
          <div className="text-xs text-slate-500 italic">Sem partidas registradas.</div>
        ) : (
          <div className="space-y-1.5">
            {matches.map((m) => <TeamHistoryRow key={m.id} match={m} teamId={teamId} state={state} openMatch={openMatch} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function TeamHistoryRow({ match, teamId, state, openMatch }) {
  const isHome = match.homeTeamId === teamId;
  const own = isHome ? match.homeScore : match.awayScore;
  const opp = isHome ? match.awayScore : match.homeScore;
  const oppTeam = getTeamById(state, isHome ? match.awayTeamId : match.homeTeamId);
  if (!oppTeam) return null;
  const result = own > opp ? 'V' : own < opp ? 'D' : 'E';
  const resultColor = result === 'V' ? 'bg-emerald-700 text-emerald-50' : result === 'D' ? 'bg-red-700 text-red-50' : 'bg-slate-700 text-slate-300';
  const stageLabel = match.stage === 'group' ? `Grupo ${match.group} · R${match.round}` : (STAGE_LABELS[match.stage] || match.stage);
  return (
    <button onClick={() => openMatch(match.id)} className="w-full grid grid-cols-[80px_30px_1fr_auto] items-center gap-2 p-2 rounded hover:bg-slate-800/40 transition text-left">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">{stageLabel}</span>
      <span className={cls('inline-flex items-center justify-center w-6 h-6 rounded text-xs font-black', resultColor)}>{result}</span>
      <div className="flex items-center gap-1.5 text-sm truncate">
        <span className="text-slate-500 text-xs">{isHome ? 'vs' : 'em'}</span>
        <span>{oppTeam.flag}</span>
        <span className="truncate font-medium">{oppTeam.name}</span>
      </div>
      <span className="font-mono font-black tabular-nums text-sm">{own}–{opp}</span>
    </button>
  );
}

/* ========== Rankings de equipes (ataque/defesa/cartões) ========== */
function TeamRankingsSection({ state, openTeam }) {
  const rankings = useMemo(() => computeTeamRankings(state), [state.matches]);
  if (rankings.bestAttack.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <Trophy className="w-4 h-4" /> Estatísticas de equipes
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamRankList title="Melhor ataque" icon={<Goal className="w-4 h-4 text-emerald-400" />} list={rankings.bestAttack.slice(0, 8)} state={state} openTeam={openTeam} render={(t) => <span className="tabular-nums font-bold">{t.GP} <span className="text-[10px] text-slate-500 font-normal">({(t.GP / t.P).toFixed(1)}/j)</span></span>} />
        <TeamRankList title="Melhor defesa" icon={<span className="w-3 h-3 rounded-full bg-sky-400" />} list={rankings.bestDefense.slice(0, 8)} state={state} openTeam={openTeam} render={(t) => <span className="tabular-nums font-bold">{t.GC} <span className="text-[10px] text-slate-500 font-normal">({(t.GC / t.P).toFixed(1)}/j)</span></span>} />
        <TeamRankList title="Mais cartões" icon={<span className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-sm" />} list={rankings.mostCards.slice(0, 8)} state={state} openTeam={openTeam} render={(t) => (
          <span className="text-xs"><span className="text-yellow-400 font-bold tabular-nums">{t.yellows}</span>{t.reds > 0 && <span className="text-red-400 font-bold ml-1 tabular-nums">{t.reds}</span>}</span>
        )} />
        <TeamRankList title="Mais disciplinados" icon={<Award className="w-4 h-4 text-emerald-400" />} list={rankings.cleanestTeams.slice(0, 8)} state={state} openTeam={openTeam} render={(t) => (
          <span className="text-xs">
            {t.totalCards === 0 ? (
              <span className="text-emerald-400 font-bold">0 cartões</span>
            ) : (
              <>
                <span className="text-yellow-400 font-bold tabular-nums">{t.yellows}</span>
                {t.reds > 0 && <span className="text-red-400 font-bold ml-1 tabular-nums">{t.reds}</span>}
              </>
            )}
          </span>
        )} />
      </div>
    </section>
  );
}

/* ========== Métricas avançadas de times (posse, finalizações, xG) ========== */
function AdvancedTeamMetricsSection({ state, rows, openTeam }) {
  const withPossession = [...rows].filter((r) => r.possessionAvg != null).sort((a, b) => b.possessionAvg - a.possessionAvg);
  const withShots      = [...rows].filter((r) => r.shotsAvg != null).sort((a, b) => b.shotsSum - a.shotsSum);
  const withXG         = [...rows].filter((r) => r.xGAvg != null).sort((a, b) => b.xGSum - a.xGSum);
  const overperformers = [...rows]
    .filter((r) => r.xGDiff != null && r.xGCount >= 1)
    .sort((a, b) => b.xGDiff - a.xGDiff);

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <BarChart3 className="w-4 h-4" /> Estatísticas avançadas
        <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">— posse, finalizações, xG</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {withPossession.length > 0 && (
          <TeamRankList
            title="Mais posse de bola"
            icon={<span className="text-sm">⚽</span>}
            list={withPossession.slice(0, 8)}
            state={state} openTeam={openTeam}
            render={(t) => (
              <span className="text-xs">
                <span className="font-bold tabular-nums">{t.possessionAvg.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-500 font-normal ml-1">({t.possessionCount}j)</span>
              </span>
            )}
          />
        )}
        {withShots.length > 0 && (
          <TeamRankList
            title="Mais finalizações"
            icon={<span className="text-sm">🎯</span>}
            list={withShots.slice(0, 8)}
            state={state} openTeam={openTeam}
            render={(t) => (
              <span className="text-xs">
                <span className="font-bold tabular-nums">{t.shotsSum}</span>
                <span className="text-[10px] text-slate-500 font-normal ml-1">({t.shotsAvg.toFixed(1)}/j)</span>
              </span>
            )}
          />
        )}
        {withXG.length > 0 && (
          <TeamRankList
            title="Mais xG (perigo criado)"
            icon={<span className="text-sm">📈</span>}
            list={withXG.slice(0, 8)}
            state={state} openTeam={openTeam}
            render={(t) => (
              <span className="text-xs">
                <span className="font-bold tabular-nums">{t.xGSum.toFixed(2)}</span>
                <span className="text-[10px] text-slate-500 font-normal ml-1">({t.xGAvg.toFixed(2)}/j)</span>
              </span>
            )}
          />
        )}
        {overperformers.length > 0 && (
          <TeamRankList
            title="Gols vs xG"
            icon={<span className="text-sm">⚡</span>}
            list={overperformers.slice(0, 8)}
            state={state} openTeam={openTeam}
            render={(t) => {
              const diff = t.xGDiff;
              const color = diff > 0.5 ? 'text-emerald-400' : diff < -0.5 ? 'text-red-400' : 'text-slate-300';
              const label = diff > 0.5 ? 'acima' : diff < -0.5 ? 'abaixo' : 'no esperado';
              return (
                <span className="text-xs">
                  <span className={cls('font-bold tabular-nums', color)}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal ml-1">{label}</span>
                </span>
              );
            }}
          />
        )}
      </div>
      <div className="text-[10px] text-slate-600 italic mt-2 leading-relaxed">
        Dados coletados apenas nos jogos onde as métricas foram preenchidas. Bônus proporcionais entram no Power Ranking dos times.
      </div>
    </section>
  );
}

/* ========== Ranking de goleiros ========== */
function GoalkeeperRankingSection({ state, rows, openTeam }) {
  const withData = rows.filter((r) => (r.saves || 0) > 0 || r.ratingCount > 0);
  if (withData.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <span className="text-sm">🧤</span> Melhores goleiros
        <span className="text-xs font-normal text-slate-500 normal-case tracking-normal">({withData.length})</span>
      </h2>
      <Card className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="text-left pb-1.5 pr-2 w-8">#</th>
                <th className="text-left pb-1.5 pr-2">Jogador</th>
                <th className="text-left pb-1.5 pr-2">Time</th>
                <th className="text-center pb-1.5 px-1" title="Defesas">🧤</th>
                <th className="text-center pb-1.5 px-1" title="Gols sofridos pelo time">GC time</th>
                <th className="text-center pb-1.5 px-1" title="Partidas com nota">Jogos</th>
                <th className="text-center pb-1.5 px-1" title="Média das notas">⭐</th>
                <th className="text-right pb-1.5 pl-2" title="Score do goleiro">Score</th>
              </tr>
            </thead>
            <tbody>
              {withData.map((p, i) => (
                <tr key={`${p.teamId}|${p.playerName}`} className={cls(
                  'border-b border-slate-800/40',
                  i === 0 && 'bg-amber-950/20',
                )}>
                  <td className="py-1.5 pr-2 tabular-nums font-bold">
                    <span className={cls(i === 0 ? 'text-amber-400' : i < 3 ? 'text-emerald-400' : 'text-slate-500')}>{i + 1}</span>
                  </td>
                  <td className="py-1.5 pr-2 font-bold">
                    {p.playerName}
                    {p.isChampionTeam && <Crown className="w-3 h-3 text-amber-400 inline ml-1" />}
                  </td>
                  <td className="py-1.5 pr-2">
                    {openTeam ? (
                      <button onClick={() => openTeam(p.teamId)} className="hover:text-lime-300 transition text-left">
                        <span className="mr-1">{p.teamFlag}</span>{p.teamName}
                      </button>
                    ) : (<><span className="mr-1">{p.teamFlag}</span>{p.teamName}</>)}
                  </td>
                  <td className="py-1.5 px-1 text-center tabular-nums font-bold text-yellow-300">{p.saves || 0}</td>
                  <td className="py-1.5 px-1 text-center tabular-nums text-slate-400">{p.goalsAgainst}</td>
                  <td className="py-1.5 px-1 text-center tabular-nums text-slate-400">{p.matchesPlayed || 0}</td>
                  <td className="py-1.5 px-1 text-center tabular-nums font-bold">
                    {p.avg > 0 ? p.avg.toFixed(2) : '—'}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums font-mono font-black text-lime-300">
                    {p.gkScore.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function TeamRankList({ title, icon, list, state, render, openTeam }) {
  return (
    <Card className="p-3">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">{icon}{title}</h3>
      <div className="space-y-1">
        {list.map((t, i) => (
          <button key={t.teamId} onClick={() => openTeam?.(t.teamId)} className="w-full flex items-center gap-2 text-sm border-b border-slate-800/40 last:border-0 pb-1 last:pb-0 hover:bg-slate-800/30 rounded px-1 transition text-left">
            <span className={cls('text-xs font-bold w-5 text-right', i === 0 ? 'text-amber-400' : i < 3 ? 'text-emerald-400' : 'text-slate-500')}>{i + 1}</span>
            <span>{t.flag}</span>
            <span className="flex-1 truncate font-medium">{t.name}</span>
            <OwnerTag owner={t.owner} p1Name={state.player1Name} p2Name={state.player2Name}
              p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
            <div className="min-w-[60px] text-right">{render(t)}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ========== Time da Rodada (com seletor) ========== */
function BestXIByRoundSection({ state }) {
  const rounds = useMemo(() => getAllRoundKeys(state), [state.matches]);
  const [selectedRound, setSelectedRound] = useState('all');

  const playedRounds = useMemo(() => rounds.filter((r) => {
    const ms = r.stage === 'group'
      ? state.matches.filter((m) => m.stage === 'group' && m.round === r.round && m.played && !m.autoPlayed)
      : state.matches.filter((m) => m.stage === r.stage && !m.isExtra && m.played && !m.autoPlayed);
    return ms.length > 0;
  }), [rounds, state.matches]);

  const bestXI = useMemo(() => {
    if (selectedRound === 'all') return computeBestXI(state);
    return computeBestXIForRound(state, selectedRound);
  }, [state.matches, state.playerPositions, selectedRound]);

  if (playedRounds.length === 0) return <BestXIField state={state} bestXI={bestXI} />;

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
        <Users className="w-4 h-4" /> Time do torneio (4-3-3)
      </h2>
      {/* Seletor de rodada */}
      <div className="flex flex-wrap gap-1 mb-3">
        <button onClick={() => setSelectedRound('all')}
          className={cls('text-[10px] font-bold uppercase px-2.5 py-1 rounded transition',
            selectedRound === 'all' ? 'bg-lime-500 text-lime-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
          Geral
        </button>
        {playedRounds.map((r) => (
          <button key={r.key} onClick={() => setSelectedRound(r.key)}
            className={cls('text-[10px] font-bold uppercase px-2.5 py-1 rounded transition',
              selectedRound === r.key ? 'bg-lime-500 text-lime-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}>
            {r.label}
          </button>
        ))}
      </div>
      <BestXIField state={state} bestXI={bestXI} hideTitle />
    </section>
  );
}

/* ========== Lista com paginação (scroll) ========== */
function ScrollableList({ items, render, maxHeight = '420px', emptyMessage = 'Sem dados.' }) {
  if (items.length === 0) {
    return <div className="text-xs text-slate-600 italic py-2">{emptyMessage}</div>;
  }
  return (
    <div className="overflow-y-auto pr-1" style={{ maxHeight }}>
      <div className="space-y-1">
        {items.map((it, i) => render(it, i))}
      </div>
    </div>
  );
}

function StatsList({ title, icon, list, render, state, maxHeight = '320px' }) {
  return (
    <Card className="p-3">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">{icon}{title}</h3>
      {list.length === 0 ? (
        <div className="text-xs text-slate-600 italic py-2">Sem dados ainda.</div>
      ) : (
        <div className="overflow-y-auto pr-1" style={{ maxHeight }}>
          <div className="space-y-1">
            {list.map((s, i) => (
              <div key={`${s.teamId}|${s.playerName}`} className="flex items-center gap-2 text-sm border-b border-slate-800/60 last:border-0 pb-1 last:pb-0">
                <span className="text-xs text-slate-500 w-5 text-right">{i + 1}.</span>
                {s.teamFlag && <span className="text-sm">{s.teamFlag}</span>}
                <span className="flex-1 truncate min-w-0">
                  <span className="font-bold">{s.playerName}</span>
                  <span className="text-xs text-slate-500 ml-1.5">{s.teamName}</span>
                </span>
                {state && (
                  <OwnerTag owner={s.owner} p1Name={state.player1Name} p2Name={state.player2Name}
                    p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
                )}
                <div>{render(s)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
