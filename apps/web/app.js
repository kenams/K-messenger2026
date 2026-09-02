import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const CONFIG_ENDPOINT='https://vlofsaivgydbzghptlfj.supabase.co/functions/v1/kss-config';
const $=(id)=>document.getElementById(id);
const state={supabase:null,session:null,me:null,contacts:[],peer:null,channel:null,authMode:'login',heartbeat:null};

const presenceLabel={online:'🟢 Disponible',busy:'🔴 Occupé',away:'🟠 Absent',invisible:'⚫ Invisible',offline:'⚫ Hors ligne'};
const escText=(v)=>String(v??'');
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),2600)}
function setMsg(id,msg,ok=false){const el=$(id);el.textContent=msg||'';el.style.color=ok?'#268856':'#c23f4b'}
function setView(name){for(const id of ['authView','profileView','appView']) $(id).classList.add('hidden');$(name).classList.remove('hidden')}
function avatarLetter(p){return (p?.nickname||p?.username||'?').trim().charAt(0).toUpperCase()||'?'}
function effectiveStatus(p){if(!p)return'offline';if(p.status==='invisible')return'offline';const seen=Date.parse(p.last_seen_at||0);if(!seen||Date.now()-seen>95000)return'offline';return p.status||'offline'}
function dotClass(el,s){el.className='presence-dot '+effectiveStatus({status:s,last_seen_at:new Date().toISOString()})}
function stopHeartbeat(){if(state.heartbeat){clearInterval(state.heartbeat);state.heartbeat=null}}
async function touchPresence(status='online'){if(!state.supabase||!state.session)return;await state.supabase.rpc('kss_touch_presence',{p_status:status})}
function startHeartbeat(){stopHeartbeat();touchPresence(state.me?.status||'online');state.heartbeat=setInterval(()=>touchPresence(state.me?.status||'online'),30000)}

async function init(){
 try{
  const r=await fetch(CONFIG_ENDPOINT,{cache:'no-store'});if(!r.ok)throw new Error('config');
  const cfg=await r.json();state.supabase=createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  state.supabase.auth.onAuthStateChange((_e,s)=>{state.session=s;if(!s){stopHeartbeat();state.me=null;state.peer=null;showAuth()}else{bootstrapUser()}});
  const {data}=await state.supabase.auth.getSession();state.session=data.session;
  if(data.session) await bootstrapUser(); else showAuth();
 }catch(e){console.error(e);$('boot').innerHTML='K-SSENGER <small>service indisponible</small>';}
}
function showAuth(){$('boot').classList.add('hidden');setView('authView')}
async function bootstrapUser(){
 $('boot').classList.remove('hidden');
 const {data,error}=await state.supabase.rpc('kss_get_my_profile');
 if(error){console.error(error);showAuth();return}
 const p=Array.isArray(data)?data[0]:data;
 if(!p){$('boot').classList.add('hidden');setView('profileView');return}
 state.me=p;renderMe();$('boot').classList.add('hidden');setView('appView');startHeartbeat();await Promise.all([loadContacts(),loadRequests()]);subscribeCore();
}
function renderMe(){
 $('meNickname').textContent=escText(state.me.nickname);$('meHandle').textContent='@'+escText(state.me.username);$('meMood').textContent=escText(state.me.mood);$('meMusic').textContent=state.me.music?'🎵 '+escText(state.me.music):'';$('meDot').className='presence-dot '+effectiveStatus(state.me);
}
function authMode(mode){state.authMode=mode;$('loginTab').classList.toggle('active',mode==='login');$('signupTab').classList.toggle('active',mode==='signup');$('authSubmit').textContent=mode==='login'?'Se connecter':'Créer mon compte';$('password').autocomplete=mode==='login'?'current-password':'new-password';setMsg('authMessage','')}
$('loginTab').onclick=()=>authMode('login');$('signupTab').onclick=()=>authMode('signup');
$('authForm').addEventListener('submit',async e=>{e.preventDefault();setMsg('authMessage','');const email=$('email').value.trim();const password=$('password').value;const btn=$('authSubmit');btn.disabled=true;try{let res;if(state.authMode==='login')res=await state.supabase.auth.signInWithPassword({email,password});else res=await state.supabase.auth.signUp({email,password});if(res.error)throw res.error;if(state.authMode==='signup'&&!res.data.session)setMsg('authMessage','Compte créé. Vérifie ton email puis connecte-toi.',true)}catch(err){setMsg('authMessage',friendly(err))}finally{btn.disabled=false}});

$('profileForm').addEventListener('submit',async e=>{e.preventDefault();const args={p_username:$('username').value.trim(),p_nickname:$('nickname').value.trim(),p_mood:$('mood').value.trim(),p_music:$('music').value.trim(),p_status:$('status').value};const {error}=await state.supabase.rpc('kss_upsert_profile',args);if(error){setMsg('profileMessage',friendly(error));return}setMsg('profileMessage','Profil enregistré.',true);await bootstrapUser()});
$('editProfile').onclick=()=>{if(!state.me)return;$('username').value=state.me.username;$('nickname').value=state.me.nickname;$('mood').value=state.me.mood||'';$('music').value=state.me.music||'';$('status').value=state.me.status==='offline'?'online':state.me.status;setView('profileView')};

