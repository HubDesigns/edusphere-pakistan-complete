// School extras: CSV student import and printable result cards.

// ---------- CSV import ----------
function parseCsv(text){
  text=text.replace(/^﻿/,'');const first=text.split(/\r?\n/)[0]||'',delim=[',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}
    else if(c==='"')q=true;else if(c===delim){row.push(cell);cell=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[]}
    else cell+=c}
  row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);return rows;
}
const HEADER_MAP={name:'name',studentname:'name',student:'name',fathername:'fatherName',father:'fatherName',guardian:'fatherName',guardianname:'fatherName',fatherguardian:'fatherName',class:'className',classname:'className',grade:'className',section:'section',admissionno:'admissionNo',admissionnumber:'admissionNo',admission:'admissionNo',admno:'admissionNo',dob:'dob',dateofbirth:'dob',guardianphone:'guardianPhone',phone:'phone',mobile:'guardianPhone',contact:'guardianPhone',guardianmobile:'guardianPhone'};
function csvToStudents(text){
  const rows=parseCsv(text);if(rows.length<2)throw new Error('The file needs a header row and at least one student.');
  const keys=rows[0].map(h=>HEADER_MAP[h.toLowerCase().replace(/[^a-z]/g,'')]||'');
  if(!keys.includes('name')||!keys.includes('fatherName')||!keys.includes('className'))throw new Error('Header row must include: Name, Father Name and Class (see the template).');
  return rows.slice(1).map(r=>{const o={};keys.forEach((k,i)=>{if(k)o[k]=(r[i]||'').trim()});
    const m=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(o.dob||'');if(m)o.dob=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return o});
}
async function renderImport(){
  await getSchoolData();
  $('#school-panel').innerHTML=`<h3>Import students from a spreadsheet</h3><p class="muted">Save your Excel sheet as <b>CSV</b> (File → Save As → CSV) and upload it. Classes must exist first. Rows with problems are skipped and listed; nothing is saved until you confirm.</p><div class="import-actions"><button class="btn btn-secondary" id="tpl-btn">Download template</button><label class="file-btn">Choose CSV file<input id="csv-file" type="file" accept=".csv,text/csv"></label></div><div id="import-result"></div>`;
  $('#tpl-btn').addEventListener('click',()=>{const k=schoolClasses[0];downloadText('students-template.csv',['Name,Father Name,Class,Section,Admission No,Date of Birth,Guardian Phone',`Ayesha Khan,Imran Khan,${k?k.name:'Five'},${k?k.section:'A'},,2014-03-15,0300-1234567`].join('\r\n'))});
  $('#csv-file').addEventListener('change',async e=>{
    const f=e.target.files[0];if(!f)return;const box=$('#import-result');
    try{
      if(f.size>1.5*1024*1024)throw new Error('File is too large (max about 1,000 students).');
      const rows=csvToStudents(await f.text());
      const dry=await schoolApi('students/import',{method:'POST',body:JSON.stringify({rows,dryRun:true})});
      box.innerHTML=`<div class="result-box"><b>${dry.valid}</b> of ${rows.length} rows are ready to import${dry.errors.length?`, <span class="warn-text">${dry.errors.length} will be skipped</span>`:''}.</div>${dry.errors.length?`<div class="table-wrap"><table><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>${dry.errors.slice(0,100).map(x=>`<tr><td>${x.row}</td><td>${escapeHtml(x.message)}</td></tr>`).join('')}</tbody></table></div>`:''}${dry.valid?`<button class="btn btn-primary" id="do-import">Import ${dry.valid} students</button>`:''}`;
      $('#do-import')?.addEventListener('click',async ev=>{ev.target.disabled=true;try{const r=await schoolApi('students/import',{method:'POST',body:JSON.stringify({rows})});toast(`${r.created} students imported.`);box.innerHTML=`<div class="result-box"><b>${r.created}</b> students imported.${r.errors.length?` ${r.errors.length} rows were skipped.`:''}</div>`}catch(err){toast(err.message,'error');ev.target.disabled=false}});
    }catch(err){box.innerHTML=`<div class="result-box warn-text">${escapeHtml(err.message)}</div>`}
  });
}

