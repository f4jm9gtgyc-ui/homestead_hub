const SUPABASE_URL = 'https://dugyrawoqiztodugzwmi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zqIUIBpxG6XTfQc8Zv_D-g_3Gu2MVzo';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let editingTransactionId = null;
let state = { openingBalance: 0, balanceDate: new Date().toISOString().slice(0,10), transactions: [], recurring: [], obligations: [] };
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const signedMoney = (n,type) => `${type==='credit'?'+':'-'}${money(Math.abs(Number(n)||0))}`;
const shortDate = s => s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
const todayISO = () => new Date().toISOString().slice(0,10);
const escapeHtml = (s='') => String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function setSync(text, bad=false){ const el=$('#syncStatus'); if(el){el.textContent=text;el.classList.toggle('bad-sync',bad);} }
function openDialog(id){ document.getElementById(id).showModal(); }
function closeDialog(id){ document.getElementById(id).close(); }
function assertOk(result,label){ if(result.error) throw new Error(`${label}: ${result.error.message}`); return result; }

async function loadData(){
  setSync('Syncing…');
  const uid=currentUser.id;
  const [settings,tx,rec,obl]=await Promise.all([
    sb.from('papa_settings').select('*').eq('user_id',uid).maybeSingle(),
    sb.from('papa_transactions').select('*').eq('user_id',uid).order('transaction_date',{ascending:true}),
    sb.from('papa_recurring').select('*').eq('user_id',uid).order('next_date',{ascending:true}),
    sb.from('papa_obligations').select('*').eq('user_id',uid).order('due_date',{ascending:true})
  ]);
  [settings,tx,rec,obl].forEach((r,i)=>assertOk(r,['Settings','Transactions','Recurring','Obligations'][i]));
  state.openingBalance=Number(settings.data?.opening_balance||0);
  state.balanceDate=settings.data?.balance_date||todayISO();
  state.transactions=(tx.data||[]).map(r=>({id:r.id,date:r.transaction_date,description:r.description,category:r.category,type:r.transaction_type,amount:Number(r.amount),notes:r.notes||''}));
  state.recurring=(rec.data||[]).map(r=>({id:r.id,description:r.description,category:r.category,type:r.transaction_type,amount:Number(r.amount),frequency:r.frequency,nextDate:r.next_date,active:r.active}));
  state.obligations=(obl.data||[]).map(r=>({id:r.id,name:r.name,dueDate:r.due_date,target:Number(r.target_amount),reserved:Number(r.reserved_amount),frequency:r.frequency}));
  render(); setSync('Synced');
}

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){ $('#loginScreen').style.display='grid'; return; }
  currentUser=session.user;
  $('#loginScreen').style.display='none';
  $('.app-shell').hidden=false;
  try{ await loadData(); }catch(e){ console.error(e); setSync('Sync failed',true); alert(e.message); }
}

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); const btn=$('#loginSubmitBtn'); $('#loginError').textContent=''; btn.disabled=true; btn.textContent='Signing in…';
  const {error}=await sb.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});
  btn.disabled=false;btn.textContent='Sign In'; if(error){$('#loginError').textContent=error.message;return;} await boot();
});
$('#signOutBtn').addEventListener('click',async()=>{await sb.auth.signOut();location.reload();});

