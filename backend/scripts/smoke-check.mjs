const baseUrl = process.env.BACKEND_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

async function checkEndpoint(name, path, options) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, options);
    const latencyMs = Date.now() - startedAt;
    return {
      check: name,
      method: options?.method ?? 'GET',
      path,
      status: response.status,
      ok: response.ok,
      latencyMs
    };
  } catch (error) {
    return {
      check: name,
      method: options?.method ?? 'GET',
      path,
      status: 0,
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function run() {
  const rows = [];

  rows.push(await checkEndpoint('Health', '/health'));
  rows.push(await checkEndpoint('Catalog', '/agents/catalog'));
  rows.push(await checkEndpoint('Wallet Balance', '/api/wallet/balance'));
  rows.push(await checkEndpoint('Chain Config', '/api/chain/config'));
  rows.push(await checkEndpoint('Transactions', '/api/transactions?limit=1'));

  const query = await checkEndpoint('Create Query Session', '/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'smoke test for backend validation' })
  });
  rows.push(query);

  if (query.ok) {
    try {
      const created = await fetch(`${baseUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'check status endpoint' })
      });
      const payload = await created.json();
      const sessionId = payload?.data?.sessionId;
      if (sessionId) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        rows.push(await checkEndpoint('Session Status', `/api/status/${sessionId}`));
      }
    } catch {
      rows.push({ check: 'Session Status', method: 'GET', path: '/api/status/:sessionId', status: 0, ok: false, latencyMs: 0, error: 'Unable to create test session' });
    }
  }

  console.log(`\nBackend smoke checks for ${baseUrl}`);
  console.table(rows);

  const failed = rows.filter((row) => !row.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void run();