const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    server.removeListener('error', reject);
    resolve(server.address().port);
  });
});

const close = server => new Promise(resolve => {
  server.close(resolve);
  server.closeAllConnections();
});

test('bounds the PostgREST queue and returns a retryable 503 under saturation', async t => {
  const postgrest = http.createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    }, 150);
  });
  const postgrestPort = await listen(postgrest);
  const originalEnvironment = {
    POSTGREST_URL: process.env.POSTGREST_URL,
    DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
    DATABASE_POOL_MAX_QUEUE: process.env.DATABASE_POOL_MAX_QUEUE,
    DATABASE_POOL_WAIT_TIMEOUT_MS: process.env.DATABASE_POOL_WAIT_TIMEOUT_MS,
  };
  Object.assign(process.env, {
    POSTGREST_URL: `http://127.0.0.1:${postgrestPort}`,
    DATABASE_POOL_SIZE: '1',
    DATABASE_POOL_MAX_QUEUE: '1',
    DATABASE_POOL_WAIT_TIMEOUT_MS: '50',
  });

  const originalConsoleError = console.error;
  const poolEvents = [];
  console.error = message => poolEvents.push(JSON.parse(message));

  let shop;
  t.after(async () => {
    console.error = originalConsoleError;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (shop?.listening) await close(shop);
    await close(postgrest);
  });

  shop = require('./server');
  const shopPort = await listen(shop);
  const databaseStarted = new Promise(resolve => postgrest.once('request', resolve));
  const first = fetch(`http://127.0.0.1:${shopPort}/api/products`);
  await databaseStarted;
  const queued = fetch(`http://127.0.0.1:${shopPort}/api/products`);
  await new Promise(resolve => setTimeout(resolve, 10));
  const overflow = await fetch(`http://127.0.0.1:${shopPort}/api/products`);

  assert.equal(overflow.status, 503);
  assert.equal(overflow.headers.get('retry-after'), '1');
  assert.deepEqual(await overflow.json(), { error: 'Service temporarily overloaded' });

  const timedOut = await queued;
  assert.equal(timedOut.status, 503);
  assert.equal(timedOut.headers.get('retry-after'), '1');
  assert.equal((await first).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${shopPort}/api/products`)).status, 200);
  assert.equal(poolEvents.length, 2);
  assert.ok(poolEvents.every(event => event.event === 'database_pool_exhausted'));
  assert.ok(poolEvents.every(event => event.message === 'database connection pool exhausted'));
});
