
/* Site update gate — enabled (+ optional ends_at) */
(async function(){
  try{
    if(typeof loadGzConfig === 'function') await loadGzConfig();
  }catch(e){}
  var URL = (window.SUPABASE_URL||'');
  var KEY = (window.SUPABASE_ANON_KEY||'');
  if(!URL||!KEY) return;
  function baseDir(strip){
    var path=location.pathname||'/';
    if(/\/index\.html$/i.test(path)) path=path.replace(/\/index\.html$/i,'/');
    else if(!path.endsWith('/')){
      if(/\.[a-zA-Z0-9]+$/.test(path.split('/').pop())) path=path.replace(/\/[^/]*$/,'/');
      else path=path+'/';
    }
    return path.replace(new RegExp('/'+strip+'/?$','i'),'/');
  }
  function active(row){
    if(!row||!row.enabled) return false;
    if(!row.ends_at) return true;
    var end=Date.parse(row.ends_at);
    return isFinite(end)&&end>Date.now();
  }
  function goUpdate(strip){
    try{location.replace(baseDir(strip)+'update/');}catch(e){location.replace('/update/');}
  }
  function check(strip){
    fetch(URL+'/rest/v1/rpc/site_update_normalize',{
      method:'POST',
      headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
      body:'{}'
    }).then(function(r){return r.ok?r.json():null;}).then(function(data){
      if(data&&data.ok){ if(data.active) goUpdate(strip); return; }
      return fetch(URL+'/rest/v1/site_update?id=eq.1&select=enabled,ends_at&limit=1',{
        headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}
      }).then(function(r){return r.ok?r.json():[];}).then(function(rows){
        if(active(rows&&rows[0])) goUpdate(strip);
      });
    }).catch(function(){});
  }
  check('login');
})();


(function(){
  var urls = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js',
    'https://unpkg.com/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js'
  ];
  window.__sbLoadPromise = new Promise(function(resolve){
    var i = 0;
    function next(){
      if (typeof supabase !== 'undefined' && supabase.createClient) { resolve(true); return; }
      if (i >= urls.length) { resolve(false); return; }
      var s = document.createElement('script');
      s.src = urls[i++];
      s.async = true;
      s.onload = function(){ if (typeof supabase !== 'undefined') resolve(true); else next(); };
      s.onerror = function(){ next(); };
      document.head.appendChild(s);
    }
    next();
  });
})();

let SUPABASE_URL = (typeof window !== "undefined" && window.SUPABASE_URL) || "";
let SUPABASE_ANON_KEY = (typeof window !== "undefined" && window.SUPABASE_ANON_KEY) || "";
let sb = null;
let sbInitError = null;

async function ensureSupabase(){
  if(sb) return sb;
  try{
    if(typeof loadGzConfig === "function"){
      const cfg = await loadGzConfig();
      if(cfg){ SUPABASE_URL = cfg.SUPABASE_URL || SUPABASE_URL; SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY; }
    }
  }catch(e){ console.warn("config", e); }
  try{
    // wait for CDN (max ~6s)
    if(window.__sbLoadPromise){
      const ok = await Promise.race([
        window.__sbLoadPromise,
        new Promise(r => setTimeout(() => r(false), 6000))
      ]);
      if(!ok && typeof supabase === 'undefined'){
        sbInitError = 'library_load_failed';
        return null;
      }
    }
    if(typeof supabase === 'undefined' || !supabase.createClient){
      sbInitError = 'library_missing';
      return null;
    }
    if(!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT') || !SUPABASE_ANON_KEY){
      sbInitError = 'config_missing';
      return null;
    }
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-client-info': 'guessino-login' } }
    });
    // lightweight connectivity probe
    try{
      const { error } = await Promise.race([
        sb.from('users').select('id').limit(1),
        new Promise((_, rej) => setTimeout(() => rej(new Error('probe_timeout')), 5000))
      ]);
      // RLS may block; network/key errors matter more
      if(error){
        const m = String(error.message||'').toLowerCase();
        if(m.includes('invalid api key') || m.includes('jwt') || m.includes('api key')){
          sbInitError = 'invalid_key';
        }
        // still keep client — many tables allow anon with open RLS
      }
    }catch(e){
      const m = String(e && e.message || e).toLowerCase();
      if(m.includes('failed to fetch') || m.includes('network') || m.includes('probe_timeout')){
        sbInitError = 'network';
      }
    }
    return sb;
  }catch(e){
    sbInitError = 'create_failed';
    console.error('supabase init', e);
    sb = null;
    return null;
  }
}

function sbNotConnectedMessage(){
  if(sbInitError === 'library_load_failed' || sbInitError === 'library_missing'){
    return 'Could not load database library. Check network / CDN (jsDelivr or unpkg) and try again.';
  }
  if(sbInitError === 'invalid_key'){
    return 'Invalid Supabase API key. Put the anon public key from Project Settings → API.';
  }
  if(sbInitError === 'network'){
    return 'Cannot reach Supabase. Check internet, VPN, or DNS and try again.';
  }
  if(sbInitError === 'config_missing'){
    return 'Supabase URL/key is not configured.';
  }
  return 'Database is not connected. Please check your connection.';
}

const $ = (id) => document.getElementById(id);
let authMode = 'login';

async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ========== ULTRA ANTI-BOT + HARD CAPTCHA v3 ========== */
const AUTH_OPENED_AT = Date.now();

/* ---------- 80-min hard bot ban (persisted) ---------- */
const BOT_BAN_MS = 80 * 60 * 1000;
const BOT_BAN_KEY = 'gz_bot_ban_until';
const BOT_BAN_REASON_KEY = 'gz_bot_ban_reason';
// پیام خیلی تند برای ربات شناسایی‌شده
const BOT_BAN_MSG = 'کیرم دهنت ربات مادر‌جندهٔ کس‌کش — ۸۰ دقیقه برو گمشو، هیچی برات کار نمی‌کنه.';

