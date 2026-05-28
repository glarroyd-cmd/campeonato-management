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
import {
  FORMATS, getFormat, STAGE_LABELS, STAGE_ORDER_INDEX, TIEBREAKERS,
  CARD_RULE_LABELS, DEFAULT_TIEBREAKERS,
  makeInitialState, makeGroupMatches, makeKnockoutMatches,
  computeGroupStanding, getPlayerCardStatus, propagateKnockoutWinners,
  autoFillSameOwnerGroupMatches, getMatchOutcome, recalcKnockoutSeeding,
  getAllTeams, getTeamById, computePlayerStats, computeTeamStats, computeOwnerStats,
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
    .select('state')
    .eq('code', code)
    .maybeSingle();
  if (error) { console.error(error); return null; }
  return data ? data.state : null;
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

async function saveTournament(code, state) {
  const stateWithMeta = { ...state, _meta: { lastUpdater: clientId, updatedAt: Date.now() } };
  const { error } = await supabase.from('tournaments').update({ state: stateWithMeta }).eq('code', code);
  if (error) console.error(error);
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

  /* Carrega torneio quando code muda */
  useEffect(() => {
    if (!code) { setState(null); return; }
    let channel = null;
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError(null);
      const loaded = await loadTournament(code);
      if (cancelled) return;
      if (!loaded) {
        setLoadError(`Torneio "${code}" não encontrado.`);
        setLoading(false);
        return;
      }
      setState(loaded);
      rememberTournament({ code });
      /* Decide view inicial baseado em estado de setup */
      if (!loaded.setupComplete) setView('setup');
      else if (!loaded.rulesComplete) setView('rules');
      else if (!loaded.teamsComplete) setView('teamsSetup');
      else setView('groups');
      setLoading(false);

      channel = supabase
        .channel(`tournament-${code}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `code=eq.${code}` },
          (payload) => {
            const newState = payload.new?.state;
            if (!newState) return;
            if (newState._meta && newState._meta.lastUpdater === clientId) return;
            setState(newState);
          }
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [code]);

  /* Auto-salvar com debounce */
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!state || !code || loading) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTournament(code, state); }, 400);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, code, loading]);

  /* Sincroniza URL hash */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (code) {
      if (window.location.hash !== `#${code}`) window.history.replaceState(null, '', `#${code}`);
    } else {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    }
  }, [code]);

  const update = useCallback((partial) => setState((prev) => prev ? ({ ...prev, ...partial }) : prev), []);
  const updateMatches = useCallback((newMatches) => {
    setState((prev) => {
      if (!prev) return prev;
      let intermediate = { ...prev, matches: newMatches };
      /* 1. Recalcula seeding do KO baseado nas standings atuais (só pra slots não jogados) */
      const { matches: afterSeeding } = recalcKnockoutSeeding(intermediate);
      intermediate = { ...intermediate, matches: afterSeeding };
      /* 2. Propaga vencedores no KO */
      const { matches: afterPropagation } = propagateKnockoutWinners(intermediate.matches);
      return { ...intermediate, matches: afterPropagation };
    });
  }, []);

  const leave = useCallback(() => {
    setCode(null);
    setState(null);
  }, []);

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
    return <SetupPlayersView state={state} update={update} code={code} onLeave={leave} />;
  }
  if (!state.rulesComplete) {
    return <RulesSetupView state={state} update={update} code={code} onLeave={leave} />;
  }
  if (!state.teamsComplete) {
    return <TeamsSetupView state={state} update={update} updateMatches={updateMatches} code={code} onLeave={leave} />;
  }

  const allTeams = getAllTeams(state);

  /* Garante que view esteja numa tab válida depois do wizard */
  const validTabs = ['groups', 'matches', 'match', 'knockout', 'stats'];
  const safeView = validTabs.includes(view) ? view : 'groups';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Header state={state} view={safeView} setView={setView} code={code} onLeave={leave} />
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24">
        {safeView === 'groups'   && <GroupsView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} />}
        {safeView === 'matches'  && <MatchesView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />}
        {safeView === 'match' && activeMatchId && (
          <MatchDetailView state={state} matchId={activeMatchId} updateMatches={updateMatches} update={update} allTeams={allTeams} onBack={() => setView('matches')} openMatch={(id) => setActiveMatchId(id)} />
        )}
        {safeView === 'knockout' && <KnockoutView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />}
        {safeView === 'stats'    && <StatsView state={state} allTeams={allTeams} />}
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
function GroupsView({ state, update, updateMatches, allTeams }) {
  const format = getFormat(state.formatId);
  if (!format.hasGroups) {
    return <div className="text-center text-slate-500 py-12">Este torneio é mata-mata direto. Use a aba "Mata-Mata".</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {state.groups.map((g) => (
        <Card key={g.letter} className="p-4">
          <h3 className="font-black text-xl mb-3">Grupo {g.letter}</h3>
          <StandingTable rows={computeGroupStanding(state, g.letter)} state={state} />
        </Card>
      ))}
    </div>
  );
}

