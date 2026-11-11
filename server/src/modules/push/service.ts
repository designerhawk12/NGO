import { createHash, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool, withTransaction } from '../../db/pool';

export type PushKind = 'VOLUNTEER_APPLICATION' | 'FOOD_REQUEST' | 'PICKUP_SCHEDULED' |
  'DRIVER_ASSIGNED' | 'VOLUNTEER_ASSIGNED' | 'CREW_DECLINED' |
  'PICKUP_CANCELLED' | 'ASSIGNMENT_CLOSED' | 'PICKUP_RESCHEDULED' | 'PICKUP_STATUS';

const copy: Record<PushKind, { title: string; body: string }> = {
  VOLUNTEER_APPLICATION: { title: 'New Volunteer Request', body: 'A new volunteer has registered. KYC verification is pending.' },
  FOOD_REQUEST: { title: 'New Food Request', body: 'A donor has submitted a new food pickup request.' },
  PICKUP_SCHEDULED: { title: 'Food Request Accepted', body: 'Your food pickup has been scheduled. Tap to track its status.' },
  DRIVER_ASSIGNED: { title: 'New Pickup Assignment', body: 'You have received a new pickup assignment. Tap to Accept or Decline.' },
  VOLUNTEER_ASSIGNED: { title: 'New Volunteer Assignment', body: 'You have been assigned to a pickup crew. Tap to Accept or Decline.' },
  CREW_DECLINED: { title: 'Crew Assignment Declined', body: 'A crew member declined a pickup assignment. Review and reassign.' },
  PICKUP_CANCELLED: { title: 'Pickup Cancelled', body: 'A scheduled pickup was cancelled. Tap for the current status.' },
  ASSIGNMENT_CLOSED: { title: 'Assignment Closed', body: 'Your pickup assignment is no longer active. Tap for the current status.' },
  PICKUP_RESCHEDULED: { title: 'Pickup Rescheduled', body: 'Your pickup schedule changed. Tap for the current status.' },
  PICKUP_STATUS: { title: 'Pickup Status Updated', body: 'Your food pickup status changed. Tap to view the latest status.' },
};

export function validExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/.test(token);
}

export async function enqueuePush(client: PoolClient, kind: PushKind, entityId: string, eventKey: string,
  recipients: 'ADMINS' | { appUserIds?: string[]; personIds?: string[]; donorFoodRequestId?: string }) {
  const recipientSql = recipients === 'ADMINS'
    ? "SELECT id FROM app.app_users WHERE role='ADMIN'"
    : recipients.appUserIds ? 'SELECT id FROM app.app_users WHERE id=ANY($5::uuid[])'
      : recipients.personIds ? 'SELECT DISTINCT app_user_id AS id FROM app.people WHERE id=ANY($5::uuid[]) AND app_user_id IS NOT NULL'
        : `SELECT p.app_user_id AS id FROM app.food_requests fr JOIN app.donors d ON d.id=fr.donor_id
           JOIN app.people p ON p.id=d.person_id WHERE fr.id=$5 AND p.app_user_id IS NOT NULL`;
  const recipientArg = recipients === 'ADMINS' ? null : recipients.appUserIds ?? recipients.personIds ?? recipients.donorFoodRequestId;
  await client.query(`WITH recipients AS (${recipientSql}), inserted AS (
      INSERT INTO app.push_notifications(event_key,recipient_user_id,kind,entity_id,title,body)
      SELECT $1,r.id,$2,$3,$4,$6 FROM recipients r
      ON CONFLICT(event_key,recipient_user_id) DO NOTHING RETURNING id,recipient_user_id)
    INSERT INTO app.push_deliveries(notification_id,device_id)
    SELECT n.id,d.id FROM inserted n JOIN app.push_devices d ON d.app_user_id=n.recipient_user_id AND d.enabled
    ON CONFLICT DO NOTHING`, [eventKey,kind,entityId,copy[kind].title,recipientArg,copy[kind].body]);
}

