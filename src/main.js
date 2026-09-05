import { createClient } from '@supabase/supabase-js';
import './style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const SITE_URL = import.meta.env.VITE_SITE_URL || window.location.origin;

const supabase = (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const app = document.querySelector('#app');
let currentUser = null;
let profile = null;
let meeting = null;
let localStream = null;
let screenStream = null;
let rtcPeers = new Map();
let channel = null;
let mediaState = { mic: true, camera: true };

const $ = (s) => document.querySelector(s);
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast = (m, type='info') => {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = m;
  document.body.appendChild(el); setTimeout(()=>el.remove(), 3200);
};
const meetingCode = () => {
  const chars='abcdefghijklmnopqrstuvwxyz';
  const part=()=>Array.from({length:3},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  return `${part()}-${part()}-${part()}`;
};
const passcode = () => String(Math.floor(Math.random()*100000)).padStart(5,'0');

function intro() {
  app.innerHTML = `<div class="intro-video">
    <video id="introVideo" autoplay muted playsinline preload="auto">
      <source src="/assets/tredt-loading.mp4" type="video/mp4">
    </video>
    <div class="intro-overlay">
      <div class="intro-sector-one">TREDT PUBLICATIONS STUDIOS</div>
      <div class="intro-sector-two">TREDT SMP GAMEPLAY<br>CONFERENCE CALL WEB APP</div>
    </div>
    <div class="intro-skip"><button id="skipIntro">SKIP</button></div>
  </div>`;
  const v=$('#introVideo');
  const finish=()=>{v.pause();route();};
  $('#skipIntro').onclick=finish;
  v.onended=finish;
  v.onerror=()=>route();
  setTimeout(()=>{ if(!document.querySelector('.shell') && !document.querySelector('.auth-page')) finish(); }, 18000);
}
function shell(content, active='home') {
  app.innerHTML = `<div class="shell">
    <header class="topbar">
      <button class="icon-btn admin-icon" id="adminBtn" title="Admin"><img src="/assets/command-block.svg"></button>
      <div class="brand"><span class="brand-mark">T</span><span>TREDT SMP <b>GAMEPLAY</b></span></div>
      <div class="top-actions"><span class="status-dot"></span><span class="user-mini">${esc(profile?.minecraft_username || '')}</span><button class="icon-btn" id="profileBtn" title="Profile"><img src="/assets/steve.svg"></button></div>
    </header>
    <main>${content}</main>
  </div>`;
  $('#adminBtn').onclick=()=>profile?.is_admin ? adminPanel() : toast('Admin access only','error');
  $('#profileBtn').onclick=profilePanel;
}

async function route(){
  const path=location.pathname;
  if(!supabase){ configScreen(); return; }
  const {data:{session}}=await supabase.auth.getSession();
  currentUser=session?.user || null;
  if(currentUser) await loadProfile();
  if(path.startsWith('/meeting/')) { 
    const code=path.split('/')[2]?.toLowerCase(); joinPage(code); return;
  }
  if(currentUser) dashboard(); else authScreen();
}

async function loadProfile(){
  const {data,error}=await supabase.from('profiles').select('*').eq('id',currentUser.id).single();
  if(error) console.error(error); profile=data;
}

function configScreen(){
  app.innerHTML=`<div class="center-page"><div class="panel"><h1>TREDT SMP</h1><p class="muted">Supabase is not configured yet.</p><p>Copy <code>.env.example</code> to <code>.env</code>, add your Supabase URL and anon key, then restart Vite.</p><p class="muted">The ZIP includes the database schema, RLS policies, realtime signaling, Netlify email function, and deployment notes.</p></div></div>`;
}

function authScreen(){
  app.innerHTML=`<div class="auth-page">
    <div class="auth-card">
      <div class="pixel-title"><span>TREDT</span><b>SMP</b></div>
      <p class="tag">GAMEPLAY CONFERENCE</p>
      <div class="tabs"><button class="tab active" data-tab="login">LOGIN</button><button class="tab" data-tab="register">REGISTER</button></div>
      <form id="authForm"></form>
      <p class="fine">No email verification or 2FA is required by this app configuration.</p>
    </div>
  </div>`;
  const render=(tab)=>{
    $('.tabs .active')?.classList.remove('active'); document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    $('#authForm').innerHTML=tab==='login'
      ? `<label>Email ID<input id="email" type="email" required></label><label>Password<input id="password" type="password" required></label><button class="mc-btn primary">ENTER WORLD</button>`
      : `<label>Minecraft Username<input id="username" maxlength="16" required></label><label>Email ID<input id="email" type="email" required></label><label>Password<input id="password" type="password" minlength="8" required></label><button class="mc-btn primary">CREATE PROFILE</button>`;
    $('#authForm').onsubmit=async e=>{
      e.preventDefault(); const email=$('#email').value.trim(), password=$('#password').value;
      if(tab==='login'){
        const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) return toast(error.message,'error');
      }else{
        const username=$('#username').value.trim();
        const {data,error}=await supabase.auth.signUp({email,password,options:{data:{minecraft_username:username}}});
        if(error) return toast(error.message,'error');
        if(data.user){ await supabase.from('profiles').upsert({id:data.user.id,minecraft_username:username,email,is_admin:false}); }
      }
      await route();
    };
  };
  render('login');
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>render(b.dataset.tab));
}