function StandingTable({ rows, state }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500">
        <tr>
          <th className="text-left font-medium pb-1">#</th>
          <th className="text-left font-medium pb-1">Time</th>
          <th className="text-left font-medium pb-1 px-1">Dono</th>
          <th className="font-medium pb-1 px-1">P</th>
          <th className="font-medium pb-1 px-1">V</th>
          <th className="font-medium pb-1 px-1">E</th>
          <th className="font-medium pb-1 px-1">D</th>
          <th className="font-medium pb-1 px-1">SG</th>
          <th className="font-medium pb-1 px-1">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={cls('border-t border-slate-800', i < 2 && 'text-lime-300', i === 2 && 'text-yellow-300')}>
            <td className="py-1">{i + 1}</td>
            <td className="py-1"><span className="mr-1">{r.flag}</span>{r.name}</td>
            <td className="py-1 px-1"><OwnerTag owner={r.owner} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} size="xs" /></td>
            <td className="text-center py-1 tabular-nums">{r.P}</td>
            <td className="text-center py-1 tabular-nums">{r.V}</td>
            <td className="text-center py-1 tabular-nums">{r.E}</td>
            <td className="text-center py-1 tabular-nums">{r.D}</td>
            <td className="text-center py-1 tabular-nums">{r.SG > 0 ? '+' : ''}{r.SG}</td>
            <td className="text-center py-1 tabular-nums font-bold">{r.Pts}</td>
          </tr>
        ))}
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

  /* Três estados visuais bem distintos */
  let containerCls;
  if (isAuto) {
    containerCls = 'bg-slate-900/30 border-slate-800/60 opacity-60';
  } else if (match.played) {
    containerCls = 'bg-emerald-950/40 border-emerald-700/50 hover:border-emerald-500';
  } else {
    containerCls = 'bg-slate-900/80 border-2 border-dashed border-lime-500/40 hover:border-lime-400 hover:bg-slate-900';
  }

  return (
    <button onClick={onClick} className={cls('w-full p-2 rounded-lg border transition text-sm block', containerCls)}>
      {isAuto && (
        <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1 text-center font-bold">Auto-empate (mesmo dono)</div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-1.5 justify-end text-right truncate min-w-0">
          <div className="flex flex-col items-end gap-0.5 min-w-0">
            <span className="truncate font-medium">{home.flag} {home.name}</span>
            <OwnerTag owner={home.owner} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
          </div>
        </div>
        <div className={cls('font-mono font-black tabular-nums px-3 py-1 rounded',
          match.played && !isAuto ? 'bg-slate-950 text-lime-300 text-base' :
          isAuto ? 'text-slate-600 text-sm' :
          'text-slate-600 text-base')}>
          {match.played ? `${match.homeScore}–${match.awayScore}` : '—'}
        </div>
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="truncate font-medium">{away.flag} {away.name}</span>
            <OwnerTag owner={away.owner} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
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

  /* Sequência ordenada de jogos pra navegação Anterior/Próximo */
  const orderedMatches = useMemo(() => {
    return [...state.matches].sort((a, b) => {
      const aIdx = STAGE_ORDER_INDEX[matchStageKey(a)] ?? 999;
      const bIdx = STAGE_ORDER_INDEX[matchStageKey(b)] ?? 999;
      if (aIdx !== bIdx) return aIdx - bIdx;
      /* mesma rodada: ordena por grupo / koIndex / leg / isExtra */
      if (a.stage === 'group') {
        if (a.group !== b.group) return (a.group || '').localeCompare(b.group || '');
        return a.id.localeCompare(b.id);
      }
      if ((a.koIndex ?? 0) !== (b.koIndex ?? 0)) return (a.koIndex ?? 0) - (b.koIndex ?? 0);
      if ((a.leg ?? 1) !== (b.leg ?? 1)) return (a.leg ?? 1) - (b.leg ?? 1);
      return (a.isExtra ? 1 : 0) - (b.isExtra ? 1 : 0);
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
      </Card>

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

      {/* Tabela de jogadores */}
      <div className="overflow-x-auto -mx-3 px-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
              <th className="text-left pb-1 pr-1">Jogador</th>
              <th className="pb-1 px-0.5 w-12" title="Gols"><Goal className="w-3.5 h-3.5 text-emerald-400 inline" /></th>
              <th className="pb-1 px-0.5 w-12" title="Assistências"><Hand className="w-3.5 h-3.5 text-sky-400 inline" /></th>
              <th className="pb-1 px-0.5 w-10" title="Amarelos"><span className="inline-block w-2 h-3 bg-yellow-400 rounded-sm" /></th>
              <th className="pb-1 px-0.5 w-10" title="Vermelhos"><span className="inline-block w-2 h-3 bg-red-500 rounded-sm" /></th>
              <th className="pb-1 px-0.5 w-14" title="Nota"><Star className="w-3.5 h-3.5 text-yellow-300 inline" /></th>
              <th className="pb-1 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {displayedPlayers.length === 0 && (
              <tr>
                <td colSpan={7} className="text-slate-600 italic text-center py-2">Sem jogadores cadastrados. Adicione abaixo.</td>
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
                onIncrement={(t) => incrementEvent(player, t)}
                onDecrement={(t) => decrementEvent(player, t)}
                onRename={(nn) => renamePlayer(player, nn)}
                onSetRating={(v) => setRating(player, v)}
                onRemove={() => removePlayerEverywhere(player)}
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
function PlayerRow({ player, rating, goals, assists, yellows, reds, onIncrement, onDecrement, onRename, onSetRating, onRemove }) {
  const [draftName, setDraftName] = useState(player);
  useEffect(() => { setDraftName(player); }, [player]);

  return (
    <tr className="border-t border-slate-800/40">
      <td className="pr-1 py-1">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => onRename(draftName)}
          className="w-full bg-transparent text-xs px-1 py-1 rounded border border-transparent hover:border-slate-700 focus:border-lime-400 outline-none"
        />
      </td>
      <td className="px-0.5 py-1">
        <Counter value={goals}    onPlus={() => onIncrement('goal')}    onMinus={() => onDecrement('goal')}    color="emerald" />
      </td>
      <td className="px-0.5 py-1">
        <Counter value={assists}  onPlus={() => onIncrement('assist')}  onMinus={() => onDecrement('assist')}  color="sky" />
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
  /* Stages do bracket principal (exclui third lugar, mostra separado) */
  const allStages = [...new Set(koMatches.filter((m) => !m.isExtra).map((m) => m.stage))];
  const stageOrder = ['r32', 'r16', 'qf', 'sf', 'final'];
  const mainStages = allStages.filter((s) => s !== 'third').sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));
  const hasThird = allStages.includes('third');

  const groupByConfront = (stage) => {
    const arr = koMatches.filter((m) => m.stage === stage && !m.isExtra);
    const grouped = {};
    for (const m of arr) {
      const key = m.koIndex;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }
    return Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).map(([, legs]) => legs);
  };

  /* Altura mínima dinâmica baseada no maior stage (cada confronto ~ 90px) */
  const firstStageCount = groupByConfront(mainStages[0])?.length || 0;
  const minHeight = Math.max(420, firstStageCount * 86);

  return (
    <div className="space-y-6">
      {/* Header com nomes das fases (sticky no topo do scroll) */}
      <div className="overflow-x-auto pb-2">
        <div className="inline-flex gap-3 min-w-full">
          {mainStages.map((stage) => (
            <div key={stage + '-h'} className="flex-shrink-0 w-[210px] text-center">
              <div className="text-xs font-bold uppercase tracking-wider text-lime-400 pb-2 border-b border-slate-800">
                {STAGE_LABELS[stage] || stage}
              </div>
            </div>
          ))}
        </div>
        <div className="inline-flex gap-3 mt-2 min-w-full" style={{ minHeight: `${minHeight}px` }}>
          {mainStages.map((stage) => {
            const confronts = groupByConfront(stage);
            return (
              <div key={stage} className="flex-shrink-0 w-[210px] flex flex-col justify-around gap-2">
                {confronts.map((legs, cIdx) => (
                  <KnockoutConfrontCard key={`${stage}-${cIdx}`} state={state} legs={legs} openMatch={openMatch} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3º Lugar separado */}
      {hasThird && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-2">
            <Award className="w-4 h-4" /> Disputa de 3º lugar
          </h3>
          <div className="max-w-xs">
            {groupByConfront('third').map((legs, cIdx) => (
              <KnockoutConfrontCard key={`third-${cIdx}`} state={state} legs={legs} openMatch={openMatch} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KnockoutConfrontCard({ state, legs, openMatch }) {
  legs = [...legs].sort((a, b) => a.leg - b.leg);
  const sample = legs[0];
  const home = getTeamById(state, sample.homeTeamId);
  const away = getTeamById(state, sample.awayTeamId);
  const sameOwner = home?.owner && away?.owner && home.owner === away.owner;
  const outcome = getMatchOutcome(state.matches, sample.stage, sample.koIndex);
  const isMultiLeg = sample.totalLegs > 1;
  const etMatch = state.matches.find((m) => m.stage === sample.stage && m.koIndex === sample.koIndex && m.isExtra);

  /* Determina placar exibido por time (agregado ou simples) */
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
  const undefined1 = !home;
  const undefined2 = !away;

  return (
    <Card className={cls(
      'overflow-hidden text-xs',
      sameOwner && 'border-amber-700/60'
    )}>
      {sameOwner && (
        <div className="px-2 py-0.5 bg-amber-900/30 text-[9px] text-amber-300 font-bold flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5" />Mesmo dono
        </div>
      )}
      {/* Linha do time da casa */}
      <button
        onClick={() => openMatch(legs[0].id)}
        className={cls(
          'w-full grid grid-cols-[1fr_auto] items-center gap-1 px-2 py-1.5 hover:bg-slate-800/60 transition',
          homeWon && 'bg-emerald-950/40',
          !legs[0].played && 'opacity-90'
        )}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <span>{home?.flag || '?'}</span>
          <span className={cls('truncate', homeWon && 'font-bold text-emerald-200', undefined1 && 'italic text-slate-600')}>
            {home?.name || 'A definir'}
          </span>
          {home?.owner && <OwnerTag owner={home.owner} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />}
        </div>
        <span className={cls('font-mono font-bold tabular-nums', homeWon ? 'text-emerald-300' : 'text-slate-300')}>
          {homeDisplay}
        </span>
      </button>

      {/* Linha do visitante */}
      <button
        onClick={() => openMatch(legs[isMultiLeg ? 1 : 0].id)}
        className={cls(
          'w-full grid grid-cols-[1fr_auto] items-center gap-1 px-2 py-1.5 hover:bg-slate-800/60 transition border-t border-slate-800',
          awayWon && 'bg-emerald-950/40',
          !legs[0].played && 'opacity-90'
        )}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <span>{away?.flag || '?'}</span>
          <span className={cls('truncate', awayWon && 'font-bold text-emerald-200', undefined2 && 'italic text-slate-600')}>
            {away?.name || 'A definir'}
          </span>
          {away?.owner && <OwnerTag owner={away.owner} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />}
        </div>
        <span className={cls('font-mono font-bold tabular-nums', awayWon ? 'text-emerald-300' : 'text-slate-300')}>
          {awayDisplay}
        </span>
      </button>

      {/* Linha de meta-info: prorrogação, ida/volta detalhada, pênaltis */}
      {(isMultiLeg || etMatch || outcome.viaPenalties) && (
        <div className="px-2 py-1 bg-slate-950/60 border-t border-slate-800 text-[10px] text-slate-500 text-center space-y-0.5">
          {isMultiLeg && legs.every((m) => m.played) && (
            <div>
              Ida: {legs[0].homeScore}-{legs[0].awayScore} · Volta: {legs[1].homeScore}-{legs[1].awayScore}
            </div>
          )}
          {etMatch && (
            <button onClick={() => openMatch(etMatch.id)} className="text-amber-400 hover:text-amber-300 flex items-center gap-1 justify-center w-full">
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
function StatsView({ state, allTeams }) {
  const playerStats = useMemo(() => computePlayerStats(state), [state.matches]);
  const teamStats   = useMemo(() => computeTeamStats(state),   [state.matches]);
  const ownerStats  = useMemo(() => computeOwnerStats(state),  [state.matches]);

  const topScorers = [...playerStats].filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 10);
  const topAssists = [...playerStats].filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 10);
  const topRated   = [...playerStats].filter((s) => s.ratingCount >= 2).map((s) => ({ ...s, avg: s.ratingSum / s.ratingCount })).sort((a, b) => b.avg - a.avg).slice(0, 10);
  const mostCards  = [...playerStats].filter((s) => s.yellows + s.reds > 0).sort((a, b) => (b.reds * 10 + b.yellows) - (a.reds * 10 + a.yellows)).slice(0, 10);

  /* Times ordenados */
  const teamsByGoals    = [...teamStats].filter((t) => t.P > 0).sort((a, b) => b.GP - a.GP).slice(0, 10);
  const teamsByDefense  = [...teamStats].filter((t) => t.P > 0).sort((a, b) => a.GC - b.GC || b.P - a.P).slice(0, 10);
  const teamsByWinPct   = [...teamStats].filter((t) => t.P >= 2).sort((a, b) => b.winPct - a.winPct || b.Pts - a.Pts).slice(0, 10);

  const champion = getChampion(state);
  const noStatsYet = teamStats.every((t) => t.P === 0);

  return (
    <div className="space-y-6">
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

      {/* Comparação entre jogadores */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Jogadores
        </h2>
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ownerStats.map((o) => (
              <div key={o.id} className={cls('p-3 rounded-lg border',
                o.id === 'p1' ? 'bg-cyan-950/30 border-cyan-800/50' : 'bg-amber-950/30 border-amber-800/50'
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-black text-lg">{o.name}</div>
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
            ))}
          </div>
        </Card>
      </section>

      {/* Stats por time */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4" /> Times
        </h2>
        {noStatsYet ? (
          <Card className="p-4 text-xs text-slate-500 italic">Sem jogos contabilizados ainda.</Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TeamStatsList title="Mais marcaram (gols pró)" list={teamsByGoals} state={state}
              render={(t) => <span className="font-bold tabular-nums">{t.GP}<span className="text-slate-500 text-xs font-normal"> ({t.P}j)</span></span>} />
            <TeamStatsList title="Melhor defesa (menos gols sofridos)" list={teamsByDefense} state={state}
              render={(t) => <span className="font-bold tabular-nums">{t.GC}<span className="text-slate-500 text-xs font-normal"> ({t.P}j)</span></span>} />
            <TeamStatsList title="Melhor aproveitamento" list={teamsByWinPct} state={state}
              render={(t) => <span className="font-bold tabular-nums">{t.winPct}%<span className="text-slate-500 text-xs font-normal"> ({t.Pts}pts)</span></span>} />
            <TeamStatsList title="Tabela completa" list={[...teamStats].filter((t) => t.P > 0).sort((a, b) => b.Pts - a.Pts || b.SG - a.SG).slice(0, 10)} state={state}
              render={(t) => <span className="text-xs tabular-nums text-slate-400">{t.V}V {t.E}E {t.D}D · <span className="font-bold text-slate-100">{t.Pts}pt</span></span>} />
          </div>
        )}
      </section>

      {/* Stats de jogadores (do game) */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3 flex items-center gap-2">
          <Star className="w-4 h-4" /> Jogadores em campo
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatsList title="Artilharia" icon={<Goal className="w-4 h-4 text-emerald-400" />} list={topScorers} render={(s) => <span className="tabular-nums font-bold">{s.goals}</span>} />
          <StatsList title="Assistências" icon={<Hand className="w-4 h-4 text-sky-400" />} list={topAssists} render={(s) => <span className="tabular-nums font-bold">{s.assists}</span>} />
          <StatsList title="Melhores médias" icon={<Star className="w-4 h-4 text-yellow-400" />} list={topRated} render={(s) => <span className="tabular-nums font-bold">{s.avg.toFixed(2)} <span className="text-slate-500 text-xs">({s.ratingCount}j)</span></span>} />
          <StatsList title="Mais cartões" icon={<span className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-sm" />} list={mostCards} render={(s) => <span className="tabular-nums text-xs"><span className="text-yellow-400 font-bold">{s.yellows}</span>{s.reds > 0 && <> <span className="text-red-400 font-bold ml-1">{s.reds}</span></>}</span>} />
        </div>
      </section>
    </div>
  );
}

function KpiCell({ label, value, highlight }) {
  return (
    <div className={cls('rounded p-1.5 bg-slate-950/40')}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cls('font-black text-lg tabular-nums', highlight ? 'text-lime-300' : 'text-slate-100')}>{value}</div>
    </div>
  );
}

function TeamStatsList({ title, list, render, state }) {
  return (
    <Card className="p-3">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-2 text-slate-300">{title}</h3>
      {list.length === 0 ? (
        <div className="text-xs text-slate-600 italic py-2">Sem dados ainda.</div>
      ) : (
        <div className="space-y-1">
          {list.map((t, i) => (
            <div key={t.teamId} className="flex items-center gap-2 text-sm border-b border-slate-800/60 last:border-0 pb-1 last:pb-0">
              <span className="text-xs text-slate-500 w-5 text-right">{i + 1}.</span>
              <span className="text-sm">{t.flag}</span>
              <span className="flex-1 truncate font-medium">{t.name}</span>
              <OwnerTag owner={t.owner} p1Name={state.player1Name} p2Name={state.player2Name} p1Color={state.player1Color} p2Color={state.player2Color} size="xs" />
              <div className="min-w-[60px] text-right">{render(t)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StatsList({ title, icon, list, render }) {
  return (
    <Card className="p-3">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">{icon}{title}</h3>
      {list.length === 0 ? (
        <div className="text-xs text-slate-600 italic py-2">Sem dados ainda.</div>
      ) : (
        <div className="space-y-1">
          {list.map((s, i) => (
            <div key={`${s.teamId}|${s.playerName}`} className="flex items-center gap-2 text-sm border-b border-slate-800/60 last:border-0 pb-1 last:pb-0">
              <span className="text-xs text-slate-500 w-5 text-right">{i + 1}.</span>
              {s.teamFlag && <span className="text-sm">{s.teamFlag}</span>}
              <span className="flex-1 truncate">
                <span className="font-bold">{s.playerName}</span>
                <span className="text-xs text-slate-500 ml-2">{s.teamName}</span>
              </span>
              <div>{render(s)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
