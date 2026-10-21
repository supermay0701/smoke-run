import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.SMOKE_RUN_API_URL || 'http://127.0.0.1:8787';
const origin = 'http://127.0.0.1:4173';

async function request(path, { method = 'GET', body, requestOrigin = origin } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

const health = await request('/health');
assert.equal(health.response.status, 200);
assert.equal(health.data.service, 'smoke-run-api');
assert.equal(health.response.headers.get('access-control-allow-origin'), origin);

const preflight = await request('/api/scores', { method: 'OPTIONS' });
assert.equal(preflight.response.status, 204);
assert.match(preflight.response.headers.get('access-control-allow-methods'), /POST/);

const playerId = randomUUID();
const score = { playerId, name: '測試菸槍', diff: 'normal', score: 600, survive: 20, cigs: 3, ach: 2 };
const first = await request('/api/scores', { method: 'POST', body: score });
assert.equal(first.response.status, 200);
assert.equal(first.data.best, 600);

const lower = await request('/api/scores', { method: 'POST', body: { ...score, score: 500 } });
assert.equal(lower.response.status, 200);
assert.equal(lower.data.best, 600, '較低分數不可覆蓋最高分');

const board = await request('/api/leaderboard?board=normal&limit=50');
assert.equal(board.response.status, 200);
assert.ok(board.data.rows.some(row => row.name === '測試菸槍' && row.score === 600));

const rename = await request('/api/player', {
  method: 'POST',
  body: { playerId, name: '改名成功', ach: 5 },
});
assert.equal(rename.response.status, 200);

const renamedBoard = await request('/api/leaderboard?board=normal&limit=50');
assert.ok(renamedBoard.data.rows.some(row => row.name === '改名成功' && row.score === 600));
const achievements = await request('/api/leaderboard?board=ach&limit=50');
assert.ok(achievements.data.rows.some(row => row.name === '改名成功' && row.ach === 5));

const invalid = await request('/api/scores', {
  method: 'POST',
  body: { ...score, playerId: randomUUID(), score: 999999, survive: 1 },
});
assert.equal(invalid.response.status, 400);
assert.equal(invalid.data.error.code, 'invalid_score');

const forbidden = await request('/health', { requestOrigin: 'https://example.com' });
assert.equal(forbidden.response.status, 403);
assert.equal(forbidden.data.error.code, 'origin_forbidden');

const rateId = randomUUID();
const rateScore = { ...score, playerId: rateId, name: '限流測試' };
const statuses = [];
for (let i = 0; i < 7; i++) {
  const result = await request('/api/scores', { method: 'POST', body: rateScore });
  statuses.push(result.response.status);
}
assert.ok(statuses.includes(429), `預期第 7 次前後出現 429，實際為 ${statuses.join(',')}`);

console.log('PASS: 12 API assertions (health, CORS, upsert, leaderboard, rename, validation, origin, rate limit)');