function calcLedger(){
  let balance=Number(state.openingBalance)||0;
  return [...state.transactions].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>{ if(!state.balanceDate||t.date>state.balanceDate) balance += t.type==='credit'?t.amount:-t.amount; return {...t,balance}; });
}
function currentBalance(){ const rows=calcLedger(); return rows.length?rows[rows.length-1].balance:Number(state.openingBalance)||0; }
function addMonths(date,months){ const d=new Date(date); const day=d.getDate(); d.setMonth(d.getMonth()+months); if(d.getDate()<day)d.setDate(0); return d; }
function occurrencesWithin(item,days=90){
  if(!item.active)return 0; const now=new Date(); now.setHours(0,0,0,0); const end=new Date(now);end.setDate(end.getDate()+days); let d=new Date(`${item.nextDate}T12:00:00`),count=0,guard=0;
  const step={monthly:1,quarterly:3,semiannual:6,annual:12}[item.frequency]||12;
  while(d<=end&&guard++<24){if(d>=now)count++;d=addMonths(d,step);} return count;
}
function renderSummary(){
  const bal=currentBalance(), now=new Date(), ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const month=state.transactions.filter(t=>t.date.startsWith(ym)), credits=month.filter(t=>t.type==='credit'), debits=month.filter(t=>t.type==='debit');
  const reserved=state.obligations.reduce((s,o)=>s+o.reserved,0);
  let fCredits=0,fDebits=0; state.recurring.forEach(r=>{const total=r.amount*occurrencesWithin(r); if(r.type==='credit')fCredits+=total;else fDebits+=total;});
  $('#currentBalance').textContent=money(bal); $('#balanceAsOf').textContent=`Starting balance ${money(state.openingBalance)} as of ${shortDate(state.balanceDate)}`;
  $('#monthCredits').textContent=`+${money(credits.reduce((s,t)=>s+t.amount,0))}`;$('#monthCreditsCount').textContent=`${credits.length} posted credit${credits.length===1?'':'s'}`;
  $('#monthDebits').textContent=`-${money(debits.reduce((s,t)=>s+t.amount,0))}`;$('#monthDebitsCount').textContent=`${debits.length} posted debit${debits.length===1?'':'s'}`;
  $('#reservedTotal').textContent=money(reserved);$('#availableBalance').textContent=money(bal-reserved);
  $('#forecastCredits').textContent=`+${money(fCredits)}`;$('#forecastDebits').textContent=`-${money(fDebits)}`;$('#projectedBalance').textContent=money(bal+fCredits-fDebits);$('#projectedAvailable').textContent=money(bal+fCredits-fDebits-reserved);
}
function renderRecurring(){
  const el=$('#recurringList'); if(!state.recurring.length){el.innerHTML='<div class="empty-state">No recurring activity yet.</div>';return;}
  el.innerHTML=state.recurring.map(r=>`<div class="recurring-item"><div><strong>${escapeHtml(r.description)}</strong><small>${escapeHtml(r.frequency)} · next ${shortDate(r.nextDate)} · ${escapeHtml(r.category)}</small></div><div class="item-actions"><strong class="${r.type==='credit'?'positive':'negative'}">${signedMoney(r.amount,r.type)}</strong><button class="delete-btn" data-delete-rec="${r.id}" type="button">Delete</button></div></div>`).join('');
}
function renderObligations(){
  const el=$('#obligationsList'); if(!state.obligations.length){el.innerHTML='<div class="empty-state">No large obligations yet.</div>';return;}
  el.innerHTML=state.obligations.map(o=>{const pct=Math.min(100,o.target?o.reserved/o.target*100:0),remaining=Math.max(0,o.target-o.reserved),months=Math.max(1,Math.ceil((new Date(`${o.dueDate}T12:00:00`)-new Date())/(1000*60*60*24*30.44)));return `<div class="obligation"><div><strong>${escapeHtml(o.name)}</strong><div class="sub">Due ${shortDate(o.dueDate)} · ${escapeHtml(o.frequency)}</div><div class="progress"><span style="width:${pct}%"></span></div></div><div><div class="label">Target</div><strong>${money(o.target)}</strong></div><div><div class="label">Reserved</div><strong>${money(o.reserved)}</strong></div><div><div class="label">Suggested / mo</div><strong>${money(remaining/months)}</strong></div><div class="item-actions"><button class="delete-btn" data-delete-obl="${o.id}" type="button">Delete</button></div></div>`;}).join('');
}
function renderLedger(){
  const tbody=$('#ledger tbody');tbody.innerHTML='';const search=$('#searchInput').value.toLowerCase(),category=$('#categoryFilter').value||'all';const rows=calcLedger();
  const categories=[...new Set(state.transactions.map(t=>t.category).filter(Boolean))].sort(),sel=$('#categoryFilter'),selected=sel.value||'all'; sel.innerHTML='<option value="all">All categories</option>'+categories.map(c=>`<option>${escapeHtml(c)}</option>`).join(''); if(selected==='all'||categories.includes(selected))sel.value=selected;
  const filtered=rows.filter(t=>(category==='all'||t.category===category)&&`${t.description} ${t.category} ${t.notes}`.toLowerCase().includes(search));$('#emptyLedger').hidden=filtered.length>0;
  filtered.forEach(t=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${shortDate(t.date)}</td><td>${escapeHtml(t.description)}</td><td><span class="pill">${escapeHtml(t.category)}</span></td><td>${t.type==='credit'?'Credit':'Debit'}</td><td class="amt ${t.type==='credit'?'positive':'negative'}">${signedMoney(t.amount,t.type)}</td><td class="amt">${money(t.balance)}</td><td>${escapeHtml(t.notes||'')}</td><td><div class="item-actions"><button class="small-btn" data-edit-tx="${t.id}" type="button">Edit</button><button class="delete-btn" data-delete-tx="${t.id}" type="button">Delete</button></div></td>`;tbody.appendChild(tr);});
}
function render(){renderSummary();renderRecurring();renderObligations();renderLedger();}

$('#balanceBtn').addEventListener('click',()=>{$('#openingBalanceDate').value=state.balanceDate||todayISO();$('#openingBalanceAmount').value=state.openingBalance||0;openDialog('balanceDialog');});
$('#balanceForm').addEventListener('submit',async e=>{e.preventDefault();const payload={user_id:currentUser.id,opening_balance:Number($('#openingBalanceAmount').value),balance_date:$('#openingBalanceDate').value,updated_at:new Date().toISOString()};try{assertOk(await sb.from('papa_settings').upsert(payload,{onConflict:'user_id'}),'Balance save failed');closeDialog('balanceDialog');await loadData();}catch(err){alert(err.message);}});

$('#addTransactionBtn').addEventListener('click',()=>{editingTransactionId=null;$('#transactionDialogTitle').textContent='Add Transaction';$('#transactionForm').reset();$('#txDate').value=todayISO();openDialog('transactionDialog');});
$('#transactionForm').addEventListener('submit',async e=>{
  e.preventDefault();setSync('Saving…');const payload={user_id:currentUser.id,transaction_date:$('#txDate').value,description:$('#txDescription').value.trim(),category:$('#txCategory').value.trim(),transaction_type:$('#txType').value,amount:Number($('#txAmount').value),notes:$('#txNotes').value.trim(),updated_at:new Date().toISOString()};
  try{ if(editingTransactionId) assertOk(await sb.from('papa_transactions').update(payload).eq('id',editingTransactionId).eq('user_id',currentUser.id),'Update failed'); else assertOk(await sb.from('papa_transactions').insert(payload),'Insert failed'); closeDialog('transactionDialog');await loadData(); }catch(err){console.error(err);setSync('Save failed',true);alert(err.message);}
});
$('#addRecurringBtn').addEventListener('click',()=>{$('#recurringForm').reset();$('#recNextDate').value=todayISO();openDialog('recurringDialog');});
$('#recurringForm').addEventListener('submit',async e=>{e.preventDefault();const payload={user_id:currentUser.id,description:$('#recDescription').value.trim(),category:$('#recCategory').value.trim(),transaction_type:$('#recType').value,amount:Number($('#recAmount').value),frequency:$('#recFrequency').value,next_date:$('#recNextDate').value,active:true,updated_at:new Date().toISOString()};try{assertOk(await sb.from('papa_recurring').insert(payload),'Recurring item failed');closeDialog('recurringDialog');await loadData();}catch(err){alert(err.message);}});
$('#addObligationBtn').addEventListener('click',()=>{$('#obligationForm').reset();$('#oblReserved').value=0;openDialog('obligationDialog');});
$('#obligationForm').addEventListener('submit',async e=>{e.preventDefault();const payload={user_id:currentUser.id,name:$('#oblName').value.trim(),due_date:$('#oblDueDate').value,target_amount:Number($('#oblTarget').value),reserved_amount:Number($('#oblReserved').value),frequency:$('#oblFrequency').value,updated_at:new Date().toISOString()};try{assertOk(await sb.from('papa_obligations').insert(payload),'Obligation failed');closeDialog('obligationDialog');await loadData();}catch(err){alert(err.message);}});

document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
$('#searchInput').addEventListener('input',renderLedger);$('#categoryFilter').addEventListener('change',renderLedger);
document.body.addEventListener('click',async e=>{
  const edit=e.target.dataset.editTx;if(edit){const t=state.transactions.find(x=>x.id===edit);if(!t)return;editingTransactionId=t.id;$('#transactionDialogTitle').textContent='Edit Transaction';$('#txDate').value=t.date;$('#txDescription').value=t.description;$('#txCategory').value=t.category;$('#txType').value=t.type;$('#txAmount').value=t.amount;$('#txNotes').value=t.notes||'';openDialog('transactionDialog');return;}
  const specs=[['deleteTx','papa_transactions','transaction'],['deleteRec','papa_recurring','recurring item'],['deleteObl','papa_obligations','obligation']];
  for(const [key,table,label] of specs){const id=e.target.dataset[key];if(id&&confirm(`Delete this ${label}?`)){try{assertOk(await sb.from(table).delete().eq('id',id).eq('user_id',currentUser.id),'Delete failed');await loadData();}catch(err){alert(err.message);}return;}}
});
$('#exportBtn').addEventListener('click',()=>{const rows=calcLedger();const csv=[['Date','Description','Category','Type','Amount','Running Balance','Notes'],...rows.map(t=>[t.date,t.description,t.category,t.type,t.amount.toFixed(2),t.balance.toFixed(2),t.notes||''])].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`papas-pocketbook-${todayISO()}.csv`;a.click();URL.revokeObjectURL(url);});

sb.channel('papas-pocketbook-sync')
  .on('postgres_changes',{event:'*',schema:'public',table:'papa_transactions'},()=>currentUser&&loadData())
  .on('postgres_changes',{event:'*',schema:'public',table:'papa_recurring'},()=>currentUser&&loadData())
  .on('postgres_changes',{event:'*',schema:'public',table:'papa_obligations'},()=>currentUser&&loadData())
  .on('postgres_changes',{event:'*',schema:'public',table:'papa_settings'},()=>currentUser&&loadData())
  .subscribe();

boot();
