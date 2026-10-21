const ALLOWED_ORIGINS = new Set([
  'https://supermay0701.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
]);
const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
const BOARDS = new Set([...DIFFICULTIES, 'ach']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status = 200, origin = null, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function fail(code, message, status, origin, details) {
  return json({ error: { code, message, ...(details ? { details } : {}) } }, status, origin);
}

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name && [...name].length <= 12 ? name : null;
}

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function validatePlayer(body) {
  const playerId = typeof body?.playerId === 'string' && UUID_RE.test(body.playerId) ? body.playerId : null;
  const name = cleanName(body?.name);
  const ach = integer(body?.ach, 0, 200);
  if (!playerId || !name || ach === null) return null;
  return { playerId, name, ach };
}

function validateScore(body) {
  const player = validatePlayer(body);
  const diff = DIFFICULTIES.has(body?.diff) ? body.diff : null;
  const score = integer(body?.score, 0, 216300);
  const survive = integer(body?.survive, 0, 3600);
  const cigs = integer(body?.cigs, 0, 10000);
  if (!player || !diff || score === null || survive === null || cigs === null) return null;
  if (score > (survive + 5) * 60) return null;
  return { ...player, diff, score, survive, cigs };
}

async function readBody(request, origin) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 4096) return { error: fail('payload_too_large', '請求內容過大', 413, origin) };
  try {
    return { body: await request.json() };
  } catch {
    return { error: fail('invalid_json', 'JSON 格式錯誤', 400, origin) };
  }
}

async function leaderboard(env, url, origin) {
  const board = url.searchParams.get('board') || 'normal';
  const rawLimit = Number(url.searchParams.get('limit') || 15);
  const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 15;
  if (!BOARDS.has(board)) return fail('invalid_board', '排行榜類型錯誤', 400, origin);

  const result = board === 'ach'
    ? await env.DB.prepare('SELECT name, ach FROM players WHERE ach > 0 ORDER BY ach DESC, updated_at ASC LIMIT ?1').bind(limit).all()
    : await env.DB.prepare('SELECT name, score, survive FROM scores WHERE diff = ?1 ORDER BY score DESC, updated_at ASC LIMIT ?2').bind(board, limit).all();
  return json({ board, rows: result.results || [] }, 200, origin, { 'Cache-Control': 'public, max-age=20' });
}

async function submitPlayer(env, request, origin) {
  const parsed = await readBody(request, origin);
  if (parsed.error) return parsed.error;
  const player = validatePlayer(parsed.body);
  if (!player) return fail('invalid_player', '玩家資料格式錯誤', 400, origin);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO players (id, name, ach, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        ach = max(players.ach, excluded.ach),
        updated_at = CURRENT_TIMESTAMP
    `).bind(player.playerId, player.name, player.ach),
    env.DB.prepare('UPDATE scores SET name = ?1 WHERE player_id = ?2').bind(player.name, player.playerId),
  ]);
  return json({ ok: true }, 200, origin);
}

async function submitScore(env, request, origin) {
  const parsed = await readBody(request, origin);
  if (parsed.error) return parsed.error;
  const score = validateScore(parsed.body);
  if (!score) return fail('invalid_score', '分數資料不合理或格式錯誤', 400, origin);

  if (env.SCORE_LIMITER?.limit) {
    const limited = await env.SCORE_LIMITER.limit({ key: score.playerId });
    if (!limited.success) return fail('rate_limited', '上傳太頻繁，請稍後再試', 429, origin, { retryAfter: 60 });
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO players (id, name, ach, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        ach = max(players.ach, excluded.ach),
        updated_at = CURRENT_TIMESTAMP
    `).bind(score.playerId, score.name, score.ach),
    env.DB.prepare(`
      INSERT INTO scores (player_id, diff, name, score, survive, cigs, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
      ON CONFLICT(player_id, diff) DO UPDATE SET
        name = excluded.name,
        survive = CASE WHEN excluded.score > scores.score THEN excluded.survive ELSE scores.survive END,
        cigs = CASE WHEN excluded.score > scores.score THEN excluded.cigs ELSE scores.cigs END,
        updated_at = CASE WHEN excluded.score > scores.score THEN CURRENT_TIMESTAMP ELSE scores.updated_at END,
        score = max(scores.score, excluded.score)
    `).bind(score.playerId, score.diff, score.name, score.score, score.survive, score.cigs),
  ]);

  const best = await env.DB.prepare('SELECT score FROM scores WHERE player_id = ?1 AND diff = ?2').bind(score.playerId, score.diff).first();
  const rank = await env.DB.prepare('SELECT count(*) + 1 AS rank FROM scores WHERE diff = ?1 AND score > ?2').bind(score.diff, best.score).first();
  return json({ best: best.score, rank: rank.rank }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) return fail('origin_forbidden', '不允許的網站來源', 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'smoke-run-api' }, 200, origin);
      if (request.method === 'GET' && url.pathname === '/api/leaderboard') return leaderboard(env, url, origin);
      if (request.method === 'POST' && url.pathname === '/api/player') return submitPlayer(env, request, origin);
      if (request.method === 'POST' && url.pathname === '/api/scores') return submitScore(env, request, origin);
      return fail('not_found', '找不到此 API', 404, origin);
    } catch (error) {
      console.error('smoke-run-api', error);
      return fail('internal_error', '排行榜服務暫時無法使用', 500, origin);
    }
  },
};