// ---------- result cards ----------
const gradeOf=p=>p>=90?'A+':p>=80?'A':p>=70?'B':p>=60?'C':p>=50?'D':p>=40?'E':'F';
const remarkOf=g=>({'A+':'Outstanding performance','A':'Excellent work','B':'Very good, keep it up','C':'Good, can improve further','D':'Satisfactory, needs more effort','E':'Needs serious attention','F':'Unsatisfactory — extra support required'})[g];
function buildResultRows(classId,exam){
  const stu=schoolStudents.filter(s=>s.classId===classId&&s.status==='active');
  const rows=stu.map(s=>{const rs=schoolResults.filter(r=>r.studentId===s.id&&r.examName===exam),got=rs.reduce((n,r)=>n+r.marks,0),tot=rs.reduce((n,r)=>n+r.total,0),pct=tot?Math.round(got/tot*10000)/100:0;return{s,rs,got,tot,pct,grade:tot?gradeOf(pct):'—'}}).filter(r=>r.rs.length);
  rows.sort((a,b)=>b.pct-a.pct);rows.forEach((r,i)=>{r.pos=i&&r.pct===rows[i-1].pct?rows[i-1].pos:i+1});return rows;
}
async function renderResultCards(){
  await getSchoolData();
  const exams=[...new Set(schoolResults.map(r=>r.examName))].sort();
  $('#school-panel').innerHTML=`<h3>Result cards</h3><p class="muted">Pick a class and exam to rank students and print report cards. Grades: A+ 90%+, A 80+, B 70+, C 60+, D 50+, E 40+, F below 40. Position is within the class for the chosen exam.</p><form id="rc-form" class="school-form"><label>Class<select name="classId">${classOptions()}</select></label><label>Exam<select name="exam">${exams.map(x=>`<option>${escapeHtml(x)}</option>`).join('')||'<option value="">No marks recorded yet</option>'}</select></label></form><div id="rc-out"></div>`;
  const show=()=>{const f=Object.fromEntries(new FormData($('#rc-form'))),rows=f.exam?buildResultRows(f.classId,f.exam):[];
    $('#rc-out').innerHTML=rows.length?`<div class="foot-stats"><span>${rows.length} students</span><button class="btn btn-secondary btn-small" id="rc-all">Print all cards</button></div><div class="table-wrap"><table><thead><tr><th>Pos.</th><th>Student</th><th>Subjects</th><th>Marks</th><th>%</th><th>Grade</th><th></th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${r.pos}</td><td>${escapeHtml(r.s.name)}</td><td>${r.rs.length}</td><td>${r.got}/${r.tot}</td><td>${r.pct}%</td><td><b>${r.grade}</b></td><td><button class="table-action" data-card="${i}">Print card</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No marks recorded for this class and exam yet.</p>';
    const print=list=>printDoc('Result cards',list.map(r=>`<div class="rcard"><h1>${escapeHtml(institutionName||'EduSphere Pakistan')}</h1><h2>Result Card — ${escapeHtml(f.exam)}</h2><div class="meta"><p><b>Student:</b> ${escapeHtml(r.s.name)}</p><p><b>Father / Guardian:</b> ${escapeHtml(r.s.fatherName)}</p><p><b>Admission No:</b> ${escapeHtml(r.s.admissionNo)}</p><p><b>Class:</b> ${escapeHtml(classLabel(f.classId))}</p></div><table><tr><th>Subject</th><th>Marks obtained</th><th>Total marks</th><th>%</th></tr>${r.rs.map(x=>`<tr><td>${escapeHtml(x.subject)}</td><td>${x.marks}</td><td>${x.total}</td><td>${x.percentage}%</td></tr>`).join('')}<tr><th>Total</th><th>${r.got}</th><th>${r.tot}</th><th>${r.pct}%</th></tr></table><p><b>Grade:</b> ${r.grade} &nbsp;&nbsp; <b>Position in class:</b> ${r.pos} of ${rows.length}</p><p><b>Remarks:</b> ${escapeHtml(remarkOf(r.grade)||'')}</p><div class="sign-row"><span>Class teacher</span><span>Principal</span><span>Parent / guardian</span></div></div><div class="page-break"></div>`).join(''));
    $('#rc-all')?.addEventListener('click',()=>print(rows));
    $('#rc-out').querySelectorAll('[data-card]').forEach(b=>b.addEventListener('click',()=>print([rows[Number(b.dataset.card)]])));
  };
  $('#rc-form').addEventListener('change',show);show();
}