function dashboard(){
  shell(`<section class="dashboard">
    <div class="hero">
      <div><div class="eyebrow">TREDT SMP NETWORK</div><h1>Gameplay Conference</h1><p>Meet, plan and play together.</p></div>
      <div class="grass-block">✦</div>
    </div>
    <div class="cards">
      <button class="feature-card" id="instant"><span>⚡</span><h2>Instant Meeting</h2><p>Start a room now and become host.</p></button>
      <button class="feature-card" id="scheduled"><span>📅</span><h2>Set Meeting</h2><p>Schedule a room for a date and time.</p></button>
      <button class="feature-card" id="join"><span>🚪</span><h2>Join Meeting</h2><p>Enter a meeting ID and passcode.</p></button>
    </div>
    <div class="notice"><b>Tip:</b> Chrome/Edge work best for camera, microphone and screen sharing.</div>
  </section>`);
  $('#instant').onclick=()=>meetingForm(false); $('#scheduled').onclick=()=>meetingForm(true); $('#join').onclick=()=>joinPage('');
}

function meetingForm(scheduled){
  shell(`<section class="form-page"><button class="back" id="back">← Back</button><div class="panel large">
    <h1>${scheduled?'Set Meeting':'Instant Meeting'}</h1>
    <label>TOPIC<input id="topic" maxlength="120" placeholder="e.g. SMP Survival Session" required></label>
    <label class="check"><input id="protected" type="checkbox"> PASSCODE PROTECTED</label>
    <div id="passBox" class="hidden"><label>PASSCODE<input id="pass" inputmode="numeric" maxlength="5" placeholder="00000"></label></div>
    ${scheduled?'<label>DATE & TIME (IST)<input id="when" type="datetime-local" required></label>':''}
    <button class="mc-btn primary" id="create">${scheduled?'CREATE SCHEDULED MEETING':'START MEETING'}</button>
  </div></section>`);
  $('#back').onclick=dashboard;
  $('#protected').onchange=()=>$('#passBox').classList.toggle('hidden',!$('#protected').checked);
  $('#create').onclick=async()=>{
    const topic=$('#topic').value.trim(); if(!topic) return toast('Enter a topic','error');
    const protectedRoom=$('#protected').checked, pc=protectedRoom?$('#pass').value: null;
    if(protectedRoom && !/^\d{5}$/.test(pc)) return toast('Passcode must be exactly 5 digits','error');
    const code=meetingCode();
    const row={code,topic,passcode:pc,scheduled_for:scheduled?new Date($('#when').value).toISOString():new Date().toISOString(),created_by:currentUser.id,status:'active'};
    const {data,error}=await supabase.from('meetings').insert(row).select().single();
    if(error) return toast(error.message,'error'); meeting=data;
    await supabase.from('meeting_members').insert({meeting_id:data.id,user_id:currentUser.id,is_host:true});
    navigator.clipboard?.writeText(`${SITE_URL}/meeting/${code}`);
    toast('Meeting created — link copied','success'); enterMeeting(code);
  };
}

