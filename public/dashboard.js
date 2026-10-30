// Dashboards: platform admin overview and role-aware institution overview.
function kpi({go='',icon:ic,tone='teal',label,value,sub='',progress=null}){
  const click=go?` role="button" tabindex="0" data-go="${go}"`:'';
  return `<article class="kpi kpi-${tone}${go?' kpi-click':''}"${click}><div class="kpi-top"><span class="kpi-icon">${icon(ic)}</span><span class="kpi-label">${escapeHtml(label)}</span></div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-sub">${escapeHtml(sub)}</div>${progress!==null&&progress!==undefined?`<progress class="bar-progress" value="${Math.max(0,Math.min(100,progress))}" max="100"></progress>`:''}</article>`;
}
const card=(title,body,{sub='',cls=''}={})=>`<section class="card ${cls}"><div class="card-head"><h3>${escapeHtml(title)}</h3>${sub?`<span class="card-sub">${escapeHtml(sub)}</span>`:''}</div>${body}</section>`;
const empty=text=>`<div class="empty-inline">${escapeHtml(text)}</div>`;

function barChart(items,{height=170,fmt=fmtNum,labelEvery=1}={}){
  const W=560,H=height,padL=6,padB=24,padT=10,n=items.length,max=Math.max(1,...items.map(i=>i.value)),bw=(W-padL*2)/n,gap=Math.min(8,bw*.25);
  const bars=items.map((it,i)=>{const h=Math.round((H-padB-padT)*it.value/max),x=padL+i*bw+gap/2,y=H-padB-h;
    return `<g><title>${escapeHtml(it.title||`${it.label}: ${fmt(it.value)}`)}</title><rect class="bar${it.value?'':' bar-zero'}" x="${x.toFixed(1)}" y="${y}" width="${(bw-gap).toFixed(1)}" height="${Math.max(h,it.value?3:2)}" rx="3"/>${i%labelEvery===0?`<text class="axis" x="${(x+(bw-gap)/2).toFixed(1)}" y="${H-7}" text-anchor="middle">${escapeHtml(it.label)}</text>`:''}</g>`}).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${bars}</svg>`;
}

function goTo(target){
  const school=tab=>{nav('school');schoolTab(tab)};
  if(target==='students'&&can('students.view'))school('students');
  else if(target==='attendance'&&can('attendance.view'))school(can('attendance.mark')?'attendance':'attendance');
  else if(target==='fees'&&can('fees.view')){feesTab='challans';nav('fees')}
  else if(target==='defaulters'&&can('fees.view')){feesTab='defaulters';nav('fees')}
  else if(target==='vouchers'&&can('vouchers.view'))school('vouchers');
  else if(target==='salary'&&can('salaries.manage'))nav('finance');
}
function wireDash(root){
  root.querySelectorAll('[data-go]').forEach(el=>{const run=()=>goTo(el.dataset.go);el.addEventListener('click',run);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run()}})});
  root.querySelectorAll('[data-act]').forEach(el=>el.addEventListener('click',()=>goTo(el.dataset.act)));
}

async function loadDashboard(){
  try{
    const d=await api('/api/v1/dashboard');applyHeader(d);
    if(d.scope==='parent'){nav('portal');return}
    const qa=$('#owner-quick-actions');
    qa.classList.toggle('hidden',d.scope!=='institution'||!qa.querySelector('.quick-action:not(.hidden)'));
    if(d.scope==='platform')renderPlatformDash(d);else renderInstitutionDash(d);
  }catch(e){toast(e.message,'error')}
}

function renderInstitutionDash(d){
  const a=d.attendance,f=d.fees,k=[],cards=[];
  k.push(kpi({go:'students',icon:'users',tone:'teal',label:t('dash.students','Students'),value:fmtNum(d.students.total),sub:`${d.students.perClass.length} ${t('dash.classes','classes')}`}));
  if(a){const p=a.percent;k.push(kpi({go:'attendance',icon:'check',tone:p===null?'amber':p>=85?'green':'amber',label:t('dash.att_today','Attendance today'),value:p===null?'—':p+'%',sub:a.marked?`${fmtNum(a.present+a.late)} / ${fmtNum(a.marked)} ${t('dash.present','present')}`:`${t('dash.not_marked','Not marked yet')} · ${a.classesMarked}/${a.classesTotal}`,progress:p}))}
  if(f){k.push(kpi({go:'fees',icon:'rs',tone:'blue',label:t('dash.fees_month','Fees this month'),value:fmtRs(f.collected),sub:f.expected?`${t('dash.of','of')} ${fmtRs(f.expected)} ${t('dash.expected','expected')}`:t('dash.no_challans','No challans generated yet'),progress:f.rate}));
    k.push(kpi({go:'defaulters',icon:'alert',tone:f.defaulterCount?'red':'green',label:t('dash.overdue','Overdue fees'),value:fmtRs(f.defaulterAmount),sub:f.defaulterCount?`${f.defaulterCount} ${t('dash.students_lc','students')}`:t('dash.none_overdue','Nobody overdue')}))}
  $('#dash-top').innerHTML=`<div class="kpi-grid">${k.join('')}</div>`;

  if(a){
    const chips=a.unmarked.length?`<div class="chips">${a.unmarked.map(c=>`<button class="chip chip-warn" data-act="attendance">${escapeHtml(c.name)}</button>`).join('')}</div>`:'';
    cards.push(card(t('dash.att_today','Attendance today'),`<div class="att-counts"><div><b>${fmtNum(a.present)}</b><span>${escapeHtml(t('dash.present','Present'))}</span></div><div><b class="neg">${fmtNum(a.absent)}</b><span>${escapeHtml(t('dash.absent','Absent'))}</span></div><div><b>${fmtNum(a.late)}</b><span>${escapeHtml(t('dash.late','Late'))}</span></div><div><b>${fmtNum(a.leave)}</b><span>${escapeHtml(t('dash.leave','Leave'))}</span></div></div>${a.unmarked.length?`<h4 class="mini-title">${escapeHtml(t('dash.unmarked','Classes not marked yet'))}</h4>${chips}`:`<div class="ok-line">${icon('check')} ${a.classesTotal?escapeHtml('All classes marked'):escapeHtml('No classes with students yet')}</div>`}`,{sub:a.date}));
  }
  if(f){
    cards.push(card(t('dash.trend','Fee collection (last 14 days)'),`${barChart(f.trend.map(x=>({label:x.date.slice(8),value:x.amount,title:`${x.date}: ${fmtRs(x.amount)}`})),{labelEvery:2,fmt:fmtRs})}<div class="foot-stats"><span>${escapeHtml(t('dash.collected','Collected this month'))}: <b>${fmtRs(f.collected)}</b></span><span>${escapeHtml(t('dash.outstanding','Total outstanding'))}: <b>${fmtRs(f.outstanding)}</b></span></div>`));
  }
  if(a){
    const rows=a.absentees.map(x=>`<div class="person-row"><div class="person-main"><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.className)} · ${escapeHtml(x.fatherName||'')}</small></div><div class="person-actions">${contactButtons(x.guardianPhone,`Assalam o Alaikum ${x.fatherName||''}. ${x.name} (${x.className}) was marked absent today (${a.date}). Please inform the school if there is any issue. — ${d.institution?.name||'School'}`)}</div></div>`).join('');
    cards.push(card(t('dash.absent_today','Absent today'),rows||empty(a.marked?t('dash.no_absent','Nobody is absent today'):t('dash.not_marked','Attendance not marked yet')),{sub:a.absent?String(a.absent):''}));
  }
  const alerts=(d.alerts||[]).map(x=>`<div class="alert-row alert-${x.level}"><span class="dot"></span><span class="alert-text">${escapeHtml(x.text)}</span>${x.action?`<button class="btn-mini" data-act="${escapeHtml(x.action)}">${escapeHtml(t('dash.open','Open'))}</button>`:''}</div>`).join('');
  cards.push(card(t('dash.attention','Needs attention'),alerts||`<div class="ok-line">${icon('check')} ${escapeHtml(t('dash.all_clear','All clear — nothing needs attention'))}</div>`));
  if(d.students.perClass.length){const max=Math.max(1,...d.students.perClass.map(c=>c.count));
    cards.push(card(t('dash.per_class','Students per class'),d.students.perClass.map(c=>`<div class="class-row"><span class="class-name">${escapeHtml(c.name)}</span><progress class="bar-progress" value="${c.count}" max="${max}"></progress><b>${fmtNum(c.count)}</b></div>`).join('')))}
  if(d.recentActivity)cards.push(card(t('dash.activity','Recent activity'),d.recentActivity.length?d.recentActivity.map(x=>`<div class="activity-row"><span class="activity-dot"></span><div><strong>${escapeHtml(x.message)}</strong><small>${escapeHtml(ago(x.createdAt))}</small></div></div>`).join(''):empty('Nothing has happened yet.')));
  $('#dash-body').innerHTML=`<div class="dash-grid">${cards.join('')}</div>`;
  wireDash($('#dash-top'));wireDash($('#dash-body'));
}

function renderPlatformDash(d){
  const tones=['teal','blue','amber','red'],icons=['building','users','clock','alert'],keys=['dash.p_institutions','dash.p_students','dash.p_trials','dash.p_inactive'],defs=['Institutions','Students on platform','Trials ending in 7 days','Inactive 14+ days'];
  $('#dash-top').innerHTML=`<div class="kpi-grid">${d.stats.map((s,i)=>kpi({icon:icons[i],tone:(i>1&&!s.value)?'green':tones[i],label:t(keys[i],defs[i]),value:fmtNum(s.value),sub:s.note})).join('')}</div>`;
  const status=x=>x.status==='suspended'?'<span class="status status-suspended">suspended</span>':x.subscriptionStatus==='trial'?`<span class="status ${x.trialDaysLeft<=7?'status-pending':'status-active'}">${x.trialDaysLeft<0?'trial ended':'trial · '+x.trialDaysLeft+'d'}</span>`:'<span class="status status-active">active</span>';
  const table=d.tenants.length?`<div class="table-wrap"><table class="compact"><thead><tr><th>INSTITUTION</th><th>STUDENTS</th><th>LAST ACTIVE</th><th>STATUS</th></tr></thead><tbody>${d.tenants.map(x=>`<tr><td><div class="table-tenant"><span class="tenant-logo">${escapeHtml(initials(x.name))}</span><span><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.institutionType.replace('_',' & '))}</small></span></div></td><td>${fmtNum(x.studentCount)}</td><td>${escapeHtml(ago(x.lastActiveAt))}</td><td>${status(x)}</td></tr>`).join('')}</tbody></table></div><button class="text-btn" data-nav="institutions">Manage all institutions →</button>`:empty('No institutions yet. Use “Add institution” to create the first one.');
  const attn=d.attention.length?d.attention.map(x=>`<div class="alert-row alert-${x.level}"><span class="dot"></span><span class="alert-text">${escapeHtml(x.text)}</span></div>`).join(''):`<div class="ok-line">${icon('check')} ${escapeHtml(t('dash.all_clear','All clear'))}</div>`;
  const cards=[card(t('dash.p_recent','Institutions'),table,{cls:'span-2'}),card(t('dash.attention','Needs attention'),attn),card(t('dash.p_growth','New institutions per month'),barChart(d.growth.map(g=>({label:g.month.slice(2),value:g.count,title:`${g.month}: ${g.count} new`})),{height:150})),
    card(t('dash.activity','Recent activity'),d.recentActivity.length?d.recentActivity.map(x=>`<div class="activity-row"><span class="activity-dot"></span><div><strong>${escapeHtml(x.message)}</strong><small>${escapeHtml(ago(x.createdAt))}</small></div></div>`).join(''):empty('No activity yet.'),{cls:'span-2'})];
  $('#dash-body').innerHTML=`<div class="dash-grid">${cards.join('')}</div>`;
  $('#dash-body').querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav)));
}

document.getElementById('quick-generate-challans').addEventListener('click',()=>{feesTab='generate';nav('fees')});
document.getElementById('quick-defaulters').addEventListener('click',()=>{feesTab='defaulters';nav('fees')});
