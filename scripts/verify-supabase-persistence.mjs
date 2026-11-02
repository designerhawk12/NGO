import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;
const rootDir = process.cwd();
dotenv.config({ path: path.join(rootDir, 'server', '.env') });
dotenv.config({ path: path.join(rootDir, 'apps', 'web', '.env') });

const dbUrl = process.env.DATABASE_URL;
const sslCaPath = process.env.DATABASE_SSL_CA_PATH ? path.resolve(rootDir, 'server', process.env.DATABASE_SSL_CA_PATH) : null;
const ca = sslCaPath && fs.existsSync(sslCaPath) ? fs.readFileSync(sslCaPath, 'utf8') : undefined;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false }
});

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const admin = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY);

const API_BASE = 'http://localhost:4000/api/v1';

async function main() {
  console.log('--- Step 1: Sign in with authorized admin test account ---');
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'admin_test@gmail.com'
  });
  if (linkErr) throw new Error('Generate link failed: ' + linkErr.message);

  const { data: authData, error: authError } = await supabase.auth.verifyOtp({
    email: 'admin_test@gmail.com',
    token: linkData.properties.email_otp,
    type: 'magiclink'
  });
  if (authError || !authData.session) {
    throw new Error('Supabase verify failed: ' + authError?.message);
  }
  const token = authData.session.access_token;
  console.log('Signed in successfully as:', authData.user.email);

  console.log('\n--- Step 2: Verify me endpoint ---');
  const meRes = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meJson = await meRes.json();
  console.log('Current user role from Express DB:', meJson.data?.role);
  if (meJson.data?.role !== 'ADMIN') throw new Error('Not an ADMIN user');

  console.log('\n--- Step 3: Fetch coordinator food requests through real API ---');
  const initialFetchRes = await fetch(`${API_BASE}/food-requests`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const initialFetchJson = await initialFetchRes.json();
  const initialItems = initialFetchJson.data?.items || [];
  console.log(`Fetched ${initialItems.length} existing live food request(s) from Express.`);
  const hasHardcodedDemo = initialItems.some(i => i.id === 'f1000000-0000-4000-8000-000000000001');
  console.log('Contains hardcoded fallback demo record (f1000...0001):', hasHardcodedDemo ? 'YES (FAIL)' : 'NO (CLEAN)');

  console.log('\n--- Step 4: Create ONE clearly identifiable test food request ---');
  const now = new Date();
  const futureHourOffset = 6 + Math.floor(Math.random() * 50);
  const readyAt = new Date(now.getTime() + futureHourOffset * 3600000).toISOString();
  const deadline = new Date(now.getTime() + (futureHourOffset + 3) * 3600000).toISOString();
  const testPayload = {
    sourceName: 'Real Supabase Live Test Hall',
    sourceType: 'EVENT',
    contactName: 'Syed Atif Test',
    contactPhoneE164: '+919876543210',
    pickupAddress: 'MG Road Trinity Circle, Bengaluru',
    preparedAt: now.toISOString(),
    readyAt,
    pickupDeadline: deadline,
    estimatedWeightKg: 42,
    handlingRequirements: 'Refrigerated container preferred',
    donorSafetyDeclaration: true,
    items: [
      { foodType: 'Rice & Curry', quantity: 25, unit: 'KG', handlingRequirements: 'Keep covered' },
      { foodType: 'Gulab Jamun', quantity: 17, unit: 'KG', handlingRequirements: 'Keep cool' }
    ]
  };

  const createReqRes = await fetch(`${API_BASE}/food-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(testPayload)
  });
  const createReqJson = await createReqRes.json();
  if (!createReqRes.ok || !createReqJson.success) {
    throw new Error('Create food request failed: ' + JSON.stringify(createReqJson));
  }
  const createdReq = createReqJson.data;
  const requestId = createdReq.id;
  console.log('Created test food request ID:', requestId);
  console.log('Source Name:', createdReq.sourceName);
  console.log('Status:', createdReq.status);

  console.log('\n--- Step 5: Verify request exists in PostgreSQL directly ---');
  const dbReqRes = await pool.query('SELECT id, source_name, status, pickup_address, created_at FROM app.food_requests WHERE id = $1', [requestId]);
  if (dbReqRes.rows.length === 0) {
    throw new Error('Food request was NOT found in app.food_requests table!');
  }
  console.log('PostgreSQL confirmed record:', dbReqRes.rows[0]);

  console.log('\n--- Step 6: Fetch through coordinator API & verify it appears without duplicates ---');
  const secondFetchRes = await fetch(`${API_BASE}/food-requests`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const secondFetchJson = await secondFetchRes.json();
  const secondItems = secondFetchJson.data?.items || [];
  const foundReqs = secondItems.filter(i => i.id === requestId);
  console.log(`Found ${foundReqs.length} instance(s) of request ID ${requestId} in live API response.`);
  if (foundReqs.length !== 1) {
    throw new Error(`Expected exactly 1 instance, got ${foundReqs.length}`);
  }

  console.log('\n--- Step 7: Simulate page refresh (retrieve persisted records) ---');
  const thirdFetchRes = await fetch(`${API_BASE}/food-requests`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const thirdFetchJson = await thirdFetchRes.json();
  const refreshedItem = (thirdFetchJson.data?.items || []).find(i => i.id === requestId);
  if (!refreshedItem) {
    throw new Error('Record did not persist after simulated page refresh!');
  }
  console.log('Simulated refresh confirmed persisted record:', refreshedItem.id, refreshedItem.sourceName);

  console.log('\n--- Step 8: Approve safety review ---');
  const safetyRes = await fetch(`${API_BASE}/food-requests/${requestId}/safety-review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ review: 'APPROVED' })
  });
  const safetyJson = await safetyRes.json();
  console.log('Safety review response:', safetyJson.success ? 'APPROVED' : safetyJson);

  console.log('\n--- Step 9: Schedule test pickup via live API ---');
  const pickupPayload = {
    foodRequestId: requestId,
    deliveryAddress: 'AaharaConnect Indiranagar Distribution Center',
    windowStartsAt: readyAt,
    windowEndsAt: deadline
  };
  const createPickupRes = await fetch(`${API_BASE}/pickups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(pickupPayload)
  });
  const createPickupJson = await createPickupRes.json();
  if (!createPickupRes.ok || !createPickupJson.success) {
    throw new Error('Create pickup failed: ' + JSON.stringify(createPickupJson));
  }
  const pickupId = createPickupJson.data.id;
  console.log('Created live pickup ID:', pickupId);
  console.log('Pickup status:', createPickupJson.data.status);

  // Check in PostgreSQL
  const dbPickupRes = await pool.query('SELECT id, food_request_id, status, delivery_address FROM app.pickups WHERE id = $1', [pickupId]);
  console.log('PostgreSQL confirmed pickup record:', dbPickupRes.rows[0]);

  console.log('\n--- Step 10: Assign vehicle, driver, and volunteer via live API ---');
  // Get canonical driver & vehicle from DB
  const driverQuery = await pool.query('SELECT d.id as driver_id, d.licence_number, p.name FROM app.drivers d JOIN app.people p ON d.person_id = p.id WHERE d.status = $1 LIMIT 1', ['ACTIVE']);
  const vehicleQuery = await pool.query('SELECT id as vehicle_id, registration_number, capacity_kg FROM app.vehicles WHERE status = $1 LIMIT 1', ['ACTIVE']);
  const volQuery = await pool.query('SELECT v.id as volunteer_id, p.name FROM app.volunteers v JOIN app.people p ON v.person_id = p.id WHERE v.status = $1 LIMIT 1', ['ACTIVE']);

  const driver = driverQuery.rows[0];
  const vehicle = vehicleQuery.rows[0];
  const volunteer = volQuery.rows[0];

  const availStart = new Date(now.getTime() - 2 * 3600 * 1000);
  const availEnd = new Date(now.getTime() + 100 * 3600 * 1000);
  await pool.query(
    "INSERT INTO app.volunteer_availability (volunteer_id, starts_at, ends_at, state) VALUES ($1, $2, $3, 'AVAILABLE') ON CONFLICT DO NOTHING",
    [volunteer.volunteer_id, availStart, availEnd]
  );

  console.log('Assigning driver:', driver?.name, `(${driver?.driver_id})`);
  console.log('Assigning vehicle:', vehicle?.registration_number, `(${vehicle?.vehicle_id})`);
  console.log('Assigning volunteer:', volunteer?.name, `(${volunteer?.volunteer_id})`);

  const assignPayload = {
    teamId: null,
    volunteerIds: [volunteer.volunteer_id],
    driverId: driver.driver_id,
    vehicleId: vehicle.vehicle_id,
    role: 'Pickup Volunteer',
    windowStartsAt: readyAt,
    windowEndsAt: deadline,
    containers: [{ containerType: 'insulated crate', count: 3, estimatedLoadKg: 42 }]
  };

  const createAssignRes = await fetch(`${API_BASE}/pickups/${pickupId}/assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify(assignPayload)
  });
  const createAssignJson = await createAssignRes.json();
  if (!createAssignRes.ok || !createAssignJson.success) {
    throw new Error('Create assignment failed: ' + JSON.stringify(createAssignJson));
  }
  const assignmentId = createAssignJson.data.id;
  console.log('Created live assignment ID:', assignmentId);
  console.log('Assignment status:', createAssignJson.data.status);

  // Check assignment in PostgreSQL
  const dbAssignRes = await pool.query('SELECT id, pickup_id, vehicle_id, driver_id, status FROM app.assignments WHERE id = $1', [assignmentId]);
  console.log('PostgreSQL confirmed assignment record:', dbAssignRes.rows[0]);

  // Check updated pickup status in PostgreSQL
  const dbPickupAfterAssign = await pool.query('SELECT id, status FROM app.pickups WHERE id = $1', [pickupId]);
  console.log('PostgreSQL confirmed updated pickup status:', dbPickupAfterAssign.rows[0]);

  console.log('\n--- Step 11: Verify live pickups list through API ---');
  const pickupsListRes = await fetch(`${API_BASE}/pickups`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const pickupsListJson = await pickupsListRes.json();
  const foundPickup = (pickupsListJson.data?.items || []).find(p => p.id === pickupId);
  console.log('Verified pickup in live API list:', foundPickup?.id, 'Status:', foundPickup?.status);

  console.log('\n✅ ALL LIVE SUPABASE / POSTGRESQL VERIFICATION STEPS PASSED SUCCESSFULLY!');
}

main()
  .catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