function getBotBanUntil(){
  try{
    const v = parseInt(localStorage.getItem(BOT_BAN_KEY) || '0', 10);
    return (v && v > Date.now()) ? v : 0;
  }catch(e){ return 0; }
}
function isBotBanned(){
  return getBotBanUntil() > Date.now();
}
function applyBotBan(reason){
  const until = Date.now() + BOT_BAN_MS;
  try{
    localStorage.setItem(BOT_BAN_KEY, String(until));
    localStorage.setItem(BOT_BAN_REASON_KEY, String(reason || 'automation'));
    // wipe session so they cannot stay logged in
    localStorage.removeItem('gz_user_id');
  }catch(e){}
  try{
    if(typeof logAntiBot === 'function'){
      logAntiBot('bot_ban_80m', { reason: reason || 'automation', until: new Date(until).toISOString() });
    }
  }catch(e){}
  showBotBanScreen(reason);
}
function clearBotBanIfExpired(){
  try{
    const v = parseInt(localStorage.getItem(BOT_BAN_KEY) || '0', 10);
    if(v && v <= Date.now()){
      localStorage.removeItem(BOT_BAN_KEY);
      localStorage.removeItem(BOT_BAN_REASON_KEY);
    }
  }catch(e){}
}
function showBotBanScreen(reason){
  const until = getBotBanUntil();
  const mins = until ? Math.max(1, Math.ceil((until - Date.now()) / 60000)) : 80;
  const html = `<div id="botBanOverlay" style="position:fixed;inset:0;z-index:999999;background:#0a0505;color:#f5e6d0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Tahoma,Arial,sans-serif">
    <div style="max-width:420px">
      <div style="font-size:56px;margin-bottom:12px">🚫</div>
      <div style="font-size:20px;font-weight:900;line-height:1.55;color:#ff6b6b;margin-bottom:14px">${BOT_BAN_MSG}</div>
      <div style="font-size:14px;color:#c9a227;margin-bottom:8px">محرومیت موقت: حدود ${mins} دقیقه باقی مانده</div>
      <div style="font-size:12px;color:#9a8b72;line-height:1.6">ربات تشخیص داده شد. تا پایان محرومیت هیچ گزینه‌ای فعال نیست.<br>دلیل: ${String(reason||'automation').replace(/[<>&]/g,'')}</div>
    </div>
  </div>`;
  try{
    // disable everything
    document.documentElement.style.pointerEvents = 'none';
    const existing = document.getElementById('botBanOverlay');
    if(existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    const ov = document.getElementById('botBanOverlay');
    if(ov){ ov.style.pointerEvents = 'auto'; }
    // block keys
    window.addEventListener('keydown', function blockKeys(e){ e.preventDefault(); e.stopPropagation(); }, true);
    window.addEventListener('contextmenu', function(e){ e.preventDefault(); }, true);
  }catch(e){
    try{ document.body.innerHTML = html; }catch(_){}
  }
}

function clearFalsePositiveBansOnce(){
  try{
    if(localStorage.getItem('gz_ban_fp_cleared_v31') === '1') return;
    localStorage.setItem('gz_ban_fp_cleared_v31', '1');
    // clear any previous over-aggressive bans so real users can enter again
    localStorage.removeItem('gz_bot_ban_until');
    localStorage.removeItem('gz_bot_ban_reason');
  }catch(e){}
}

function enforceBotBanOnBoot(){
  clearFalsePositiveBansOnce();
  clearBotBanIfExpired();
  if(isBotBanned()){
    const reason = (function(){ try{ return localStorage.getItem(BOT_BAN_REASON_KEY)||'automation'; }catch(e){ return 'automation'; }})();
    showBotBanScreen(reason);
    return true;
  }
  return false;
}

const MIN_FORM_MS = 2500;
const MAX_ACCOUNTS_PER_DEVICE_24H = 2;
const MAX_ACCOUNTS_PER_DEVICE_TOTAL = 3;
const MAX_FAILED_ATTEMPTS = 4;
const LOCKOUT_MS = 120000;
const POW_DIFFICULTY = 3; // leading zero hex digits (16^4 = 65536 avg hashes)
let failCount = 0;
let lockUntil = 0;
let captchaToken = null;
let captchaTokenExp = 0;
let interactionScore = 0;
let lastHumanEventAt = 0;

/* --- Human interaction scoring (bots often skip real events) --- */
(function trackHumanSignals(){
  const bump = (w)=>{
    interactionScore = Math.min(100, interactionScore + w);
    lastHumanEventAt = Date.now();
  };
  ['pointermove','pointerdown','touchstart','keydown','scroll','mousemove'].forEach(ev=>{
    window.addEventListener(ev, ()=> bump(ev==='pointermove'||ev==='mousemove'?0.15:1.2), {passive:true, once:false});
  });
  // visibility / focus
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') bump(2); });
  window.addEventListener('focus', ()=> bump(1.5));
})();

function collectDeviceSignals(){
  const nav = navigator || {};
  const scr = window.screen || {};
  const tz = (()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }catch(e){ return ''; }})();
  let canvasHash = '', webglHash = '', audioHash = '';
  try{
    const c = document.createElement('canvas');
    c.width = 320; c.height = 70;
    const ctx = c.getContext('2d');
    if(ctx){
      ctx.textBaseline = 'top';
      ctx.font = '15px "Segoe UI", Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0,0,320,70);
      ctx.fillStyle = '#069';
      ctx.fillText('GZ-FP3-'+nav.language+'-'+(performance.now()|0), 3, 3);
      ctx.fillStyle = 'rgba(102,204,0,0.75)';
      ctx.fillText('v3', 6, 24);
      ctx.strokeStyle = '#c45c26';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(160,35,22,0,Math.PI*1.7); ctx.stroke();
      ctx.fillStyle = '#fff';
      for(let i=0;i<12;i++){ ctx.fillRect(20+i*22, 50+Math.sin(i)*6, 3, 3); }
      canvasHash = c.toDataURL().slice(-96);
    }
  }catch(e){}
  try{
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if(gl){
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '';
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      webglHash = (vendor+'|'+renderer+'|'+gl.getParameter(gl.VERSION)+'|'+gl.getParameter(gl.SHADING_LANGUAGE_VERSION)).slice(0,160);
    }
  }catch(e){}
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC){
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const an = ctx.createAnalyser();
      osc.connect(an); an.connect(ctx.destination);
      osc.frequency.value = 440;
      osc.start(0);
      const freq = an.frequencyBinCount;
      osc.stop();
      try{ ctx.close(); }catch(_){}
      audioHash = String(freq)+':'+String(ctx.sampleRate||0);
    }
  }catch(e){}
  let fontsProbe = '';
  try{
    const base = ['monospace','serif','sans-serif'];
    const test = ['Arial','Courier New','Georgia','Times New Roman','Verdana','Comic Sans MS','Impact'];
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:72px;visibility:hidden;';
    span.textContent = 'mmmmmmmmmmlli';
    const root = document.body || document.documentElement;
    if(root){
      root.appendChild(span);
      const widths = {};
      base.forEach(f=>{ span.style.fontFamily=f; widths[f]=span.offsetWidth; });
      fontsProbe = test.map(f=>{
        span.style.fontFamily = '"'+f+'",monospace';
        return (span.offsetWidth !== widths.monospace) ? '1' : '0';
      }).join('');
      root.removeChild(span);
    }
  }catch(e){ fontsProbe = ''; }
  return {
    ua: (nav.userAgent || '').slice(0, 340),
    platform: nav.platform || (nav.userAgentData && nav.userAgentData.platform) || '',
    language: nav.language || '',
    languages: (nav.languages || []).slice(0,6).join(','),
    screen: (scr.width||0)+'x'+(scr.height||0)+'@'+(window.devicePixelRatio||1),
    avail: (scr.availWidth||0)+'x'+(scr.availHeight||0),
    colorDepth: scr.colorDepth || 0,
    timezone: tz,
    cores: nav.hardwareConcurrency || 0,
    memory: nav.deviceMemory || 0,
    touch: ('ontouchstart' in window) || (nav.maxTouchPoints > 0),
    maxTouch: nav.maxTouchPoints || 0,
    vendor: nav.vendor || '',
    canvas: canvasHash,
    webgl: webglHash,
    audio: audioHash,
    fonts: fontsProbe,
    plugins: (nav.plugins ? nav.plugins.length : 0),
    cookie: navigator.cookieEnabled ? 1 : 0,
    doNotTrack: String(nav.doNotTrack || ''),
    pdf: (nav.pdfViewerEnabled === true) ? 1 : 0,
    hw: (nav.userAgentData && nav.userAgentData.mobile) ? 'm' : 'd'
  };
}