function joinPage(prefill=''){
  shell(`<section class="form-page"><div class="panel large"><h1>Join Meeting</h1>
    <label>MEETING ID<input id="code" maxlength="11" placeholder="abc-def-ghi" value="${esc(prefill)}"></label>
    <label>PASSCODE (If Required)<input id="pass" inputmode="numeric" maxlength="5" placeholder="00000"></label>
    <button class="mc-btn primary" id="joinNow">JOIN</button>
  </div></section>`);
  $('#joinNow').onclick=async()=>{
    const code=$('#code').value.trim().toLowerCase();
    const {data,error}=await supabase.from('meetings').select('*').eq('code',code).eq('status','active').single();
    if(error||!data) return toast('Meeting not found','error');
    if(data.passcode && $('#pass').value!==data.passcode) return toast('Incorrect passcode','error');
    meeting=data;
    const {count:memberCount}=await supabase.from('meeting_members').select('*',{count:'exact',head:true}).eq('meeting_id',data.id);
    const already=await supabase.from('meeting_members').select('user_id').eq('meeting_id',data.id).eq('user_id',currentUser.id).maybeSingle();
    if(!already.data && (memberCount||0)>=7) return toast('This meeting is full (maximum 7 participants).','error');
    await supabase.from('meeting_members').upsert({meeting_id:data.id,user_id:currentUser.id,is_host:false},{onConflict:'meeting_id,user_id'});
    enterMeeting(code);
  };
}

async function enterMeeting(code){
  history.pushState({},'',`/meeting/${code}`);
  await startMedia();
  const {data:members}=await supabase.from('meeting_members').select('user_id,is_host,profiles(minecraft_username)').eq('meeting_id',meeting.id);
  const isHost=members?.find(m=>m.user_id===currentUser.id)?.is_host;
  app.innerHTML=`<div class="call-page">
    <header class="call-top"><div><b>${esc(meeting.topic)}</b><span class="meeting-code">${code}</span></div><div class="call-top-actions"><button id="copyLink">COPY LINK</button><button id="leave">LEAVE</button></div></header>
    <section class="video-grid" id="grid"><div class="video-tile local"><video id="localVideo" autoplay muted playsinline></video><span>${esc(profile.minecraft_username)} (You)</span></div></section>
    <aside class="chat-panel"><h3>CHAT</h3><div id="messages"></div><form id="chatForm"><input id="chatInput" placeholder="Type a message..."><button>➤</button></form></aside>
    <footer class="controls"><button id="mic" class="control">🎙</button><button id="cam" class="control">📷</button><button id="screen" class="control">🖥</button><button id="participants" class="control">👥</button>${isHost?'<button id="hostPanel" class="control">⚒</button>':''}<button id="leave2" class="control danger">☎</button></footer>
  </div>`;
  $('#localVideo').srcObject=localStream;
  $('#copyLink').onclick=()=>navigator.clipboard.writeText(`${SITE_URL}/meeting/${code}`).then(()=>toast('Link copied','success'));
  $('#leave').onclick=$('#leave2').onclick=leaveMeeting;
  $('#mic').onclick=toggleMic; $('#cam').onclick=toggleCam; $('#screen').onclick=shareScreen;
  $('#chatForm').onsubmit=sendChat;
  if(isHost) $('#hostPanel').onclick=hostControls;
  setupRealtime(isHost);
}

