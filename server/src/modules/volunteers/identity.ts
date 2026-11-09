import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { IdentityProofInput, VolunteerRegistrationInput } from '@aaharaconnect/shared';
import { getSupabaseAdminClient, inviteSupabaseUserByEmail } from '../../auth/supabase';
import { getPool, withTransaction } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';
import { consumeVolunteerRegistrationRateLimit } from './registrationRateLimit';
import { findAdminVolunteerConflict, insertSelfRegisteredVolunteer } from './repository';
import { enqueue, outboxEnabled } from '../notifications/service';

export const IDENTITY_BUCKET = 'volunteer-identity-private';
export const identityEnabled = () => process.env.VOLUNTEER_IDENTITY_REQUIRED === 'true';
function enabled() { if (!identityEnabled()) throw new HttpError(503, 'IDENTITY_SETUP_REQUIRED', 'Identity onboarding is awaiting secure storage setup.'); }
export async function validatedIdentityImage(input: IdentityProofInput): Promise<Buffer> {
  const bytes = Buffer.from(input.dataBase64, 'base64');
  if (!bytes.length || bytes.length > 500_000) throw new HttpError(413, 'IDENTITY_TOO_LARGE', 'Use an image smaller than 500 KB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((input.contentType === 'image/png' && !png) || (input.contentType === 'image/jpeg' && !jpeg)) throw new HttpError(415, 'IDENTITY_TYPE_INVALID', 'Use a valid JPEG or PNG image.');
  try {
    // Decode, bound dimensions and re-encode: discard metadata, extra frames and trailing payloads.
    return await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch { throw new HttpError(415, 'IDENTITY_TYPE_INVALID', 'The identity image could not be safely decoded.'); }
}
async function storage() {
  const client = getSupabaseAdminClient().storage;
  const bucket = await client.getBucket(IDENTITY_BUCKET);
  // Infrastructure setup is explicit. Never silently accept an accidentally public bucket.
  if (bucket.error || !bucket.data || bucket.data.public) throw new HttpError(503, 'IDENTITY_STORAGE_UNAVAILABLE', 'Private identity storage is not configured.');
  return client.from(IDENTITY_BUCKET);
}
export async function registerWithIdentity(input: VolunteerRegistrationInput, ip: string) {
  enabled();
  if (!input.identityProof || !input.submissionId) throw new HttpError(400, 'IDENTITY_REQUIRED', 'Identity proof, consent and submission ID are required.');
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existing = await getPool().query('SELECT id FROM app.identity_registration_attempts WHERE id = $1', [input.submissionId]);
  if (!existing.rows[0]) {
    if (!await consumeVolunteerRegistrationRateLimit(ip, input.email)) throw new HttpError(429, 'INVITE_RATE_LIMITED', 'Registration limit reached. Retry the same submission later.');
    await getPool().query(`INSERT INTO app.identity_registration_attempts(id, request_hash, object_path) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [input.submissionId, hash, `registration/${input.submissionId}.jpg`]);
  }
  const bytes = await validatedIdentityImage(input.identityProof);
  const leaseId = randomUUID();
  const claim = await getPool().query(`UPDATE app.identity_registration_attempts SET lease_id=$2, locked_until=now()+interval '5 minutes'
    WHERE id=$1 AND (locked_until IS NULL OR locked_until < now()) RETURNING *`, [input.submissionId, leaseId]);
  const attempt = claim.rows[0];
  if (!attempt) throw new HttpError(409, 'SUBMISSION_BUSY', 'This application is being processed. Retry the same submission shortly.');
  try {
    if (!attempt || attempt.request_hash !== hash) throw new HttpError(409, 'SUBMISSION_CONFLICT', 'Retry with the original submission details or start a new submission.');
    if (attempt.volunteer_id) return { status: 'PENDING' as const, message: 'Your application and identity proof were already submitted for review.' };
    if (new Date(attempt.expires_at).getTime() < Date.now()) throw new HttpError(409, 'SUBMISSION_EXPIRED', 'This submission expired. Contact the NGO before retrying.');
    const store = await storage();
    await getPool().query('INSERT INTO app.identity_storage_objects(object_path) VALUES($1) ON CONFLICT DO NOTHING',[attempt.object_path]);
    const uploaded = await store.upload(attempt.object_path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (uploaded.error) throw new HttpError(503, 'IDENTITY_STORAGE_UNAVAILABLE', 'The proof could not be stored. Retry the same submission.');
    let authId = attempt.auth_user_id as string | null;
    if (!authId) {
      if(await findAdminVolunteerConflict(null,input.phoneE164))throw new HttpError(409,'VOLUNTEER_REGISTRATION_CONFLICT','An account already uses these details.');
      if(attempt.invite_started_at) throw new HttpError(503,'VOLUNTEER_REGISTRATION_REVIEW_REQUIRED','An invitation may already have been sent. The NGO must reconcile this application before retrying.');
      await getPool().query('UPDATE app.identity_registration_attempts SET invite_started_at=now() WHERE id=$1 AND lease_id=$2',[input.submissionId,leaseId]);
      const invited = await inviteSupabaseUserByEmail(input.email, input.name);
      authId = invited.authUserId;
      // Persist external invitation recovery independently; rollback cannot unsend an invitation.
      await getPool().query('UPDATE app.identity_registration_attempts SET auth_user_id = $2 WHERE id = $1', [input.submissionId, authId]);
    }
    return await withTransaction(async tx => {
      const locked = await tx.query('SELECT lease_id FROM app.identity_registration_attempts WHERE id=$1 FOR UPDATE', [input.submissionId]);
      if (locked.rows[0]?.lease_id !== leaseId) throw new HttpError(409, 'SUBMISSION_BUSY', 'Submission lease expired. Retry the same details.');
      const volunteer = await insertSelfRegisteredVolunteer(authId!, input, tx);
      await tx.query(`INSERT INTO app.volunteer_identity_documents(volunteer_id, document_type, object_path) VALUES ($1,$2,$3)`, [volunteer.id, input.identityProof!.documentType, attempt.object_path]);
      await tx.query('UPDATE app.identity_registration_attempts SET volunteer_id = $2 WHERE id = $1', [input.submissionId, volunteer.id]);
      if (outboxEnabled() && input.whatsappOptIn) {
        await tx.query('SAVEPOINT registration_whatsapp_consent');
        try { await tx.query(`INSERT INTO app.whatsapp_preferences(app_user_id,phone_e164,opted_in,consent_version) SELECT app_user_id,$2,true,'whatsapp-v1' FROM app.people WHERE id=$1 ON CONFLICT DO NOTHING`, [volunteer.person_id,input.phoneE164]); await tx.query('RELEASE SAVEPOINT registration_whatsapp_consent'); }
        catch { await tx.query('ROLLBACK TO SAVEPOINT registration_whatsapp_consent'); await tx.query('RELEASE SAVEPOINT registration_whatsapp_consent'); }
      }
      await enqueue(tx,'volunteer_application',volunteer.id,[]);
      return { status: 'PENDING' as const, message: 'Application and private identity proof submitted. An administrator must verify your proof before approval.' };
    });
  } finally {
    await getPool().query('UPDATE app.identity_registration_attempts SET locked_until=NULL, lease_id=NULL WHERE id=$1 AND lease_id=$2', [input.submissionId, leaseId]);
  }
}
export async function identityForAdmin(volunteerId: string) {
  enabled();
  const result = await getPool().query(`SELECT d.document_type AS "documentType", d.status, d.submitted_at AS "submittedAt", d.reviewed_at AS "reviewedAt", d.reviewed_by AS "reviewedBy", d.reason, d.object_path, a.identity_required AS required
    FROM app.volunteer_applications a LEFT JOIN app.volunteer_identity_documents d ON d.volunteer_id = a.volunteer_id WHERE a.volunteer_id = $1`, [volunteerId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Application not found.');
  let previewUrl: string | null = null;
  if (row.object_path && row.status !== 'DELETED') {
    const signed = await (await storage()).createSignedUrl(row.object_path, 120);
    if (signed.error) throw new HttpError(503, 'IDENTITY_STORAGE_UNAVAILABLE', 'Proof preview is unavailable.');
    previewUrl = signed.data.signedUrl;
  }
  const { object_path: _path, ...metadata } = row;
  return { ...metadata, previewUrl };
}
export async function reviewIdentity(volunteerId: string, actorId: string, status: 'VERIFIED' | 'REJECTED', reason: string) {
  enabled();
  return withTransaction(async tx => {
    const application = await tx.query('SELECT status FROM app.volunteer_applications WHERE volunteer_id = $1 FOR UPDATE', [volunteerId]);
    if (application.rows[0]?.status !== 'PENDING') throw new HttpError(409, 'INVALID_TRANSITION', 'Only pending applications may be reviewed.');
    const changed = await tx.query(`UPDATE app.volunteer_identity_documents SET status=$2, reviewed_by=$3, reviewed_at=now(), reason=$4 WHERE volunteer_id=$1 AND status <> 'DELETED' RETURNING volunteer_id`, [volunteerId, status, actorId, reason]);
    if (!changed.rows[0]) throw new HttpError(409, 'IDENTITY_REQUIRED', 'No proof has been submitted.');
    await tx.query('INSERT INTO app.identity_review_events(volunteer_id,actor_user_id,action,reason) VALUES($1,$2,$3,$4)', [volunteerId, actorId, status, reason]);
    return { status };
  });
}
export async function replaceOwnIdentity(userId: string, input: IdentityProofInput) {
  enabled();
  const applicant=await getPool().query(`SELECT a.volunteer_id FROM app.volunteer_applications a JOIN app.volunteers v ON v.id=a.volunteer_id JOIN app.people p ON p.id=v.person_id WHERE p.app_user_id=$1 AND a.status='PENDING'`,[userId]);
  if(!applicant.rows[0])throw new HttpError(403,'FORBIDDEN','Only your pending application may be updated.');
  const bytes = await validatedIdentityImage(input);
  const path = `replacement/${userId}/${randomUUID()}.jpg`;
  const store = await storage();
  // Reserve outside the transaction: never hold one pooled connection while waiting for another.
  const reservation=await getPool().query(`INSERT INTO app.identity_storage_objects(object_path) SELECT $1 WHERE (SELECT count(*) FROM app.identity_storage_objects WHERE object_path LIKE $2 AND created_at>now()-interval '1 hour')<6 RETURNING object_path`,[path,`replacement/${userId}/%`]);
  if(!reservation.rows[0])throw new HttpError(429,'IDENTITY_RATE_LIMITED','Try again later; replacement upload attempts are limited.');
  let oldPath: string | undefined;
  try {
    oldPath = await withTransaction(async tx => {
      const own = await tx.query(`SELECT a.volunteer_id FROM app.volunteer_applications a JOIN app.volunteers v ON v.id=a.volunteer_id JOIN app.people p ON p.id=v.person_id WHERE p.app_user_id=$1 AND a.status='PENDING' FOR UPDATE OF a`, [userId]);
      if (!own.rows[0]) throw new HttpError(403, 'FORBIDDEN', 'Only your pending application may be updated.');
      const id = own.rows[0].volunteer_id;
      const rate=await tx.query("SELECT count(*)::int AS count FROM app.identity_review_events WHERE volunteer_id=$1 AND action='REUPLOAD' AND created_at>now()-interval '1 hour'",[id]);
      if(rate.rows[0].count>=3)throw new HttpError(429,'IDENTITY_RATE_LIMITED','Try again later; three replacement uploads are allowed per hour.');
      const upload = await store.upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (upload.error) throw new HttpError(503, 'IDENTITY_STORAGE_UNAVAILABLE', 'Proof upload failed.');
      const previous = await tx.query('SELECT object_path FROM app.volunteer_identity_documents WHERE volunteer_id=$1', [id]);
      await tx.query(`INSERT INTO app.volunteer_identity_documents(volunteer_id,document_type,object_path) VALUES($1,$2,$3) ON CONFLICT(volunteer_id) DO UPDATE SET document_type=$2,object_path=$3,status='SUBMITTED',submitted_at=now(),reviewed_by=NULL,reviewed_at=NULL,reason=NULL`, [id,input.documentType,path]);
      await tx.query('INSERT INTO app.identity_review_events(volunteer_id,actor_user_id,action) VALUES($1,$2,$3)', [id,userId,'REUPLOAD']);
      return previous.rows[0]?.object_path;
    });
  } catch (error) { await store.remove([path]); throw error; }
  // The new reference is committed. Cleanup failure must never delete its bytes.
  if (oldPath) {
    try {
      const removed = await store.remove([oldPath]);
      if (removed.error) throw new Error('Superseded identity object cleanup failed.');
    } catch {
      console.error(JSON.stringify({ level: 'error', subsystem: 'identity', code: 'SUPERSEDED_PROOF_CLEANUP_PENDING' }));
    }
  }
  return { status: 'SUBMITTED' };
}
