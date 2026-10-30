// Fee management: challans, generation, fee structure, defaulters, settings & discounts.
let feesTab='challans',feesToken=0,feeSettings={feeDueDay:10,lateFine:0,bankDetails:''};
const feeStatus=i=>i.status==='paid'?'paid':(i.balance>0.001&&i.dueDate<pakistanDate()?'overdue':i.status);
const statusPill=s=>`<span class="status status-${s==='paid'?'verified':s==='partial'?'pending':s==='overdue'?'rejected':'pending'}">${escapeHtml(s)}</span>`;
const PAY_METHODS=['Cash','Bank deposit','JazzCash','Easypaisa','Raast','Cheque','Other'];

async function renderFees(tab){
  if(tab)feesTab=tab;
  const my=++feesToken,panel=$('#fees-panel');
  document.querySelectorAll('[data-fees-tab]').forEach(b=>b.classList.toggle('btn-primary',b.dataset.feesTab===feesTab));
  panel.innerHTML='<p class="muted">Loading…</p>';
  try{
    await getSchoolData();
    const s=await schoolApi('settings').catch(()=>({data:feeSettings}));feeSettings=s.data;
    if(my!==feesToken)return;
    if(feesTab==='challans')await feesChallans(my);else if(feesTab==='generate')feesGenerate();else if(feesTab==='structure')await feesStructure(my);else if(feesTab==='defaulters')await feesDefaulters(my);else if(feesTab==='settings')await feesSettings(my);
  }catch(e){toast(e.message,'error')}
}
document.querySelectorAll('[data-fees-tab]').forEach(b=>b.addEventListener('click',()=>renderFees(b.dataset.feesTab)));

const classSelect=(name='classId',all=true)=>`<select name="${name}">${all?'<option value="all">All classes</option>':''}${schoolClasses.map(k=>`<option value="${escapeHtml(k.id)}">${escapeHtml(k.name)} - ${escapeHtml(k.section)}</option>`).join('')}</select>`;