async function startMedia(){
  try{ localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true}); }
  catch(e){ toast('Camera/microphone permission was not granted. You can still join with media disabled.','error'); localStream=new MediaStream(); }
}
function toggleMic(){ mediaState.mic=!mediaState.mic; localStream.getAudioTracks().forEach(t=>t.enabled=mediaState.mic); $('#mic').classList.toggle('off',!mediaState.mic); }
function toggleCam(){ mediaState.camera=!mediaState.camera; localStream.getVideoTracks().forEach(t=>t.enabled=mediaState.camera); $('#cam').classList.toggle('off',!mediaState.camera); }
async function shareScreen(){
  try{
    screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});
    const track=screenStream.getVideoTracks()[0];
    for(const pc of rtcPeers.values()){ const sender=pc.getSenders().find(s=>s.track?.kind==='video'); if(sender) await sender.replaceTrack(track); }
    track.onended=async()=>{ const cam=localStream.getVideoTracks()[0]; for(const pc of rtcPeers.values()){const s=pc.getSenders().find(x=>x.track?.kind==='video'); if(s) await s.replaceTrack(cam);} };
  }catch(e){ toast('Screen sharing cancelled','info'); }
}

async function hostControls(){
  const {data:members}=await supabase.from('meeting_members').select('user_id,is_host,profiles(minecraft_username)').eq('meeting_id',meeting.id);
  const others=(members||[]).filter(m=>m.user_id!==currentUser.id);
  if(!others.length) return toast('No other participants are connected yet.','info');
  const choices=others.map((m,i)=>`${i+1}. ${m.profiles?.minecraft_username||'Player'}`).join('\n');
  const pick=prompt(`HOST CONTROLS — maximum 7 participants\n\n${choices}\n\nEnter participant number:`);
  const idx=Number(pick)-1; if(!Number.isInteger(idx)||idx<0||idx>=others.length)return;
  const target=others[idx]; const action=prompt(`Action for ${target.profiles?.minecraft_username||'Player'}:\n1 = Mute microphone\n2 = Kick from meeting`);
  if(action==='1'){
    await channel.send({type:'broadcast',event:'control',payload:{to:target.user_id,action:'mute'}});
    toast('Mute command sent','success');
  } else if(action==='2'){
    await channel.send({type:'broadcast',event:'control',payload:{to:target.user_id,action:'kick'}});
    await supabase.from('meeting_members').delete().eq('meeting_id',meeting.id).eq('user_id',target.user_id);
    toast('Kick command sent','success');
  }
}

function setupRealtime(isHost){
  channel=supabase.channel(`meeting:${meeting.id}`,{config:{broadcast:{self:false},presence:{key:currentUser.id}}});
  channel.on('broadcast',{event:'chat'},({payload})=>appendChat(payload));
  channel.on('broadcast',{event:'media'},({payload})=>handleMediaSignal(payload));
  channel.on('broadcast',{event:'control'},({payload})=>{ if(payload.to!==currentUser.id) return; if(payload.action==='mute') {mediaState.mic=false;localStream.getAudioTracks().forEach(t=>t.enabled=false);toast('Host muted your microphone','error');} if(payload.action==='kick') leaveMeeting(true); });
  channel.on('presence',{event:'sync'},async()=>{
    const state=channel.presenceState();
    for(const id of Object.keys(state)) if(id!==currentUser.id && !rtcPeers.has(id)) await createPeer(id, true);
  });
  channel.subscribe(async status=>{ if(status==='SUBSCRIBED') await channel.track({username:profile.minecraft_username,isHost}); });
}
async function createPeer(peerId, initiator){
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  rtcPeers.set(peerId,pc);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.onicecandidate=e=>e.candidate&&channel.send({type:'broadcast',event:'media',payload:{from:currentUser.id,to:peerId,type:'candidate',candidate:e.candidate}});
  pc.ontrack=e=>{ let v=document.querySelector(`[data-peer="${peerId}"]`); if(!v){const tile=document.createElement('div');tile.className='video-tile';tile.dataset.peer=peerId;tile.innerHTML=`<video autoplay playsinline></video><span>Participant</span>`;$('#grid').appendChild(tile);v=tile.querySelector('video');} v.srcObject=e.streams[0]; };
  pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState)) rtcPeers.delete(peerId);};
  if(initiator){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await channel.send({type:'broadcast',event:'media',payload:{from:currentUser.id,to:peerId,type:'offer',sdp:offer}});}
}
async function handleMediaSignal(p){
  if(p.to!==currentUser.id) return;
  let pc=rtcPeers.get(p.from);
  if(!pc) await createPeer(p.from,false); pc=rtcPeers.get(p.from);
  if(p.type==='offer'){await pc.setRemoteDescription(p.sdp);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await channel.send({type:'broadcast',event:'media',payload:{from:currentUser.id,to:p.from,type:'answer',sdp:answer}});}
  if(p.type==='answer') await pc.setRemoteDescription(p.sdp);
  if(p.type==='candidate') try{await pc.addIceCandidate(p.candidate)}catch{}
}
function appendChat(p){ const box=$('#messages'); if(!box)return; const d=document.createElement('div'); d.className='msg'; d.innerHTML=`<b>${esc(p.username)}</b><span>${esc(p.text)}</span>`;box.appendChild(d);box.scrollTop=box.scrollHeight; }
async function sendChat(e){e.preventDefault();const text=$('#chatInput').value.trim();if(!text)return;appendChat({username:profile.minecraft_username,text});await channel.send({type:'broadcast',event:'chat',payload:{username:profile.minecraft_username,text}});$('#chatInput').value='';}
async function leaveMeeting(kicked=false){ try{await supabase.from('meeting_members').delete().eq('meeting_id',meeting.id).eq('user_id',currentUser.id);await channel?.unsubscribe();rtcPeers.forEach(pc=>pc.close());localStream?.getTracks().forEach(t=>t.stop());}catch{} history.pushState({},'', '/'); toast(kicked?'You were kicked by the host':'You left the meeting'); dashboard(); }