export async function registerDevice(appUserId: string, deviceId: string, token: string, platform: 'android' | 'ios') {
  if (!validExpoToken(token)) throw new Error('INVALID_EXPO_TOKEN');
  return withTransaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[token]);
    // A reinstall or account switch must never leave the same token assigned to another user.
    const existing=await tx.query<{id:string}>('SELECT id FROM app.push_devices WHERE app_user_id=$1 AND device_id=$2 FOR UPDATE',[appUserId,deviceId]);
    await tx.query('DELETE FROM app.push_devices WHERE expo_token=$1 AND NOT (app_user_id=$2 AND device_id=$3)',[token,appUserId,deviceId]);
    if(existing.rows[0]){
      await tx.query(`UPDATE app.push_devices SET expo_token=$2,platform=$3,enabled=true,updated_at=now() WHERE id=$1`,[existing.rows[0].id,token,platform]);
    }else{
      const row=await tx.query(`INSERT INTO app.push_devices(app_user_id,device_id,expo_token,platform)
        VALUES($1,$2,$3,$4) RETURNING id`,[appUserId,deviceId,token,platform]);
      await tx.query(`INSERT INTO app.push_deliveries(notification_id,device_id)
        SELECT n.id,$2 FROM app.push_notifications n WHERE n.recipient_user_id=$1 AND n.created_at>now()-interval '7 days'
        ON CONFLICT DO NOTHING`,[appUserId,row.rows[0].id]);
    }
    return { registered: true };
  });
}

export async function unregisterDevice(appUserId: string, deviceId: string) {
  await getPool().query('DELETE FROM app.push_devices WHERE app_user_id=$1 AND device_id=$2',[appUserId,deviceId]);
  return { unregistered: true };
}