async function hashFingerprint(str){
  try{
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    let h = 2166136261;
    for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'fb'+ (h>>>0).toString(16) + str.length.toString(16);
  }
}

async function buildDeviceId(){
  try{
    const cached = localStorage.getItem('gz_device_id');
    if(cached && String(cached).length > 8){
      return { id: cached };
    }
  }catch(e){}

  const sig = collectDeviceSignals();
  const core = [
    sig.platform, sig.language, sig.screen, sig.avail, sig.timezone,
    String(sig.cores), String(sig.memory), String(sig.touch),
    String(sig.maxTouch), sig.vendor, sig.canvas, sig.webgl, sig.audio,
    String(sig.colorDepth), String(sig.plugins), sig.fonts, sig.hw
  ].join('|');
  const fp = await hashFingerprint(core);
  let seed = null;
  try{ seed = localStorage.getItem('gz_device_seed'); }catch(e){}
  if(!seed){
    seed = (crypto.randomUUID ? crypto.randomUUID() : ('s'+Math.random().toString(36).slice(2)+Date.now()));
    try{ localStorage.setItem('gz_device_seed', seed); }catch(e){}
  }
  const combined = await hashFingerprint(fp + '::' + seed + '::' + (sig.ua||'').slice(0,48));
  try{ localStorage.setItem('gz_device_id', combined); }catch(e){}
  return { id: combined, signals: sig, coreFp: fp };
}

let DEVICE_INFO = { id: null, signals: {}, coreFp: '' };
let DEVICE_ID = null;

async function initDevice(){
  const built = await buildDeviceId();
  DEVICE_INFO = built;
  DEVICE_ID = built.id;
  return built;
}

function getDeviceId(){
  if(DEVICE_ID) return DEVICE_ID;
  try{
    const cached = localStorage.getItem('gz_device_id');
    if(cached){ DEVICE_ID = cached; return cached; }
  }catch(e){}
  return 'unknown';
}

/* ---------- Proof of Work (cheap for humans, costly at bot scale) ---------- */
async function solvePow(challenge, difficulty){
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  const start = performance.now();
  // Cap work time so UX stays acceptable (~0.5–2s on normal devices)
  while(performance.now() - start < 3500){
    const h = await hashFingerprint(challenge + ':' + nonce);
    if(h.startsWith(prefix)) return { nonce, hash: h, ms: Math.round(performance.now()-start) };
    nonce++;
    if(nonce % 64 === 0) await new Promise(r=>setTimeout(r,0)); // yield to UI
  }
  return null; // failed within time
}

/* ---------- Ultra puzzle CAPTCHA with motion biometrics ---------- */
let PUZZLE={
  x:0,y:0,targetX:0,targetY:0,size:48,drag:false,offX:0,offY:0,solved:false,
  started:0,moved:0,moveEvents:0,lastX:0,lastY:0,dirChanges:0,lastDir:0,
  path:[],velocitySamples:[],accelSamples:[],pauseCount:0,lastMoveAt:0,
  pointerType:'',pressureSamples:[],jitter:0
};

