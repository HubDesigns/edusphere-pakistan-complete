import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=4000+Math.floor(Math.random()*900),B=`http://127.0.0.1:${PORT}`;
const dir=mkdtempSync(path.join(tmpdir(),'edu2-'));
const env={...process.env,DATA_DIR:dir,PORT:String(PORT),DEMO_ADMIN_PASSWORD:'AdminPass!2026',DEMO_OWNER_PASSWORD:'OwnerPass!2026'};
let server,admin;
const rnd=()=>Math.random().toString(36).slice(2,8);

async function login(email,password){const r=await fetch(B+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json().catch(()=>({}));return{status:r.status,cookie:(r.headers.get('set-cookie')||'').split(';')[0],csrf:j.csrfToken,user:j.user,error:j.error}}
const call=(s,m,p,b)=>fetch(B+p,{method:m,headers:{'content-type':'application/json',cookie:s.cookie,'x-csrf-token':s.csrf},body:b?JSON.stringify(b):undefined});
const J=async(s,m,p,b)=>{const r=await call(s,m,p,b);return{status:r.status,body:await r.json().catch(()=>null)}};

before(async()=>{
  execFileSync('node',['src/seed.js'],{cwd:root,env});
  server=spawn('node',['src/server.js'],{cwd:root,env,stdio:'ignore'});
  for(let i=0;i<50;i++){try{await fetch(B+'/api/v1/health');break}catch{await new Promise(r=>setTimeout(r,100))}}
  admin=await login('admin@edusphere.local','AdminPass!2026');
});
after(()=>{server?.kill();rmSync(dir,{recursive:true,force:true})});

/** a fresh institution with an owner, two classes and a few students */
async function school(){
  const id=rnd(),email=`owner-${id}@t.test`,pw='OwnerPass!2026';
  const t=(await J(admin,'POST','/api/v1/tenants',{name:`School ${id}`,institutionType:'school',ownerName:'Owner '+id,ownerEmail:email,ownerPassword:pw})).body.data;
  const owner=await login(email,pw);
  const A=(await J(owner,'POST','/api/v1/school/classes',{name:'Five',section:'A',academicYear:'2026-2027'})).body.data;
  const Bc=(await J(owner,'POST','/api/v1/school/classes',{name:'Six',section:'B',academicYear:'2026-2027'})).body.data;
  const mk=async(name,cls,phone)=>(await J(owner,'POST','/api/v1/school/students',{name,fatherName:'Father of '+name,classId:cls.id,guardianPhone:phone})).body.data;
  const ali=await mk('Ali',A,'0300-1111111'),sara=await mk('Sara',A,'0300-1111111'),omar=await mk('Omar',Bc,'0321-2222222');
  return{id,t,owner,A,Bc,ali,sara,omar,email,pw};
}
const addUser=(sc,body)=>J(sc.owner,'POST','/api/v1/school/users',{password:'StaffPass!2026',...body});
const monthsAgo=n=>{const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-n);return d.toISOString().slice(0,7)};

test('suspension is enforced for existing sessions and new logins',async()=>{
  const sc=await school();
  assert.equal((await J(sc.owner,'GET','/api/v1/school/classes')).status,200);
  await J(admin,'PATCH',`/api/v1/tenants/${sc.t.id}`,{status:'suspended'});
  assert.equal((await J(sc.owner,'GET','/api/v1/school/classes')).status,401,'old session is revoked');
  const again=await login(sc.email,sc.pw);assert.equal(again.status,403);assert.match(again.error,/suspended/i);
  await J(admin,'PATCH',`/api/v1/tenants/${sc.t.id}`,{status:'active'});
  assert.equal((await login(sc.email,sc.pw)).status,200);
});

test('login throttling is per account+IP and wrong passwords never reveal which emails exist',async()=>{
  const sc=await school();
  for(let i=0;i<8;i++)assert.equal((await login(sc.email,'wrong-password-'+i)).status,401);
  assert.equal((await login(sc.email,sc.pw)).status,429,'locked after 8 failures');
  const other=await school();assert.equal((await login(other.email,other.pw)).status,200,'other accounts unaffected');
  const a=await login('nobody@t.test','whatever-1234'),b=await login(other.email,'whatever-1234');
  assert.equal(a.error,b.error);
});