export async function inbox(appUserId: string, limit = 40) {
  const rows = await getPool().query(`SELECT id,kind,entity_id AS "entityId",title,body,read_at AS "readAt",created_at AS "createdAt"
    FROM app.push_notifications WHERE recipient_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,[appUserId,limit]);
  return { items: rows.rows };
}
export async function unreadCount(appUserId: string) {
  const rows = await getPool().query('SELECT count(*)::int AS count FROM app.push_notifications WHERE recipient_user_id=$1 AND read_at IS NULL',[appUserId]);
  return { count: rows.rows[0].count as number };
}
export async function markRead(appUserId: string, notificationId: string) {
  const row = await getPool().query('UPDATE app.push_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_user_id=$2 RETURNING id',[notificationId,appUserId]);
  return { updated: row.rowCount === 1 };
}

type Due = { id: string; notification_id: string; expo_token: string; title: string; body: string; kind: PushKind; entity_id: string; attempts: number };
const cleanCode = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_]{1,60}$/.test(value) ? value : 'PROVIDER_ERROR';
function delay(attempts: number) { return Math.min(3600, 30 * 2 ** Math.min(attempts,6)); }
async function failDelivery(id: string, code: string, retry: boolean, attempts: number, invalidateToken?: string) {
  await withTransaction(async tx => {
    await tx.query(`UPDATE app.push_deliveries SET state=$2,last_error=$3,locked_until=NULL,
      next_attempt_at=now()+($4::int * interval '1 second'),updated_at=now() WHERE id=$1`,
    [id,retry && attempts < 6 ? 'PENDING' : 'FAILED',code,delay(attempts)]);
    if(invalidateToken) await tx.query('UPDATE app.push_devices SET enabled=false,updated_at=now() WHERE expo_token=$1',[invalidateToken]);
  });
}

/** One bounded dispatch pass; safe for Vercel functions, never an in-process worker. */
export async function dispatchPush(limit = 10) {
  const rows = await withTransaction(async tx => {
    const result = await tx.query<Due>(`SELECT q.id,q.notification_id,d.expo_token,n.title,n.body,n.kind,n.entity_id,q.attempts
      FROM app.push_deliveries q JOIN app.push_devices d ON d.id=q.device_id
      JOIN app.push_notifications n ON n.id=q.notification_id
      WHERE q.state='PENDING' AND q.next_attempt_at<=now() AND d.enabled
      ORDER BY q.next_attempt_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT $1`,[Math.min(limit,25)]);
    for(const row of result.rows) await tx.query(`UPDATE app.push_deliveries SET state='SENDING',attempts=attempts+1,
      locked_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1`,[row.id]);
    return result.rows;
  });
  let accepted = 0;
  await Promise.all(rows.map(async row => {
    const attempts = row.attempts+1;
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({to:row.expo_token,title:row.title,body:row.body,sound:'default',channelId:'assignments',
          data:{notificationId:row.notification_id,kind:row.kind,entityId:row.entity_id}}),signal:AbortSignal.timeout(6500),
      });
      if(response.status===429 || response.status>=500) { await failDelivery(row.id,`HTTP_${response.status}`,true,attempts); return; }
      if(!response.ok) { await failDelivery(row.id,`HTTP_${response.status}`,false,attempts); return; }
      const payload = await response.json() as { data?: { status?: string; id?: string; details?: { error?: string } } | Array<{ status?: string; id?: string; details?: { error?: string } }> };
      const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
      if(ticket?.status==='ok' && ticket.id) {
        await getPool().query(`UPDATE app.push_deliveries SET state='TICKET',expo_ticket_id=$2,locked_until=NULL,updated_at=now()
          WHERE id=$1 AND state='SENDING'`,[row.id,ticket.id]); accepted++;
      } else {
        const code=cleanCode(ticket?.details?.error);
        await failDelivery(row.id,code,code!=='DeviceNotRegistered' && code!=='InvalidCredentials',attempts,
          code==='DeviceNotRegistered' ? row.expo_token : undefined);
      }
    } catch {
      // Ambiguous network outcome: Expo may already have accepted it. Do not blindly resend.
      await getPool().query(`UPDATE app.push_deliveries SET state='UNKNOWN',last_error='AMBIGUOUS_RESPONSE',locked_until=NULL,updated_at=now() WHERE id=$1`,[row.id]);
    }
  }));
  return { claimed:rows.length,accepted };
}

export async function dispatchBestEffort() {
  try { await dispatchPush(10); }
  catch { console.error(JSON.stringify({level:'error',subsystem:'push',code:'DISPATCH_DEFERRED'})); }
}

export async function checkReceipts(limit = 50) {
  const due = await getPool().query<{id:string;expo_ticket_id:string;attempts:number;expo_token:string}>(`SELECT q.id,q.expo_ticket_id,q.attempts,d.expo_token
    FROM app.push_deliveries q JOIN app.push_devices d ON d.id=q.device_id WHERE q.state='TICKET'
    AND q.updated_at < now()-interval '15 minutes' ORDER BY q.updated_at LIMIT $1`,[Math.min(limit,100)]);
  if(!due.rows.length)return {checked:0};
  const response=await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ids:due.rows.map(r=>r.expo_ticket_id)}),signal:AbortSignal.timeout(6500),
  });
  if(!response.ok) return {checked:0};
  const data=(await response.json() as {data?:Record<string,{status?:string;details?:{error?:string}}>}).data??{};
  let checked=0;
  for(const row of due.rows){
    const receipt=data[row.expo_ticket_id]; if(!receipt)continue;
    if(receipt.status==='ok') {
      await getPool().query("UPDATE app.push_deliveries SET state='DELIVERED',updated_at=now() WHERE id=$1",[row.id]); checked++;
    } else if(receipt.status==='error') {
      const code=cleanCode(receipt.details?.error);
      await failDelivery(row.id,code,code!=='DeviceNotRegistered' && code!=='InvalidCredentials',row.attempts,
        code==='DeviceNotRegistered'?row.expo_token:undefined); checked++;
    }
  }
  return {checked};
}

export async function recoverExpiredClaims() {
  // An interrupted send is ambiguous: leave for operator review, never duplicate automatically.
  const result=await getPool().query(`UPDATE app.push_deliveries SET state='UNKNOWN',last_error='SEND_INTERRUPTED',
    locked_until=NULL,updated_at=now() WHERE state='SENDING' AND locked_until<now()`);
  return result.rowCount??0;
}
export function secretMatches(input: string, expected: string | undefined) {
  return !!expected && timingSafeEqual(createHash('sha256').update(input).digest(),createHash('sha256').update(expected).digest());
}