function puzzleRand(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function puzzleStatus(t,c=''){const e=$('puzzleStatus');if(e){e.textContent=t||'';e.className='puzzle-status'+(c?' '+c:'')}}

/* ---------- Premium confetti burst on puzzle solve ---------- */
function fireConfetti(){
  const canvas = document.getElementById('confettiCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);

  const colors = ['#60a5fa','#a78bfa','#34d399','#fbbf24','#f472b6','#38bdf8','#c4b5fd'];
  const particles = [];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.38;
  for(let i=0;i<70;i++){
    const angle = (Math.PI * 2 * i) / 70 + (Math.random()-0.5)*0.4;
    const speed = 4 + Math.random()*9;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed - 3,
      g: 0.18 + Math.random()*0.12,
      size: 3 + Math.random()*5,
      rot: Math.random()*360,
      vr: (Math.random()-0.5)*14,
      color: colors[i % colors.length],
      life: 1,
      decay: 0.012 + Math.random()*0.01,
      shape: Math.random() > 0.5 ? 'rect' : 'circle'
    });
  }
  let frame = 0;
  function tick(){
    frame++;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    let alive = 0;
    for(const p of particles){
      if(p.life <= 0) continue;
      alive++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= 0.99;
      p.rot += p.vr;
      p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      if(p.shape === 'rect'){
        ctx.fillRect(-p.size/2, -p.size/3, p.size, p.size*0.55);
      } else {
        ctx.beginPath();
        ctx.arc(0,0,p.size/2,0,Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
    if(alive > 0 && frame < 120) requestAnimationFrame(tick);
    else ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
  }
  requestAnimationFrame(tick);
}

function puzzleMakeImage(){
  const b=$('puzzleBoard'),c=$('puzzleCanvas'),p=$('puzzlePiece'),t=$('puzzleTarget');
  if(!b||!c||!p||!t)return;
  const w=Math.max(220,b.clientWidth),h=Math.max(140,b.clientHeight||156),s=puzzleRand(46,56);
  PUZZLE.size=s;c.width=w*2;c.height=h*2;
  const x=c.getContext('2d');x.setTransform(2,0,0,2,0,0);

  // Rich abstract art — vibrant on desktop, refined dark on mobile
  const isPc = (typeof window !== 'undefined' && window.innerWidth >= 900);
  const themesPc=[
    {bg:['#e8f1ff','#c7dfff','#9ec5ff'], shapes:['#5b8def','#7aa8ff','#3d6fd4','#93c5fd']},
    {bg:['#eefaf3','#c9f0d8','#9ee0b8'], shapes:['#3cb878','#6dd5a0','#2a9a62','#86efac']},
    {bg:['#fff3e8','#ffd9b8','#ffc091'], shapes:['#f08a3c','#ffb070','#d96b20','#fdba74']},
    {bg:['#f3eefe','#ddd0ff','#c4b0ff'], shapes:['#7b5fd4','#9b82ef','#5c40b8','#c4b5fd']},
    {bg:['#eef8fb','#c9ebf4','#a0dcec'], shapes:['#2aa7c5','#5ec4db','#1b8eab','#67e8f9']},
    {bg:['#fdf2f8','#fbcfe8','#f9a8d4'], shapes:['#ec4899','#f472b6','#db2777','#f9a8d4']}
  ];
  const themesMobile=[
    {bg:['#121a28','#1a2740','#243454'], shapes:['#5b8def','#7aa8ff','#3d6fd4','#60a5fa']},
    {bg:['#121f1a','#1a3028','#243c32'], shapes:['#3cb878','#6dd5a0','#2a9a62','#4ade80']},
    {bg:['#1e1a14','#2e261c','#3c3224'], shapes:['#f08a3c','#ffb070','#d96b20','#fb923c']},
    {bg:['#18142a','#221c3a','#2e2648'], shapes:['#7b5fd4','#9b82ef','#5c40b8','#a78bfa']}
  ];
  const themes = isPc ? themesPc : themesMobile;
  const th=themes[Math.floor(Math.random()*themes.length)];
  const g=x.createLinearGradient(0,0,w,h);
  g.addColorStop(0,th.bg[0]);g.addColorStop(.45,th.bg[1]);g.addColorStop(1,th.bg[2]);
  x.fillStyle=g;x.fillRect(0,0,w,h);

  // large soft glow orbs
  for(let i=0;i<6;i++){
    const cx=Math.random()*w, cy=Math.random()*h, r=32+Math.random()*58;
    const rg=x.createRadialGradient(cx,cy,0,cx,cy,r);
    rg.addColorStop(0, th.shapes[i%th.shapes.length]+'aa');
    rg.addColorStop(0.55, th.shapes[i%th.shapes.length]+'33');
    rg.addColorStop(1, th.shapes[i%th.shapes.length]+'00');
    x.fillStyle=rg;
    x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
  }
  // floating rounded plates
  for(let i=0;i<5;i++){
    const rw=28+Math.random()*55, rh=16+Math.random()*38;
    const rx=Math.random()*(w-rw), ry=Math.random()*(h-rh);
    x.fillStyle=th.shapes[i%th.shapes.length]+'48';
    x.beginPath();
    const rr=12;
    x.moveTo(rx+rr,ry);
    x.arcTo(rx+rw,ry,rx+rw,ry+rh,rr);
    x.arcTo(rx+rw,ry+rh,rx,ry+rh,rr);
    x.arcTo(rx,ry+rh,rx,ry,rr);
    x.arcTo(rx,ry,rx+rw,ry,rr);
    x.closePath();x.fill();
  }
  // elegant arcs & rings
  x.lineWidth=2.2;
  for(let i=0;i<4;i++){
    x.strokeStyle=th.shapes[i%th.shapes.length]+'99';
    x.beginPath();
    x.arc(Math.random()*w, Math.random()*h, 18+Math.random()*42, Math.random()*Math.PI, Math.random()*Math.PI+1.4);
    x.stroke();
  }
  // subtle highlight dots
  for(let i=0;i<40;i++){
    x.fillStyle='rgba(255,255,255,'+(0.06+Math.random()*0.12)+')';
    const ds=1+Math.random()*2.5;
    x.beginPath();x.arc(Math.random()*w, Math.random()*h, ds, 0, Math.PI*2);x.fill();
  }
  // fine grain texture (anti-bot + depth)
  for(let i=0;i<110;i++){
    x.fillStyle='rgba(255,255,255,'+(0.03+Math.random()*0.06)+')';
    x.fillRect(Math.random()*w, Math.random()*h, 1+Math.random()*2, 1+Math.random()*2);
  }
  for(let i=0;i<60;i++){
    x.fillStyle='rgba(0,0,0,'+(0.02+Math.random()*0.05)+')';
    x.fillRect(Math.random()*w, Math.random()*h, 1, 1);
  }

  const minX=12,maxX=Math.max(12,w-s-12),minY=12,maxY=Math.max(12,h-s-12);
  PUZZLE.targetX=puzzleRand(minX,maxX);PUZZLE.targetY=puzzleRand(minY,maxY);
  let px=puzzleRand(minX,maxX),py=puzzleRand(minY,maxY);
  for(let i=0;i<18&&Math.hypot(px-PUZZLE.targetX,py-PUZZLE.targetY)<100;i++){
    px=puzzleRand(minX,maxX);py=puzzleRand(minY,maxY);
  }
  PUZZLE.x=px;PUZZLE.y=py;PUZZLE.solved=false;PUZZLE.drag=false;
  PUZZLE.started=0;PUZZLE.moved=0;PUZZLE.moveEvents=0;PUZZLE.dirChanges=0;PUZZLE.lastDir=0;
  PUZZLE.lastX=px;PUZZLE.lastY=py;PUZZLE.path=[];PUZZLE.velocitySamples=[];
  PUZZLE.accelSamples=[];PUZZLE.pauseCount=0;PUZZLE.lastMoveAt=0;
  PUZZLE.pointerType='';PUZZLE.pressureSamples=[];PUZZLE.jitter=0;
  captchaToken=null;captchaTokenExp=0;

  t.style.left=PUZZLE.targetX+'px';t.style.top=PUZZLE.targetY+'px';
  t.style.width=s+'px';t.style.height=s+'px';

  const scale = 2;
  const pieceCanvas = document.createElement('canvas');
  pieceCanvas.width = s * scale;
  pieceCanvas.height = s * scale;
  const pcx = pieceCanvas.getContext('2d');
  try{
    pcx.drawImage(
      c,
      PUZZLE.targetX * scale, PUZZLE.targetY * scale, s * scale, s * scale,
      0, 0, s * scale, s * scale
    );
    x.save();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    const rr = 8;
    const hx = PUZZLE.targetX, hy = PUZZLE.targetY;
    x.moveTo(hx+rr, hy);
    x.arcTo(hx+s, hy, hx+s, hy+s, rr);
    x.arcTo(hx+s, hy+s, hx, hy+s, rr);
    x.arcTo(hx, hy+s, hx, hy, rr);
    x.arcTo(hx, hy, hx+s, hy, rr);
    x.closePath();
    x.fill();
    x.restore();
  }catch(e){ console.warn('piece cut', e); }

  p.classList.remove('solved','dragging');
  p.style.width = s+'px';
  p.style.height = s+'px';
  p.style.backgroundImage = 'url('+pieceCanvas.toDataURL('image/png')+')';
  p.style.backgroundSize = '100% 100%';
  p.style.backgroundRepeat = 'no-repeat';
  p.style.top = py+'px';
  p.style.left = px+'px';
  puzzleSetX(px);
  puzzleStatus('');
}

function puzzleSetPos(x,y){
  const b=$('puzzleBoard'),p=$('puzzlePiece');if(!b||!p)return;
  const maxX=Math.max(0,b.clientWidth-PUZZLE.size),maxY=Math.max(0,b.clientHeight-PUZZLE.size);
  PUZZLE.x=Math.max(0,Math.min(maxX,x));PUZZLE.y=Math.max(0,Math.min(maxY,y));
  p.style.left=PUZZLE.x+'px';p.style.top=PUZZLE.y+'px';
}
function puzzleSetX(v){puzzleSetPos(v,PUZZLE.y)}

function puzzleDown(e){
  const p=$('puzzlePiece');if(!p||PUZZLE.solved)return;
  const r=p.getBoundingClientRect();
  if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;
  e.preventDefault();
  PUZZLE.drag=true;PUZZLE.started=performance.now();
  PUZZLE.offX=e.clientX-r.left;PUZZLE.offY=e.clientY-r.top;
  PUZZLE.moved=0;PUZZLE.moveEvents=0;PUZZLE.dirChanges=0;PUZZLE.lastDir=0;
  PUZZLE.lastX=PUZZLE.x;PUZZLE.lastY=PUZZLE.y;
  PUZZLE.path=[{x:PUZZLE.x,y:PUZZLE.y,t:PUZZLE.started}];
  PUZZLE.velocitySamples=[];PUZZLE.accelSamples=[];PUZZLE.pauseCount=0;
  PUZZLE.lastMoveAt=PUZZLE.started;PUZZLE.jitter=0;
  PUZZLE.pointerType = e.pointerType || 'unknown';
  if(typeof e.pressure === 'number') PUZZLE.pressureSamples.push(e.pressure);
  p.classList.add('dragging');
  try{p.setPointerCapture(e.pointerId)}catch(_){}
  interactionScore = Math.min(100, interactionScore + 3);
}

function puzzleMove(e){
  if(!PUZZLE.drag)return;
  e.preventDefault();
  const r=$('puzzleBoard').getBoundingClientRect();
  const nx=e.clientX-r.left-PUZZLE.offX, ny=e.clientY-r.top-PUZZLE.offY;
  const now=performance.now();
  const dx=nx-PUZZLE.lastX, dy=ny-PUZZLE.lastY;
  const dist=Math.hypot(nx-PUZZLE.x,ny-PUZZLE.y);
  PUZZLE.moved+=dist;
  PUZZLE.moveEvents++;
  // micro-pause detection (humans pause; pure bots rarely)
  if(PUZZLE.lastMoveAt && (now - PUZZLE.lastMoveAt) > 45 && (now - PUZZLE.lastMoveAt) < 400){
    PUZZLE.pauseCount++;
  }
  PUZZLE.lastMoveAt = now;
  if(Math.abs(dx)>0.3){
    const dir=dx>0?1:-1;
    if(PUZZLE.lastDir&&dir!==PUZZLE.lastDir)PUZZLE.dirChanges++;
    PUZZLE.lastDir=dir;
  }
  if(PUZZLE.path.length){
    const last=PUZZLE.path[PUZZLE.path.length-1];
    const dt=Math.max(1,now-last.t);
    const v=dist/(dt/1000);
    PUZZLE.velocitySamples.push(v);
    if(PUZZLE.velocitySamples.length>50)PUZZLE.velocitySamples.shift();
    if(PUZZLE.velocitySamples.length>=2){
      const prev=PUZZLE.velocitySamples[PUZZLE.velocitySamples.length-2];
      PUZZLE.accelSamples.push(v-prev);
      if(PUZZLE.accelSamples.length>40)PUZZLE.accelSamples.shift();
    }
  }
  // jitter (human hand tremor / imperfect tracking)
  if(PUZZLE.path.length>=2){
    const prev=PUZZLE.path[PUZZLE.path.length-1];
    const expectedAngle = Math.atan2(ny-prev.y, nx-prev.x);
    // accumulate small lateral noise
    PUZZLE.jitter += Math.abs(dy)*0.01 + Math.abs(dx)*0.005;
  }
  PUZZLE.path.push({x:nx,y:ny,t:now});
  if(PUZZLE.path.length>100)PUZZLE.path.shift();
  if(typeof e.pressure === 'number') {
    PUZZLE.pressureSamples.push(e.pressure);
    if(PUZZLE.pressureSamples.length>30) PUZZLE.pressureSamples.shift();
  }
  PUZZLE.lastX=nx;PUZZLE.lastY=ny;
  puzzleSetPos(nx,ny);
}

function puzzleUp(){
  if(PUZZLE.drag){
    PUZZLE.drag=false;
    const p=$('puzzlePiece');
    if(p)p.classList.remove('dragging');
  }
}

function resetPuzzleCaptcha(){ puzzleMakeImage(); }
try{
  document.addEventListener('DOMContentLoaded', function(){
    var rb = document.getElementById('puzzleRefreshBtn');
    if(rb) rb.addEventListener('click', function(e){ e.preventDefault(); resetPuzzleCaptcha(); });
  });
}catch(e){}

function analyzeHumanMotion(){
  if(!PUZZLE.started||PUZZLE.moved<20||PUZZLE.moveEvents<6){
    return 'Drag the piece naturally with your finger or mouse.';
  }
  const elapsed=performance.now()-PUZZLE.started;
  if(elapsed<200||elapsed>180000){
    return 'Please move the piece at a natural speed.';
  }
  // velocity consistency (bots often flat)
  if(PUZZLE.velocitySamples.length>=8){
    const vs=PUZZLE.velocitySamples;
    const mean=vs.reduce((a,b)=>a+b,0)/vs.length;
    const variance=vs.reduce((a,v)=>a+(v-mean)*(v-mean),0)/vs.length;
    const std=Math.sqrt(variance);
    if(mean>0.2 && std/mean < 0.04 && PUZZLE.dirChanges===0 && PUZZLE.path.length>25){
      return 'Movement looks automated. Try a more natural drag.';
    }
    // unrealistically high constant speed
    if(mean > 4500 && std < 200){
      return 'Too fast / unnatural. Slow down a bit.';
    }
  }
  // acceleration variance
  if(PUZZLE.accelSamples.length>=6){
    const as=PUZZLE.accelSamples;
    const aMean=as.reduce((a,b)=>a+b,0)/as.length;
    const aVar=as.reduce((a,v)=>a+(v-aMean)*(v-aMean),0)/as.length;
    if(aVar < 0.15 && PUZZLE.moved > 120 && PUZZLE.dirChanges===0){
      return 'Please drag with natural acceleration.';
    }
  }
  // path curvature
  if(PUZZLE.path.length>=12){
    const first=PUZZLE.path[0], last=PUZZLE.path[PUZZLE.path.length-1];
    const totalDist=Math.hypot(last.x-first.x,last.y-first.y);
    let pathLen=0;
    for(let i=1;i<PUZZLE.path.length;i++){
      pathLen+=Math.hypot(PUZZLE.path[i].x-PUZZLE.path[i-1].x,PUZZLE.path[i].y-PUZZLE.path[i-1].y);
    }
    if(totalDist>40 && pathLen/totalDist < 1.008 && PUZZLE.dirChanges===0){
      return 'Please drag with a more natural path.';
    }
  }
  // mechanical check disabled for false-positive safety on mobile
  return null;
}

async function mintCaptchaToken(){
  // Bind solution to device + short time window
  const payload = [
    DEVICE_ID || 'x',
    String(PUZZLE.targetX|0), String(PUZZLE.targetY|0),
    String(Math.round(PUZZLE.moved)), String(PUZZLE.moveEvents),
    String(Date.now())
  ].join('|');
  const tok = await hashFingerprint(payload + '|gz-captcha-v3');
  captchaToken = tok.slice(0,32);
  captchaTokenExp = Date.now() + 90000; // 90s
  return captchaToken;
}

async function checkPuzzleCaptcha(){
  if(PUZZLE.solved && captchaToken && Date.now() < captchaTokenExp) return null;
  const motionErr=analyzeHumanMotion();
  if(motionErr){
    puzzleStatus(motionErr,'bad');
    return motionErr;
  }
  const dx=PUZZLE.x-PUZZLE.targetX, dy=PUZZLE.y-PUZZLE.targetY;
  if(Math.hypot(dx,dy)<=9){
    PUZZLE.solved=true;
    puzzleSetPos(PUZZLE.targetX,PUZZLE.targetY);
    const p=$('puzzlePiece');
    if(p){ p.classList.add('solved'); p.classList.remove('dragging'); }
    puzzleStatus('Verified ✓','ok');
    try{ fireConfetti(); }catch(e){}
    await mintCaptchaToken();
    return null;
  }
  puzzleStatus('Wrong position — try again.','bad');
  resetPuzzleCaptcha();
  return 'Puzzle verification failed — try again';
}

async function logAntiBot(action, details){
  if(!sb) return;
  try{
    await sb.from('audit_log').insert({
      actor_id: null,
      actor_username: 'SYSTEM',
      action: action || 'anti_bot',
      target_username: details && details.username || null,
      target_device_id: DEVICE_ID || null,
      details: Object.assign({
        source: 'auth_v3',
        ua: (navigator.userAgent||'').slice(0,140),
        score: interactionScore
      }, details || {})
    });
  }catch(e){ console.warn('anti_bot log', e); }
}

async function deleteUserHard(userId){
  if(!sb || !userId) return;
  try{
    await sb.from('devices').delete().eq('user_id', userId);
    await sb.from('users').delete().eq('id', userId);
  }catch(e){ console.warn('delete user', e); }
}

async function countDeviceAccounts(){
  if(!sb || !DEVICE_ID) return { day: 0, total: 0 };
  try{
    const since = new Date(Date.now() - 24*60*60*1000).toISOString();
    const { data: all } = await sb.from('users').select('id,created_at').eq('device_id', DEVICE_ID);
    const rows = all || [];
    const day = rows.filter(u => u.created_at && u.created_at >= since).length;
    return { day, total: rows.length };
  }catch(e){
    return { day: 0, total: 0 };
  }
}

function detectAutomation(){
  // ONLY hard, high-confidence bot signals — avoid false positives on real users
  const reasons = [];
  try{
    if(navigator.webdriver === true) reasons.push('webdriver');
  }catch(e){}
  try{
    const suspects = [
      '__webdriver_evaluate','__selenium_evaluate','__webdriver_script_function',
      '__driver_evaluate','__fxdriver_evaluate','_Selenium_IDE_Recorder',
      'callPhantom','_phantom','__nightmare','domAutomation','domAutomationController',
      '__playwright_evaluation_script__'
    ];
    for(const k of suspects){
      if(window[k] || document[k]) { reasons.push('inject:'+k); break; }
    }
  }catch(e){}
  // document.$cdc_ / $chrome_asyncScriptInfo — chrome driver leftovers
  try{
    for(const k of Object.keys(document)){
      if(/^\$cdc_/.test(k) || k === '$chrome_asyncScriptInfo'){ reasons.push('cdc'); break; }
    }
  }catch(e){}
  return reasons;
}

async function runAntiBotGates(username, isSignup){
  if(Date.now() < lockUntil){
    return 'Too many attempts. Please wait a moment.';
  }
  // honeypot
  const hp = $('authWebsite');
  if(hp && hp.value){
    await logAntiBot('anti_bot', { username, reason: 'honeypot_filled' });
    applyBotBan('honeypot');
    return BOT_BAN_MSG;
  }
  // form too fast
  if(Date.now() - AUTH_OPENED_AT < MIN_FORM_MS){
    await logAntiBot('anti_bot', { username, reason: 'form_too_fast', ms: Date.now()-AUTH_OPENED_AT });
    return 'Please wait a moment and try again.';
  }
  // low interaction: soft reject only
  if(interactionScore < 1.5 && (Date.now() - AUTH_OPENED_AT) > 8000){
    return 'Please move the mouse or touch the screen once, then try again.';
  }
  // automation fingerprints
  const auto = detectAutomation();
  if(auto.length){
    await logAntiBot('anti_bot', { username, reason: 'automation', signals: auto });
    applyBotBan('automation:' + auto.join(','));
    return BOT_BAN_MSG;
  }
  // captcha token validity
  if(!captchaToken || Date.now() > captchaTokenExp){
    return 'Please complete the puzzle verification again.';
  }
  // device ban
  try{
    const ban = await getActiveDeviceBan();
    if(ban) return 'This device is restricted.';
  }catch(e){}

  if(isSignup){
    const counts = await countDeviceAccounts();
    if(counts.day >= MAX_ACCOUNTS_PER_DEVICE_24H || counts.total >= MAX_ACCOUNTS_PER_DEVICE_TOTAL){
      await logAntiBot('anti_bot_block_device', {
        username, reason: 'mass_signup',
        accounts_24h: counts.day, accounts_total: counts.total
      });
      return 'Registration temporarily blocked on this device.';
    }
  }
  return null;
}

function recordFail(){
  failCount++;
  if(failCount >= MAX_FAILED_ATTEMPTS){
    lockUntil = Date.now() + LOCKOUT_MS;
    failCount = 0;
    resetPuzzleCaptcha();
  }
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US') + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}

function validateUsername(u){
  if(u.length < 2 || u.length > 16) return 'Username must be 2-16 characters';
  if(!/^[a-zA-Z0-9_]+$/.test(u)) return 'Only letters, numbers and underscore are allowed';
  return null;
}
function validatePassword(p){
  if(p.length < 3 || p.length > 15) return 'Password must be 3–15 characters';
  return null;
}

function authErrorMessage(error, fallback){
  if(!error) return fallback || 'Something went wrong. Please try again.';
  const code=String(error.code||'');
  const msg=String(error.message||'').toLowerCase();
  if(code==='23505' || msg.includes('duplicate') || msg.includes('unique')) return 'This username is already taken.';
  if(code==='42501' || msg.includes('row-level security') || msg.includes('permission denied')) return 'Database permission denied. Please check the Supabase policies.';
  if(msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch')) return 'Connection failed. Check your internet connection and try again.';
  if(msg.includes('timeout')) return 'Server took too long to respond. Please try again.';
  return error.message || fallback || 'Something went wrong. Please try again.';
}

async function withTimeout(promise, ms){
  let timer;
  try{
    return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms)})]);
  }finally{clearTimeout(timer);}
}

