import { closePool } from './pool';
import { maintainIdentityStorage } from '../modules/volunteers/identityMaintenance';
maintainIdentityStorage(process.argv.includes('--apply')).then(result=>console.info(JSON.stringify({task:'identity-retention',...result})))
  .catch(()=>{console.error(JSON.stringify({task:'identity-retention',error:'CLEANUP_FAILED_OR_APPROVAL_REQUIRED'}));process.exitCode=1;}).finally(()=>closePool());