test('receipt numbers are sequential and unique even under concurrency',async()=>{
  const sc=await school();
  const rs=await Promise.all(Array.from({length:12},()=>J(sc.owner,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,amount:100})));
  assert.ok(rs.every(r=>r.status===201));
  const nos=rs.map(r=>r.body.data.receiptNo);assert.equal(new Set(nos).size,12);
  assert.deepEqual([...nos].sort(),Array.from({length:12},(_,i)=>'RCP-'+String(i+1).padStart(6,'0')));
});

test('input validation: dates, duplicates and junk fields',async()=>{
  const sc=await school();
  const rec=[{studentId:sc.ali.id,status:'present',junk:'x'.repeat(500)}];
  assert.equal((await J(sc.owner,'POST','/api/v1/school/attendance',{classId:sc.A.id,date:'2026-13-45',records:rec})).status,422);
  assert.equal((await J(sc.owner,'POST','/api/v1/school/attendance',{classId:sc.A.id,date:'2026-10-01',records:[rec[0],rec[0]]})).status,422);
  const ok=await J(sc.owner,'POST','/api/v1/school/attendance',{classId:sc.A.id,date:'2026-10-01',records:rec});
  assert.equal(ok.status,201);assert.deepEqual(Object.keys(ok.body.data.records[0]).sort(),['status','studentId']);
  assert.equal((await J(sc.owner,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,amount:1e300})).status,422);
  assert.equal((await J(sc.owner,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,amount:50,paidOn:'not-a-date'})).status,422);
});

test('roles: teacher is limited to assigned classes; accountant to fees; principal is read-only',async()=>{
  const sc=await school();
  const t=(await addUser(sc,{name:'Teacher T',email:`t-${sc.id}@t.test`,role:'teacher',classIds:[sc.A.id]})).body.data;
  const acc=await addUser(sc,{name:'Acc A',email:`a-${sc.id}@t.test`,role:'accountant'}),pri=await addUser(sc,{name:'Pri P',email:`p-${sc.id}@t.test`,role:'principal'});
  assert.equal(t.role,'teacher');assert.equal(acc.status,201);assert.equal(pri.status,201);
  const ts=await login(`t-${sc.id}@t.test`,'StaffPass!2026'),as=await login(`a-${sc.id}@t.test`,'StaffPass!2026'),ps=await login(`p-${sc.id}@t.test`,'StaffPass!2026');
  assert.ok(ts.user.permissions.includes('attendance.mark'));
  assert.deepEqual((await J(ts,'GET','/api/v1/school/classes')).body.data.map(k=>k.id),[sc.A.id]);
  assert.deepEqual((await J(ts,'GET','/api/v1/school/students')).body.data.map(s=>s.name).sort(),['Ali','Sara']);
  const rec=id=>[{studentId:id,status:'present'}];
  assert.equal((await J(ts,'POST','/api/v1/school/attendance',{classId:sc.A.id,date:'2026-10-02',records:rec(sc.ali.id)})).status,201);
  assert.equal((await J(ts,'POST','/api/v1/school/attendance',{classId:sc.Bc.id,date:'2026-10-02',records:rec(sc.omar.id)})).status,403);
  assert.equal((await J(ts,'GET',`/api/v1/school/attendance?classId=${sc.Bc.id}&date=2026-10-02`)).status,403);
  assert.equal((await J(ts,'POST','/api/v1/school/students',{name:'X',fatherName:'Y',classId:sc.A.id})).status,403);
  assert.equal((await J(ts,'GET','/api/v1/school/receipts')).status,403);
  assert.equal((await J(ts,'GET','/api/v1/school/users')).status,403);
  assert.equal((await J(ts,'POST','/api/v1/school/results',{studentId:sc.omar.id,subject:'Math',examName:'T1',marks:5,total:10})).status,403);
  assert.equal((await J(as,'POST','/api/v1/school/receipts',{studentId:sc.omar.id,amount:500})).status,201);
  assert.equal((await J(as,'POST','/api/v1/school/attendance',{classId:sc.A.id,date:'2026-10-02',records:rec(sc.ali.id)})).status,403);
  assert.equal((await J(as,'GET','/api/v1/school/salaries')).status,403);
  assert.equal((await J(ps,'GET','/api/v1/school/students')).body.data.length,3);
  assert.equal((await J(ps,'POST','/api/v1/school/classes',{name:'Seven',section:'A',academicYear:'2026'})).status,403);
  assert.equal((await J(ps,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,amount:5})).status,403);
});