async function getActiveDeviceBan(){
  const { data: devBan } = await sb.from('banned_devices').select('*').eq('device_id', DEVICE_ID).maybeSingle();
  if(devBan && (!devBan.banned_until || new Date(devBan.banned_until) > new Date())) return devBan;
  return null;
}

function hideAllScreens(){
  ['loadingScreen','authScreen','banScreen'].forEach(id=>{ const el=$(id); if(el) el.classList.add('hidden'); });
}
function showLoading(){
  hideAllScreens();
  $('loadingScreen').classList.remove('hidden');
}
function showAuth(mode){
  hideAllScreens();
  authMode = mode || 'login';
  $('authScreen').classList.remove('hidden');
  $('authError').classList.add('hidden');
  $('authSubmitBtn').textContent = authMode === 'login' ? 'Log In' : 'Sign Up';
  $('authSub').textContent = authMode === 'login' ? 'Sign in to continue' : 'Create a new account';
  $('authSwitchLine').innerHTML = authMode === 'login'
    ? `Don't have an account? <a href="#" id="authSwitchLink">Sign up</a>`
    : `Already have an account? <a href="#" id="authSwitchLink">Log in</a>`;
  const link = $('authSwitchLink');
  if(link) link.onclick = (e)=>{ e.preventDefault(); showAuth(authMode === 'login' ? 'signup' : 'login'); };
  resetPuzzleCaptcha();
}
function showDeviceBanScreen(devBan){
  hideAllScreens();
  $('banScreen').classList.remove('hidden');
  $('banTypeText').textContent = 'Device ban';
  $('banReasonText').textContent = (devBan && devBan.reason) || 'No reason';
  $('banUntilText').textContent = (devBan && devBan.banned_until) ? fmtDate(devBan.banned_until) : 'Permanent';
}
function showUserBanScreen(user){
  hideAllScreens();
  $('banScreen').classList.remove('hidden');
  $('banTypeText').textContent = (user.ban_type === 'device') ? 'Device ban' : 'Account ban';
  $('banReasonText').textContent = user.ban_reason || 'No reason';
  $('banUntilText').textContent = user.ban_until ? fmtDate(user.ban_until) : 'Permanent';
}
function goHome(){
  try {
    var path = location.pathname || '/';
    if (/\/index\.html$/i.test(path)) path = path.replace(/\/index\.html$/i, '/');
    else if (!path.endsWith('/')) path = path + '/';
    path = path.replace(/\/login\/$/, '/');
    location.replace(path + 'app/');
  } catch (e) {
    location.replace('../app/');
  }
}

