// Shared UI helpers: role-based visibility, dialogs, icons, formatting, links, downloads.
const ICONS={
 users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 check:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
 alert:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
 building:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
 clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
 trend:'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
 phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
 chat:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'};
const icon=n=>n==='rs'?'<span class="icon icon-text">Rs</span>':`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;
const fmtNum=n=>Number(n||0).toLocaleString('en-PK'),fmtRs=n=>'Rs. '+fmtNum(n);
function ago(iso){if(!iso)return 'Never';const s=(Date.now()-new Date(iso).getTime())/1000;if(s<90)return 'just now';const m=s/60;if(m<60)return Math.round(m)+' min ago';const h=m/60;if(h<24)return Math.round(h)+' h ago';const d=h/24;if(d<30)return Math.round(d)+(Math.round(d)===1?' day ago':' days ago');return date(iso)}
function monthLabel(m){return new Date(m+'-01T00:00:00Z').toLocaleString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})}
function waPhone(p){const d=String(p||'').replace(/\D/g,'');if(d.length<7)return '';if(d.startsWith('92'))return d;if(d.startsWith('0'))return '92'+d.slice(1);return d}
function contactButtons(phone,message){const w=waPhone(phone);if(!w)return '<span class="muted">No phone</span>';return `<a class="btn-mini" href="tel:+${w}">${icon('phone')}${escapeHtml(t('dash.call','Call'))}</a><a class="btn-mini btn-wa" target="_blank" rel="noopener" href="https://wa.me/${w}?text=${encodeURIComponent(message)}">${icon('chat')}${escapeHtml(t('dash.whatsapp','WhatsApp'))}</a>`}
function csvCell(v){let x=String(v??'');if(/^[=+\-@\t\r]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'}
function downloadText(name,text,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob(['﻿'+text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
const studentLabel=id=>{const s=schoolStudents.find(x=>x.id===id);return s?s.name:'Unknown'};
const classLabel=id=>{const k=schoolClasses.find(x=>x.id===id);return k?`${k.name}-${k.section}`:''};

// ---- role-based visibility: elements carry data-show="platform|staff|parent|perm:x.y" (any match shows) ----
function allowed(rule){const u=currentUser;if(!u)return false;const plat=u.role==='platform_admin',par=u.role==='parent',staff=!plat&&!par;
  return rule.split('|').some(r=>r==='platform'?plat:r==='staff'?staff:r==='parent'?par:r==='any'||(r.startsWith('perm:')&&staff&&(u.permissions||[]).includes(r.slice(5))))}
const can=p=>allowed('perm:'+p);
function applyRoleUI(u){currentUser=u;document.querySelectorAll('[data-show]').forEach(el=>el.classList.toggle('hidden',!allowed(el.dataset.show)));nav('dashboard');
  const par=u.role==='parent';$('#new-institution-btn').classList.toggle('hidden',u.role!=='platform_admin');
  $('#dashboard-subtitle').textContent=u.role==='platform_admin'?'Monitor institutions, trials and platform activity.':({teacher:'Your classes at a glance.',accountant:'Fee collection at a glance.',principal:'How your institution is doing today.'})[u.role]||'A quick overview of your institution workspace.';void par}

// ---- dialogs (replace prompt()) ----
function dlgField(f,i){
  if(f.type==='note')return `<p class="dlg-note">${escapeHtml(f.text)}</p>`;
  const id='dlgf-'+i,req=f.required?' required':'',val=f.value??'';let ctl='';
  if(f.type==='select')ctl=`<select id="${id}" name="${f.name}"${req}>${f.options.map(o=>{const v=typeof o==='object'?o.value:o,l=typeof o==='object'?o.label:o;return `<option value="${escapeHtml(v)}"${String(v)===String(val)?' selected':''}>${escapeHtml(l)}</option>`}).join('')}</select>`;
  else if(f.type==='multiselect')ctl=`<select id="${id}" name="${f.name}" multiple size="${f.size||7}">${f.options.map(o=>`<option value="${escapeHtml(o.value)}"${(f.values||[]).includes(o.value)?' selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
  else if(f.type==='textarea')ctl=`<textarea id="${id}" name="${f.name}" rows="3"${req}>${escapeHtml(val)}</textarea>`;
  else if(f.type==='checks')ctl=`<div class="checks" data-checks="${f.name}">${f.options.map(o=>`<label class="check"><input type="checkbox" value="${escapeHtml(o.value)}"${(f.values||[]).includes(o.value)?' checked':''}> ${escapeHtml(o.label)}</label>`).join('')||'<span class="muted">Nothing to choose yet.</span>'}</div>`;
  else ctl=`<input id="${id}" name="${f.name}" type="${f.type||'text'}" value="${escapeHtml(val)}" ${f.attrs||''}${req}${f.type==='password'?' autocomplete="new-password"':''}>`;
  return `<div class="dlg-field" data-showif="${f.showIf?escapeHtml(JSON.stringify(f.showIf)):''}"><label for="${id}">${escapeHtml(f.label)}</label>${ctl}${f.help?`<small class="muted">${escapeHtml(f.help)}</small>`:''}</div>`;
}
function openDialog({title,intro='',fields=[],submit='Save',cancel='Cancel',onSubmit=null}){
  return new Promise(resolve=>{
    const prev=document.activeElement,wrap=document.createElement('div');
    wrap.className='modal-backdrop';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label',title);
    wrap.innerHTML=`<div class="modal dlg"><div class="modal-heading"><div><h2>${escapeHtml(title)}</h2>${intro?`<p>${escapeHtml(intro)}</p>`:''}</div><button type="button" class="icon-btn" data-close aria-label="Close dialog">×</button></div><form>${fields.map(dlgField).join('')}<div class="form-error" role="alert"></div><div class="dlg-actions"><button type="button" class="btn btn-secondary" data-close>${escapeHtml(cancel)}</button><button class="btn btn-primary" type="submit">${escapeHtml(submit)}</button></div></form></div>`;
    document.body.appendChild(wrap);
    const form=wrap.querySelector('form'),err=wrap.querySelector('.form-error');
    const onKey=e=>{if(e.key==='Escape')done(null)};
    const done=v=>{document.removeEventListener('keydown',onKey);wrap.remove();try{prev&&prev.focus&&prev.focus()}catch{}resolve(v)};
    document.addEventListener('keydown',onKey);
    wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-close]'))done(null)});
    const apply=()=>wrap.querySelectorAll('.dlg-field[data-showif]').forEach(w=>{const raw=w.dataset.showif;if(!raw)return;const c=JSON.parse(raw),show=c.in.includes(form.elements[c.name]?.value);w.classList.toggle('hidden',!show);w.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=!show)});
    form.addEventListener('input',apply);form.addEventListener('change',apply);apply();
    const collect=()=>{const v={};for(const f of fields){if(f.type==='note')continue;const w=[...wrap.querySelectorAll('.dlg-field')].find(x=>x.querySelector(`[name="${f.name}"],[data-checks="${f.name}"]`));if(!w||w.classList.contains('hidden'))continue;
      if(f.type==='checks')v[f.name]=[...w.querySelectorAll('input:checked')].map(i=>i.value);
      else if(f.type==='multiselect')v[f.name]=[...w.querySelector('select').selectedOptions].map(o=>o.value);
      else v[f.name]=form.elements[f.name].value}return v};
    form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const vals=collect(),btn=form.querySelector('[type=submit]');
      if(!onSubmit)return done(vals);
      btn.disabled=true;err.textContent='';try{const r=await onSubmit(vals);done(r===undefined?true:r)}catch(ex){err.textContent=ex.message||'Something went wrong';btn.disabled=false}});
    const first=form.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])');if(first)first.focus();
  });
}

// ---- owner setup / password reset for the platform admin (dialogs instead of prompt()) ----
async function setupOwner(id){
  await openDialog({title:'Set up / update owner account',intro:'Creates the owner login for this institution, or updates the existing one (this also replaces the password and signs the owner out).',submit:'Save owner',
    fields:[{name:'name',label:'Owner full name',required:true,attrs:'minlength="2"'},{name:'email',label:'Login email',type:'email',required:true},{name:'password',label:'Password (at least 10 characters)',type:'password',required:true,attrs:'minlength="10"'}],
    onSubmit:async v=>{await api(`/api/v1/tenants/${encodeURIComponent(id)}/owner-account`,{method:'POST',body:JSON.stringify(v)});toast('Owner account saved. Share the credentials securely.')}});
}
async function resetOwnerPassword(id){
  await openDialog({title:'Reset owner password',intro:'The existing password cannot be viewed. The owner will be signed out everywhere.',submit:'Reset password',
    fields:[{name:'newPassword',label:'New temporary password (at least 10 characters)',type:'password',required:true,attrs:'minlength="10"'}],
    onSubmit:async v=>{await api(`/api/v1/tenants/${encodeURIComponent(id)}/reset-owner-password`,{method:'POST',body:JSON.stringify(v)});toast('Owner password reset. Share the new password securely.')}});
}

// ---- audit trail page (readable sentences) ----
async function loadAudit(){
  try{const d=await api('/api/v1/audit-logs'),logs=d.data||[];
    $('#audit-table').innerHTML=logs.map(a=>`<tr><td>${escapeHtml(a.message||a.action)}</td><td>${escapeHtml(a.entityType||'system')}</td><td>${escapeHtml(a.actorName||'System')}</td><td>${date(a.createdAt)}</td></tr>`).join('');
    $('#audit-empty').classList.toggle('hidden',logs.length>0);
  }catch(e){toast(e.message,'error')}
}
