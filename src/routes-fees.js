// Fee management: fee heads per class, settings, monthly challans (invoices), payments, late fines, defaulters.
import {token} from './security.js';
import {pkDate,validDate,validMonth,money,pad,nextNo,invoiceBalance,applyPayment,waPhone} from './lib.js';

const METHODS=['Cash','Bank deposit','JazzCash','Easypaisa','Raast','Cheque','Other'];
const fail=(ctx,status,error)=>{ctx.send(ctx.res,status,{error});return true};
const withBalance=i=>({...i,balance:invoiceBalance(i)});

export default async function feeRoutes(ctx){
  const {req,res,url,s,c,send,readBody,need,classOk,tn,writeStore,audit}=ctx,tid=c.user.tenantId,p=url.pathname,m=req.method;
  if(!p.startsWith('/api/v1/school/'))return false;
  const inScope=st=>classOk(st.classId);

  // ---- settings ----
  if(p==='/api/v1/school/settings'&&m==='GET'){if(!need('fees.view'))return true;return send(res,200,{data:{feeDueDay:10,lateFine:0,bankDetails:'',...(tn.settings||{})}}),true}
  if(p==='/api/v1/school/settings'&&m==='PATCH'){
    if(!need('fees.manage'))return true;const x=await readBody(req),cur={feeDueDay:10,lateFine:0,bankDetails:'',...(tn.settings||{})};
    if(x.feeDueDay!==undefined){const d=Number(x.feeDueDay);if(!Number.isInteger(d)||d<1||d>28)return fail(ctx,422,'Due day must be between 1 and 28');cur.feeDueDay=d}
    if(x.lateFine!==undefined){const f=Number(x.lateFine);if(!Number.isFinite(f)||f<0||f>100000)return fail(ctx,422,'Late fine must be between 0 and 100,000');cur.lateFine=money(f)}
    if(x.bankDetails!==undefined)cur.bankDetails=String(x.bankDetails).trim().slice(0,300);
    tn.settings=cur;audit(s,c.user,'fee_settings.updated','tenant',tid,{});await writeStore(s);return send(res,200,{data:cur}),true;
  }

  // ---- fee structure ----
  if(p==='/api/v1/school/fee-structure'&&m==='GET'){if(!need('fees.view'))return true;return send(res,200,{data:s.feeStructures.filter(f=>f.tenantId===tid)}),true}
  if(p==='/api/v1/school/fee-structure'&&m==='POST'){
    if(!need('fees.manage'))return true;const x=await readBody(req),name=String(x.name||'').trim(),amount=Number(x.amount),classId=String(x.classId||'');
    if(!s.classes.some(k=>k.id===classId&&k.tenantId===tid))return fail(ctx,422,'Choose a class from your institution');
    if(name.length<1||name.length>60)return fail(ctx,422,'Enter a fee name (e.g. Tuition fee)');
    if(!Number.isFinite(amount)||amount<=0||amount>1e7)return fail(ctx,422,'Enter a valid monthly amount');
    if(s.feeStructures.some(f=>f.tenantId===tid&&f.classId===classId&&f.name.toLowerCase()===name.toLowerCase()))return fail(ctx,409,'This class already has a fee with that name');
    const item={id:'fee_'+token(8),tenantId:tid,classId,name,amount:money(amount),createdAt:new Date().toISOString()};
    s.feeStructures.push(item);audit(s,c.user,'fee_structure.added','fee_structure',item.id,{classId,name,amount:item.amount});await writeStore(s);return send(res,201,{data:item}),true;
  }
  let mm=p.match(/^\/api\/v1\/school\/fee-structure\/([^/]+)$/);
  if(mm&&m==='DELETE'){
    if(!need('fees.manage'))return true;const i=s.feeStructures.findIndex(f=>f.id===decodeURIComponent(mm[1])&&f.tenantId===tid);if(i<0)return fail(ctx,404,'Fee not found');
    const [gone]=s.feeStructures.splice(i,1);audit(s,c.user,'fee_structure.removed','fee_structure',gone.id,{name:gone.name,classId:gone.classId});await writeStore(s);return send(res,200,{ok:true}),true;
  }

  // ---- student discounts / siblings ----
  mm=p.match(/^\/api\/v1\/school\/students\/([^/]+)\/discount$/);
  if(mm&&m==='PATCH'){
    if(!need('fees.manage'))return true;const st=s.students.find(z=>z.id===decodeURIComponent(mm[1])&&z.tenantId===tid);if(!st)return fail(ctx,404,'Student not found');
    const x=await readBody(req),pct=Number(x.discountPercent);if(!Number.isFinite(pct)||pct<0||pct>100)return fail(ctx,422,'Discount must be between 0 and 100 percent');
    st.discountPercent=money(pct);st.discountNote=String(x.discountNote||'').trim().slice(0,80);audit(s,c.user,'student.discount','student',st.id,{discountPercent:st.discountPercent});await writeStore(s);return send(res,200,{data:st}),true;
  }
  if(p==='/api/v1/school/siblings'&&m==='GET'){
    if(!need('fees.view'))return true;const groups=new Map();
    for(const st of s.students.filter(z=>z.tenantId===tid&&z.status==='active')){const ph=waPhone(st.guardianPhone);if(!ph)continue;(groups.get(ph)||groups.set(ph,[]).get(ph)).push(st)}
    const data=[...groups].filter(([,l])=>l.length>1).map(([phone,l])=>({phone,students:l.map(st=>({id:st.id,name:st.name,classId:st.classId,discountPercent:st.discountPercent||0}))}));
    return send(res,200,{data}),true;
  }

  // ---- invoices (monthly challans) ----
  if(p==='/api/v1/school/invoices/generate'&&m==='POST'){
    if(!need('fees.manage'))return true;const x=await readBody(req),month=String(x.month||''),classId=String(x.classId||'all');
    if(!validMonth(month))return fail(ctx,422,'Choose a valid month');
    if(classId!=='all'&&!s.classes.some(k=>k.id===classId&&k.tenantId===tid))return fail(ctx,422,'Choose a class from your institution');
    const dueDay=(tn.settings?.feeDueDay)||10,dueDate=`${month}-${pad(dueDay)}`,prefix=`FV-${month.slice(2,4)}${month.slice(5,7)}-`;
    let created=0,skippedExisting=0;const noStructure=new Set();
    for(const st of s.students.filter(z=>z.tenantId===tid&&z.status==='active'&&(classId==='all'||z.classId===classId))){
      const heads=s.feeStructures.filter(f=>f.tenantId===tid&&f.classId===st.classId);
      if(!heads.length){noStructure.add(st.classId);continue}
      if(s.invoices.some(i=>i.tenantId===tid&&i.studentId===st.id&&i.month===month)){skippedExisting++;continue}
      const gross=money(heads.reduce((n,h)=>n+h.amount,0)),discount=money(gross*(st.discountPercent||0)/100);
      s.invoices.push({id:'inv_'+token(8),tenantId:tid,voucherNo:nextNo(tn,'invoice',prefix,n=>s.invoices.some(i=>i.tenantId===tid&&i.voucherNo===n)),studentId:st.id,classId:st.classId,month,items:heads.map(h=>({name:h.name,amount:h.amount})),gross,discount,discountNote:st.discountNote||'',lateFine:0,total:money(gross-discount),paid:0,status:'unpaid',dueDate,createdAt:new Date().toISOString()});created++;
    }
    audit(s,c.user,'invoices.generated','invoice',month,{month,created,classId});await writeStore(s);
    return send(res,201,{created,skippedExisting,classesWithoutFees:[...noStructure].map(id=>{const k=s.classes.find(z=>z.id===id);return k?`${k.name}-${k.section}`:id})}),true;
  }
  if(p==='/api/v1/school/invoices'&&m==='GET'){
    if(!need('fees.view'))return true;const q=url.searchParams,month=q.get('month'),classId=q.get('classId'),status=q.get('status'),studentId=q.get('studentId'),today=pkDate();
    let list=s.invoices.filter(i=>i.tenantId===tid&&classOk(i.classId));
    if(month)list=list.filter(i=>i.month===month);if(classId)list=list.filter(i=>i.classId===classId);if(studentId)list=list.filter(i=>i.studentId===studentId);
    if(status==='overdue')list=list.filter(i=>invoiceBalance(i)>0.001&&i.dueDate<today);else if(status)list=list.filter(i=>i.status===status);
    return send(res,200,{data:list.slice(-2000).map(withBalance)}),true;
  }
  if(p==='/api/v1/school/invoices/late-fines'&&m==='POST'){
    if(!need('fees.manage'))return true;const fine=Number(tn.settings?.lateFine||0);if(fine<=0)return fail(ctx,422,'Set a late fine amount in Fee settings first');
    const today=pkDate();let count=0;
    for(const i of s.invoices.filter(z=>z.tenantId===tid&&invoiceBalance(z)>0.001&&z.dueDate<today&&!z.lateFine)){i.lateFine=fine;i.total=money(i.total+fine);if(i.status==='paid')i.status='partial';count++}
    audit(s,c.user,'invoices.late_fines','invoice','bulk',{count});await writeStore(s);return send(res,200,{count}),true;
  }
  mm=p.match(/^\/api\/v1\/school\/invoices\/([^/]+)$/);
  if(mm&&m==='DELETE'){
    if(!need('fees.manage'))return true;const i=s.invoices.findIndex(z=>z.id===decodeURIComponent(mm[1])&&z.tenantId===tid);if(i<0)return fail(ctx,404,'Challan not found');
    if(s.invoices[i].paid>0)return fail(ctx,409,'This challan already has payments and cannot be cancelled');
    const [gone]=s.invoices.splice(i,1);audit(s,c.user,'invoice.deleted','invoice',gone.id,{voucherNo:gone.voucherNo});await writeStore(s);return send(res,200,{ok:true}),true;
  }

  // ---- defaulters ----
  if(p==='/api/v1/school/defaulters'&&m==='GET'){
    if(!need('fees.view'))return true;const today=pkDate(),by=new Map();
    for(const i of s.invoices.filter(z=>z.tenantId===tid&&classOk(z.classId)&&invoiceBalance(z)>0.001&&z.dueDate<today)){const e=by.get(i.studentId)||{studentId:i.studentId,balance:0,months:[],oldestDue:i.dueDate,invoiceCount:0};e.balance=money(e.balance+invoiceBalance(i));e.months.push(i.month);e.invoiceCount++;if(i.dueDate<e.oldestDue)e.oldestDue=i.dueDate;by.set(i.studentId,e)}
    const data=[...by.values()].map(e=>{const st=s.students.find(z=>z.id===e.studentId),k=s.classes.find(z=>z.id===st?.classId);return{...e,months:e.months.sort(),name:st?.name||'Unknown',admissionNo:st?.admissionNo||'',fatherName:st?.fatherName||'',className:k?`${k.name}-${k.section}`:'',guardianPhone:st?.guardianPhone||''}}).sort((a,b)=>b.balance-a.balance);
    return send(res,200,{data,total:money(data.reduce((n,d)=>n+d.balance,0))}),true;
  }

  // ---- payments / receipts ----
  if(p==='/api/v1/school/receipts'&&m==='POST'){
    if(!need('fees.record'))return true;const x=await readBody(req),studentId=String(x.studentId||''),amount=Number(x.amount),paidOn=String(x.paidOn||pkDate()),method=METHODS.includes(x.method)?x.method:'Cash',invoiceId=x.invoiceId?String(x.invoiceId):null;
    const st=s.students.find(z=>z.id===studentId&&z.tenantId===tid&&inScope(z));
    if(!st)return fail(ctx,422,'Choose a student from your institution');
    if(!Number.isFinite(amount)||amount<=0||amount>1e8)return fail(ctx,422,'Enter a valid amount');
    if(!validDate(paidOn))return fail(ctx,422,'Enter a valid payment date');
    try{
      const {receipt,invoice}=applyPayment(s,tn,{studentId,invoiceId,amount,paidOn,description:String(x.description||'').trim().slice(0,120)||undefined,method,actor:c.user});
      audit(s,c.user,'fee_receipt.created','receipt',receipt.id,{studentId,amount:receipt.amount,receiptNo:receipt.receiptNo,invoiceId});await writeStore(s);
      return send(res,201,{data:receipt,invoice:invoice?withBalance(invoice):null}),true;
    }catch(e){if(e.status)return fail(ctx,e.status,e.message);throw e}
  }
  return false;
}