async function registerCurrentDevice(userId){
  if(!sb || !userId || !DEVICE_ID) return;
  try{
    const { data: rows } = await sb.from('devices').select('id').eq('user_id', userId).eq('device_id', DEVICE_ID);
    if(rows && rows.length){
      await sb.from('devices').update({ last_seen: new Date().toISOString(), revoked: false, revoked_at: null }).eq('id', rows[0].id);
      if(rows.length > 1){
        const extras = rows.slice(1).map(r=>r.id);
        await sb.from('devices').delete().in('id', extras);
      }
    } else {
      await sb.from('devices').insert({
        user_id: userId, device_id: DEVICE_ID, last_seen: new Date().toISOString(),
        first_seen: new Date().toISOString(), revoked: false
      });
    }
  }catch(e){ console.warn(e); }
}

async function finishLogin(user){
  if(user.banned && user.ban_until && new Date(user.ban_until) <= new Date()){
    const { data: updated } = await sb.from('users').update({
      banned:false, ban_type:null, ban_reason:null, ban_until:null, banned_at:null
    }).eq('id', user.id).select().single();
    if(updated) user = updated;
  }
  if(user.banned){ showUserBanScreen(user); return; }
  localStorage.setItem('gz_user_id', user.id);
  try{ localStorage.setItem('gz_device_id', DEVICE_ID); }catch(e){}
  await registerCurrentDevice(user.id);
  goHome();
}