test('staff logins: disable and password change end sessions; no cross-institution access; owner cannot be edited',async()=>{
  const sc=await school(),other=await school();
  const u=(await addUser(sc,{name:'Teach',email:`x-${sc.id}@t.test`,role:'teacher',classIds:[sc.A.id]})).body.data;
  const ts=await login(`x-${sc.id}@t.test`,'StaffPass!2026');assert.equal((await J(ts,'GET','/api/v1/school/classes')).status,200);
  assert.equal((await J(other.owner,'PATCH',`/api/v1/school/users/${u.id}`,{status:'disabled'})).status,404);
  assert.equal((await J(sc.owner,'PATCH',`/api/v1/school/users/${u.id}`,{status:'disabled'})).status,200);
  assert.equal((await J(ts,'GET','/api/v1/school/classes')).status,401);
  assert.equal((await login(`x-${sc.id}@t.test`,'StaffPass!2026')).status,401);
  assert.equal((await addUser(sc,{name:'Dup',email:`x-${sc.id}@T.test`,role:'teacher'})).status,409);
  assert.equal((await addUser(sc,{name:'Bad',email:`b-${sc.id}@t.test`,role:'institution_owner'})).status,422);
  assert.equal((await addUser(sc,{name:'Bad',email:`c-${sc.id}@t.test`,role:'teacher',classIds:[other.A.id]})).status,422);
  const list=(await J(sc.owner,'GET','/api/v1/school/users')).body.data;assert.ok(list.every(x=>!('passwordHash' in x)));
});

test('fee management: structure, discount, challans, partial payment, balances, fines, defaulters',async()=>{
  const sc=await school(),o=sc.owner,m=monthsAgo(2);
  assert.equal((await J(o,'POST','/api/v1/school/fee-structure',{classId:sc.A.id,name:'Tuition',amount:3000})).status,201);
  assert.equal((await J(o,'POST','/api/v1/school/fee-structure',{classId:sc.A.id,name:'tuition',amount:1})).status,409);
  await J(o,'POST','/api/v1/school/fee-structure',{classId:sc.A.id,name:'Transport',amount:1000});
  assert.equal((await J(o,'PATCH',`/api/v1/school/students/${sc.sara.id}/discount`,{discountPercent:25,discountNote:'Sibling'})).status,200);
  const sib=(await J(o,'GET','/api/v1/school/siblings')).body.data;assert.equal(sib.length,1);assert.equal(sib[0].students.length,2);
  await J(o,'PATCH','/api/v1/school/settings',{feeDueDay:10,lateFine:200});
  const g=await J(o,'POST','/api/v1/school/invoices/generate',{month:m,classId:'all'});
  assert.equal(g.body.created,2,'Ali and Sara; Omar has no fee structure');assert.equal(g.body.classesWithoutFees.length,1);
  assert.equal((await J(o,'POST','/api/v1/school/invoices/generate',{month:m,classId:'all'})).body.skippedExisting,2);
  const inv=(await J(o,'GET',`/api/v1/school/invoices?month=${m}`)).body.data,ali=inv.find(i=>i.studentId===sc.ali.id),sara=inv.find(i=>i.studentId===sc.sara.id);
  assert.equal(ali.total,4000);assert.equal(sara.discount,1000);assert.equal(sara.total,3000);assert.match(ali.voucherNo,/^FV-\d{4}-\d{6}$/);
  const p1=await J(o,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,invoiceId:ali.id,amount:1500,method:'JazzCash'});
  assert.equal(p1.status,201);assert.equal(p1.body.invoice.status,'partial');assert.equal(p1.body.invoice.balance,2500);
  assert.equal((await J(o,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,invoiceId:ali.id,amount:2600})).status,422,'cannot overpay');
  assert.equal((await J(o,'POST','/api/v1/school/receipts',{studentId:sc.sara.id,invoiceId:ali.id,amount:10})).status,422,'invoice must belong to the student');
  const d=(await J(o,'GET','/api/v1/school/defaulters')).body;assert.equal(d.data.length,2);assert.equal(d.total,2500+3000);assert.equal(d.data[0].name,'Sara');
  assert.equal((await J(o,'POST','/api/v1/school/invoices/late-fines')).body.count,2);
  assert.equal((await J(o,'POST','/api/v1/school/invoices/late-fines')).body.count,0,'idempotent');
  assert.equal((await J(o,'GET','/api/v1/school/defaulters')).body.total,2500+3000+400);
  assert.equal((await J(o,'DELETE',`/api/v1/school/invoices/${ali.id}`)).status,409,'paid-against challan cannot be removed');
  assert.equal((await J(o,'DELETE',`/api/v1/school/invoices/${sara.id}`)).status,200);
  const pay=await J(o,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,invoiceId:ali.id,amount:2700});assert.equal(pay.body.invoice.status,'paid');
  const d2=(await J(o,'GET','/api/v1/school/defaulters')).body;assert.equal(d2.data.length,0);
});