function profilePanel(){
  shell(`<section class="form-page"><div class="panel"><h1>Profile</h1><div class="profile-card"><img src="/assets/steve.svg"><div><b>${esc(profile.minecraft_username)}</b><span>${esc(profile.email)}</span></div></div><button class="mc-btn" id="logout">LOG OUT</button></div></section>`);
  $('#logout').onclick=async()=>{await supabase.auth.signOut();location.href='/';};
}
function adminPanel(){
  supabase.from('profiles').select('*').order('created_at',{ascending:false}).then(({data})=>{
    shell(`<section class="admin-page"><div class="panel large"><div class="admin-head"><h1>Command Block Admin</h1><span>ADMIN</span></div><p class="muted">Ban or delete profiles. A reason is recorded and can be emailed through the included Netlify function.</p><div id="users"></div></div></section>`);
    $('#users').innerHTML=(data||[]).map(u=>`<div class="user-row"><div><b>${esc(u.minecraft_username)}</b><small>${esc(u.email)}</small></div><div><button class="small danger-btn" data-ban="${u.id}">BAN</button></div></div>`).join('');
    document.querySelectorAll('[data-ban]').forEach(b=>b.onclick=()=>moderate(b.dataset.ban,'ban'));
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>moderate(b.dataset.del,'delete'));
  });
}
async function moderate(id, action='ban'){
  action='ban';
  if(id===currentUser.id) return toast('You cannot moderate yourself','error');
  const reason=prompt(`Reason for ${action}:`); if(!reason) return;
  const {data,error}=await supabase.from('profiles').select('*').eq('id',id).single(); if(error)return toast(error.message,'error');
  await supabase.from('moderation_actions').insert({target_user:id,admin_user:currentUser.id,action,reason});
  if(action==='ban') await supabase.from('profiles').update({is_banned:true,ban_reason:reason}).eq('id',id);
  toast(`${action.toUpperCase()} completed. Reason recorded for manual notification.`, 'success'); adminPanel();
}

supabase?.auth.onAuthStateChange(async (_e,session)=>{currentUser=session?.user||null;if(currentUser){await loadProfile(); if(profile?.is_banned||profile?.is_deleted){await supabase.auth.signOut();toast('This profile is unavailable.','error');return;} }});
window.addEventListener('popstate',route);
route();
