// Fee voucher submission: details + photo/PDF attachments. Loaded after app.js (shares its globals).
const VOUCHER_METHODS=['Bank deposit','Cash','JazzCash','Easypaisa','Raast','Cheque','Other'];
const MAX_UPLOAD=2*1024*1024,MAX_UPLOADS=3;
let schoolVouchers=[],pendingVoucherFiles=[];

const readAsBase64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(new Error('Could not read the file'));r.readAsDataURL(blob)});

// Photos from phones are often 3-8 MB: shrink to max 1600px JPEG so uploads stay fast on slow connections.
async function prepareVoucherFile(file){
  if(file.type==='application/pdf'){
    if(file.size>MAX_UPLOAD)throw new Error(`${file.name} is larger than 2 MB`);
    return{name:file.name,data:await readAsBase64(file),preview:null,kind:'pdf'};
  }
  if(!file.type.startsWith('image/'))throw new Error(`${file.name}: only photos (JPG, PNG, WebP) or PDF files are allowed`);
  let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw new Error(`${file.name} could not be read. Please use a JPG or PNG photo.`)}
  for(const [edge,quality] of [[1600,0.82],[1200,0.7],[900,0.6]]){
    const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));
    if(blob&&blob.size<=MAX_UPLOAD){const data=await readAsBase64(blob);return{name:file.name.replace(/\.[^.]+$/,'')+'.jpg',data,preview:'data:image/jpeg;base64,'+data,kind:'image'}}
  }
  throw new Error(`${file.name} is too large even after compression`);
}

const voucherFileUrl=(v,f)=>`/api/v1/school/vouchers/${encodeURIComponent(v.id)}/files/${encodeURIComponent(f.id)}`;

function renderVoucherPreviews(){
  const box=$('#voucher-previews');if(!box)return;
  box.innerHTML=pendingVoucherFiles.map((f,i)=>`<div class="voucher-preview">${f.preview?`<img class="voucher-thumb" src="${escapeHtml(f.preview)}" alt="Attachment ${i+1}">`:'<div class="voucher-thumb voucher-pdf">PDF</div>'}<small>${escapeHtml(f.name)}</small><button type="button" class="table-action" data-remove-file="${i}">Remove</button></div>`).join('');
  box.querySelectorAll('[data-remove-file]').forEach(b=>b.addEventListener('click',()=>{pendingVoucherFiles.splice(Number(b.dataset.removeFile),1);renderVoucherPreviews()}));
  const hint=$('#voucher-file-hint');if(hint)hint.textContent=`${pendingVoucherFiles.length} of ${MAX_UPLOADS} attached`;
}

function renderVoucherRows(){
  const status=$('#voucher-filter')?.value||'all',q=($('#voucher-search')?.value||'').trim().toLowerCase();
  const rows=schoolVouchers.filter(v=>(status==='all'||v.status===status)&&(!q||`${v.voucherNo} ${(schoolStudents.find(s=>s.id===v.studentId)||{}).name||''}`.toLowerCase().includes(q)));
  $('#voucher-rows').innerHTML=rows.map(v=>{
    const st=schoolStudents.find(s=>s.id===v.studentId);
    const files=(v.files||[]).map(f=>f.mime==='application/pdf'?`<a class="voucher-file-link" href="${escapeHtml(voucherFileUrl(v,f))}" target="_blank" rel="noopener">PDF</a>`:`<a href="${escapeHtml(voucherFileUrl(v,f))}" target="_blank" rel="noopener"><img class="voucher-thumb" loading="lazy" src="${escapeHtml(voucherFileUrl(v,f))}" alt="Voucher photo for ${escapeHtml(v.voucherNo)}"></a>`).join('')||'<span class="muted">None</span>';
    const actions=v.status==='pending'?`<button class="table-action" data-review="verified" data-id="${escapeHtml(v.id)}">Verify</button> <button class="table-action" data-review="rejected" data-id="${escapeHtml(v.id)}">Reject</button>`:'—';
    return `<tr><td><strong>${escapeHtml(v.voucherNo)}</strong><br><small class="muted">${escapeHtml(v.method)}${v.bankName?' · '+escapeHtml(v.bankName):''}${v.reference?' · Ref '+escapeHtml(v.reference):''}</small></td><td>${escapeHtml(st?st.name:'Unknown')}</td><td>${escapeHtml(v.feeMonth)}</td><td>${Number(v.amount).toLocaleString('en-PK')}</td><td>${escapeHtml(v.paidOn)}</td><td class="voucher-files">${files}</td><td><span class="status status-${escapeHtml(v.status)}">${escapeHtml(v.status)}</span></td><td>${actions}</td></tr>`;
  }).join('')||'<tr><td colspan="8">No vouchers found.</td></tr>';
  $('#voucher-rows').querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',async()=>{
    const next=b.dataset.review;if(!confirm(`Mark this voucher as ${next}?`))return;
    try{await schoolApi('vouchers/'+encodeURIComponent(b.dataset.id),{method:'PATCH',body:JSON.stringify({status:next})});toast(`Voucher ${next}.`);renderVouchers()}catch(err){toast(err.message,'error')}
  }));
}