test('a verified voucher records the payment against the matching challan',async()=>{
  const sc=await school(),o=sc.owner,m=monthsAgo(1);
  await J(o,'POST','/api/v1/school/fee-structure',{classId:sc.A.id,name:'Tuition',amount:3000});
  await J(o,'POST','/api/v1/school/invoices/generate',{month:m,classId:sc.A.id});
  const v=(await J(o,'POST','/api/v1/school/vouchers',{studentId:sc.ali.id,voucherNo:'V-'+sc.id,feeMonth:m,amount:2000,method:'Bank deposit',paidOn:m+'-12',files:[]})).body.data;
  assert.ok(v.invoiceId);
  const r=await J(o,'PATCH',`/api/v1/school/vouchers/${v.id}`,{status:'verified'});
  assert.equal(r.body.paymentRecorded.amount,2000);
  const inv=(await J(o,'GET',`/api/v1/school/invoices?studentId=${sc.ali.id}`)).body.data[0];assert.equal(inv.status,'partial');assert.equal(inv.balance,1000);
  assert.equal((await J(o,'GET','/api/v1/school/receipts')).body.data.length,1);
});

test('audit trail: platform actions are visible to the institution, in readable words',async()=>{
  const sc=await school();
  await J(admin,'POST',`/api/v1/tenants/${sc.t.id}/reset-owner-password`,{newPassword:'BrandNewPass!2026'});
  const o=await login(sc.email,'BrandNewPass!2026');
  const logs=(await J(o,'GET','/api/v1/audit-logs')).body.data;
  const reset=logs.find(a=>a.action==='tenant.owner_password_reset');
  assert.ok(reset,'owner can see that the platform reset their password');assert.match(reset.message,/Platform Admin reset the owner/);
  await J(o,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,amount:4500});
  const logs2=(await J(o,'GET','/api/v1/audit-logs')).body.data;
  assert.match(logs2.find(a=>a.action==='fee_receipt.created').message,/Owner .* recorded Rs\. 4,500 from Ali/);
});

test('dashboards: institution numbers and platform overview',async()=>{
  const sc=await school(),o=sc.owner,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi'}).format(new Date());
  await J(o,'POST','/api/v1/school/attendance',{classId:sc.A.id,date:today,records:[{studentId:sc.ali.id,status:'present'},{studentId:sc.sara.id,status:'absent'}]});
  await J(o,'POST','/api/v1/school/receipts',{studentId:sc.ali.id,amount:700});
  const d=(await J(o,'GET','/api/v1/dashboard')).body;
  assert.equal(d.institution.name,`School ${sc.id}`);assert.equal(d.students.total,3);
  assert.equal(d.attendance.percent,50);assert.equal(d.attendance.absentees[0].name,'Sara');
  assert.deepEqual(d.attendance.unmarked.map(k=>k.name),['Six-B']);assert.equal(d.fees.collected,700);assert.equal(d.fees.trend.length,14);
  assert.ok(d.alerts.some(a=>/no attendance/.test(a.text)));
  assert.ok(d.recentActivity.every(a=>typeof a.message==='string'&&!/^auth/.test(a.message)));
  const t=await login(`nobody@t.test`,'x');void t;
  const pd=(await J(admin,'GET','/api/v1/dashboard')).body;
  assert.equal(pd.scope,'platform');assert.ok(pd.stats.length===4&&pd.growth.length===6&&Array.isArray(pd.attention));
  assert.ok(pd.tenants.every(x=>'studentCount' in x&&'trialDaysLeft' in x));
});

