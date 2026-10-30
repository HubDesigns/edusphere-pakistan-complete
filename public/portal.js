// Parent portal: attendance, fee balance and results for linked children.
async function renderPortal(){
  const body=$('#portal-body');body.innerHTML='<p class="muted">Loading…</p>';
  try{
    const d=(await api('/api/v1/portal/children')).data;
    if(!d.length){body.innerHTML=empty('No children are linked to this login yet. Please contact the school office.');return}
    body.innerHTML=d.map(c=>{const a=c.attendance,fe=c.fees;
      const days=a.recent.map(x=>`<span class="day day-${escapeHtml(x.status)}" title="${escapeHtml(x.date)}: ${escapeHtml(x.status)}">${escapeHtml(x.date.slice(8))}</span>`).join('');
      return `<section class="card child-card"><div class="card-head"><h3>${escapeHtml(c.student.name)}</h3><span class="card-sub">${escapeHtml(c.student.className)} · ${escapeHtml(c.student.admissionNo)}</span></div>
      <div class="kpi-grid">${kpi({icon:'check',tone:a.percent===null||a.percent>=85?'green':'amber',label:'Attendance (30 days)',value:a.percent===null?'—':a.percent+'%',sub:a.marked?`${a.last30.present+a.last30.late} of ${a.marked} days present`:'Not marked yet',progress:a.percent})}${kpi({icon:'rs',tone:fe.balance>0?'red':'green',label:'Fee balance',value:fmtRs(fe.balance),sub:fe.balance>0?'Please pay at the school or bank':'All fees paid'})}</div>
      ${days?`<h4 class="mini-title">Recent days</h4><div class="days">${days}</div><div class="legend"><span class="day day-present">P</span> present <span class="day day-absent">A</span> absent <span class="day day-late">L</span> late <span class="day day-leave">V</span> leave</div>`:''}
      <h4 class="mini-title">Fee challans</h4><div class="table-wrap"><table class="compact"><thead><tr><th>Challan</th><th>Month</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th></tr></thead><tbody>${fe.invoices.map(i=>`<tr><td>${escapeHtml(i.voucherNo)}</td><td>${escapeHtml(monthLabel(i.month))}</td><td>${fmtNum(i.total)}</td><td>${fmtNum(i.paid)}</td><td><b>${fmtNum(i.balance)}</b></td><td>${escapeHtml(i.dueDate)}</td></tr>`).join('')||'<tr><td colspan="6">No challans yet.</td></tr>'}</tbody></table></div>
      <h4 class="mini-title">Results</h4><div class="table-wrap"><table class="compact"><thead><tr><th>Exam</th><th>Subject</th><th>Marks</th><th>%</th></tr></thead><tbody>${c.results.map(r=>`<tr><td>${escapeHtml(r.examName)}</td><td>${escapeHtml(r.subject)}</td><td>${r.marks}/${r.total}</td><td>${r.percentage}%</td></tr>`).join('')||'<tr><td colspan="4">No results yet.</td></tr>'}</tbody></table></div></section>`}).join('');
  }catch(e){body.innerHTML='';toast(e.message,'error')}
}
