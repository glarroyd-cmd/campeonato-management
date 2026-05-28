import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error(
    'Variáveis de ambiente do Supabase não configuradas. Confira VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env (local) ou nas envs do Vercel (produção).'
  );
}

export const supabase = createClient(url || '', anon || '', {
  realtime: { params: { eventsPerSecond: 10 } },
});

/* ID único deste navegador/sessão — usamos pra ignorar eco dos próprios updates no Realtime */
export const clientId =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
