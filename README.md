# Campeonato Manager

App web pra você e seu colega disputarem campeonatos de videogame de futebol — Copa, Champions, ou qualquer formato. Estado compartilhado em tempo real via Supabase, deploy grátis na Vercel.

## O que tem

- **Tela inicial** com listagem dos seus torneios (em andamento e terminados) — cada dispositivo lembra os códigos que você criou ou visitou
- **6 formatos prontos**: Copa do Mundo 2026 (48), Copa Clássica (32), Eurocopa (24), Mata-Mata direto (8/16/32)
- **Wizard de regras** (trancado depois que o torneio começa):
  - Ida e volta na fase de grupos e/ou no mata-mata
  - Critérios de desempate dos grupos reordenáveis
  - Sorteio do mata-mata: padrão FIFA (chave fixa) ou aleatório
  - 4 regras de cartão amarelo (FIFA, zerar no mata-mata, nunca zerar, sem suspensão)
- **Empate no mata-mata** → cria jogo dedicado de prorrogação (placar próprio). Empate na prorrogação → escolhe o vencedor dos pênaltis manualmente
- **Por jogo**: placar, eventos (gols/assistências/cartões), notas dos jogadores
- **Botão "Última escalação"** pra copiar os jogadores do último jogo do mesmo time
- **OCR via foto**: tira foto da tela de notas do FIFA/EA FC e o app extrai automaticamente (via API Anthropic, com a chave segura no servidor)
- **Estatísticas**: artilharia, assistências, médias, cartões, campeão
- **Tempo real**: dois dispositivos abrem o mesmo torneio e veem o estado atualizado na hora

## Stack
- Frontend: React + Vite + Tailwind (CDN)
- Banco e tempo real: Supabase (free)
- Deploy + função serverless de OCR: Vercel (free)
- OCR: Anthropic Claude (chave de API guardada no servidor)

## Passo-a-passo de deploy

### 1) Conta no Supabase
1. Crie em https://supabase.com (free, dá pra logar com GitHub)
2. New Project → escolha região (preferir `sa-east-1` em São Paulo)
3. Salve a senha do banco em algum lugar
4. Espere uns 2 min até o projeto subir
5. Abra **SQL Editor** → New Query → cole o conteúdo de `supabase-schema.sql` → Run

Isso cria a tabela `tournaments`, libera leitura/escrita pública via anon key, e habilita Realtime.

6. Em **Project Settings → API**, copie:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon public key** (chave longa)

### 2) Chave da Anthropic (pro OCR — opcional)
1. Crie conta em https://console.anthropic.com
2. Settings → API Keys → Create Key
3. Copie a chave (começa com `sk-ant-...`)

Se você não quer usar OCR, pode pular esse passo — o resto do app funciona normal.

### 3) Repositório no GitHub
1. Cria um repo novo (pode ser privado)
2. Sobe o conteúdo da pasta `copa-online/` (sem `node_modules` e `dist`)

### 4) Deploy na Vercel
1. Crie em https://vercel.com (login com GitHub)
2. **Add New → Project** → escolha seu repo
3. Framework: **Vite** (Vercel detecta sozinho)
4. **Environment Variables** (adicione antes de fazer Deploy):
   - `VITE_SUPABASE_URL` = a URL do Supabase do passo 1
   - `VITE_SUPABASE_ANON_KEY` = a anon key do Supabase
   - `ANTHROPIC_API_KEY` = sua chave da Anthropic (opcional, sem isso o OCR fica desativado)
5. Clica em **Deploy**, espera ~1 min

Pronto! A Vercel te dá uma URL pública (algo tipo `campeonato-manager.vercel.app`). Compartilha com seu colega.

### 5) Uso
1. Abre a URL → clica em **Criar novo torneio**
2. Dá um nome (ex: "Copa Galera 2026") e escolhe o formato
3. Compartilha o **código de 6 letras** que aparece no topo (ou copia o link inteiro)
4. Seu colega abre o link no celular dele → o estado sincroniza em tempo real

A tela inicial mostra todos os torneios que esse navegador já visitou, separados em "em andamento" e "terminados".

## Estrutura do projeto
```
copa-online/
├── api/extract-ratings.js     # Função serverless (OCR via Anthropic)
├── src/
│   ├── App.jsx                # UI (Home, wizard, grupos, jogos, mata-mata, stats)
│   ├── main.jsx
│   └── lib/
│       ├── supabase.js        # Client + clientId pra filtrar eco do Realtime
│       ├── tournament.js      # Formatos, regras, cálculos, propagação
│       └── localHistory.js    # Histórico local de códigos visitados
├── supabase-schema.sql        # Schema do banco
├── vercel.json
└── package.json
```

## Custo
**R$ 0** se for só você e seu colega. Limites do free tier:
- Vercel: 100GB de banda/mês (mais que sobra)
- Supabase: 500MB de banco + 2GB de banda Realtime/mês (mais que sobra)
- Anthropic: vai cobrar centavos por OCR (claude-haiku é barato, ~R$0,005 por foto)

## Rodando localmente (opcional)
```bash
cd copa-online
npm install
cp .env.example .env.local   # preencha as 2 envs do Supabase
npm run dev
```

Abre em `http://localhost:5173`. Note que o OCR (`/api/extract-ratings`) só funciona depois do deploy na Vercel — localmente ele 404. O resto roda igual.
