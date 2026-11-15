import { getPool, withTransaction } from '../../db/pool';
import { getSupabaseAdminClient } from '../../auth/supabase';
import { IDENTITY_BUCKET } from './identity';
/** Dry-run is the default. No Production document deletion without explicit policy approval. */
export async function maintainIdentityStorage(apply = false) {
  if(apply && process.env.IDENTITY_DELETION_APPROVED !== 'true') throw new Error('Identity deletion requires approved NGO retention policy and explicit operational approval.');
  const candidates=await getPool().query<{object_path:string}>(`SELECT o.object_path FROM app.identity_storage_objects o
    LEFT JOIN app.volunteer_identity_documents d ON d.object_path=o.object_path
    LEFT JOIN app.volunteer_applications a ON a.volunteer_id=d.volunteer_id
    WHERE (d.volunteer_id IS NULL AND o.created_at<now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM app.identity_registration_attempts r WHERE r.object_path=o.object_path AND r.expires_at>now()))
      OR (a.status IN ('APPROVED','DENIED') AND COALESCE(d.reviewed_at,a.reviewed_at)<now()-interval '30 days') LIMIT 100`);
  let deleted=0;
  if(apply)for(const row of candidates.rows){
    await withTransaction(async tx=>{
      // Recheck eligibility while serialized with replacements/reviews before removal.
      const doc=await tx.query(`SELECT d.volunteer_id FROM app.volunteer_identity_documents d JOIN app.volunteer_applications a ON a.volunteer_id=d.volunteer_id WHERE d.object_path=$1 AND a.status IN ('APPROVED','DENIED') AND COALESCE(d.reviewed_at,a.reviewed_at)<now()-interval '30 days' FOR UPDATE OF a,d`,[row.object_path]);
      if(!doc.rows[0]){
        const bound=await tx.query('SELECT 1 FROM app.volunteer_identity_documents WHERE object_path=$1 UNION ALL SELECT 1 FROM app.identity_registration_attempts WHERE object_path=$1 AND expires_at>now()',[row.object_path]);
        if(bound.rows[0])return;
      }
      const removed=await getSupabaseAdminClient().storage.from(IDENTITY_BUCKET).remove([row.object_path]);
      if(removed.error)throw new Error('Private storage cleanup failed; retry required.');
      if(doc.rows[0]){
        await tx.query("UPDATE app.volunteer_identity_documents SET status='DELETED' WHERE object_path=$1",[row.object_path]);
        await tx.query("INSERT INTO app.identity_review_events(volunteer_id,action) VALUES($1,'RETENTION_DELETE')",[doc.rows[0].volunteer_id]);
      }
      await tx.query('DELETE FROM app.identity_storage_objects WHERE object_path=$1',[row.object_path]);
      deleted++;
    });
  }
  return { candidates:candidates.rows.length,deleted,dryRun:!apply };
}
