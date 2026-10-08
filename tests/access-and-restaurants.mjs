import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';

const edge = fs.readFileSync('supabase/functions/revenue-api/index.ts', 'utf8');
let handler;
let email = 'soltnar@gmail.com';
let listed = false;
const context = {
  Deno: { env: { get: (key) => key === 'CRON_SECRET' ? 'test-cron' : 'test' }, serve: (fn) => { handler = fn; } },
  Request, Response, URL, setTimeout,
  fetch: async (url) => new Response(JSON.stringify(String(url).includes('/auth/v1/user') ? { email } : listed ? [{email}] : []), {status: 200})
};
vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(edge), context);
const authorize = (method, cron = false) => context.authorize(new Request('https://example.test', {
  method, headers: cron ? { 'x-cron-secret': 'test-cron' } : { authorization: 'Bearer fake' }
}));
assert.ok(await authorize('POST')); // Owner retains existing operations.
email = 'viewer@example.test'; listed = true;
assert.ok(await authorize('GET'));
assert.equal(await authorize('POST'), null); // No access to advances or refresh writes.
listed = false;
assert.equal(await authorize('GET'), null);
assert.equal((await authorize('POST', true)).cron, true);
assert.ok(edge.includes('body.action === "sync-advance-day"'));
const source = fs.readFileSync('script.js', 'utf8');
const functions = ['splitRestaurantName', 'normalizeNameKey'].map((name) => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
});
vm.runInContext(functions.join('\n'), context);
assert.equal(context.splitRestaurantName('Самурай, БП 63 (КУХНЯ)').group,
  context.splitRestaurantName('Самурай, Б. Покровская 63_П (БАР)').group);
console.log('Owner, viewer, stranger, cron and restaurant rename checks passed');
