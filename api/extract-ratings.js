/**
 * Serverless function no Vercel.
 * Recebe imagem (base64) e nomes dos jogadores esperados,
 * chama a API da Anthropic com visão e devolve as notas extraídas.
 *
 * A API key fica APENAS no servidor (env var no Vercel).
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY não configurada no servidor.',
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Body inválido' });
  }

  const { imageBase64, mediaType, playerNames } = body || {};
  if (!imageBase64 || !mediaType || !Array.isArray(playerNames)) {
    return res.status(400).json({
      error: 'Faltando imageBase64, mediaType ou playerNames',
    });
  }

  const prompt = `Esta imagem é a tela de notas dos jogadores ao final de um jogo de videogame de futebol (EA FC / FIFA).

Extraia o nome e a nota (0.0 a 10.0) de cada jogador visível.

Jogadores esperados nesta partida: ${playerNames.join(', ')}.

Faça correspondência fuzzy entre o nome que você lê na imagem e o nome esperado mais parecido (sobrenomes, abreviações, números de camisa podem aparecer). Se um jogador esperado não aparece na imagem, omita-o. Se aparecem jogadores não listados, ignore-os.

Retorne APENAS JSON válido neste formato exato, sem texto antes ou depois:
{"ratings":[{"playerName":"nome do jogador esperado","rating":7.5},...]}`;

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageBase64 },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return res.status(502).json({
        error: 'Erro ao chamar Anthropic',
        detail: errText,
      });
    }

    const data = await anthropicResponse.json();
    const text = (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();

    // Tenta achar bloco JSON
    let parsed;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch {
      return res.status(200).json({
        ratings: [],
        raw: text,
        warning: 'Não consegui parsear JSON da resposta',
      });
    }

    return res.status(200).json({
      ratings: Array.isArray(parsed.ratings) ? parsed.ratings : [],
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Erro interno',
      detail: String(err && err.message ? err.message : err),
    });
  }
}
