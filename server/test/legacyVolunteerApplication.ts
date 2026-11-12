import type { Pool } from 'pg';
/** These regression fixtures represent accounts approved before identity onboarding. */
export async function seedLegacyApprovedApplication(db: Pool, volunteerId: string, reviewerId: string) {
  const shape=await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='volunteer_applications' AND column_name='identity_required'");
  await db.query(shape.rows.length
    ? "INSERT INTO app.volunteer_applications(volunteer_id,status,reviewed_at,reviewed_by,identity_required) VALUES($1,'APPROVED',now(),$2,false)"
    : "INSERT INTO app.volunteer_applications(volunteer_id,status,reviewed_at,reviewed_by) VALUES($1,'APPROVED',now(),$2)",[volunteerId,reviewerId]);
}