for(const b of document.querySelectorAll('.top-tabs button'))b.onclick=()=>{document.querySelectorAll('.top-tabs button').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.panel+'Panel').classList.add('active')};

async function loadContacts(){const {data,error}=await state.supabase.rpc('kss_list_contacts');if(error){toast('Impossible de charger les contacts');return}state.contacts=data||[];renderContacts();if(state.peer){const fresh=state.contacts.find(x=>x.user_id===state.peer.user_id);if(fresh){state.peer=fresh;renderPeerHeader()}}}
function renderContacts(){const root=$('contactsList');root.replaceChildren();$('contactsEmpty').classList.toggle('hidden',state.contacts.length>0);for(const p of state.contacts){const card=document.createElement('button');card.type='button';card.className='contact-card';const av=document.createElement('span');av.className='contact-avatar';av.textContent=avatarLetter(p);const d=document.createElement('span');d.className='presence-dot '+effectiveStatus(p);av.appendChild(d);const copy=document.createElement('span');copy.className='contact-copy';const strong=document.createElement('strong');strong.textContent=p.nickname;const line=document.createElement('span');line.textContent=`${presenceLabel[effectiveStatus(p)]||'⚫ Hors ligne'} · @${p.username}`;const sub=document.createElement('span');sub.textContent=p.music?'🎵 '+p.music:(p.mood||'');copy.append(strong,line,sub);card.append(av,copy);card.onclick=()=>openChat(p);root.append(card)}}
$('refreshContacts').onclick=()=>Promise.all([loadContacts(),loadRequests()]);

async function loadRequests(){const {data,error}=await state.supabase.rpc('kss_list_incoming_requests');if(error)return;const rows=data||[];$('requestBadge').textContent=rows.length;$('requestBadge').classList.toggle('hidden',!rows.length);$('requestsEmpty').classList.toggle('hidden',!!rows.length);const root=$('requestsList');root.replaceChildren();for(const r of rows){const card=document.createElement('div');card.className='contact-card';const av=document.createElement('span');av.className='contact-avatar';av.textContent=avatarLetter(r);const copy=document.createElement('span');copy.className='contact-copy';const s=document.createElement('strong');s.textContent=r.nickname;const u=document.createElement('span');u.textContent='@'+r.username;copy.append(s,u);const actions=document.createElement('span');actions.className='row-actions';const yes=document.createElement('button');yes.textContent='✓';yes.title='Accepter';yes.onclick=async()=>{const {error}=await state.supabase.rpc('kss_accept_contact_request',{p_request_id:r.id});if(error)return toast(friendly(error));toast(`${r.nickname} ajouté`);await Promise.all([loadRequests(),loadContacts()])};const no=document.createElement('button');no.textContent='×';no.title='Refuser';no.onclick=async()=>{await state.supabase.rpc('kss_decline_contact_request',{p_request_id:r.id});loadRequests()};actions.append(yes,no);card.append(av,copy,actions);root.append(card)}}

$('searchForm').addEventListener('submit',async e=>{e.preventDefault();const q=$('searchInput').value.trim();const {data,error}=await state.supabase.rpc('kss_search_profiles',{p_query:q});if(error){setMsg('searchMessage',friendly(error));return}renderSearch(data||[]);setMsg('searchMessage',data?.length?'': 'Aucun utilisateur trouvé.')});
function renderSearch(rows){const root=$('searchList');root.replaceChildren();for(const p of rows){const card=document.createElement('div');card.className='contact-card';const av=document.createElement('span');av.className='contact-avatar';av.textContent=avatarLetter(p);const copy=document.createElement('span');copy.className='contact-copy';const s=document.createElement('strong');s.textContent=p.nickname;const u=document.createElement('span');u.textContent='@'+p.username;copy.append(s,u);const actions=document.createElement('span');actions.className='row-actions';const add=document.createElement('button');add.textContent='Ajouter';add.onclick=async()=>{const {error}=await state.supabase.rpc('kss_send_contact_request',{p_username:p.username});if(error)toast(friendly(error));else{toast('Invitation envoyée');add.disabled=true}};actions.append(add);card.append(av,copy,actions);root.append(card)}}

