// Dashboard payloads: platform admin overview and role-aware institution overview.
import {PERMISSIONS} from './security.js';
import {pkDate,money,DAY,invoiceBalance,tenantStats,withMessage} from './lib.js';

const monthKey=d=>pkDate(d).slice(0,7);

export function buildDashboard(s,user){
  if(user.role==='platform_admin')return platform(s);
  if(user.role==='parent')return{scope:'parent'};
  return institution(s,user);
}

function platform(s){
  const now=Date.now();
  const rows=s.tenants.map(t=>({id:t.id,name:t.name,slug:t.slug,institutionType:t.institutionType,status:t.status,plan:t.plan,subscriptionStatus:t.subscriptionStatus,createdAt:t.createdAt,...tenantStats(s,t)}));
  const inactive=rows.filter(t=>t.status==='active'&&(t.lastActiveAt?now-new Date(t.lastActiveAt).getTime()>14*DAY:now-new Date(t.createdAt).getTime()>14*DAY));
  const trials=rows.filter(t=>t.subscriptionStatus==='trial'&&t.status==='active');
  const trialsEnding=trials.filter(t=>t.trialDaysLeft!==null&&t.trialDaysLeft<=7);
  const growth=[];for(let i=5;i>=0;i--){const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-i);const k=d.toISOString().slice(0,7);growth.push({month:k,count:rows.filter(t=>String(t.createdAt).slice(0,7)===k).length})}
  const attention=[
    ...trialsEnding.map(t=>({level:t.trialDaysLeft<0?'danger':'warn',tenantId:t.id,text:t.trialDaysLeft<0?`${t.name}: trial ended ${-t.trialDaysLeft} day(s) ago`:`${t.name}: trial ends in ${t.trialDaysLeft} day(s)`})),
    ...inactive.map(t=>({level:'warn',tenantId:t.id,text:`${t.name}: no sign-in for 14+ days`})),
    ...rows.filter(t=>t.status==='suspended').map(t=>({level:'info',tenantId:t.id,text:`${t.name} is suspended`}))];
  return{scope:'platform',
    stats:[{key:'institutions',label:'Institutions',value:rows.length,note:`${rows.filter(t=>t.status==='active').length} active`},
      {key:'students',label:'Students on platform',value:rows.reduce((n,t)=>n+t.studentCount,0),note:`${rows.reduce((n,t)=>n+t.userCount,0)} user accounts`},
      {key:'trials',label:'Trials ending in 7 days',value:trialsEnding.length,note:`${trials.length} on trial`},
      {key:'inactive',label:'Inactive 14+ days',value:inactive.length,note:'Active but not signing in'}],
    tenants:rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,8),growth,attention,
    recentActivity:s.auditLogs.filter(a=>!String(a.action).startsWith('auth.')).slice(-10).reverse().map(a=>{const w=withMessage(s,a);return{id:w.id,message:w.message,action:a.action,entityType:a.entityType,createdAt:w.createdAt}})};
}

