// server.js - Secure Backend and Static PWA Server for Akshaya Ahar
// Built with Node.js built-in modules (no external npm dependencies required)

const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Read .env file safely
const envPath = path.join(__dirname, '.env');
const env = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      env[k] = v;
    }
  });
}

const PORT = parseInt(env.PORT || process.env.PORT || '4000', 10);

// Restrict CORS strictly to trusted origins configured in .env
const TRUSTED_ORIGINS = (env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Flexible mapping preserving teammate variable names (SUPABASE_URL, VITE_, EXPO_)
const SUPABASE_URL = (
  env.SUPABASE_URL ||
  env.VITE_SUPABASE_URL ||
  env.EXPO_PUBLIC_SUPABASE_URL ||
  ''
).replace(/\/$/, '');

const SUPABASE_PUBLISHABLE_KEY =
  env.SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY || '';
const SUPABASE_KEY = SUPABASE_SECRET_KEY || SUPABASE_PUBLISHABLE_KEY || '';

const GROQ_API_KEY = env.GROQ || env.GROQ_API_KEY || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Helper: Check if Supabase credentials are configured
function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_KEY &&
    !SUPABASE_URL.includes('your-project-id') &&
    !SUPABASE_URL.startsWith('<')
  );
}

// Helper: Call Supabase REST API safely server-side
async function supabaseFetch(endpoint, options = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error('DATABASE_CREDENTIALS_MISSING: SUPABASE_URL and API keys are not configured in .env');
  }

  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const responseText = await res.text();
  let json = null;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = { raw: responseText };
  }

  if (!res.ok) {
    const errorMsg = (json && (json.message || json.error || json.hint)) || `Supabase API error (${res.status})`;
    const err = new Error(errorMsg);
    err.status = res.status;
    throw err;
  }

  return json;
}

// Helper: Read request JSON body safely
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: Send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;

  // Strict CORS restriction
  const host = req.headers.host;
  const isSelf = origin && (
    origin === `http://${host}` ||
    origin === `https://${host}` ||
    origin === `http://localhost:${PORT}` ||
    origin === `http://127.0.0.1:${PORT}`
  );

  let isOriginAllowed = false;
  if (!origin || isSelf) {
    // Same-origin browser requests or non-browser tools (curl)
    isOriginAllowed = true;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
  } else if (TRUSTED_ORIGINS.includes(origin)) {
    isOriginAllowed = true;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  if (isOriginAllowed && origin) {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CORS forbidden: origin not in trusted list' }));
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  // Reject untrusted cross-origin requests
  if (origin && !isOriginAllowed) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'CORS forbidden: origin not permitted' }));
    return;
  }

  const urlPath = req.url.split('?')[0];
  const query = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;

  // -------------------------------------------------------------
  // Safe Public Config Endpoint (NEVER exposes secrets or DB URLs)
  // -------------------------------------------------------------
  if (urlPath === '/config.js') {
    const configJs = `// Generated dynamically from .env
// Strictly public configuration only. Internal keys and connection strings are never exposed.
window.__CONFIG__ = {
  SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
  SUPABASE_PUBLISHABLE_KEY: ${JSON.stringify(SUPABASE_PUBLISHABLE_KEY)},
  API_BASE_URL: ${JSON.stringify(env.VITE_API_BASE_URL || env.EXPO_PUBLIC_API_BASE_URL || `http://localhost:${PORT}/api/v1`)}
};
`;
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(configJs);
    return;
  }

  // -------------------------------------------------------------
  // Backend API Endpoints (/api/v1/...)
  // -------------------------------------------------------------

  // 1. Health & Config Verification
  if (urlPath === '/api/v1/health') {
    sendJson(res, 200, {
      status: 'ok',
      app: 'Akshaya Ahar',
      port: PORT,
      databaseConfigured: isSupabaseConfigured(),
      aiEstimationConfigured: Boolean(GROQ_API_KEY),
      vegetarianOnlyEnforced: true,
      allowedOriginsCount: TRUSTED_ORIGINS.length
    });
    return;
  }

  // 1b. AI Serving-Size Estimate (POST /api/v1/estimate-food)
  if (urlPath === '/api/v1/estimate-food' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const name = (payload.name || '').trim();
      const unit = payload.unit === 'pcs' ? 'pcs' : 'kg';

      if (!name) {
        return sendJson(res, 400, { error: 'Food name is required' });
      }
      if (!GROQ_API_KEY) {
        return sendJson(res, 503, { error: 'AI estimation is not configured (missing GROQ key in .env)' });
      }

      const unitLabel = unit === 'kg' ? 'kilograms' : 'pieces';
      const prompt = `You help a vegetarian Indian community food donation app.