async function openChat(p){state.peer=p;$('welcomeChat').classList.add('hidden');$('chatView').classList.remove('hidden');$('appView').classList.add('chat-open');renderPeerHeader();await loadMessages()}
function renderPeerHeader(){if(!state.peer)return;$('peerAvatar').textContent=avatarLetter(state.peer);$('peerNickname').textContent=state.peer.nickname;$('peerStatus').textContent=presenceLabel[effectiveStatus(state.peer)]||'⚫ Hors ligne';$('peerMusic').textContent=state.peer.music?'🎵 '+state.peer.music:(state.peer.mood||'');$('peerDot').className='presence-dot '+effectiveStatus(state.peer)}
$('mobileBack').onclick=()=>{$('appView').classList.remove('chat-open')};
async function loadMessages(){if(!state.peer)return;const me=state.session.user.id,peer=state.peer.user_id;const filter=`and(sender_id.eq.${me},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${me})`;const {data,error}=await state.supabase.from('kss_messages').select('id,sender_id,recipient_id,body,kind,created_at').or(filter).order('created_at',{ascending:true}).limit(300);if(error){toast('Messages indisponibles');return}renderMessages(data||[])}
function renderMessages(rows){const root=$('messages');root.replaceChildren();for(const m of rows){if(m.kind==='wizz'){const w=document.createElement('div');w.className='wizz-message';w.textContent=(m.sender_id===state.session.user.id?'Tu as envoyé':'Tu as reçu')+' un ⚡ Wizz';root.append(w);continue}const row=document.createElement('div');row.className='message-row '+(m.sender_id===state.session.user.id?'mine':'theirs');const b=document.createElement('div');b.className='bubble';const text=document.createElement('div');text.textContent=m.body;const t=document.createElement('time');t.textContent=new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});b.append(text,t);row.append(b);root.append(row)}root.scrollTop=root.scrollHeight}
$('messageForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.peer)return;const input=$('messageInput'),body=input.value.trim();if(!body)return;input.value='';const {error}=await state.supabase.rpc('kss_send_message',{p_recipient:state.peer.user_id,p_body:body,p_kind:'text'});if(error){toast(friendly(error));input.value=body;return}await loadMessages()});
$('wizz').onclick=async()=>{if(!state.peer)return;const {error}=await state.supabase.rpc('kss_send_message',{p_recipient:state.peer.user_id,p_body:'WIZZ',p_kind:'wizz'});if(error)return toast(friendly(error));doWizz('Wizz envoyé ⚡');await loadMessages()};
function doWizz(text){const shell=$('chatView');shell.classList.remove('wizzing');void shell.offsetWidth;document.body.classList.add('wizzing');shell.classList.add('wizzing');setTimeout(()=>{shell.classList.remove('wizzing');document.body.classList.remove('wizzing')},900);$('wizzBanner').textContent=text;$('wizzBanner').classList.remove('hidden');setTimeout(()=>$('wizzBanner').classList.add('hidden'),1300);if(navigator.vibrate)navigator.vibrate([80,40,80])}
$('blockPeer').onclick=async()=>{if(!state.peer)return;if(!confirm(`Bloquer ${state.peer.nickname} ? Vous ne pourrez plus vous écrire.`))return;const {error}=await state.supabase.rpc('kss_block_user',{p_user:state.peer.user_id});if(error)return toast(friendly(error));toast('Utilisateur bloqué');state.peer=null;$('chatView').classList.add('hidden');$('welcomeChat').classList.remove('hidden');$('appView').classList.remove('chat-open');loadContacts()};

function subscribeCore(){if(state.channel)state.supabase.removeChannel(state.channel);const me=state.session.user.id;state.channel=state.supabase.channel('kss-beta-'+me)
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'kss_messages',filter:`recipient_id=eq.${me}`},payload=>{if(payload.new.kind==='wizz'){const sender=state.contacts.find(x=>x.user_id===payload.new.sender_id);doWizz(`${sender?.nickname||'Un contact'} t'envoie un Wizz ⚡`)}if(state.peer&&payload.new.sender_id===state.peer.user_id)loadMessages();else toast('💬 Nouveau message')})
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'kss_contact_requests',filter:`recipient_id=eq.${me}`},()=>{toast('👋 Nouvelle invitation');loadRequests()})
 .on('postgres_changes',{event:'UPDATE',schema:'public',table:'kss_profiles'},()=>loadContacts())
 .subscribe();}

$('logout').onclick=async()=>{try{await touchPresence('offline')}catch{}stopHeartbeat();if(state.channel)await state.supabase.removeChannel(state.channel);await state.supabase.auth.signOut()};
window.addEventListener('beforeunload',()=>{stopHeartbeat()});
document.addEventListener('visibilitychange',()=>{if(!state.session)return;if(document.visibilityState==='visible'){touchPresence(state.me?.status||'online');loadContacts()}else touchPresence('away')});

function friendly(err){const m=(err?.message||String(err||'Erreur')).toLowerCase();if(m.includes('invalid login'))return'Email ou mot de passe incorrect.';if(m.includes('email not confirmed'))return'Confirme ton email avant de te connecter.';if(m.includes('already registered'))return'Cet email possède déjà un compte.';if(m.includes('user not found'))return'Utilisateur introuvable.';if(m.includes('already contacts'))return'Vous êtes déjà contacts.';if(m.includes('blocked'))return'Action impossible avec cet utilisateur.';if(m.includes('cooldown'))return'Wizz en recharge… attends quelques secondes ⚡';if(m.includes('username')||m.includes('duplicate'))return'Cet identifiant est déjà pris ou invalide.';if(m.includes('rate'))return'Trop de tentatives. Réessaie dans un moment.';return err?.message||'Une erreur est survenue.'}

init();
