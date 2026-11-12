import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { HttpError } from '../../middleware/errorHandler';
import { sendSuccess } from '../../utils/response';
import { getPool, withTransaction } from '../../db/pool';
import { dispatchOne, outboxEnabled, verifySignature } from './service';

export const notificationRoutes = Router();
function enabled() { if (!outboxEnabled()) throw new HttpError(503,'NOTIFICATIONS_DISABLED','WhatsApp notifications are awaiting setup.'); }
function secretMatches(input: string, expected: string | undefined) {
  return !!expected && timingSafeEqual(createHash('sha256').update(input).digest(),createHash('sha256').update(expected).digest());
}
notificationRoutes.put('/preferences',requireAuth,validateBody(z.strictObject({ phoneE164:z.string().regex(/^\+[1-9][0-9]{7,14}$/), optedIn:z.boolean() })),async (_req,res,next)=>{
  try { enabled(); await getPool().query(`INSERT INTO app.whatsapp_preferences(app_user_id,phone_e164,opted_in,consent_version) VALUES($1,$2,$3,'whatsapp-v1') ON CONFLICT(app_user_id) DO UPDATE SET phone_e164=$2,opted_in=$3,updated_at=now(),consent_version='whatsapp-v1'`,[res.locals.appUser.id,res.locals.validatedBody.phoneE164,res.locals.validatedBody.optedIn]); sendSuccess(res,{saved:true}); }
  catch(error){next(error);}
});
notificationRoutes.get('/preferences',requireAuth,async (_req,res,next)=>{
  try{enabled();res.setHeader('Cache-Control','no-store');const row=await getPool().query('SELECT phone_e164 AS "phoneE164",opted_in AS "optedIn" FROM app.whatsapp_preferences WHERE app_user_id=$1',[res.locals.appUser.id]);sendSuccess(res,row.rows[0]??{phoneE164:'',optedIn:false});}catch(error){next(error);}
});
notificationRoutes.get('/outbox',requireAuth,requireRole('ADMIN'),async (_req,res,next)=>{
  try{enabled();res.setHeader('Cache-Control','no-store');const rows=await getPool().query('SELECT id,template_key,status,attempts,last_error,created_at,updated_at FROM app.notification_outbox ORDER BY created_at DESC LIMIT 100');sendSuccess(res,{items:rows.rows});}catch(error){next(error);}
});
notificationRoutes.post('/dispatch',async(req,res,next)=>{
  try{if(!secretMatches(req.headers.authorization??'',process.env.NOTIFICATION_DISPATCH_SECRET ? `Bearer ${process.env.NOTIFICATION_DISPATCH_SECRET}`:undefined))throw new HttpError(401,'UNAUTHENTICATED','Dispatcher authorization required.');sendSuccess(res,await dispatchOne());}catch(error){next(error);}
});
notificationRoutes.get('/webhook',(req,res,next)=>{
  if(req.query['hub.mode']==='subscribe' && typeof req.query['hub.verify_token']==='string' && secretMatches(req.query['hub.verify_token'],process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) && typeof req.query['hub.challenge']==='string')res.status(200).send(req.query['hub.challenge']);
  else next(new HttpError(403,'FORBIDDEN','Webhook verification failed.'));
});
notificationRoutes.post('/webhook',async(req,res,next)=>{
  try{
    enabled();const raw=(req as typeof req & {rawBody?:Buffer}).rawBody;
    if(!raw||!verifySignature(raw,String(req.headers['x-hub-signature-256']??''),process.env.WHATSAPP_APP_SECRET??''))throw new HttpError(401,'UNAUTHENTICATED','Invalid webhook signature.');
    await withTransaction(async tx=>{
      const event=await tx.query('INSERT INTO app.notification_webhook_events(event_hash) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_hash',[createHash('sha256').update(raw).digest('hex')]);
      if(!event.rows[0])return;
      for(const entry of req.body.entry??[])for(const change of entry.changes??[]){
        for(const status of change.value?.statuses??[]){
          if(!['sent','delivered','read','failed'].includes(status.status)||!/^\d+$/.test(String(status.timestamp)))continue;
          if(Math.abs(Date.now()-Number(status.timestamp)*1000)>7*24*3600*1000)continue;
          const nextStatus=String(status.status).toUpperCase();
          await tx.query(`UPDATE app.notification_outbox SET status=$2,updated_at=now() WHERE provider_message_id=$1 AND (($2='FAILED' AND status NOT IN ('DELIVERED','READ')) OR (CASE $2 WHEN 'READ' THEN 3 WHEN 'DELIVERED' THEN 2 ELSE 1 END) > (CASE status WHEN 'READ' THEN 3 WHEN 'DELIVERED' THEN 2 WHEN 'SENT' THEN 1 ELSE 0 END))`,[status.id,nextStatus]);
        }
        for(const message of change.value?.messages??[])if(/^\d{8,15}$/.test(message.from??'')&&/^(stop|unsubscribe)$/i.test(message.text?.body?.trim()??''))await tx.query('UPDATE app.whatsapp_preferences SET opted_in=false,updated_at=now() WHERE phone_e164=$1',[`+${message.from}`]);
      }
      await tx.query("DELETE FROM app.notification_webhook_events WHERE created_at < now()-interval '8 days'");
    });res.status(200).send('EVENT_RECEIVED');
  }catch(error){next(error);}
});