Food item: "${name}"
Measured in: ${unitLabel}

Give two things about this one food item, for ONE adult's shared-meal serving:
1. perPerson: how many ${unitLabel} of it are needed to feed exactly one adult
2. emoji: ONE single emoji that best represents this specific food (prefer a close, specific match over a generic one)

Respond with ONLY a JSON object, nothing else, in exactly this form:
{"perPerson": <number>, "emoji": "<single emoji>"}`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 200,
          reasoning_effort: 'low'
        })
      });

      const groqData = await groqRes.json();
      if (!groqRes.ok) {
        throw new Error((groqData.error && groqData.error.message) || 'Groq API error');
      }

      const content = (groqData.choices && groqData.choices[0] && groqData.choices[0].message.content) || '';

      let perPerson = NaN;
      let emoji = null;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          perPerson = parseFloat(parsed.perPerson);
          if (typeof parsed.emoji === 'string' && parsed.emoji.trim()) {
            emoji = parsed.emoji.trim().slice(0, 8);
          }
        } catch {
          // fall through to the numeric-only fallback below
        }
      }
      if (!perPerson || !isFinite(perPerson)) {
        const numMatch = content.match(/[\d.]+/);
        perPerson = numMatch ? parseFloat(numMatch[0]) : NaN;
      }

      if (!perPerson || perPerson <= 0 || !isFinite(perPerson)) {
        throw new Error('AI could not produce a usable estimate for this item');
      }

      sendJson(res, 200, { success: true, name, unit, perPerson, emoji });
    } catch (err) {
      console.error('[API /estimate-food Error]', err.message);
      sendJson(res, err.status || 500, { error: err.message });
    }
    return;
  }

  // 1c. AI Holistic Donation Estimate (POST /api/v1/estimate-total)
  // Looks at every donated item together (not a simple per-item sum) and factors in
  // how much time has passed since the food was prepared.
  if (urlPath === '/api/v1/estimate-total' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const foods = Array.isArray(payload.foods) ? payload.foods : [];
      const preparedTime = payload.preparedTime || null;

      if (!foods.length) {
        return sendJson(res, 400, { error: 'At least one food item is required' });
      }
      if (!GROQ_API_KEY) {
        return sendJson(res, 503, { error: 'AI estimation is not configured (missing GROQ key in .env)' });
      }

      const now = new Date();
      let timeNote = 'The preparation time was not provided.';
      const prepared = preparedTime ? new Date(preparedTime) : null;
      if (prepared && !isNaN(prepared.getTime())) {
        const hoursElapsed = Math.max(0, (now.getTime() - prepared.getTime()) / 3600000);
        timeNote = `The food was prepared at ${prepared.toISOString()}, about ${hoursElapsed.toFixed(1)} hour(s) before now (${now.toISOString()}).`;
      }

      const itemLines = foods
        .map(f => `- ${f.name}: ${f.quantity} ${f.unit === 'pcs' ? 'pieces' : 'kg'}`)
        .join('\n');

      const prompt = `You assess a vegetarian Indian community food donation made up of several items shared as one meal.

Food items donated:
${itemLines}

${timeNote}

Tasks:
1. estimatedFeeds: estimate the TOTAL number of adults this combined donation can feed as one shared meal. Do not simply add up each item's individual headcount - people take a bit of several items on one plate, so the combined total is usually close to the single largest item's headcount, nudged up a little by the variety of other items available.
2. note: write a VERY SHORT note (max 2 sentences) explaining the estimate. Mention the time consideration: if the food is more than 3-4 hours old, flag a freshness/safety concern; otherwise reassure it is still fresh.

