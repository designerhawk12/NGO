import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool, withTransaction } from '../../db/pool';

export type NotificationTemplate = 'donation_received' | 'volunteer_assignment' | 'driver_assignment' | 'volunteer_application';
export const outboxEnabled = () => process.env.NOTIFICATION_OUTBOX_ENABLED === 'true';
export function safeAppPath(kind: NotificationTemplate, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid notification reference');
  if (kind === 'donation_received') return `/open/donation/${id}`;
  if (kind === 'volunteer_assignment') return `/open/volunteer/${id}`;
  if (kind === 'driver_assignment') return `/open/driver/${id}`;
  return '/#/workspace/volunteers';
}
/** A savepoint isolates outbox failures from the already validated core operation. */
export async function enqueue(tx: PoolClient, template: NotificationTemplate, entityId: string, userIds: string[], when?: string) {
  if (!outboxEnabled()) return;
  await tx.query('SAVEPOINT notification_event');
  try {
    const admin = template === 'volunteer_application';
    const recipients: (string | null)[] = admin ? [null] : [...new Set(userIds)];
    for (const recipient of recipients) {
      await tx.query(`INSERT INTO app.notification_outbox(event_key,recipient_user_id,admin_recipient,template_key,parameters)
        SELECT $1,$2,$3,$4,$5::jsonb WHERE $3 OR EXISTS(SELECT 1 FROM app.whatsapp_preferences WHERE app_user_id=$2 AND opted_in)
        ON CONFLICT(event_key) DO NOTHING`, [`${template}:${entityId}:${recipient ?? 'admin'}`,recipient,admin,template,JSON.stringify({ reference: entityId.slice(0,8).toUpperCase(), when: when ?? '', path: safeAppPath(template,entityId) })]);
    }
    await tx.query('RELEASE SAVEPOINT notification_event');
  } catch {
    await tx.query('ROLLBACK TO SAVEPOINT notification_event');
    await tx.query('RELEASE SAVEPOINT notification_event');
    console.error(JSON.stringify({ level: 'error', subsystem: 'notifications', code: 'OUTBOX_ENQUEUE_FAILED', template }));
  }
}
export async function enqueueForPeople(tx: PoolClient, template: NotificationTemplate, entityId: string, personIds: string[], when: string) {
  if (!outboxEnabled() || personIds.length === 0) return;
  await tx.query('SAVEPOINT notification_people');
  try {
    const people = await tx.query<{ app_user_id: string }>('SELECT app_user_id FROM app.people WHERE id=ANY($1::uuid[]) AND app_user_id IS NOT NULL', [personIds]);
    await enqueue(tx,template,entityId,people.rows.map(row => row.app_user_id),when);
    await tx.query('RELEASE SAVEPOINT notification_people');
  } catch {
    await tx.query('ROLLBACK TO SAVEPOINT notification_people');
    await tx.query('RELEASE SAVEPOINT notification_people');
    console.error(JSON.stringify({level:'error',subsystem:'notifications',code:'OUTBOX_ENQUEUE_FAILED',template}));
  }
}
export function verifySignature(raw: Buffer, signature: string, secret: string) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256',secret).update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
export function retryDelay(attempt: number) { return Math.min(3600,30 * 2 ** Math.max(0,attempt - 1)); }

export async function dispatchOne(onlyId?: string) {
  if (!outboxEnabled() || process.env.WHATSAPP_SENDING_ENABLED !== 'true') return { processed: 0, disabled: true };
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const sender = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!token || !sender || !/^\d+$/.test(sender) || !version || !/^v\d+\.\d+$/.test(version) || !origin || new URL(origin).protocol !== 'https:') return { processed: 0, configurationRequired: true };
  const row = await withTransaction(async tx => {
    // Ambiguous crashed sends need reconciliation, never blind resending.
    await tx.query("UPDATE app.notification_outbox SET status='UNKNOWN',last_error='SEND_OUTCOME_UNKNOWN',updated_at=now() WHERE status='SENDING' AND locked_until < now()");
    const rate = await tx.query("UPDATE app.notification_dispatch_rate SET next_send_at=now()+interval '1 second' WHERE id=1 AND next_send_at<=now() RETURNING id");
    if (!rate.rows[0]) return null;
    const claimed = await tx.query(`WITH candidate AS (SELECT id FROM app.notification_outbox WHERE status='PENDING' AND next_attempt_at<=now() AND ($1::uuid IS NULL OR id=$1) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE app.notification_outbox o SET status='SENDING',attempts=attempts+1,locked_until=now()+interval '30 seconds',updated_at=now() FROM candidate c WHERE o.id=c.id RETURNING o.*`,[onlyId??null]);
    return claimed.rows[0] ?? null;
  });
  if (!row) return { processed: 0 };
  let phone: string | undefined;
  if (row.admin_recipient && process.env.WHATSAPP_ADMIN_OPTED_IN === 'true') phone = process.env.WHATSAPP_ADMIN_PHONE;
  if (!row.admin_recipient) {
    const pref = await getPool().query('SELECT phone_e164 FROM app.whatsapp_preferences WHERE app_user_id=$1 AND opted_in AND updated_at <= $2', [row.recipient_user_id,row.created_at]);
    phone = pref.rows[0]?.phone_e164;
  }
  const template = process.env[`WHATSAPP_TEMPLATE_${String(row.template_key).toUpperCase()}`];
  if (!phone || !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    await getPool().query("UPDATE app.notification_outbox SET status='SKIPPED',last_error='NO_ACTIVE_OPT_IN',updated_at=now() WHERE id=$1",[row.id]);
    return { processed: 1 };
  }
  if (!template || !/^[a-z0-9_]+$/.test(template)) {
    await getPool().query("UPDATE app.notification_outbox SET status='FAILED',last_error='TEMPLATE_NOT_CONFIGURED',updated_at=now() WHERE id=$1",[row.id]);
    return { processed: 1 };
  }
  const values = [row.parameters.reference, row.parameters.when || 'Pending review', new URL(row.parameters.path,origin).href];
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${sender}/messages`, {
      method:'POST',headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json' },signal:AbortSignal.timeout(8000),
      body:JSON.stringify({ messaging_product:'whatsapp',to:phone.slice(1),type:'template',template:{name:template,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en'},components:[{type:'body',parameters:values.map(text=>({type:'text',text}))}]} }),
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      await getPool().query(`UPDATE app.notification_outbox SET status=$2,last_error=$3,next_attempt_at=now()+$4::int*interval '1 second',updated_at=now() WHERE id=$1`,[row.id,retryable && row.attempts < 6 ? 'PENDING':'FAILED',`PROVIDER_HTTP_${response.status}`,retryDelay(row.attempts)]);
    } else {
      const body = await response.json() as { messages?: { id?: string }[] };
      const messageId = body.messages?.[0]?.id;
      await getPool().query('UPDATE app.notification_outbox SET status=$2,provider_message_id=$3,last_error=$4,updated_at=now() WHERE id=$1',[row.id,messageId ? 'SENT':'UNKNOWN',messageId ?? null,messageId ? null:'SEND_OUTCOME_UNKNOWN']);
    }
  } catch {
    await getPool().query("UPDATE app.notification_outbox SET status='UNKNOWN',last_error='SEND_OUTCOME_UNKNOWN',updated_at=now() WHERE id=$1",[row.id]);
  }
  return { processed: 1 };
}