async function renderVouchers(){
  try{
    await getSchoolData();schoolVouchers=(await schoolApi('vouchers')).data;pendingVoucherFiles=[];
    const students=schoolStudents.map(st=>`<option value="${escapeHtml(st.id)}">${escapeHtml(st.name)} (${escapeHtml(st.admissionNo)})</option>`).join('');
    $('#school-panel').innerHTML=`<h3>Submit fee voucher</h3><p class="muted">Record the details of a paid fee voucher / challan and attach a photo or PDF of the bank slip (JPG, PNG, WebP or PDF, up to ${MAX_UPLOADS} files, 2 MB each).</p>
<form id="voucher-form" class="school-form">
<label>Student<select name="studentId" required>${students}</select></label>
<label>Voucher / challan no.<input name="voucherNo" maxlength="40" required></label>
<label>Fee month<input name="feeMonth" type="month" value="${pakistanMonth()}" required></label>
<label>Amount (PKR)<input name="amount" type="number" min="1" step="0.01" required></label>
<label>Payment method<select name="method" required>${VOUCHER_METHODS.map(m=>`<option>${m}</option>`).join('')}</select></label>
<label>Payment date<input name="paidOn" type="date" value="${pakistanDate()}" required></label>
<label>Bank / wallet name (optional)<input name="bankName" maxlength="80"></label>
<label>Transaction / reference no. (optional)<input name="reference" maxlength="80"></label>
<label>Notes (optional)<input name="notes" maxlength="500"></label>
<label class="voucher-attach">Voucher photo or PDF<input id="voucher-files" type="file" accept="image/*,application/pdf" multiple><small id="voucher-file-hint" class="muted">0 of ${MAX_UPLOADS} attached</small></label>
<div id="voucher-previews" class="voucher-previews"></div>
<button class="btn btn-primary" id="voucher-submit">Submit voucher</button></form>
<h3>Submitted vouchers</h3><div class="school-form voucher-toolbar"><label>Status<select id="voucher-filter"><option value="all">All</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label><label>Search<input id="voucher-search" placeholder="Voucher no. or student"></label></div>
<div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Student</th><th>Fee month</th><th>Amount (PKR)</th><th>Paid on</th><th>Attachments</th><th>Status</th><th>Action</th></tr></thead><tbody id="voucher-rows"></tbody></table></div>`;
    renderVoucherRows();
    $('#voucher-filter').addEventListener('change',renderVoucherRows);$('#voucher-search').addEventListener('input',renderVoucherRows);
    $('#voucher-files').addEventListener('change',async e=>{
      const picked=[...e.target.files];e.target.value='';
      for(const f of picked){
        if(pendingVoucherFiles.length>=MAX_UPLOADS){toast(`You can attach up to ${MAX_UPLOADS} files.`,'error');break}
        try{pendingVoucherFiles.push(await prepareVoucherFile(f))}catch(err){toast(err.message,'error')}
      }
      renderVoucherPreviews();
    });
    $('#voucher-form').addEventListener('submit',async e=>{
      e.preventDefault();const btn=$('#voucher-submit');btn.disabled=true;btn.textContent='Submitting…';
      const x=Object.fromEntries(new FormData(e.target));x.amount=Number(x.amount);x.files=pendingVoucherFiles.map(f=>({name:f.name,data:f.data}));
      try{await schoolApi('vouchers',{method:'POST',body:JSON.stringify(x)});toast('Voucher submitted.');renderVouchers()}
      catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Submit voucher'}
    });
  }catch(e){toast(e.message,'error')}
}