test('CSV import validates rows, supports dry run, and numbers admissions sequentially',async()=>{
  const sc=await school(),o=sc.owner;
  const rows=[{name:'Zain',fatherName:'Zahid',className:'Five',section:'A',guardianPhone:'03001234567'},{name:'Bad',fatherName:'Xavier',className:'Nine',section:'A'},{name:'Mina',fatherName:'Mahmood',className:'six',section:'b',dob:'2015-02-30'},{name:'Hira',fatherName:'Hameed',className:'Six',section:'B',admissionNo:'H-1'}];
  const dry=await J(o,'POST','/api/v1/school/students/import',{rows,dryRun:true});
  assert.equal(dry.body.valid,2);assert.equal(dry.body.errors.length,2);assert.equal(dry.body.created,0);
  assert.equal((await J(o,'GET','/api/v1/school/students')).body.data.length,3);
  const real=await J(o,'POST','/api/v1/school/students/import',{rows});assert.equal(real.status,201);assert.equal(real.body.created,2);
  const all=(await J(o,'GET','/api/v1/school/students')).body.data;assert.equal(all.length,5);
  assert.ok(all.find(s=>s.name==='Zain').admissionNo.startsWith('ADM-'));
  const dup=await J(o,'POST','/api/v1/school/students/import',{rows:[{name:'Again',fatherName:'Anwar',className:'Five',section:'A',admissionNo:'H-1'}]});
  assert.equal(dup.body.errors.length,1);
});

test('parent portal shows only the linked child and nothing else',async()=>{
  const sc=await school(),o=sc.owner,m=monthsAgo(1);
  await J(o,'POST','/api/v1/school/fee-structure',{classId:sc.A.id,name:'Tuition',amount:3000});await J(o,'POST','/api/v1/school/invoices/generate',{month:m,classId:'all'});
  assert.equal((await addUser(sc,{name:'Parent',email:`par-${sc.id}@t.test`,role:'parent',studentIds:[]})).status,422);
  assert.equal((await addUser(sc,{name:'Parent',email:`par-${sc.id}@t.test`,role:'parent',studentIds:[sc.ali.id]})).status,201);
  const ps=await login(`par-${sc.id}@t.test`,'StaffPass!2026');
  const kids=(await J(ps,'GET','/api/v1/portal/children')).body.data;
  assert.equal(kids.length,1);assert.equal(kids[0].student.name,'Ali');assert.equal(kids[0].fees.balance,3000);
  assert.equal((await J(ps,'GET','/api/v1/school/students')).status,403);
  assert.equal((await J(ps,'GET','/api/v1/school/invoices')).status,403);
  assert.equal((await J(o,'GET','/api/v1/portal/children')).status,403);
});

test('fee routes are tenant-isolated',async()=>{
  const a=await school(),b=await school();
  await J(a.owner,'POST','/api/v1/school/fee-structure',{classId:a.A.id,name:'Tuition',amount:3000});
  assert.equal((await J(b.owner,'POST','/api/v1/school/fee-structure',{classId:a.A.id,name:'Tuition',amount:1})).status,422);
  await J(a.owner,'POST','/api/v1/school/invoices/generate',{month:monthsAgo(1),classId:'all'});
  const inv=(await J(a.owner,'GET','/api/v1/school/invoices')).body.data[0];
  assert.equal((await J(b.owner,'GET','/api/v1/school/invoices')).body.data.length,0);
  assert.equal((await J(b.owner,'DELETE',`/api/v1/school/invoices/${inv.id}`)).status,404);
  assert.equal((await J(b.owner,'POST','/api/v1/school/receipts',{studentId:b.ali.id,invoiceId:inv.id,amount:10})).status,422);
  assert.equal((await J(admin,'GET','/api/v1/school/invoices')).status,403);
});