async function submitAuth(){
  const username = ($('authUsername').value || '').trim();
  const password = $('authPassword').value || '';
  const errBox = $('authError');
  const btn = $('authSubmitBtn');
  errBox.classList.add('hidden');

  if(Date.now() < lockUntil){
    errBox.textContent = 'Too many attempts. Please wait a moment.';
    errBox.classList.remove('hidden');
    return;
  }

  const uErr = validateUsername(username);
  if(uErr){ errBox.textContent=uErr; errBox.classList.remove('hidden'); return; }
  const pErr = validatePassword(password);
  if(pErr){ errBox.textContent=pErr; errBox.classList.remove('hidden'); return; }

  const vErr = await checkPuzzleCaptcha();
  if(vErr){ errBox.textContent=vErr; errBox.classList.remove('hidden'); recordFail(); return; }
  if(!sb){ await ensureSupabase(); }
if(!sb){ errBox.textContent=sbNotConnectedMessage(); errBox.classList.remove('hidden'); return; }

  btn.disabled = true;
  const oldLabel = btn.textContent;
  try{
    // Proof-of-Work layer
    btn.textContent = 'Verifying…';
    const challenge = (captchaToken||'') + '|' + (DEVICE_ID||'') + '|' + username + '|' + String(Date.now()>>10);
    const pow = await solvePow(challenge, POW_DIFFICULTY);
    if(!pow){
      errBox.textContent = 'Security check timed out. Please try again.';
      errBox.classList.remove('hidden');
      resetPuzzleCaptcha();
      recordFail();
      return;
    }

    const botMsg = await withTimeout(runAntiBotGates(username, authMode === 'signup'), 7000);
    if(botMsg){
      errBox.textContent = botMsg;
      errBox.classList.remove('hidden');
      resetPuzzleCaptcha();
      recordFail();
      return;
    }

    btn.textContent = authMode === 'login' ? 'Logging in…' : 'Signing up…';
    const hash = await sha256(password);

    if(authMode === 'signup'){
      const lookup = await withTimeout(
        sb.from('users').select('id').ilike('username', username).maybeSingle(), 8000
      );
      if(lookup.error) throw lookup.error;
      if(lookup.data){
        errBox.textContent='This username is already taken.';
        errBox.classList.remove('hidden');
        resetPuzzleCaptcha();
        recordFail();
        return;
      }

      const result = await withTimeout(sb.from('users').insert({
        username: username,
        password_hash: hash,
        device_id: DEVICE_ID
      }).select().single(), 10000);
      if(result.error) throw result.error;
      const newUser=result.data;

      const counts = await withTimeout(countDeviceAccounts(), 6000);
      if(counts.day > MAX_ACCOUNTS_PER_DEVICE_24H || counts.total > MAX_ACCOUNTS_PER_DEVICE_TOTAL){
        await deleteUserHard(newUser.id);
        await logAntiBot('anti_bot_delete_user', {username,reason:'post_signup_limit',target_user_id:newUser.id,accounts_24h:counts.day,accounts_total:counts.total});
        errBox.textContent='Registration blocked on this device.';
        errBox.classList.remove('hidden');
        resetPuzzleCaptcha();
        return;
      }

      await logAntiBot('signup', {username,user_id:newUser.id,note:'ok',pow_ms:pow.ms});
      await finishLogin(newUser);
    }else{
      let user = null;
      try{
        const rpc = await withTimeout(sb.rpc('login_user', { p_username: username, p_password_hash: hash }), 8000);
        if(rpc && !rpc.error && rpc.data && rpc.data.ok && rpc.data.user){
          user = rpc.data.user;
        } else if(rpc && rpc.data && rpc.data.reason === 'bad_password'){
          errBox.textContent='Incorrect password.';
          errBox.classList.remove('hidden');
          resetPuzzleCaptcha();
          recordFail();
          return;
        } else if(rpc && rpc.data && rpc.data.reason === 'not_found'){
          errBox.textContent='Username not found.';
          errBox.classList.remove('hidden');
          resetPuzzleCaptcha();
          recordFail();
          return;
        }
      }catch(e){ console.warn('login rpc', e); }
      if(!user){
        const result = await withTimeout(
          sb.from('users').select('*').ilike('username', username).maybeSingle(), 8000
        );
        if(result.error) throw result.error;
        user = result.data;
        if(!user){
          errBox.textContent='Username not found.';
          errBox.classList.remove('hidden');
          resetPuzzleCaptcha();
          recordFail();
          return;
        }
        if(user.password_hash !== hash){
          errBox.textContent='Incorrect password.';
          errBox.classList.remove('hidden');
          resetPuzzleCaptcha();
          recordFail();
          return;
        }
      }
      await finishLogin(user);
    }
  }catch(e){
    console.error('Authentication error:',e);
    errBox.textContent=authErrorMessage(e,'Unable to complete the request. Please try again.');
    errBox.classList.remove('hidden');
    resetPuzzleCaptcha();
    recordFail();
  }finally{
    btn.disabled=false;
    btn.textContent = oldLabel || (authMode === 'login' ? 'Log In' : 'Sign Up');
  }
}

