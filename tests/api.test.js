import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=3900+Math.floor(Math.random()*90),B=`http://127.0.0.1:${PORT}`;
const dir=mkdtempSync(path.join(tmpdir(),'edu-'));
const env={...process.env,DATA_DIR:dir,PORT:String(PORT),DEMO_ADMIN_PASSWORD:'AdminPass!2026',DEMO_OWNER_PASSWORD:'OwnerPass!2026'};
let server;
const JPEG=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF,0xE0]),Buffer.alloc(200,1)]).toString('base64');
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),Buffer.alloc(50)]).toString('base64');

async function login(email,password){const r=await fetch(B+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json();return{status:r.status,cookie:(r.headers.get('set-cookie')||'').split(';')[0],csrf:j.csrfToken,user:j.user}}
const call=(s,m,p,b)=>fetch(B+p,{method:m,headers:{'content-type':'application/json',cookie:s.cookie,'x-csrf-token':s.csrf},body:b?JSON.stringify(b):undefined});
const json=async r=>({status:r.status,body:await r.json()});

before(async()=>{
  execFileSync('node',['src/seed.js'],{cwd:root,env});
  server=spawn('node',['src/server.js'],{cwd:root,env,stdio:'ignore'});
  for(let i=0;i<50;i++){try{await fetch(B+'/api/v1/health');return}catch{await new Promise(r=>setTimeout(r,100))}}
  throw new Error('server did not start');
});
after(()=>{server?.kill();rmSync(dir,{recursive:true,force:true})});

async function setup(){
  const admin=await login('admin@edusphere.local','AdminPass!2026'),owner=await login('owner@brightfuture.local','OwnerPass!2026');
  const cls=(await json(await call(owner,'POST','/api/v1/school/classes',{name:'Class '+Math.random().toString(36).slice(2,8),section:'A',academicYear:'2026-2027'}))).body.data;
  const st=(await json(await call(owner,'POST','/api/v1/school/students',{name:'Ali Raza',fatherName:'Raza Khan',classId:cls.id,admissionNo:'A-'+Math.random().toString(36).slice(2,9)}))).body.data;
  return{admin,owner,st};
}
const base=st=>({studentId:st.id,voucherNo:'CH-'+Math.random().toString(36).slice(2,8),feeMonth:'2026-10',amount:4500,method:'Bank deposit',paidOn:'2026-10-20',files:[{name:'slip.jpg',data:JPEG}]});

test('dashboard returns the institution name set by the platform admin',async()=>{
  const {admin}=await setup();
  const created=await json(await call(admin,'POST','/api/v1/tenants',{name:'Knowledge Academy',institutionType:'school',ownerName:'Sana Malik',ownerEmail:'sana@knowledge.test',ownerPassword:'SanaPass!2026'}));
  assert.equal(created.status,201);
  const sana=await login('sana@knowledge.test','SanaPass!2026');
  const d=await json(await call(sana,'GET','/api/v1/dashboard'));
  assert.equal(d.body.institution.name,'Knowledge Academy');
  assert.equal(sana.user.name,'Sana Malik');
});

test('voucher with photo is stored, listed, and the file is served back',async()=>{
  const {owner,st}=await setup();
  const c=await json(await call(owner,'POST','/api/v1/school/vouchers',base(st)));
  assert.equal(c.status,201);assert.equal(c.body.data.status,'pending');assert.equal(c.body.data.files[0].mime,'image/jpeg');
  assert.equal(c.body.data.files[0].path,undefined,'internal storage path must not leak');
  const list=await json(await call(owner,'GET','/api/v1/school/vouchers'));assert.equal(list.body.data.length,1);
  const f=c.body.data.files[0],r=await call(owner,'GET',`/api/v1/school/vouchers/${c.body.data.id}/files/${f.id}`);
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await r.arrayBuffer()).byteLength,204);
});

test('upload validation: wrong type, fake extension, oversize, too many, duplicate no.',async()=>{
  const {owner,st}=await setup();const U=Math.random().toString(36).slice(2,6);
  const html=Buffer.from('<script>alert(1)</script>').toString('base64');
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'X1'+U,files:[{name:'evil.jpg',data:html}]})).status,422);
  const big=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF]),Buffer.alloc(2.2*1024*1024)]).toString('base64');
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'X2'+U,files:[{name:'big.jpg',data:big}]})).status,422);
  const four=Array.from({length:4},()=>({name:'a.png',data:PNG}));
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'X3'+U,files:four})).status,422);
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'DUP'+U,files:[]})).status,201);
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'dup'+U,files:[]})).status,409);
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'X4'+U,feeMonth:'2026-13'})).status,422);
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'X5'+U,paidOn:'2026-02-31'})).status,422);
  assert.equal((await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'X6'+U,amount:-5})).status,422);
});

test('tenant isolation: another institution cannot list, read files of, or review a voucher',async()=>{
  const {admin,owner,st}=await setup();
  const c=(await json(await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'ISO-'+Math.random().toString(36).slice(2,7)}))).body.data;
  await call(admin,'POST','/api/v1/tenants',{name:'Other School',institutionType:'school',ownerName:'Other Owner',ownerEmail:'other@other.test',ownerPassword:'OtherPass!2026'});
  const other=await login('other@other.test','OtherPass!2026');
  assert.equal((await json(await call(other,'GET','/api/v1/school/vouchers'))).body.data.length,0);
  assert.equal((await call(other,'GET',`/api/v1/school/vouchers/${c.id}/files/${c.files[0].id}`)).status,404);
  assert.equal((await call(other,'PATCH',`/api/v1/school/vouchers/${c.id}`,{status:'verified'})).status,404);
  assert.equal((await call(admin,'GET','/api/v1/school/vouchers')).status,403,'platform admin has no school-scope access');
});

test('review: pending voucher can be verified once, then is locked',async()=>{
  const {owner,st}=await setup();
  const c=(await json(await call(owner,'POST','/api/v1/school/vouchers',{...base(st),voucherNo:'REV-'+Math.random().toString(36).slice(2,7),files:[]}))).body.data;
  assert.equal((await call(owner,'PATCH',`/api/v1/school/vouchers/${c.id}`,{status:'bogus'})).status,422);
  assert.equal((await call(owner,'PATCH',`/api/v1/school/vouchers/${c.id}`,{status:'verified'})).status,200);
  assert.equal((await call(owner,'PATCH',`/api/v1/school/vouchers/${c.id}`,{status:'rejected'})).status,409);
});

test('voucher writes need a CSRF token and a session',async()=>{
  const {owner,st}=await setup();
  const r=await fetch(B+'/api/v1/school/vouchers',{method:'POST',headers:{'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify(base(st))});
  assert.equal(r.status,403);
  assert.equal((await fetch(B+'/api/v1/school/vouchers')).status,401);
});

test('concurrent writes are no longer lost',async()=>{
  const {owner}=await setup();
  const rs=await Promise.all(Array.from({length:20},(_,i)=>call(owner,'POST','/api/v1/school/classes',{name:'P'+i,section:'Z',academicYear:'2026-2027'})));
  assert.ok(rs.every(r=>r.status===201));
  const list=(await json(await call(owner,'GET','/api/v1/school/classes'))).body.data.filter(k=>k.section==='Z');
  assert.equal(list.length,20);
});

test('oversized request body is rejected',async()=>{
  const {owner}=await setup();
  const r=await call(owner,'POST','/api/v1/school/classes',{name:'x'.repeat(1.2e6)});
  assert.equal(r.status,413);
});
