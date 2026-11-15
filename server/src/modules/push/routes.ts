import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authenticate';
import { HttpError } from '../../middleware/errorHandler';
import { validateBody } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import { checkReceipts, dispatchPush, inbox, markRead, recoverExpiredClaims, registerDevice, secretMatches, unreadCount, unregisterDevice } from './service';

export const pushRoutes = Router();
const uuid = z.uuid();
function readId(value:unknown){const result=uuid.safeParse(value);if(!result.success)throw new HttpError(400,'VALIDATION_ERROR','A valid UUID is required.');return result.data;}
const device = z.strictObject({deviceId:uuid,token:z.string().min(20).max(256),platform:z.enum(['android','ios'])});
pushRoutes.put('/devices',requireAuth,validateBody(device),async(_req,res,next)=>{
  try {const b=res.locals.validatedBody; if(!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/.test(b.token))throw new HttpError(400,'INVALID_EXPO_TOKEN','Invalid Expo push token.');
    sendSuccess(res,await registerDevice(res.locals.appUser.id,b.deviceId,b.token,b.platform));
  }catch(error){next(error);}
});
pushRoutes.delete('/devices/:id',requireAuth,async(req,res,next)=>{
  try{const id=readId(req.params.id);sendSuccess(res,await unregisterDevice(res.locals.appUser.id,id));}catch(error){next(error);}
});
pushRoutes.get('/inbox',requireAuth,async(_req,res,next)=>{
  try{res.setHeader('Cache-Control','no-store');sendSuccess(res,await inbox(res.locals.appUser.id));}catch(error){next(error);}
});
pushRoutes.get('/unread-count',requireAuth,async(_req,res,next)=>{
  try{res.setHeader('Cache-Control','no-store');sendSuccess(res,await unreadCount(res.locals.appUser.id));}catch(error){next(error);}
});
pushRoutes.post('/inbox/:id/read',requireAuth,async(req,res,next)=>{
  try{sendSuccess(res,await markRead(res.locals.appUser.id,readId(req.params.id)));}catch(error){next(error);}
});
pushRoutes.get('/dispatch',async(req,res,next)=>{
  try{
    const expected=process.env.PUSH_DISPATCH_SECRET ?? process.env.CRON_SECRET;
    if(!secretMatches(req.headers.authorization??'',expected?`Bearer ${expected}`:undefined))throw new HttpError(401,'UNAUTHENTICATED','Dispatcher authorization required.');
    const recovered=await recoverExpiredClaims();
    const sent=await dispatchPush();
    const receipts=await checkReceipts();
    sendSuccess(res,{recovered,...sent,...receipts});
  }catch(error){next(error);}
});