Respond with ONLY a JSON object, nothing else, in exactly this form:
{"estimatedFeeds": <integer>, "note": "<short text>"}`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
          reasoning_effort: 'low'
        })
      });

      const groqData = await groqRes.json();
      if (!groqRes.ok) {
        throw new Error((groqData.error && groqData.error.message) || 'Groq API error');
      }

      const content = (groqData.choices && groqData.choices[0] && groqData.choices[0].message.content) || '';

      let estimatedFeeds = NaN;
      let note = '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          estimatedFeeds = parseInt(parsed.estimatedFeeds, 10);
          if (typeof parsed.note === 'string') note = parsed.note.trim().slice(0, 300);
        } catch {
          // fall through to the numeric-only fallback below
        }
      }
      if (!estimatedFeeds || !isFinite(estimatedFeeds)) {
        const numMatch = content.match(/\d+/);
        estimatedFeeds = numMatch ? parseInt(numMatch[0], 10) : NaN;
      }

      if (!estimatedFeeds || estimatedFeeds <= 0) {
        throw new Error('AI could not produce a usable total estimate');
      }

      sendJson(res, 200, {
        success: true,
        estimatedFeeds,
        note: note || 'Estimate generated from the combined items.'
      });
    } catch (err) {
      console.error('[API /estimate-total Error]', err.message);
      sendJson(res, err.status || 500, { error: err.message });
    }
    return;
  }

  // 2. Submit Donation (POST /api/v1/donations)
  if (urlPath === '/api/v1/donations' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { donor, hall, foods, preparedTime, feedsCount } = payload;

      if (!donor || !donor.name || !donor.phone) {
        return sendJson(res, 400, { error: 'Missing donor name or phone number' });
      }

      if (!foods || !Array.isArray(foods) || foods.length === 0) {
        return sendJson(res, 400, { error: 'At least one food item is required' });
      }

      // Enforce Vegetarian-Only Policy
      const nonVegKeywords = /\b(chicken|mutton|fish|meat|egg|eggs|beef|pork|prawn|prawns|crab|seafood)\b/i;
      const nonVegItems = foods.filter(f => f.foodType === 'NON_VEG' || nonVegKeywords.test(f.name || ''));
      if (nonVegItems.length > 0) {
        return sendJson(res, 400, {
          error: 'Vegetarian-only policy violation: Akshaya Ahar only accepts vegetarian food donations.',
          prohibitedItems: nonVegItems.map(f => f.name)
        });
      }

      // If Supabase is not configured, inform caller cleanly
      if (!isSupabaseConfigured()) {
        return sendJson(res, 503, {
          error: 'Supabase credentials pending. Please configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SECRET_KEY) in .env.',
          databaseConfigured: false
        });
      }

      // 1. Ensure donor exists in Supabase
      let donorId = null;
      const existingDonors = await supabaseFetch(`/donors?phone=eq.${encodeURIComponent(donor.phone)}&select=id`);
      if (existingDonors && existingDonors.length > 0) {
        donorId = existingDonors[0].id;
      } else {
        const createdDonor = await supabaseFetch('/donors', {
          method: 'POST',
          body: {
            name: donor.name,
            phone: donor.phone,
            address: donor.address || 'Not specified',
            password_hash: 'api_registered'
          }
        });
        if (createdDonor && createdDonor[0]) donorId = createdDonor[0].id;
      }

      // 2. Insert Function Hall if provided
      let hallId = null;
      if (hall) {
        const createdHall = await supabaseFetch('/function_halls', {
          method: 'POST',
          body: {
            donor_id: donorId,
            hall_name: hall.hallName || 'Function Hall',
            hall_address: hall.hallAddress || 'Not specified',
            latitude: hall.latitude || null,
            longitude: hall.longitude || null
          }
        });
        if (createdHall && createdHall[0]) hallId = createdHall[0].id;
      }

      // 3. Insert Donation Record
      const createdDonation = await supabaseFetch('/donations', {
        method: 'POST',
        body: {
          donor_id: donorId,
          hall_id: hallId,
          prepared_time: preparedTime ? new Date(preparedTime).toISOString() : null,
          feeds_count: parseInt(feedsCount, 10) || 0,
          status: 'pending',
          status_message: 'Waiting for pickup team to accept'
        }
      });

      const donation = createdDonation && createdDonation[0];
      if (!donation) throw new Error('Failed to create donation record in database');

      // 4. Insert Donation Items
      const itemRows = foods.map(f => ({
        donation_id: donation.id,
        name: f.name,
        food_type: ['VEG', 'SWEETS', 'PACKAGED'].includes(f.foodType) ? f.foodType : 'VEG',
        quantity: parseFloat(f.quantity) || 0,
        unit: f.unit === 'pcs' ? 'pcs' : 'kg',
        people_fed: parseInt(f.peopleFed, 10) || 0
      }));

      await supabaseFetch('/donation_items', {
        method: 'POST',
        body: itemRows
      });

      sendJson(res, 201, {
        success: true,
        donationId: donation.id,
        status: donation.status,
        statusMessage: donation.status_message,
        createdAt: donation.created_at
      });
    } catch (err) {
      console.error('[API /donations Error]', err.message);
      sendJson(res, err.status || 500, { error: err.message });
    }
    return;
  }

  // 3. Retrieve Donations (GET /api/v1/donations)
  if (urlPath === '/api/v1/donations' && req.method === 'GET') {
    if (!isSupabaseConfigured()) {
      return sendJson(res, 503, {
        error: 'Database credentials pending in .env',
        databaseConfigured: false
      });
    }

    try {
      let filter = '?select=*,donors(name,phone),function_halls(*),donation_items(*)&order=created_at.desc';
      const phone = query.get('phone');
      if (phone) {
        filter += `&donors.phone=eq.${encodeURIComponent(phone)}`;
      }
      const records = await supabaseFetch(`/donations${filter}`);
      sendJson(res, 200, { success: true, count: records.length, donations: records });
    } catch (err) {
      console.error('[API GET /donations Error]', err.message);
      sendJson(res, err.status || 500, { error: err.message });
    }
    return;
  }

  // 4. Retrieve Single Donation Status (GET /api/v1/donations/:id)
  const donationMatch = urlPath.match(/^\/api\/v1\/donations\/([a-f0-9\-]+)$/);
  if (donationMatch && req.method === 'GET') {
    if (!isSupabaseConfigured()) {
      return sendJson(res, 503, { error: 'Database credentials pending in .env' });
    }

    try {
      const donationId = donationMatch[1];
      const records = await supabaseFetch(`/donations?id=eq.${encodeURIComponent(donationId)}&select=*,function_halls(*),donation_items(*)`);
      if (!records || records.length === 0) {
        return sendJson(res, 404, { error: 'Donation record not found' });
      }
      sendJson(res, 200, { success: true, donation: records[0] });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message });
    }
    return;
  }

  // 5. Cancel Donation (PATCH /api/v1/donations/:id/cancel)
  const cancelMatch = urlPath.match(/^\/api\/v1\/donations\/([a-f0-9\-]+)\/cancel$/);
  if (cancelMatch && (req.method === 'PATCH' || req.method === 'POST')) {
    if (!isSupabaseConfigured()) {
      return sendJson(res, 503, { error: 'Database credentials pending in .env' });
    }

    try {
      const donationId = cancelMatch[1];
      const updated = await supabaseFetch(`/donations?id=eq.${encodeURIComponent(donationId)}`, {
        method: 'PATCH',
        body: {
          status: 'cancelled',
          status_message: 'Cancelled by donor'
        }
      });
      sendJson(res, 200, { success: true, message: 'Donation cancelled', donation: updated[0] });
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.message });
    }
    return;
  }

  // -------------------------------------------------------------
  // Static File Serving & Security Protection
  // -------------------------------------------------------------
  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\' || safePath === '') safePath = '/index.html';

  const filePath = path.join(__dirname, safePath);

  // Security check 1: ensure path stays within workspace
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Security check 2: Never expose .env, secrets, SQL migration, or validation scripts over HTTP
  const baseName = path.basename(filePath);
  if (baseName.startsWith('.') || baseName.endsWith('.sql') || baseName === 'validate-env.js') {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied: Protected resource');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  Akshaya Ahar Server running at: http://localhost:${PORT}`);
  console.log(`  Serving PWA with dynamic public config`);
  console.log(`  Restricted CORS to trusted origins: ${TRUSTED_ORIGINS.join(', ')}`);
  console.log(`  Vegetarian-only policy: ENFORCED`);
  console.log(`  Database status: ${isSupabaseConfigured() ? 'CONFIGURED' : 'PENDING CREDENTIALS'}`);
  console.log(`  AI estimation (Groq): ${GROQ_API_KEY ? 'CONFIGURED' : 'PENDING KEY'}`);
  console.log(`==================================================\n`);
});
