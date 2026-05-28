import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Trophy, Users, Calendar, BarChart3, ChevronRight, ChevronLeft,
  Edit2, Check, X, Plus, AlertTriangle, Award, Target, Camera,
  Loader2, ArrowLeftRight, Star, RefreshCw,
  Goal, Hand, FileText, ArrowRight, ChevronDown, ChevronUp,
  Link2, LogOut, Copy, Home as HomeIcon, ArrowUp, ArrowDown,
  Settings2, Shuffle, Crown, Clock, Zap,
} from 'lucide-react';
import { supabase, clientId } from './lib/supabase.js';
import {
  getLocalHistory, rememberTournament, forgetTournament,
} from './lib/localHistory.js';
import {
  FORMATS, getFormat, STAGE_LABELS, STAGE_ORDER_INDEX, TIEBREAKERS,
  CARD_RULE_LABELS, DEFAULT_TIEBREAKERS,
  makeInitialState, makeGroupMatches, makeKnockoutMatches,
  computeGroupStanding, getPlayerCardStatus, propagateKnockoutWinners,
  autoFillSameOwnerGroupMatches, getMatchOutcome,
  getAllTeams, getTeamById, computePlayerStats,
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
  const updateMatches = useCallback((newMatches) => setState((prev) => prev ? ({ ...prev, matches: newMatches }) : prev), []);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Header state={state} view={view} setView={setView} code={code} onLeave={leave} />
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24">
        {view === 'groups'   && <GroupsView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} />}
        {view === 'matches'  && <MatchesView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />}
        {view === 'match' && activeMatchId && (
          <MatchDetailView state={state} matchId={activeMatchId} updateMatches={updateMatches} update={update} allTeams={allTeams} onBack={() => setView('matches')} openMatch={(id) => setActiveMatchId(id)} />
        )}
        {view === 'knockout' && <KnockoutView state={state} update={update} updateMatches={updateMatches} allTeams={allTeams} openMatch={(id) => { setActiveMatchId(id); setView('match'); }} />}
        {view === 'stats'    && <StatsView state={state} allTeams={allTeams} />}
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

  const handleNext = () => {
    update({
      player1Name: p1.trim() || 'Jogador 1',
      player2Name: p2.trim() || 'Jogador 2',
      setupComplete: true,
    });
  };

  return (
    <WizardShell step={1} totalSteps={3} code={code} onLeave={onLeave}
      title="Quem são os jogadores?"
      subtitle="Defina os nomes dos dois jogadores que vão disputar este torneio."
    >
      <Card className="p-5 space-y-4">
        <PlayerField label="Jogador 1" value={p1} onChange={setP1} placeholder="Ex: João" color="cyan" />
        <PlayerField label="Jogador 2" value={p2} onChange={setP2} placeholder="Ex: Pedro" color="amber" />
      </Card>
      <div className="mt-6 flex justify-end">
        <button onClick={handleNext} className="px-6 py-3 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded-lg flex items-center gap-2">
          Próximo: regras <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </WizardShell>
  );
}