$('authSubmitBtn').onclick = ()=> submitAuth();
['authUsername','authPassword'].forEach(id=>{
  const el=$(id); if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter') submitAuth(); });
});
$('banLogoutBtn').onclick = ()=>{ localStorage.removeItem('gz_user_id'); showAuth('login'); };

async function boot(){
  if(enforceBotBanOnBoot()) return;
  showLoading();
  let finished=false;
  const forceOpen=setTimeout(()=>{
    if(!finished){
      finished=true;
      showAuth('login');
      const e=$('authError');
      e.textContent='Connection is taking too long. You can try logging in again.';
      e.classList.remove('hidden');
    }
  },4500);

  try{
    await ensureSupabase();
    if(!sb){
      finished=true;
      showAuth('login');
      $('authError').textContent=sbNotConnectedMessage();
      $('authError').classList.remove('hidden');
      return;
    }

    try{ await withTimeout(initDevice(),1800); }
    catch(e){
      console.warn('Device initialization failed:',e);
      DEVICE_ID=getDeviceId();
    }

    try{
      const devBan=await withTimeout(getActiveDeviceBan(),2500);
      if(devBan){ finished=true; showDeviceBanScreen(devBan); return; }
    }catch(e){ console.warn('Device ban check skipped:',e); }

    const savedId=localStorage.getItem('gz_user_id');
    if(savedId){
      try{
        const result=await withTimeout(sb.from('users').select('*').eq('id',savedId).maybeSingle(),2500);
        if(!result.error && result.data){
          finished=true;
          if(result.data.banned){ showUserBanScreen(result.data); return; }
          goHome();
          return;
        }
      }catch(e){ console.warn('Saved session check failed:',e); }
      localStorage.removeItem('gz_user_id');
    }

    finished=true;
    showAuth('login');
  }catch(e){
    console.error('Boot error:',e);
    localStorage.removeItem('gz_user_id');
    finished=true;
    showAuth('login');
  }finally{
    clearTimeout(forceOpen);
  }
}

(function bindPuzzleUI(){
  const p=$('puzzlePiece');
  if(p&&!p._bound){
    p._bound=true;
    p.addEventListener('pointerdown',puzzleDown,{passive:false});
    p.addEventListener('pointermove',puzzleMove,{passive:false});
    p.addEventListener('pointerup',puzzleUp,{passive:false});
    p.addEventListener('pointercancel',puzzleUp,{passive:false});
  }
  window.addEventListener('resize',()=>{if($('puzzleCaptcha')&&!$('authScreen').classList.contains('hidden'))puzzleMakeImage()});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if($('puzzleCaptcha'))puzzleMakeImage()}));
})();

boot();
