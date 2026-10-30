// Staff / parent logins, teacher class assignment, parent portal, CSV student import.
import {token,hashPassword,PERMISSIONS,hasPermission} from './security.js';
import {pkDate,validDate,money,nextNo,invoiceBalance,DAY} from './lib.js';

const ROLES=['principal','teacher','accountant','parent'];
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail=(ctx,status,error)=>{ctx.send(ctx.res,status,{error});return true};
const safe=u=>({id:u.id,name:u.name,email:u.email,role:u.role,status:u.status,classIds:u.classIds||[],studentIds:u.studentIds||[],lastLoginAt:u.lastLoginAt||null,createdAt:u.createdAt});

export default async function peopleRoutes(ctx){
  const {req,res,url,s,c,send,readBody,need,tn,writeStore,audit,sessions}=ctx,tid=c.user.tenantId,p=url.pathname,m=req.method;

  // ---- parent portal ----
  if(p==='/api/v1/portal/children'&&m==='GET'){
    if(!hasPermission(c.user,'portal.parent.view'))return fail(ctx,403,'You do not have permission to perform this action');
    const today=pkDate(),since=pkDate(new Date(Date.now()-30*DAY));
    const data=(c.user.studentIds||[]).map(id=>s.students.find(z=>z.id===id&&z.tenantId===tid)).filter(Boolean).map(st=>{
      const k=s.classes.find(z=>z.id===st.classId),days=[];
      for(const a of s.attendance.filter(z=>z.tenantId===tid&&z.classId===st.classId&&z.date>=since&&z.date<=today)){const r=(a.records||[]).find(z=>z.studentId===st.id);if(r)days.push({date:a.date,status:r.status})}
      days.sort((a,b)=>b.date.localeCompare(a.date));const cnt={present:0,absent:0,late:0,leave:0};days.forEach(d=>cnt[d.status]++);
      const inv=s.invoices.filter(i=>i.tenantId===tid&&i.studentId===st.id).sort((a,b)=>b.month.localeCompare(a.month));
      return{student:{id:st.id,name:st.name,admissionNo:st.admissionNo,className:k?`${k.name}-${k.section}`:''},attendance:{last30:cnt,marked:days.length,percent:days.length?Math.round((cnt.present+cnt.late)/days.length*100):null,recent:days.slice(0,10)},
        fees:{balance:money(inv.reduce((n,i)=>n+invoiceBalance(i),0)),invoices:inv.slice(0,6).map(i=>({voucherNo:i.voucherNo,month:i.month,total:i.total,paid:i.paid,balance:invoiceBalance(i),dueDate:i.dueDate,status:i.status}))},
        results:s.results.filter(r=>r.tenantId===tid&&r.studentId===st.id).slice(-30).map(r=>({examName:r.examName,subject:r.subject,marks:r.marks,total:r.total,percentage:r.percentage}))};
    });
    return send(res,200,{data}),true;
  }
  if(!p.startsWith('/api/v1/school/'))return false;

  // ---- logins ----
  if(p==='/api/v1/school/users'&&m==='GET'){if(!need('users.view'))return true;return send(res,200,{data:s.users.filter(u=>u.tenantId===tid&&u.id!==c.user.id).map(safe)}),true}
  if(p==='/api/v1/school/users'&&m==='POST'){
    if(!need('users.manage'))return true;const x=await readBody(req),name=String(x.name||'').trim(),email=String(x.email||'').trim().toLowerCase(),password=String(x.password||''),role=String(x.role||'');
    if(name.length<2||name.length>120)return fail(ctx,422,'Enter the full name');
    if(!EMAIL.test(email))return fail(ctx,422,'Enter a valid email');
    if(password.length<10||password.length>200)return fail(ctx,422,'Password must be at least 10 characters');
    if(!ROLES.includes(role))return fail(ctx,422,'Choose a role');
    if(s.users.some(u=>u.email.toLowerCase()===email))return fail(ctx,409,'This email already has an account');
    const classIds=role==='teacher'?[...new Set((x.classIds||[]).map(String))]:[],studentIds=role==='parent'?[...new Set((x.studentIds||[]).map(String))]:[];
    if(classIds.some(id=>!s.classes.some(k=>k.id===id&&k.tenantId===tid)))return fail(ctx,422,'One of the selected classes is not in your institution');
    if(studentIds.some(id=>!s.students.some(k=>k.id===id&&k.tenantId===tid)))return fail(ctx,422,'One of the selected students is not in your institution');
    if(role==='parent'&&!studentIds.length)return fail(ctx,422,'Link the parent to at least one student');
    const now=new Date().toISOString(),u={id:'usr_'+token(12),name,email,passwordHash:await hashPassword(password),role,tenantId:tid,status:'active',classIds,studentIds,createdAt:now};
    s.users.push(u);s.memberships.push({userId:u.id,tenantId:tid,role,status:'active'});audit(s,c.user,'user.created','user',u.id,{email,role});await writeStore(s);return send(res,201,{data:safe(u)}),true;
  }
  let mm=p.match(/^\/api\/v1\/school\/users\/([^/]+)$/);
  if(mm&&m==='PATCH'){
    if(!need('users.manage'))return true;const u=s.users.find(z=>z.id===decodeURIComponent(mm[1])&&z.tenantId===tid);
    if(!u||u.id===c.user.id||u.role==='institution_owner')return fail(ctx,404,'User not found');
    const x=await readBody(req),changed=[];
    if(x.name!==undefined){const n=String(x.name).trim();if(n.length<2||n.length>120)return fail(ctx,422,'Enter the full name');u.name=n;changed.push('name')}
    if(x.status!==undefined){if(!['active','disabled'].includes(x.status))return fail(ctx,422,'Invalid status');u.status=x.status;changed.push('status')}
    if(x.password!==undefined){const pw=String(x.password);if(pw.length<10||pw.length>200)return fail(ctx,422,'Password must be at least 10 characters');u.passwordHash=await hashPassword(pw);u.passwordChangedAt=new Date().toISOString();changed.push('password')}
    if(x.classIds!==undefined&&u.role==='teacher'){const ids=[...new Set((x.classIds||[]).map(String))];if(ids.some(id=>!s.classes.some(k=>k.id===id&&k.tenantId===tid)))return fail(ctx,422,'One of the selected classes is not in your institution');u.classIds=ids;changed.push('classes')}
    if(x.studentIds!==undefined&&u.role==='parent'){const ids=[...new Set((x.studentIds||[]).map(String))];if(!ids.length||ids.some(id=>!s.students.some(k=>k.id===id&&k.tenantId===tid)))return fail(ctx,422,'Link the parent to valid students of your institution');u.studentIds=ids;changed.push('students')}
    if(changed.some(k=>['status','password'].includes(k)))for(const [k,v] of sessions)if(v.userId===u.id)sessions.delete(k);
    audit(s,c.user,'user.updated','user',u.id,{email:u.email,changed});await writeStore(s);return send(res,200,{data:safe(u)}),true;
  }

  // ---- CSV / spreadsheet import ----
  if(p==='/api/v1/school/students/import'&&m==='POST'){
    if(!need('students.manage'))return true;const x=await readBody(req),rows=Array.isArray(x.rows)?x.rows:[],dry=x.dryRun===true;
    if(!rows.length)return fail(ctx,422,'The file has no rows');if(rows.length>1000)return fail(ctx,422,'Import at most 1,000 students at a time');
    const classes=s.classes.filter(k=>k.tenantId===tid).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),taken=new Set(s.students.filter(z=>z.tenantId===tid).map(z=>z.admissionNo)),errors=[],ready=[];
    rows.forEach((r,idx)=>{
      const row=idx+2,name=String(r.name||'').trim(),father=String(r.fatherName||'').trim(),cname=String(r.className||'').trim().toLowerCase(),sec=String(r.section||'A').trim().toLowerCase(),dob=String(r.dob||'').trim();
      const k=classes.find(z=>z.name.toLowerCase()===cname&&z.section.toLowerCase()===sec);
      if(name.length<2)return errors.push({row,message:'Student name is required'});
      if(father.length<2)return errors.push({row,message:'Father / guardian name is required'});
      if(!k)return errors.push({row,message:`Class "${r.className||''}" section "${r.section||'A'}" does not exist - create it first`});
      if(dob&&!validDate(dob))return errors.push({row,message:'Date of birth must be YYYY-MM-DD'});
      let adm=String(r.admissionNo||'').trim();if(adm&&taken.has(adm))return errors.push({row,message:`Admission number ${adm} already exists`});
      if(adm)taken.add(adm);
      ready.push({name,father,k,dob,adm,phone:String(r.guardianPhone||'').trim().slice(0,20)});
    });
    let created=0;
    if(!dry){
      for(const r of ready){const adm=r.adm||nextNo(tn,'admission','ADM-',n=>taken.has(n));taken.add(adm);s.students.push({id:'stu_'+token(8),tenantId:tid,admissionNo:adm,name:r.name,fatherName:r.father,classId:r.k.id,dob:r.dob,guardianPhone:r.phone,status:'active',createdAt:new Date().toISOString()});created++}
      if(created){audit(s,c.user,'students.imported','student','bulk',{created});await writeStore(s)}
    }
    return send(res,dry?200:201,{dryRun:dry,valid:ready.length,created,errors}),true;
  }
  return false;
}
