require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

const DEFAULTS = {
  members: 5000,
  accounts: 500,
  baseUrl: 'http://127.0.0.1:3000',
  loginConcurrency: 50,
  treeConcurrency: 10,
  treeRequests: 40,
  dashboardConcurrency: 10,
  dashboardRequests: 40,
  password: 'LoadTest@123',
  batchSize: 500,
  cleanup: false,
};

function readArgs() {
  const args = { ...DEFAULTS };
  for (let i = 2; i < process.argv.length; i += 1) {
    const item = process.argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    if (key === 'cleanup') {
      args.cleanup = true;
      continue;
    }
    const value = process.argv[i + 1];
    i += 1;
    if (['members', 'accounts', 'loginConcurrency', 'treeConcurrency', 'treeRequests', 'dashboardConcurrency', 'dashboardRequests', 'batchSize'].includes(key)) {
      args[key] = Number(value);
    } else if (key in args) {
      args[key] = value;
    }
  }
  if (!Number.isInteger(args.members) || args.members < 1) throw new Error('--members must be a positive integer');
  if (!Number.isInteger(args.accounts) || args.accounts < 1) throw new Error('--accounts must be a positive integer');
  if (args.accounts > args.members) throw new Error('--accounts cannot be greater than --members');
  return args;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function insertMany(connection, table, columns, rows, batchSize) {
  for (const part of chunk(rows, batchSize)) {
    const placeholders = part.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const values = part.flat();
    await connection.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`, values);
  }
}

function percentile(sorted, pct) {
  if (!sorted.length) return 0;
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function summarize(samples) {
  const durations = samples.map((s) => s.ms).sort((a, b) => a - b);
  const ok = samples.filter((s) => s.ok).length;
  const failed = samples.length - ok;
  const totalMs = samples.reduce((sum, s) => sum + s.ms, 0);
  const wallMs = samples.reduce((max, s) => Math.max(max, s.endedAt - samples[0].startedAt), 0);
  const statuses = {};
  for (const sample of samples) {
    statuses[sample.status || 'ERR'] = (statuses[sample.status || 'ERR'] || 0) + 1;
  }
  return {
    requests: samples.length,
    ok,
    failed,
    statuses,
    rps: wallMs ? Number((samples.length / (wallMs / 1000)).toFixed(2)) : 0,
    avg_ms: samples.length ? Math.round(totalMs / samples.length) : 0,
    min_ms: durations[0] || 0,
    p50_ms: percentile(durations, 50),
    p95_ms: percentile(durations, 95),
    p99_ms: percentile(durations, 99),
    max_ms: durations[durations.length - 1] || 0,
    avg_bytes: Math.round(samples.reduce((sum, s) => sum + (s.bytes || 0), 0) / Math.max(1, samples.length)),
  };
}

async function runPool(count, concurrency, task) {
  const samples = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (next < count) {
      const current = next;
      next += 1;
      const startedAt = Date.now();
      try {
        const result = await task(current);
        const endedAt = Date.now();
        samples.push({
          ok: result.ok,
          status: result.status,
          bytes: result.bytes || 0,
          ms: endedAt - startedAt,
          startedAt,
          endedAt,
        });
      } catch (error) {
        const endedAt = Date.now();
        samples.push({
          ok: false,
          status: error.code || 'ERR',
          bytes: 0,
          ms: endedAt - startedAt,
          startedAt,
          endedAt,
        });
      }
    }
  });
  await Promise.all(workers);
  samples.sort((a, b) => a.startedAt - b.startedAt);
  return samples;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    bytes: Buffer.byteLength(text || ''),
    data,
  };
}

async function login(baseUrl, email, password) {
  return requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function seed(args) {
  const runId = `lt_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const connection = await db.getConnection();
  const started = Date.now();
  try {
    await connection.beginTransaction();

    const [clanResult] = await connection.query(
      'INSERT INTO clans (clan_name, history, hall_address) VALUES (?, ?, ?)',
      [`__LOADTEST__ ${runId}`, `Load test clan ${runId}`, 'Synthetic load test data']
    );
    const clanId = clanResult.insertId;

    const peopleRows = [];
    const generationByIndex = new Map([[1, 1]]);
    for (let i = 1; i <= args.members; i += 1) {
      const parentIndex = i === 1 ? null : Math.floor((i - 2) / 3) + 1;
      const generation = parentIndex ? (generationByIndex.get(parentIndex) || 1) + 1 : 1;
      generationByIndex.set(i, generation);
      const isAccount = i <= args.accounts;
      peopleRows.push([
        clanId,
        `Load Test ${i}`,
        `Name${i}`,
        `Gen${generation}`,
        'Load',
        i % 2 === 0 ? 2 : 1,
        generation,
        ((i - 1) % 12) + 1,
        `${1970 + (i % 40)}-01-01`,
        1,
        isAccount ? `loadtest_${runId}_${i}@example.test` : null,
        'Load Test',
        (i % 80) * 240,
        generation * 180,
        i,
        runId,
      ]);
    }

    const personColumns = [
      'clan_id',
      'display_name',
      'first_name',
      'middle_name',
      'surname',
      'gender',
      'generation',
      'branch',
      'birth_date',
      'is_living',
      'email',
      'hometown',
      'tree_x',
      'tree_y',
      'display_order',
      'note',
    ];
    const personIds = [];
    for (const part of chunk(peopleRows, args.batchSize)) {
      const placeholders = part.map(() => `(${personColumns.map(() => '?').join(',')})`).join(',');
      const [result] = await connection.query(
        `INSERT INTO people (${personColumns.join(',')}) VALUES ${placeholders}`,
        part.flat()
      );
      for (let i = 0; i < result.affectedRows; i += 1) personIds.push(result.insertId + i);
    }

    const familyByParentIndex = new Map();
    const familyRows = [];
    for (let parentIndex = 1; parentIndex <= Math.floor((args.members - 2) / 3) + 1; parentIndex += 1) {
      const firstChild = (parentIndex - 1) * 3 + 2;
      if (firstChild > args.members) continue;
      const parentPersonId = personIds[parentIndex - 1];
      const parentGender = parentIndex % 2 === 0 ? 2 : 1;
      familyRows.push([
        clanId,
        parentGender === 1 ? parentPersonId : null,
        parentGender === 2 ? parentPersonId : null,
        null,
        'active',
        null,
        runId,
      ]);
    }

    const familyColumns = ['clan_id', 'father_id', 'mother_id', 'marriage_date', 'relationship_status', 'ended_at', 'relation_note'];
    let parentIndexCursor = 1;
    for (const part of chunk(familyRows, args.batchSize)) {
      const placeholders = part.map(() => `(${familyColumns.map(() => '?').join(',')})`).join(',');
      const [result] = await connection.query(
        `INSERT INTO families (${familyColumns.join(',')}) VALUES ${placeholders}`,
        part.flat()
      );
      for (let i = 0; i < result.affectedRows; i += 1) {
        familyByParentIndex.set(parentIndexCursor, result.insertId + i);
        parentIndexCursor += 1;
      }
    }

    const childRows = [];
    for (let i = 2; i <= args.members; i += 1) {
      const parentIndex = Math.floor((i - 2) / 3) + 1;
      const familyId = familyByParentIndex.get(parentIndex);
      if (familyId) childRows.push([familyId, personIds[i - 1], (i - 2) % 3]);
    }
    await insertMany(connection, 'children', ['family_id', 'person_id', 'sort_order'], childRows, args.batchSize);

    const passwordHash = await bcrypt.hash(args.password, 10);
    const accountRows = [];
    for (let i = 1; i <= args.accounts; i += 1) {
      accountRows.push([
        `loadtest_${runId}_${i}@example.test`,
        passwordHash,
        personIds[i - 1],
        i === 1 ? 2 : 3,
        'active',
      ]);
    }
    const accountColumns = ['email', 'password', 'person_id', 'role_id', 'status'];
    const accountIds = [];
    for (const part of chunk(accountRows, args.batchSize)) {
      const placeholders = part.map(() => `(${accountColumns.map(() => '?').join(',')})`).join(',');
      const [result] = await connection.query(
        `INSERT INTO accounts (${accountColumns.join(',')}) VALUES ${placeholders}`,
        part.flat()
      );
      for (let i = 0; i < result.affectedRows; i += 1) accountIds.push(result.insertId + i);
    }

    const accountClanRows = accountIds.map((accountId, index) => [
      accountId,
      clanId,
      personIds[index],
      'active',
    ]);
    await insertMany(connection, 'account_clans', ['account_id', 'clan_id', 'person_id', 'status'], accountClanRows, args.batchSize);

    await connection.commit();
    return {
      runId,
      clanId,
      managerEmail: accountRows[0][0],
      memberEmails: accountRows.slice(1).map((row) => row[0]),
      accountEmails: accountRows.map((row) => row[0]),
      seed_ms: Date.now() - started,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function cleanup(clanId) {
  await db.query('DELETE FROM clans WHERE id = ?', [clanId]);
}

async function main() {
  const args = readArgs();
  const report = {
    config: args,
    environment: {
      db_connection_limit: Number(process.env.DB_CONNECTION_LIMIT || 5),
      node: process.version,
    },
  };

  const health = await requestJson(`${args.baseUrl}/api/health`);
  if (!health.ok) {
    throw new Error(`Backend health check failed at ${args.baseUrl}/api/health: ${health.status}`);
  }

  const seedInfo = await seed(args);
  report.seed = {
    runId: seedInfo.runId,
    clanId: seedInfo.clanId,
    managerEmail: seedInfo.managerEmail,
    accountEmailPattern: `loadtest_${seedInfo.runId}_{1..${args.accounts}}@example.test`,
    members: args.members,
    accounts: args.accounts,
    seed_ms: seedInfo.seed_ms,
  };

  const managerLogin = await login(args.baseUrl, seedInfo.managerEmail, args.password);
  if (!managerLogin.ok || !managerLogin.data?.token) {
    throw new Error(`Manager login failed: ${managerLogin.status}`);
  }
  const managerToken = managerLogin.data.token;

  const warmTree = await requestJson(`${args.baseUrl}/api/manager/tree`, {
    headers: { authorization: `Bearer ${managerToken}` },
  });
  report.warmup_manager_tree = {
    ok: warmTree.ok,
    status: warmTree.status,
    bytes: warmTree.bytes,
    members: warmTree.data?.treeMembers?.length || 0,
    families: warmTree.data?.families?.length || 0,
    children: warmTree.data?.children?.length || 0,
  };

  const loginSamples = await runPool(args.accounts, args.loginConcurrency, async (index) => {
    const result = await login(args.baseUrl, seedInfo.accountEmails[index], args.password);
    return result;
  });
  report.login_500_accounts = summarize(loginSamples);

  const treeSamples = await runPool(args.treeRequests, args.treeConcurrency, async () => {
    return requestJson(`${args.baseUrl}/api/manager/tree`, {
      headers: { authorization: `Bearer ${managerToken}` },
    });
  });
  report.manager_tree = summarize(treeSamples);

  const memberLogin = await login(args.baseUrl, seedInfo.memberEmails[0], args.password);
  if (memberLogin.ok && memberLogin.data?.token) {
    const memberToken = memberLogin.data.token;
    const dashboardSamples = await runPool(args.dashboardRequests, args.dashboardConcurrency, async () => {
      return requestJson(`${args.baseUrl}/api/member/dashboard`, {
        headers: { authorization: `Bearer ${memberToken}` },
      });
    });
    report.member_dashboard = summarize(dashboardSamples);
  } else {
    report.member_dashboard = { skipped: true, reason: `member login failed: ${memberLogin.status}` };
  }

  if (args.cleanup) {
    await cleanup(seedInfo.clanId);
    report.cleanup = { clan_deleted: seedInfo.clanId };
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (_) {}
  });