// ---------- challans ----------
let challanCache=[];
async function feesChallans(my){
  const panel=$('#fees-panel');
  panel.innerHTML=`<h3>Fee challans</h3><form id="challan-filter" class="school-form filters"><label>Month<input name="month" type="month" value="${pakistanMonth()}"></label><label>Class<select name="classId"><option value="">All classes</option>${schoolClasses.map(k=>`<option value="${escapeHtml(k.id)}">${escapeHtml(k.name)} - ${escapeHtml(k.section)}</option>`).join('')}</select></label><label>Status<select name="status"><option value="">All</option><option value="unpaid">Unpaid</option><option value="partial">Partly paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></label><label>Search student<input name="q" placeholder="Name or admission no."></label></form><div id="challan-summary" class="foot-stats"></div><div id="challan-table"></div>`;
  const form=$('#challan-filter');
  const load=async()=>{
    const f=Object.fromEntries(new FormData(form)),qs=new URLSearchParams();['month','classId','status'].forEach(k=>f[k]&&qs.set(k,f[k]));
    const d=await schoolApi('invoices?'+qs);if(my!==feesToken)return;
    const q=(f.q||'').toLowerCase();
    challanCache=d.data.filter(i=>!q||`${studentLabel(i.studentId)} ${(schoolStudents.find(s=>s.id===i.studentId)||{}).admissionNo||''} ${i.voucherNo}`.toLowerCase().includes(q));
    const tot=challanCache.reduce((n,i)=>({b:n.b+i.total,p:n.p+i.paid,r:n.r+i.balance}),{b:0,p:0,r:0});
    $('#challan-summary').innerHTML=`<span>${challanCache.length} challans</span><span>Billed: <b>${fmtRs(tot.b)}</b></span><span>Collected: <b>${fmtRs(tot.p)}</b></span><span>Balance: <b>${fmtRs(tot.r)}</b></span>${challanCache.length?'<button class="btn btn-secondary btn-small" id="print-all-challans">Print all shown</button>':''}`;
    $('#challan-table').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Challan</th><th>Student</th><th>Class</th><th>Month</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>${challanCache.map(i=>{const st=feeStatus(i);return `<tr><td><strong>${escapeHtml(i.voucherNo)}</strong></td><td>${escapeHtml(studentLabel(i.studentId))}</td><td>${escapeHtml(classLabel(i.classId))}</td><td>${escapeHtml(i.month)}</td><td>${fmtNum(i.total)}${i.discount?`<br><small class="muted">after ${fmtNum(i.discount)} discount</small>`:''}</td><td>${fmtNum(i.paid)}</td><td><b>${fmtNum(i.balance)}</b></td><td>${escapeHtml(i.dueDate)}</td><td>${statusPill(st)}</td><td class="row-actions">${i.balance>0.001&&can('fees.record')?`<button class="table-action" data-pay="${escapeHtml(i.id)}">Record payment</button>`:''}<button class="table-action" data-print="${escapeHtml(i.id)}">Print</button>${i.paid===0&&can('fees.manage')?`<button class="table-action" data-del="${escapeHtml(i.id)}">Cancel</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="10">No challans match. Generate this month’s challans from the “Generate challans” tab.</td></tr>'}</tbody></table></div>`;
    $('#print-all-challans')?.addEventListener('click',()=>printChallans(challanCache));
    $('#challan-table').querySelectorAll('[data-print]').forEach(b=>b.addEventListener('click',()=>printChallans(challanCache.filter(i=>i.id===b.dataset.print))));
    $('#challan-table').querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>payChallan(challanCache.find(i=>i.id===b.dataset.pay),load)));
    $('#challan-table').querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{const i=challanCache.find(x=>x.id===b.dataset.del);if(!confirm(`Cancel challan ${i.voucherNo}? It can be generated again.`))return;try{await schoolApi('invoices/'+encodeURIComponent(i.id),{method:'DELETE'});toast('Challan cancelled.');load()}catch(e){toast(e.message,'error')}}));
  };
  form.addEventListener('change',load);form.querySelector('[name=q]').addEventListener('input',load);
  await load();
}
async function payChallan(inv,reload){
  const st=schoolStudents.find(s=>s.id===inv.studentId);
  const r=await openDialog({title:`Record payment · ${inv.voucherNo}`,intro:`${st?st.name:''} — ${monthLabel(inv.month)}. Balance ${fmtRs(inv.balance)}.`,submit:'Record payment',
    fields:[{name:'amount',label:'Amount received (PKR)',type:'number',value:inv.balance,required:true,attrs:`min="1" max="${inv.balance}" step="0.01"`,help:'Part payments are fine; the rest stays on the challan.'},{name:'method',label:'Payment method',type:'select',options:PAY_METHODS},{name:'paidOn',label:'Payment date',type:'date',value:pakistanDate(),required:true}],
    onSubmit:async v=>(await schoolApi('receipts',{method:'POST',body:JSON.stringify({studentId:inv.studentId,invoiceId:inv.id,amount:Number(v.amount),method:v.method,paidOn:v.paidOn})}))});
  if(r&&r.data){toast(`Receipt ${r.data.receiptNo} recorded.`);await reload();printReceipt(r.data,st)}
}
function printChallans(list){
  const rows=list.map(i=>{const st=schoolStudents.find(s=>s.id===i.studentId)||{};
    return `<div class="challan"><h1>${escapeHtml(institutionName||'EduSphere Pakistan')}</h1><h2>Fee Challan · ${escapeHtml(i.voucherNo)}</h2><div class="meta"><p><b>Student:</b> ${escapeHtml(st.name||'')} (${escapeHtml(st.admissionNo||'')})</p><p><b>Father / Guardian:</b> ${escapeHtml(st.fatherName||'')}</p><p><b>Class:</b> ${escapeHtml(classLabel(i.classId))}</p><p><b>Fee month:</b> ${escapeHtml(monthLabel(i.month))}</p><p><b>Due date:</b> ${escapeHtml(i.dueDate)}</p></div><table><tr><th>Description</th><th>Amount (PKR)</th></tr>${i.items.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${fmtNum(x.amount)}</td></tr>`).join('')}${i.discount?`<tr><td>Discount${i.discountNote?' ('+escapeHtml(i.discountNote)+')':''}</td><td>- ${fmtNum(i.discount)}</td></tr>`:''}${i.lateFine?`<tr><td>Late fine</td><td>${fmtNum(i.lateFine)}</td></tr>`:''}<tr><th>Total payable</th><th>${fmtNum(i.total)}</th></tr>${i.paid?`<tr><td>Already paid</td><td>${fmtNum(i.paid)}</td></tr><tr><th>Balance</th><th>${fmtNum(i.balance)}</th></tr>`:''}</table>${feeSettings.bankDetails?`<p class="bank"><b>Pay at:</b> ${escapeHtml(feeSettings.bankDetails)}</p>`:''}${feeSettings.lateFine?`<p class="bank">Late fine of Rs. ${fmtNum(feeSettings.lateFine)} applies after the due date.</p>`:''}<div class="line">Cashier signature / stamp: __________________</div></div><div class="page-break"></div>`}).join('');
  printDoc('Fee Challans',rows);
}

// ---------- generate ----------
function feesGenerate(){
  const panel=$('#fees-panel');
  panel.innerHTML=`<h3>Generate monthly challans</h3><p class="muted">Creates one challan per active student from the class fee structure, applying each student’s discount. Students who already have a challan for the month are skipped, so it is safe to run twice.</p><form id="gen-form" class="school-form"><label>Fee month<input name="month" type="month" value="${pakistanMonth()}" required></label><label>Class${classSelect()}</label><button class="btn btn-primary">Generate challans</button></form><div id="gen-result"></div><h3>Late fines</h3><p class="muted">Adds the late fine (${fmtRs(feeSettings.lateFine||0)}) once to every challan that is past its due date and still unpaid. ${feeSettings.lateFine?'':'Set the amount in “Settings & discounts” first.'}</p><button class="btn btn-secondary" id="late-fines">Apply late fines now</button>`;
  $('#gen-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const r=await schoolApi('invoices/generate',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});
    $('#gen-result').innerHTML=`<div class="result-box"><b>${r.created}</b> challans created${r.skippedExisting?`, ${r.skippedExisting} already existed`:''}.${r.classesWithoutFees.length?`<br><span class="warn-text">No fee structure for: ${r.classesWithoutFees.map(escapeHtml).join(', ')} — add fees in the “Fee structure” tab.</span>`:''}</div>`;toast('Challans generated.')}catch(err){toast(err.message,'error')}finally{b.disabled=false}});
  $('#late-fines').addEventListener('click',async()=>{try{const r=await schoolApi('invoices/late-fines',{method:'POST',body:'{}'});toast(r.count?`Late fine added to ${r.count} challans.`:'No overdue challans needed a fine.')}catch(err){toast(err.message,'error')}});
}

// ---------- fee structure ----------
async function feesStructure(my){
  const heads=(await schoolApi('fee-structure')).data;if(my!==feesToken)return;
  const manage=can('fees.manage');
  $('#fees-panel').innerHTML=`<h3>Fee structure</h3><p class="muted">Monthly fee heads for each class. A challan adds up all heads of the student’s class.</p>${manage?`<form id="head-form" class="school-form"><label>Class${classSelect('classId',false)}</label><label>Fee name<input name="name" placeholder="e.g. Tuition fee" required maxlength="60"></label><label>Monthly amount (PKR)<input name="amount" type="number" min="1" step="1" required></label><button class="btn btn-primary">Add fee</button></form>`:''}${schoolClasses.map(k=>{const hs=heads.filter(h=>h.classId===k.id);return `<div class="class-fee"><div class="class-fee-head"><strong>${escapeHtml(k.name)} - ${escapeHtml(k.section)}</strong><span>${hs.length?'Total '+fmtRs(hs.reduce((n,h)=>n+h.amount,0))+' / month':'<span class="warn-text">No fees set</span>'}</span></div>${hs.map(h=>`<div class="head-row"><span>${escapeHtml(h.name)}</span><span>${fmtRs(h.amount)}</span>${manage?`<button class="table-action" data-rm="${escapeHtml(h.id)}">Remove</button>`:''}</div>`).join('')}</div>`}).join('')||'<p class="muted">Create classes first (School management → Classes).</p>'}`;
  $('#head-form')?.addEventListener('submit',async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.target));x.amount=Number(x.amount);try{await schoolApi('fee-structure',{method:'POST',body:JSON.stringify(x)});toast('Fee added.');renderFees('structure')}catch(err){toast(err.message,'error')}});
  $('#fees-panel').querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Remove this fee? Existing challans are not changed.'))return;try{await schoolApi('fee-structure/'+encodeURIComponent(b.dataset.rm),{method:'DELETE'});toast('Fee removed.');renderFees('structure')}catch(err){toast(err.message,'error')}}));
}

// ---------- defaulters ----------
async function feesDefaulters(my){
  const d=await schoolApi('defaulters');if(my!==feesToken)return;
  const msg=x=>`Assalam o Alaikum ${x.fatherName||''}. Fee of Rs. ${fmtNum(x.balance)} for ${x.name} (${x.className}) is overdue (${x.months.map(monthLabel).join(', ')}). Kindly pay at the earliest. — ${institutionName||'School'}`;
  $('#fees-panel').innerHTML=`<h3>Fee defaulters</h3><div class="foot-stats"><span><b>${d.data.length}</b> students</span><span>Total overdue: <b>${fmtRs(d.total)}</b></span>${d.data.length?'<button class="btn btn-secondary btn-small" id="print-defaulters">Print list</button><button class="btn btn-secondary btn-small" id="csv-defaulters">Download CSV</button>':''}</div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Overdue months</th><th>Balance (PKR)</th><th>Oldest due</th><th>Remind</th></tr></thead><tbody>${d.data.map(x=>`<tr><td><strong>${escapeHtml(x.name)}</strong><br><small class="muted">${escapeHtml(x.admissionNo)} · ${escapeHtml(x.fatherName)}</small></td><td>${escapeHtml(x.className)}</td><td>${x.months.map(m=>escapeHtml(m)).join(', ')}</td><td><b>${fmtNum(x.balance)}</b></td><td>${escapeHtml(x.oldestDue)}</td><td class="row-actions">${contactButtons(x.guardianPhone,msg(x))}</td></tr>`).join('')||'<tr><td colspan="6">Nobody has overdue fees. 🎉</td></tr>'}</tbody></table></div>`;
  $('#print-defaulters')?.addEventListener('click',()=>printDoc('Fee defaulters',`<h1>${escapeHtml(institutionName||'EduSphere Pakistan')}</h1><h2>Fee defaulters — ${escapeHtml(pakistanDate())}</h2><table><tr><th>Student</th><th>Class</th><th>Months</th><th>Balance (PKR)</th><th>Phone</th></tr>${d.data.map(x=>`<tr><td>${escapeHtml(x.name)} (${escapeHtml(x.admissionNo)})</td><td>${escapeHtml(x.className)}</td><td>${x.months.map(escapeHtml).join(', ')}</td><td>${fmtNum(x.balance)}</td><td>${escapeHtml(x.guardianPhone)}</td></tr>`).join('')}<tr><th colspan="3">Total</th><th colspan="2">${fmtNum(d.total)}</th></tr></table>`));
  $('#csv-defaulters')?.addEventListener('click',()=>downloadText(`defaulters-${pakistanDate()}.csv`,[['Student','Admission No','Father','Class','Months','Balance','Phone'],...d.data.map(x=>[x.name,x.admissionNo,x.fatherName,x.className,x.months.join(' '),x.balance,x.guardianPhone])].map(r=>r.map(csvCell).join(',')).join('\r\n')));
}

// ---------- settings & discounts ----------
async function feesSettings(my){
  const sib=(await schoolApi('siblings')).data;if(my!==feesToken)return;
  const disc=schoolStudents.filter(s=>s.discountPercent>0);
  $('#fees-panel').innerHTML=`<h3>Fee settings</h3><form id="set-form" class="school-form"><label>Due day of month (1–28)<input name="feeDueDay" type="number" min="1" max="28" value="${escapeHtml(feeSettings.feeDueDay)}" required></label><label>Late fine (PKR, 0 = none)<input name="lateFine" type="number" min="0" step="1" value="${escapeHtml(feeSettings.lateFine)}" required></label><label class="wide">Bank / payment details printed on challans<textarea name="bankDetails" rows="2" maxlength="300" placeholder="e.g. HBL Main Branch, A/C Title: Your School, A/C No. 0000-0000">${escapeHtml(feeSettings.bankDetails||'')}</textarea></label><button class="btn btn-primary">Save settings</button></form>
  <h3>Student discounts</h3><form id="disc-form" class="school-form"><label>Student<select name="studentId" required>${schoolStudents.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.admissionNo)}) — ${escapeHtml(classLabel(s.classId))}</option>`).join('')}</select></label><label>Discount %<input name="discountPercent" type="number" min="0" max="100" step="0.5" value="10" required></label><label>Reason<input name="discountNote" placeholder="Sibling / Scholarship" maxlength="80"></label><button class="btn btn-primary">Save discount</button></form>
  <div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Discount</th><th>Reason</th><th></th></tr></thead><tbody>${disc.map(s=>`<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(classLabel(s.classId))}</td><td>${s.discountPercent}%</td><td>${escapeHtml(s.discountNote||'—')}</td><td><button class="table-action" data-clear="${escapeHtml(s.id)}">Remove</button></td></tr>`).join('')||'<tr><td colspan="5">No discounts set. Discounts apply to challans generated afterwards.</td></tr>'}</tbody></table></div>
  <h3>Siblings detected</h3><p class="muted">Students sharing the same guardian phone number.</p>${sib.map((g,i)=>`<div class="class-fee"><div class="class-fee-head"><strong>${escapeHtml(g.phone)}</strong><button class="table-action" data-sib="${i}">Apply sibling discount…</button></div>${g.students.map(s=>`<div class="head-row"><span>${escapeHtml(s.name)} — ${escapeHtml(classLabel(s.classId))}</span><span>${s.discountPercent?s.discountPercent+'% discount':'no discount'}</span></div>`).join('')}</div>`).join('')||'<p class="muted">No siblings found.</p>'}`;
  $('#set-form').addEventListener('submit',async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.target));x.feeDueDay=Number(x.feeDueDay);x.lateFine=Number(x.lateFine);try{await schoolApi('settings',{method:'PATCH',body:JSON.stringify(x)});toast('Settings saved.')}catch(err){toast(err.message,'error')}});
  const setDisc=(id,pct,note)=>schoolApi(`students/${encodeURIComponent(id)}/discount`,{method:'PATCH',body:JSON.stringify({discountPercent:pct,discountNote:note})});
  $('#disc-form').addEventListener('submit',async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.target));try{await setDisc(x.studentId,Number(x.discountPercent),x.discountNote);toast('Discount saved.');renderFees('settings')}catch(err){toast(err.message,'error')}});
  $('#fees-panel').querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',async()=>{try{await setDisc(b.dataset.clear,0,'');toast('Discount removed.');renderFees('settings')}catch(err){toast(err.message,'error')}}));
  $('#fees-panel').querySelectorAll('[data-sib]').forEach(b=>b.addEventListener('click',()=>{const g=sib[Number(b.dataset.sib)];openDialog({title:'Sibling discount',intro:'Choose who gets the discount (usually all but the eldest child).',submit:'Apply',fields:[{name:'pct',label:'Discount %',type:'number',value:10,required:true,attrs:'min="0" max="100" step="0.5"'},{name:'ids',label:'Students',type:'checks',options:g.students.map(s=>({value:s.id,label:`${s.name} — ${classLabel(s.classId)}`})),values:g.students.slice(1).map(s=>s.id)}],
    onSubmit:async v=>{for(const id of v.ids)await setDisc(id,Number(v.pct),'Sibling');toast('Sibling discount applied.');renderFees('settings')}})}));
}
