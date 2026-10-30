// Staff / parent logins managed by the institution owner.
const ROLE_NAMES={principal:'Principal (view only)',teacher:'Teacher',accountant:'Accountant',parent:'Parent / guardian'};
let loginUsers=[];

async function renderUsers(){
  try{
    await getSchoolData();loginUsers=(await schoolApi('users')).data;
    const manage=can('users.manage');
    $('#users-table').innerHTML=loginUsers.map(u=>{
      const access=u.role==='teacher'?(u.classIds.map(classLabel).join(', ')||'No classes yet'):u.role==='parent'?(u.studentIds.map(studentLabel).join(', ')||'—'):u.role==='accountant'?'Fees & vouchers':'All data, read-only';
      return `<tr><td><strong>${escapeHtml(u.name)}</strong><br><small class="muted">${escapeHtml(u.email)}</small></td><td><span class="plan-pill">${escapeHtml(ROLE_NAMES[u.role]||u.role)}</span></td><td class="wrap-cell">${escapeHtml(access)}</td><td>${escapeHtml(ago(u.lastLoginAt))}</td><td><span class="status ${u.status==='active'?'status-active':'status-suspended'}">${escapeHtml(u.status)}</span></td><td class="row-actions">${manage?`<button class="table-action" data-edit="${escapeHtml(u.id)}">Edit</button><button class="table-action" data-toggle="${escapeHtml(u.id)}">${u.status==='active'?'Disable':'Enable'}</button><button class="table-action" data-pw="${escapeHtml(u.id)}">Reset password</button>`:'—'}</td></tr>`}).join('');
    $('#users-empty').classList.toggle('hidden',loginUsers.length>0);
    $('#users-table').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editLogin(loginUsers.find(u=>u.id===b.dataset.edit))));
    $('#users-table').querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',async()=>{const u=loginUsers.find(x=>x.id===b.dataset.toggle),next=u.status==='active'?'disabled':'active';if(next==='disabled'&&!confirm(`Disable ${u.name}? They will be signed out immediately.`))return;try{await schoolApi('users/'+encodeURIComponent(u.id),{method:'PATCH',body:JSON.stringify({status:next})});toast(`Login ${next==='active'?'enabled':'disabled'}.`);renderUsers()}catch(e){toast(e.message,'error')}}));
    $('#users-table').querySelectorAll('[data-pw]').forEach(b=>b.addEventListener('click',()=>resetLoginPassword(loginUsers.find(u=>u.id===b.dataset.pw))));
  }catch(e){toast(e.message,'error')}
}
const classChecks=values=>({name:'classIds',label:'Classes this teacher can access',type:'checks',options:schoolClasses.map(k=>({value:k.id,label:`${k.name} - ${k.section} (${k.academicYear})`})),values:values||[],showIf:{name:'role',in:['teacher']}});
const studentPick=values=>({name:'studentIds',label:'Linked children (Ctrl/Cmd-click to pick several)',type:'multiselect',options:schoolStudents.map(s=>({value:s.id,label:`${s.name} (${s.admissionNo}) — ${classLabel(s.classId)}`})),values:values||[],showIf:{name:'role',in:['parent']}});

function addLogin(){
  openDialog({title:'Add a login',intro:'They sign in with this email and password. Share it securely and ask them to keep it private.',submit:'Create login',
    fields:[{name:'role',label:'Role',type:'select',options:Object.entries(ROLE_NAMES).map(([value,label])=>({value,label})),value:'teacher'},{name:'name',label:'Full name',required:true,attrs:'minlength="2"'},{name:'email',label:'Login email',type:'email',required:true},{name:'password',label:'Password (at least 10 characters)',type:'password',required:true,attrs:'minlength="10"'},classChecks([]),studentPick([]),
      {type:'note',text:'Teachers can mark attendance and enter results for their classes only. Accountants handle fees and vouchers. The principal can view everything but change nothing. Parents see only their own children.'}],
    onSubmit:async v=>{await schoolApi('users',{method:'POST',body:JSON.stringify(v)});toast('Login created.');renderUsers()}});
}
function editLogin(u){
  openDialog({title:`Edit ${u.name}`,submit:'Save changes',
    fields:[{name:'role',label:'Role',type:'select',options:[{value:u.role,label:ROLE_NAMES[u.role]||u.role}],value:u.role},{name:'name',label:'Full name',value:u.name,required:true,attrs:'minlength="2"'},{type:'note',text:`Login email: ${u.email}`},classChecks(u.classIds),studentPick(u.studentIds)],
    onSubmit:async v=>{const body={name:v.name};if(u.role==='teacher')body.classIds=v.classIds||[];if(u.role==='parent')body.studentIds=v.studentIds||[];await schoolApi('users/'+encodeURIComponent(u.id),{method:'PATCH',body:JSON.stringify(body)});toast('Login updated.');renderUsers()}});
}
function resetLoginPassword(u){
  openDialog({title:`Reset password · ${u.name}`,intro:'They will be signed out everywhere and must use the new password.',submit:'Reset password',
    fields:[{name:'password',label:'New password (at least 10 characters)',type:'password',required:true,attrs:'minlength="10"'}],
    onSubmit:async v=>{await schoolApi('users/'+encodeURIComponent(u.id),{method:'PATCH',body:JSON.stringify({password:v.password})});toast('Password reset.');renderUsers()}});
}
document.getElementById('add-user-btn').addEventListener('click',addLogin);
