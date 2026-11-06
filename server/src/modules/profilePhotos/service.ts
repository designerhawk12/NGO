import { randomUUID } from 'node:crypto';
import { PROFILE_PHOTO_MAX_BYTES, type ProfilePhotoLookup, type ProfilePhotoUrls, type UploadProfilePhoto } from '@aaharaconnect/shared';
import { getSupabaseAdminClient } from '../../auth/supabase';
import { getPool } from '../../db/pool';
import { HttpError } from '../../middleware/errorHandler';

export const PROFILE_PHOTO_BUCKET = 'profile-photos';
const SIGNED_URL_SECONDS = 60 * 60;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

/** Verifies the bytes really are the declared image type (the client-declared type is never trusted alone). */
export function detectImageType(bytes: Buffer): UploadProfilePhoto['contentType'] | null {
  if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const storage = getSupabaseAdminClient().storage;
  const existing = await storage.getBucket(PROFILE_PHOTO_BUCKET);
  if (existing.error || !existing.data) {
    const created = await storage.createBucket(PROFILE_PHOTO_BUCKET, {
      public: false, fileSizeLimit: PROFILE_PHOTO_MAX_BYTES, allowedMimeTypes: Object.keys(extensions),
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
      throw new HttpError(503, 'PHOTO_STORAGE_UNAVAILABLE', 'Photo storage is unavailable. Try again shortly.');
    }
  }
  bucketReady = true;
}

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!paths.length) return result;
  const { data, error } = await getSupabaseAdminClient().storage.from(PROFILE_PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return result; // A broken image must never break a page: callers fall back to the default avatar.
  for (const entry of data) if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  return result;
}

export async function getOwnPhotoUrl(appUserId: string): Promise<string | null> {
  const row = await getPool().query<{ photo_path: string | null }>('SELECT photo_path FROM app.app_users WHERE id = $1', [appUserId]);
  const path = row.rows[0]?.photo_path;
  return path ? (await signedUrls([path])).get(path) ?? null : null;
}

export async function setOwnPhoto(appUserId: string, input: UploadProfilePhoto): Promise<string | null> {
  const bytes = Buffer.from(input.dataBase64, 'base64');
  if (bytes.length === 0 || bytes.length > PROFILE_PHOTO_MAX_BYTES) {
    throw new HttpError(413, 'PHOTO_TOO_LARGE', `Choose a smaller picture (limit ${Math.round(PROFILE_PHOTO_MAX_BYTES / 1024)} KB).`);
  }
  const detected = detectImageType(bytes);
  if (!detected || detected !== input.contentType) {
    throw new HttpError(415, 'PHOTO_TYPE_UNSUPPORTED', 'Use a JPEG, PNG or WebP picture.');
  }
  await ensureBucket();
  const path = `${appUserId}/${randomUUID()}.${extensions[detected]}`;
  const storage = getSupabaseAdminClient().storage.from(PROFILE_PHOTO_BUCKET);
  const upload = await storage.upload(path, bytes, { contentType: detected, upsert: false });
  if (upload.error) throw new HttpError(503, 'PHOTO_STORAGE_UNAVAILABLE', 'Could not store the picture. Try again shortly.');
  const previous = await getPool().query<{ photo_path: string | null }>(
    `WITH old AS (SELECT photo_path FROM app.app_users WHERE id = $1 FOR UPDATE)
     UPDATE app.app_users u SET photo_path = $2, photo_content_type = $3, photo_updated_at = now(), updated_at = now()
       FROM old WHERE u.id = $1 RETURNING old.photo_path`,
    [appUserId, path, detected]
  );
  const oldPath = previous.rows[0]?.photo_path;
  if (oldPath && oldPath !== path) await storage.remove([oldPath]);
  return (await signedUrls([path])).get(path) ?? null;
}

const lookupSql: Record<ProfilePhotoLookup['kind'], string> = {
  DONOR: 'SELECT r.id, u.photo_path FROM app.donors r JOIN app.app_users u ON u.id = r.app_user_id WHERE r.id = ANY($1::uuid[]) AND u.photo_path IS NOT NULL',
  VOLUNTEER: 'SELECT r.id, u.photo_path FROM app.volunteers r JOIN app.people p ON p.id = r.person_id JOIN app.app_users u ON u.id = p.app_user_id WHERE r.id = ANY($1::uuid[]) AND u.photo_path IS NOT NULL',
  DRIVER: 'SELECT r.id, u.photo_path FROM app.drivers r JOIN app.people p ON p.id = r.person_id JOIN app.app_users u ON u.id = p.app_user_id WHERE r.id = ANY($1::uuid[]) AND u.photo_path IS NOT NULL',
};

/** Admin lookup of display URLs keyed by donor / volunteer / driver record id. Records without photos are omitted. */
export async function lookupPhotoUrls(input: ProfilePhotoLookup): Promise<ProfilePhotoUrls> {
  const rows = await getPool().query<{ id: string; photo_path: string }>(lookupSql[input.kind], [input.ids]);
  const urls = await signedUrls(rows.rows.map(row => row.photo_path));
  const out: ProfilePhotoUrls = {};
  for (const row of rows.rows) { const url = urls.get(row.photo_path); if (url) out[row.id] = url; }
  return out;
}