function PlayerField({ label, value, onChange, placeholder, color }) {
  return (
    <div>
      <label className="text-xs uppercase font-bold tracking-wider text-slate-400 mb-1.5 flex items-center gap-2">
        <span className={cls('w-2 h-2 rounded-full', color === 'cyan' ? 'bg-cyan-400' : 'bg-amber-400')}></span>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={30}
        className="w-full p-3 bg-slate-900 border-2 border-slate-700 focus:border-lime-400 rounded-lg outline-none"
      />
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
    /* Gera as matches da fase de grupos (se aplicável) */
    let matches = [];
    if (format.hasGroups) {
      matches = makeGroupMatches(state.groups, state.rules);
    }
    /* Setup terminado — não geramos mata-mata ainda */
    update({ teamsComplete: true });
    updateMatches(matches);
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
          <th className="font-medium pb-1 px-1">Dono</th>
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
            <td className="text-center py-1">
              {r.owner && <span className={cls('inline-block w-3 h-3 rounded-full', r.owner === 'p1' ? 'bg-cyan-400' : 'bg-amber-400')} />}
            </td>
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
  const byGroup = {};
  for (const m of groupMatches) {
    if (!byGroup[m.group]) byGroup[m.group] = [];
    byGroup[m.group].push(m);
  }

  return (
    <div className="space-y-4">
      {Object.keys(byGroup).sort().map((letter) => (
        <Card key={letter} className="p-3">
          <h3 className="font-black text-lg mb-2">Grupo {letter}</h3>
          <div className="space-y-1.5">
            {byGroup[letter].sort((a, b) => a.round - b.round || a.id.localeCompare(b.id)).map((m) => (
              <MatchRow key={m.id} match={m} state={state} onClick={() => openMatch(m.id)} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function MatchRow({ match, state, onClick }) {
  const home = getTeamById(state, match.homeTeamId);
  const away = getTeamById(state, match.awayTeamId);
  if (!home || !away) return null;
  const isAuto = match.autoPlayed;
  return (
    <button
      onClick={onClick}
      className={cls(
        'w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-2 rounded-lg border transition text-sm',
        match.played
          ? isAuto ? 'bg-slate-900/30 border-slate-800 opacity-60' : 'bg-slate-900/60 border-slate-700 hover:border-slate-600'
          : 'bg-slate-900/40 border-slate-800 hover:border-lime-500/40'
      )}
    >
      <div className="flex items-center gap-2 justify-end text-right truncate">
        <span className="truncate">{home.name}</span>
        <span>{home.flag}</span>
        {home.owner && <span className={cls('w-1.5 h-1.5 rounded-full flex-shrink-0', home.owner === 'p1' ? 'bg-cyan-400' : 'bg-amber-400')} />}
      </div>
      <div className="font-mono font-bold tabular-nums px-2">
        {match.played ? `${match.homeScore} × ${match.awayScore}` : '—'}
      </div>
      <div className="flex items-center gap-2 truncate">
        {away.owner && <span className={cls('w-1.5 h-1.5 rounded-full flex-shrink-0', away.owner === 'p1' ? 'bg-cyan-400' : 'bg-amber-400')} />}
        <span>{away.flag}</span>
        <span className="truncate">{away.name}</span>
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

  const setMatch = useCallback((updater) => {
    const newMatches = state.matches.map((m) => m.id === matchId ? (typeof updater === 'function' ? updater(m) : updater) : m);
    /* propagate (mata-mata) */
    const isKo = match.stage !== 'group';
    let finalMatches = newMatches;
    if (isKo) {
      const { matches: propagated, changed } = propagateKnockoutWinners(newMatches);
      finalMatches = propagated;
    }
    updateMatches(finalMatches);
  }, [state.matches, matchId, match.stage, updateMatches]);

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
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">{stageLabel}{legLabel}</div>
        <ScoreEntry match={match} home={home} away={away} onChange={setScore} />
      </Card>

      {isKo && <KnockoutMatchExtras state={state} match={match} home={home} away={away} update={update} updateMatches={updateMatches} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TeamMatchPanel state={state} match={match} team={home} updateMatches={updateMatches} allMatches={state.matches} />
        <TeamMatchPanel state={state} match={match} team={away} updateMatches={updateMatches} allMatches={state.matches} />
      </div>
    </div>
  );
}

function ScoreEntry({ match, home, away, onChange }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
      <TeamHeader team={home} align="right" />
      <div className="flex items-center gap-1">
        <input
          type="number" min="0"
          value={match.homeScore ?? ''}
          onChange={(e) => onChange(e.target.value, match.awayScore ?? '')}
          className="w-14 p-2 text-center text-2xl font-black bg-slate-900 border-2 border-slate-700 focus:border-lime-400 rounded outline-none tabular-nums"
        />
        <span className="text-2xl text-slate-600 font-black">×</span>
        <input
          type="number" min="0"
          value={match.awayScore ?? ''}
          onChange={(e) => onChange(match.homeScore ?? '', e.target.value)}
          className="w-14 p-2 text-center text-2xl font-black bg-slate-900 border-2 border-slate-700 focus:border-lime-400 rounded outline-none tabular-nums"
        />
      </div>
      <TeamHeader team={away} align="left" />
    </div>
  );
}

function TeamHeader({ team, align = 'left' }) {
  return (
    <div className={cls('flex items-center gap-2', align === 'right' && 'justify-end flex-row-reverse')}>
      <span className="text-2xl">{team.flag}</span>
      <span className="font-bold truncate">{team.name}</span>
      {team.owner && <span className={cls('w-2 h-2 rounded-full flex-shrink-0', team.owner === 'p1' ? 'bg-cyan-400' : 'bg-amber-400')} />}
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
      const { matches: propagated } = propagateKnockoutWinners(newMatches);
      updateMatches(propagated);
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
function TeamMatchPanel({ state, match, team, updateMatches, allMatches }) {
  const updateMatch = (updater) => {
    updateMatches(state.matches.map((m) => m.id === match.id ? (typeof updater === 'function' ? updater(m) : updater) : m));
  };
  const events = (match.events || []).filter((e) => e.teamId === team.id);
  const ratings = match.ratings?.[team.id] || {};

  const addEvent = (type) => {
    updateMatch((m) => ({
      ...m,
      events: [...(m.events || []), { id: Math.random().toString(36).slice(2), teamId: team.id, type, playerName: '', minute: '' }],
    }));
  };
  const updateEvent = (eid, patch) => {
    updateMatch((m) => ({ ...m, events: (m.events || []).map((e) => e.id === eid ? { ...e, ...patch } : e) }));
  };
  const removeEvent = (eid) => {
    updateMatch((m) => ({ ...m, events: (m.events || []).filter((e) => e.id !== eid) }));
  };

  const setRating = (pname, val) => {
    updateMatch((m) => {
      const newRatings = { ...(m.ratings || {}) };
      const teamR = { ...(newRatings[team.id] || {}) };
      if (val === '' || val == null) delete teamR[pname];
      else teamR[pname] = val;
      newRatings[team.id] = teamR;
      return { ...m, ratings: newRatings };
    });
  };
  const renameRatingPlayer = (oldName, newName) => {
    if (!newName || newName === oldName) return;
    updateMatch((m) => {
      const newRatings = { ...(m.ratings || {}) };
      const teamR = { ...(newRatings[team.id] || {}) };
      teamR[newName] = teamR[oldName];
      delete teamR[oldName];
      newRatings[team.id] = teamR;
      /* renomeia também nos events */
      const newEvents = (m.events || []).map((ev) => ev.teamId === team.id && ev.playerName === oldName ? { ...ev, playerName: newName } : ev);
      return { ...m, ratings: newRatings, events: newEvents };
    });
  };
  const addRatingPlayer = () => {
    const baseName = 'Jogador';
    let i = 1;
    while (ratings[`${baseName} ${i}`] !== undefined) i++;
    setRating(`${baseName} ${i}`, '');
  };

  /* Copiar escalação do último jogo deste time */
  const lastMatchWithRatings = useMemo(() => {
    const prev = allMatches
      .filter((m) => m.id !== match.id && m.played && !m.autoPlayed && (m.homeTeamId === team.id || m.awayTeamId === team.id))
      .sort((a, b) => (STAGE_ORDER_INDEX[matchStageKey(b)] || 0) - (STAGE_ORDER_INDEX[matchStageKey(a)] || 0));
    for (const m of prev) {
      const tr = m.ratings?.[team.id];
      if (tr && Object.keys(tr).length > 0) return m;
    }
    return null;
  }, [allMatches, match.id, team.id]);

  const copyLineup = () => {
    if (!lastMatchWithRatings) return;
    const prevRatings = lastMatchWithRatings.ratings[team.id] || {};
    updateMatch((m) => {
      const newRatings = { ...(m.ratings || {}) };
      const teamR = { ...(newRatings[team.id] || {}) };
      for (const pname of Object.keys(prevRatings)) {
        if (teamR[pname] === undefined) teamR[pname] = '';
      }
      newRatings[team.id] = teamR;
      return { ...m, ratings: newRatings };
    });
  };

  /* Próximo stage pra checar suspensão (esse mesmo jogo) */
  const upToStageKey = matchStageKey(match);

  const players = Array.from(new Set([
    ...Object.keys(ratings),
    ...events.filter((e) => e.playerName).map((e) => e.playerName),
  ]));

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <TeamHeader team={team} />
      </div>

      {/* Avisos de suspensão */}
      {players.length > 0 && (
        <SuspensionWarnings state={state} teamId={team.id} players={players} upToStageKey={upToStageKey} />
      )}

      {/* Eventos */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-bold">Eventos</span>
          <div className="flex gap-1">
            <EventBtn icon={<Goal className="w-3 h-3" />} color="emerald" onClick={() => addEvent('goal')}>Gol</EventBtn>
            <EventBtn icon={<Hand className="w-3 h-3" />} color="sky" onClick={() => addEvent('assist')}>Assist</EventBtn>
            <EventBtn icon={<span className="inline-block w-2 h-3 bg-yellow-400 rounded-sm" />} color="yellow" onClick={() => addEvent('yellow')}>Amarelo</EventBtn>
            <EventBtn icon={<span className="inline-block w-2 h-3 bg-red-500 rounded-sm" />} color="red" onClick={() => addEvent('red')}>Vermelho</EventBtn>
          </div>
        </div>
        {events.length === 0 && <div className="text-xs text-slate-600 italic py-1">Sem eventos.</div>}
        {events.map((e) => (
          <EventRow key={e.id} event={e} players={players} onUpdate={(p) => updateEvent(e.id, p)} onRemove={() => removeEvent(e.id)} />
        ))}
      </div>

      {/* Notas */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-bold">Notas</span>
          <div className="flex gap-1">
            {lastMatchWithRatings && (
              <button onClick={copyLineup} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 flex items-center gap-1" title="Copia os jogadores do último jogo deste time">
                <Copy className="w-3 h-3" /> Última escalação
              </button>
            )}
            <PhotoRatingsButton playerNames={Object.keys(ratings)} onExtracted={(playersWithRatings) => {
              updateMatch((m) => {
                const newRatings = { ...(m.ratings || {}) };
                const teamR = { ...(newRatings[team.id] || {}) };
                for (const { name, rating } of playersWithRatings) {
                  if (name && rating != null) teamR[name] = rating;
                }
                newRatings[team.id] = teamR;
                return { ...m, ratings: newRatings };
              });
            }} />
          </div>
        </div>
        <div className="space-y-1">
          {Object.entries(ratings).map(([pname, rating]) => (
            <RatingRow key={pname} name={pname} rating={rating}
              onRename={(nn) => renameRatingPlayer(pname, nn)}
              onChange={(v) => setRating(pname, v)}
              onRemove={() => setRating(pname, '')}
            />
          ))}
          <button onClick={addRatingPlayer} className="w-full text-xs text-slate-500 hover:text-lime-400 py-1 border border-dashed border-slate-800 rounded flex items-center justify-center gap-1">
            <Plus className="w-3 h-3" /> Adicionar jogador
          </button>
        </div>
      </div>
    </Card>
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

function EventBtn({ icon, color, onClick, children }) {
  const colors = {
    emerald: 'bg-emerald-900/60 border-emerald-700 text-emerald-200 hover:bg-emerald-800',
    sky:     'bg-sky-900/60 border-sky-700 text-sky-200 hover:bg-sky-800',
    yellow:  'bg-yellow-900/40 border-yellow-700 text-yellow-200 hover:bg-yellow-800',
    red:     'bg-red-900/60 border-red-700 text-red-200 hover:bg-red-800',
  };
  return (
    <button onClick={onClick} className={cls('text-[10px] uppercase font-bold px-2 py-0.5 rounded border flex items-center gap-1', colors[color])}>
      {icon}{children}
    </button>
  );
}

function EventRow({ event, players, onUpdate, onRemove }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <EventTypeIcon type={event.type} />
      <input
        list="players-datalist"
        value={event.playerName}
        onChange={(ev) => onUpdate({ playerName: ev.target.value })}
        placeholder="Jogador"
        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
      />
      <datalist id="players-datalist">
        {players.map((p) => <option key={p} value={p} />)}
      </datalist>
      <input
        value={event.minute}
        onChange={(ev) => onUpdate({ minute: ev.target.value })}
        placeholder="'min"
        className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-center"
      />
      <button onClick={onRemove} className="text-slate-600 hover:text-red-400">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function EventTypeIcon({ type }) {
  if (type === 'goal')   return <Goal className="w-3.5 h-3.5 text-emerald-400" />;
  if (type === 'assist') return <Hand className="w-3.5 h-3.5 text-sky-400" />;
  if (type === 'yellow') return <span className="inline-block w-2.5 h-3 bg-yellow-400 rounded-sm" />;
  if (type === 'red')    return <span className="inline-block w-2.5 h-3 bg-red-500 rounded-sm" />;
  return null;
}

function RatingRow({ name, rating, onRename, onChange, onRemove }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => { setDraft(name); }, [name]);
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onRename(draft.trim())}
        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
      />
      <input
        type="number" step="0.1" min="0" max="10"
        value={rating ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-center tabular-nums font-bold"
      />
      <button onClick={onRemove} className="text-slate-600 hover:text-red-400">
        <X className="w-3 h-3" />
      </button>
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

  /* Se nao tem KO ainda, ofertar geração (só pra formatos com grupos — KO direto já gera no setup) */
  if (koMatches.length === 0) {
    const groupMatches = state.matches.filter((m) => m.stage === 'group');
    const allGroupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.played);
    return (
      <Card className="p-6">
        {!allGroupsDone ? (
          <div className="text-center text-slate-400">
            <Trophy className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <h3 className="font-bold mb-1">Mata-mata ainda não disponível</h3>
            <p className="text-sm">Termine todos os jogos da fase de grupos primeiro.</p>
            <p className="text-xs mt-2 text-slate-500">{groupMatches.filter((m) => m.played).length}/{groupMatches.length} jogos jogados</p>
          </div>
        ) : (
          <div className="text-center">
            <Trophy className="w-8 h-8 mx-auto mb-3 text-lime-400" />
            <h3 className="font-bold mb-2">Tudo certo pra começar o mata-mata!</h3>
            <p className="text-sm text-slate-400 mb-4">Vamos gerar os confrontos baseado nas classificações da fase de grupos e nas regras que você configurou.</p>
            <button
              onClick={() => {
                const matches = makeKnockoutMatches(state);
                updateMatches([...state.matches, ...matches]);
                update({ knockoutGenerated: true });
              }}
              className="px-5 py-3 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded-lg"
            >
              Gerar chave do mata-mata
            </button>
          </div>
        )}
      </Card>
    );
  }

  return <KnockoutBracket state={state} koMatches={koMatches} updateMatches={updateMatches} openMatch={openMatch} />;
}

function KnockoutBracket({ state, koMatches, updateMatches, openMatch }) {
  /* Agrupa por stage */
  const stages = [...new Set(koMatches.filter((m) => !m.isExtra).map((m) => m.stage))];
  const stageOrder = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  stages.sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));

  /* Confrontos agrupados por (stage, koIndex) */
  const groupedByConfront = {};
  for (const m of koMatches) {
    if (m.isExtra) continue;
    const key = `${m.stage}|${m.koIndex}`;
    if (!groupedByConfront[key]) groupedByConfront[key] = [];
    groupedByConfront[key].push(m);
  }

  return (
    <div className="space-y-6">
      {stages.map((stage) => {
        const stageConfronts = Object.entries(groupedByConfront).filter(([k]) => k.startsWith(`${stage}|`));
        stageConfronts.sort(([a], [b]) => Number(a.split('|')[1]) - Number(b.split('|')[1]));
        return (
          <div key={stage}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-lime-400 mb-3">{STAGE_LABELS[stage] || stage}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stageConfronts.map(([key, legs]) => (
                <KnockoutConfrontCard key={key} state={state} legs={legs} openMatch={openMatch} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KnockoutConfrontCard({ state, legs, openMatch }) {
  /* legs[0] sempre é o leg 1 */
  legs = [...legs].sort((a, b) => a.leg - b.leg);
  const sample = legs[0];
  const home = getTeamById(state, sample.homeTeamId);
  const away = getTeamById(state, sample.awayTeamId);
  if (!home || !away) {
    return <Card className="p-3 text-center text-slate-600 text-xs italic">Aguardando definição...</Card>;
  }

  const sameOwner = home.owner && away.owner && home.owner === away.owner;
  const outcome = getMatchOutcome(state.matches, sample.stage, sample.koIndex);

  return (
    <Card className={cls('p-2', sameOwner && 'border-amber-700/60 bg-amber-900/10')}>
      {sameOwner && (
        <div className="text-[10px] text-amber-400 font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Mesmo dono</div>
      )}
      {legs.map((m) => (
        <button key={m.id} onClick={() => openMatch(m.id)} className="w-full text-left p-1.5 mb-1 rounded hover:bg-slate-900/80 transition">
          {m.totalLegs > 1 && (
            <div className="text-[10px] uppercase text-slate-500 mb-0.5">{m.leg === 1 ? 'Ida' : 'Volta'}</div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-xs">
            <div className="text-right truncate">{getTeamById(state, m.homeTeamId)?.flag} {getTeamById(state, m.homeTeamId)?.name}</div>
            <div className="font-mono tabular-nums px-1 font-bold">{m.played ? `${m.homeScore}×${m.awayScore}` : '—'}</div>
            <div className="truncate">{getTeamById(state, m.awayTeamId)?.flag} {getTeamById(state, m.awayTeamId)?.name}</div>
          </div>
        </button>
      ))}
      {/* prorrogação */}
      {state.matches.filter((m) => m.stage === sample.stage && m.koIndex === sample.koIndex && m.isExtra).map((et) => (
        <button key={et.id} onClick={() => openMatch(et.id)} className="w-full text-left p-1.5 mb-1 rounded bg-amber-900/20 hover:bg-amber-900/40 transition border border-amber-800/50">
          <div className="text-[10px] uppercase text-amber-300 mb-0.5 flex items-center gap-1"><Zap className="w-2.5 h-2.5" />Prorrogação{et.penaltyWinner && ' + pênaltis'}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-xs">
            <div className="text-right truncate">{getTeamById(state, et.homeTeamId)?.flag} {getTeamById(state, et.homeTeamId)?.name}</div>
            <div className="font-mono tabular-nums px-1 font-bold">{et.played ? `${et.homeScore}×${et.awayScore}` : '—'}</div>
            <div className="truncate">{getTeamById(state, et.awayTeamId)?.flag} {getTeamById(state, et.awayTeamId)?.name}</div>
          </div>
        </button>
      ))}
      {/* Resultado agregado e vencedor */}
      {legs[0].totalLegs > 1 && legs.every((m) => m.played) && (
        <div className="mt-1 text-[10px] text-slate-500 text-center">
          Agregado {outcome.aggA ?? 0}×{outcome.aggB ?? 0}
        </div>
      )}
      {outcome.decided && (
        <div className="mt-1 text-[10px] text-lime-400 text-center flex items-center justify-center gap-1">
          <Trophy className="w-3 h-3" />
          {getTeamById(state, outcome.winner)?.name} {outcome.viaPenalties && '(pênaltis)'}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   STATS VIEW
   ============================================================ */
function StatsView({ state, allTeams }) {
  const stats = useMemo(() => computePlayerStats(state), [state.matches]);

  const topScorers = [...stats].filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 10);
  const topAssists = [...stats].filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 10);
  const topRated = [...stats].filter((s) => s.ratingCount >= 2).map((s) => ({ ...s, avg: s.ratingSum / s.ratingCount })).sort((a, b) => b.avg - a.avg).slice(0, 10);
  const mostCards = [...stats].filter((s) => s.yellows + s.reds > 0).sort((a, b) => (b.reds * 10 + b.yellows) - (a.reds * 10 + a.yellows)).slice(0, 10);

  const champion = getChampion(state);

  return (
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatsList title="Artilharia" icon={<Goal className="w-4 h-4 text-emerald-400" />} list={topScorers} render={(s) => <span className="tabular-nums font-bold">{s.goals}</span>} />
        <StatsList title="Assistências" icon={<Hand className="w-4 h-4 text-sky-400" />} list={topAssists} render={(s) => <span className="tabular-nums font-bold">{s.assists}</span>} />
        <StatsList title="Melhores médias" icon={<Star className="w-4 h-4 text-yellow-400" />} list={topRated} render={(s) => <span className="tabular-nums font-bold">{s.avg.toFixed(2)} <span className="text-slate-500 text-xs">({s.ratingCount}j)</span></span>} />
        <StatsList title="Mais cartões" icon={<span className="inline-block w-2.5 h-3.5 bg-yellow-400 rounded-sm" />} list={mostCards} render={(s) => <span className="tabular-nums text-xs"><span className="text-yellow-400 font-bold">{s.yellows}</span>{s.reds > 0 && <> <span className="text-red-400 font-bold ml-1">{s.reds}</span></>}</span>} />
      </div>
    </div>
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
