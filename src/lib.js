// Shared helpers: dates, numbering, money, audit wording, payments.
import {token} from './security.js';

export const pkDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export const validDate=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v};
export const validMonth=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const money=n=>Math.round(Number(n)*100)/100;
export const pad=(n,w=2)=>String(n).padStart(w,'0');
export const fmtRs=n=>'Rs. '+Number(n||0).toLocaleString('en-PK');
export const DAY=86400000;

/** Next per-institution sequential number, e.g. RCP-000012. Skips numbers already taken. */
export function nextNo(tn,key,prefix,exists=()=>false){
  tn.counters??={};let no;
  do{tn.counters[key]=(tn.counters[key]||0)+1;no=prefix+pad(tn.counters[key],6)}while(exists(no));
  return no;
}

export const invoiceBalance=i=>money(Number(i.total||0)-Number(i.paid||0));

/** Record a payment (optionally against an invoice). Mutates the store; caller writes it. */
export function applyPayment(s,tn,{studentId,invoiceId=null,amount,paidOn,description,method='Cash',actor,voucherId=null}){
  const tid=tn.id;let inv=null;
  if(invoiceId){
    inv=s.invoices.find(i=>i.id===invoiceId&&i.tenantId===tid);
    if(!inv||inv.studentId!==studentId)throw Object.assign(new Error('Invoice not found for this student'),{status:422});
    if(amount>invoiceBalance(inv)+0.001)throw Object.assign(new Error(`Amount exceeds the outstanding balance (${fmtRs(invoiceBalance(inv))})`),{status:422});
    inv.paid=money(inv.paid+amount);inv.status=invoiceBalance(inv)<=0.001?'paid':'partial';
  }
  const receipt={id:'rcp_'+token(8),tenantId:tid,receiptNo:nextNo(tn,'receipt','RCP-',n=>s.receipts.some(r=>r.tenantId===tid&&r.receiptNo===n)),studentId,invoiceId:inv?inv.id:null,voucherId,amount:money(amount),description:description||(inv?`Fee ${inv.voucherNo} (${inv.month})`:'Tuition fee'),method,paidOn,createdAt:new Date().toISOString(),createdBy:actor?.id||null};
  s.receipts.push(receipt);return{receipt,invoice:inv};
}

export function waPhone(p){const d=String(p||'').replace(/\D/g,'');if(d.length<7)return '';if(d.startsWith('92'))return d;if(d.startsWith('0'))return '92'+d.slice(1);return d}

/** Human-readable sentence for an audit entry. */
export function describeAudit(s,a){
  const who=!a.actorUserId||a.actorUserId==='system'?'System':(s.users.find(u=>u.id===a.actorUserId)?.name||'A user');
  const d=a.details||{};
  const stu=id=>s.students.find(x=>x.id===id)?.name||'a student';
  const cls=id=>{const k=s.classes.find(x=>x.id===id);return k?`${k.name}-${k.section}`:'a class'};
  switch(a.action){
    case 'auth.login':return `${who} signed in`;
    case 'auth.logout':return `${who} signed out`;
    case 'auth.login_failed':return `Failed sign-in attempt for ${d.email||'an account'}`;
    case 'demo.seeded':return 'Demo data created';
    case 'tenant.created':return `${who} created institution "${d.name||''}"`;
    case 'tenant.updated':return `${who} updated institution settings (${(d.changedFields||[]).join(', ')||'details'})`;
    case 'tenant.owner_account_configured':return `${who} set up the owner account (${d.email||''})`;
    case 'tenant.owner_password_reset':return `${who} reset the owner's password`;
    case 'class.created':return `${who} added class ${d.name||''}-${d.section||''}`;
    case 'student.admitted':return `${who} admitted ${stu(a.entityId)} (${d.admissionNo||''})`;
    case 'students.imported':return `${who} imported ${d.created||0} students from a file`;
    case 'attendance.saved':return `${who} saved attendance for ${cls(d.classId)} on ${d.date||''}`;
    case 'result.recorded':return `${who} recorded ${d.subject||'a'} marks for ${stu(d.studentId)} (${d.examName||''})`;
    case 'fee_receipt.created':return `${who} recorded ${fmtRs(d.amount)} from ${stu(d.studentId)}${d.receiptNo?' · '+d.receiptNo:''}`;
    case 'invoices.generated':return `${who} generated ${d.created||0} fee challans for ${d.month||''}`;
    case 'invoices.late_fines':return `${who} applied late fines to ${d.count||0} challans`;
    case 'invoice.deleted':return `${who} cancelled challan ${d.voucherNo||''}`;
    case 'fee_structure.added':return `${who} added fee head "${d.name||''}" (${fmtRs(d.amount)}) to ${cls(d.classId)}`;
    case 'fee_structure.removed':return `${who} removed fee head "${d.name||''}"`;
    case 'fee_settings.updated':return `${who} updated fee settings`;
    case 'student.discount':return `${who} set a ${d.discountPercent||0}% discount for ${stu(a.entityId)}`;
    case 'voucher.submitted':return `${who} submitted fee voucher ${d.voucherNo||''} (${fmtRs(d.amount)})`;
    case 'voucher.verified':return `${who} verified fee voucher ${d.voucherNo||''}`;
    case 'voucher.rejected':return `${who} rejected fee voucher ${d.voucherNo||''}`;
    case 'staff.created':return `${who} added staff member ${s.staff.find(x=>x.id===a.entityId)?.name||''}`;
    case 'salary.paid':return `${who} paid salary ${fmtRs(d.amount)} (${d.month||''})`;
    case 'user.created':return `${who} created a ${String(d.role||'').replace('_',' ')} login for ${d.email||''}`;
    case 'user.updated':return `${who} updated login ${d.email||''} (${(d.changed||[]).join(', ')})`;
    default:return `${who}: ${String(a.action).replaceAll('.',' ').replaceAll('_',' ')}`;
  }
}
export const withMessage=(s,a)=>({...a,actorName:!a.actorUserId||a.actorUserId==='system'?'System':(s.users.find(u=>u.id===a.actorUserId)?.name||'Unknown user'),message:describeAudit(s,a)});

export function tenantStats(s,t){
  const users=s.users.filter(u=>u.tenantId===t.id);
  const last=users.map(u=>u.lastLoginAt).filter(Boolean).sort().pop()||null;
  const trialEndsAt=t.trialEndsAt||new Date(new Date(t.createdAt).getTime()+14*DAY).toISOString();
  return{studentCount:s.students.filter(x=>x.tenantId===t.id&&x.status==='active').length,userCount:users.length,lastActiveAt:last,trialEndsAt,trialDaysLeft:t.subscriptionStatus==='trial'?Math.ceil((new Date(trialEndsAt).getTime()-Date.now())/DAY):null};
}