function institution(s,user){
  const tid=user.tenantId,perms=PERMISSIONS[user.role]||[],has=p=>perms.includes(p),tn=s.tenants.find(t=>t.id===tid);
  const mine=user.role==='teacher'?new Set(user.classIds||[]):null,ok=id=>!mine||mine.has(id);
  const day=pkDate(),month=day.slice(0,7);
  const classes=s.classes.filter(k=>k.tenantId===tid&&ok(k.id)),students=s.students.filter(z=>z.tenantId===tid&&z.status==='active'&&ok(z.classId));
  const label=k=>`${k.name}-${k.section}`;
  const out={scope:'institution',role:user.role,permissions:perms,institution:tn?{name:tn.name,type:tn.institutionType,status:tn.status}:null,
    students:{total:students.length,perClass:classes.map(k=>({id:k.id,name:label(k),count:students.filter(z=>z.classId===k.id).length}))},alerts:[]};

  if(has('attendance.view')){
    const recs=s.attendance.filter(a=>a.tenantId===tid&&a.date===day&&ok(a.classId));
    const cnt={present:0,absent:0,late:0,leave:0};recs.forEach(a=>(a.records||[]).forEach(r=>{if(cnt[r.status]!==undefined)cnt[r.status]++}));
    const marked=cnt.present+cnt.absent+cnt.late+cnt.leave,markedIds=new Set(recs.map(a=>a.classId));
    const unmarked=classes.filter(k=>!markedIds.has(k.id)&&students.some(z=>z.classId===k.id));
    const absentees=[];for(const a of recs)for(const r of a.records||[])if(r.status==='absent'){const st=students.find(z=>z.id===r.studentId),k=classes.find(z=>z.id===a.classId);if(st)absentees.push({studentId:st.id,name:st.name,fatherName:st.fatherName,admissionNo:st.admissionNo,className:k?label(k):'',guardianPhone:st.guardianPhone||''})}
    out.attendance={date:day,marked,...cnt,percent:marked?Math.round((cnt.present+cnt.late)/marked*100):null,classesTotal:classes.filter(k=>students.some(z=>z.classId===k.id)).length,classesMarked:markedIds.size,unmarked:unmarked.map(k=>({id:k.id,name:label(k)})),absentees:absentees.slice(0,50)};
    if(unmarked.length&&has('attendance.mark'))out.alerts.push({level:'warn',text:`${unmarked.length} class${unmarked.length>1?'es have':' has'} no attendance yet today`,action:'attendance'});
  }
  if(has('fees.view')){
    const inv=s.invoices.filter(i=>i.tenantId===tid&&ok(i.classId)),rc=s.receipts.filter(r=>r.tenantId===tid);
    const expected=money(inv.filter(i=>i.month===month).reduce((n,i)=>n+i.total,0)),collected=money(rc.filter(r=>String(r.paidOn).startsWith(month)).reduce((n,r)=>n+Number(r.amount||0),0));
    const overdue=inv.filter(i=>invoiceBalance(i)>0.001&&i.dueDate<day),defaulters=new Set(overdue.map(i=>i.studentId));
    const trend=[];for(let i=13;i>=0;i--){const d=pkDate(new Date(Date.now()-i*DAY));trend.push({date:d,amount:money(rc.filter(r=>r.paidOn===d).reduce((n,r)=>n+Number(r.amount||0),0))})}
    out.fees={month,expected,collected,rate:expected?Math.min(100,Math.round(collected/expected*100)):null,outstanding:money(inv.reduce((n,i)=>n+invoiceBalance(i),0)),defaulterCount:defaulters.size,defaulterAmount:money(overdue.reduce((n,i)=>n+invoiceBalance(i),0)),challans:inv.filter(i=>i.month===month).length,trend};
    if(defaulters.size)out.alerts.push({level:'danger',text:`${defaulters.size} student${defaulters.size>1?'s have':' has'} overdue fees (Rs. ${out.fees.defaulterAmount.toLocaleString('en-PK')})`,action:'defaulters'});
  }
  if(has('vouchers.view')){const n=s.vouchers.filter(v=>v.tenantId===tid&&v.status==='pending').length;out.pendingVouchers=n;if(n&&has('vouchers.manage'))out.alerts.push({level:'info',text:`${n} fee voucher${n>1?'s':''} waiting for verification`,action:'vouchers'})}
  if(has('salaries.manage')&&Number(day.slice(8,10))>=25){const paid=new Set(s.salaryPayments.filter(p=>p.tenantId===tid&&p.month===month).map(p=>p.staffId)),due=s.staff.filter(z=>z.tenantId===tid&&z.status==='active'&&!paid.has(z.id)).length;if(due)out.alerts.push({level:'warn',text:`${due} staff member${due>1?'s':''} not yet paid for ${month}`,action:'salary'})}
  if(user.role==='institution_owner'||user.role==='principal'){
    out.recentActivity=s.auditLogs.filter(a=>a.tenantId===tid&&!String(a.action).startsWith('auth.')).slice(-8).reverse().map(a=>{const w=withMessage(s,a);return{id:w.id,message:w.message,action:a.action,entityType:a.entityType,createdAt:w.createdAt}});
  }
  out.stats=[{label:'Total Students',value:students.length,key:'students'},{label:'Present Today',value:out.attendance?.present||0,key:'present'},{label:'Absent Today',value:out.attendance?.absent||0,key:'absent'},{label:'Fee Collected',value:out.fees?.collected||0,key:'fees'}];
  out.tenants=[];out.recentActivity??=[];
  return out;
}
