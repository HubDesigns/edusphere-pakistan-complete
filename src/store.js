import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));export const DATA_DIR=process.env.DATA_DIR||path.resolve(here,'../data');export const DB_FILE=path.join(DATA_DIR,'store.json');
const empty=()=>({users:[],tenants:[],memberships:[],classes:[],students:[],attendance:[],results:[],receipts:[],vouchers:[],feeStructures:[],invoices:[],staff:[],salaryPayments:[],auditLogs:[],counters:{audit:1}});
export async function readStore(){await fs.mkdir(DATA_DIR,{recursive:true});try{const s=JSON.parse(await fs.readFile(DB_FILE,'utf8'));for(const k of ['users','tenants','memberships','classes','students','attendance','results','receipts','vouchers','feeStructures','invoices','staff','salaryPayments','auditLogs'])s[k]??=[];s.counters??={audit:1};return s;}catch(e){if(e.code!=='ENOENT')throw e;const s=empty();await writeStore(s);return s;}}
export async function writeStore(s){await fs.mkdir(DATA_DIR,{recursive:true});const tmp=DB_FILE+'.tmp';await fs.writeFile(tmp,JSON.stringify(s,null,2),{mode:0o600});await fs.rename(tmp,DB_FILE);}
export function audit(s,actor,action,entityType,entityId,details={}){const tenantId=actor?.tenantId||null;s.auditLogs.push({id:'aud_'+s.counters.audit++,actorUserId:actor?.id||null,tenantId,action,entityType,entityId,details,createdAt:new Date().toISOString()});
// keep at most 2,000 entries per institution (and 2,000 platform-level) so one busy school can't push out another's history
let n=0;for(const a of s.auditLogs)if(a.tenantId===tenantId)n++;
if(n>2000){const i=s.auditLogs.findIndex(a=>a.tenantId===tenantId);if(i>=0)s.auditLogs.splice(i,1)}}
