/* Auth gate: must be logged in to use app */
(function(){
  function goLogin(){
    try {
      var path = location.pathname || '/';
      if (/\/index\.html$/i.test(path)) path = path.replace(/\/index\.html$/i, '/');
      else if (!path.endsWith('/')) {
        if (/\.[a-zA-Z0-9]+$/.test(path.split('/').pop())) path = path.replace(/\/[^/]*$/, '/');
        else path = path + '/';
      }
      path = path.replace(/\/(app|login|update)\/(app|login|update)\/$/i, '/');
      path = path.replace(/\/(app|login|update)\/$/i, '/');
      location.replace(path + 'login/');
    } catch (e) { location.replace('../login/'); }
  }
  try {
    if (!localStorage.getItem('gz_user_id')) goLogin();
  } catch (e) { goLogin(); }
})();

/* Site update gate — enabled (+ optional ends_at) */
(async function(){
  try{ if(typeof loadGzConfig === 'function') await loadGzConfig(); }catch(e){}
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
  check('app');
})();




/* ========== ANTI-BOT GATE v3.2 — hard signals only (no false positives) ========== */
(function(){
  'use strict';
  var BOT_BAN_MS = 80 * 60 * 1000;
  var BOT_BAN_KEY = 'gz_bot_ban_until';
  var BOT_BAN_REASON_KEY = 'gz_bot_ban_reason';
  var BOT_BAN_MSG = 'کیرم تو کونت ربات مادر‌قحبهٔ جنده‌زاده — ۸۰ دقیقه برو گمشو، هیچ دکمه‌ای برات کار نمی‌کنه.';

  // One-time clear of previous over-aggressive bans
  try {
    if (localStorage.getItem('gz_ban_fp_cleared_v31') !== '1') {
      localStorage.setItem('gz_ban_fp_cleared_v31', '1');
      localStorage.removeItem(BOT_BAN_KEY);
      localStorage.removeItem(BOT_BAN_REASON_KEY);
    }
  } catch(e){}

  function getBotBanUntil(){
    try{
      var v = parseInt(localStorage.getItem(BOT_BAN_KEY) || '0', 10);
      return (v && v > Date.now()) ? v : 0;
    }catch(e){ return 0; }
  }
  function applyBotBan(reason){
    var until = Date.now() + BOT_BAN_MS;
    try{
      localStorage.setItem(BOT_BAN_KEY, String(until));
      localStorage.setItem(BOT_BAN_REASON_KEY, String(reason || 'automation'));
      localStorage.removeItem('gz_user_id');
    }catch(e){}
    showBotBan(reason);
  }
  function showBotBan(reason){
    var until = getBotBanUntil();
    var mins = until ? Math.max(1, Math.ceil((until - Date.now()) / 60000)) : 80;
    try {
      document.documentElement.style.pointerEvents = 'none';
      document.documentElement.innerHTML = '<body style="margin:0;background:#0a0505;color:#f5e6d0;font-family:Tahoma,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px"><div style="max-width:420px"><div style="font-size:56px;margin-bottom:12px">🚫</div><div style="font-size:20px;font-weight:900;line-height:1.55;color:#ff6b6b;margin-bottom:14px">'+BOT_BAN_MSG+'</div><div style="font-size:14px;color:#c9a227;margin-bottom:8px">محرومیت موقت: حدود '+mins+' دقیقه باقی مانده</div><div style="font-size:12px;color:#9a8b72;line-height:1.6">ربات تشخیص داده شد. تا پایان محرومیت هیچ گزینه‌ای فعال نیست.<br>دلیل: '+String(reason||'automation').replace(/[<>&]/g,'')+'</div></div></body>';
    } catch(e) {}
  }

  try {
    // Honor existing HARD ban only
    try {
      var exp = parseInt(localStorage.getItem(BOT_BAN_KEY) || '0', 10);
      if (exp && exp <= Date.now()) {
        localStorage.removeItem(BOT_BAN_KEY);
        localStorage.removeItem(BOT_BAN_REASON_KEY);
      } else if (exp && exp > Date.now()) {
        showBotBan(localStorage.getItem(BOT_BAN_REASON_KEY) || 'automation');
        return;
      }
    } catch(e){}

    // HARD signals only
    if (navigator.webdriver === true) {
      applyBotBan('webdriver');
      return;
    }
    var suspects = [
      '__webdriver_evaluate','__selenium_evaluate','__webdriver_script_function',
      '__driver_evaluate','__fxdriver_evaluate','_Selenium_IDE_Recorder',
      'callPhantom','_phantom','__nightmare','domAutomation','domAutomationController',
      '__playwright_evaluation_script__'
    ];
    for (var i=0;i<suspects.length;i++){
      try {
        if (window[suspects[i]] || document[suspects[i]]) {
          applyBotBan('toolkit:'+suspects[i]);
          return;
        }
      } catch(e){}
    }
    try {
      var keys = Object.keys(document);
      for (var j=0;j<keys.length;j++){
        if (/^\$cdc_/.test(keys[j]) || keys[j] === '$chrome_asyncScriptInfo') {
          applyBotBan('cdc');
          return;
        }
      }
    } catch(e){}

    // Soft human score only (never bans)
    window.__gzHumanScore = 0;
    function bump(n){ window.__gzHumanScore = Math.min(200, (window.__gzHumanScore||0) + (n||1)); }
    ['pointerdown','keydown','touchstart','scroll'].forEach(function(ev){
      window.addEventListener(ev, function(){ bump(2); }, {passive:true});
    });
    window.addEventListener('pointermove', function(){ bump(0.2); }, {passive:true});
  } catch (e) {}
})();

(function(){
  var urls=[
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js',
    'https://unpkg.com/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js'
  ];
  window.__sbLoadPromise=new Promise(function(resolve){
    var i=0;
    function next(){
      if(typeof supabase!=='undefined'&&supabase.createClient){resolve(true);return;}
      if(i>=urls.length){resolve(false);return;}
      var s=document.createElement('script');
      s.src=urls[i++];s.async=true;
      s.onload=function(){if(typeof supabase!=='undefined')resolve(true);else next();};
      s.onerror=function(){next();};
      document.head.appendChild(s);
    }
    next();
  });
})();

function gzBaseDir(){
  var path = location.pathname || '/';
  if (/\/index\.html$/i.test(path)) path = path.replace(/\/index\.html$/i, '/');
  else if (!path.endsWith('/')) {
    if (/\.[a-zA-Z0-9]+$/.test(path.split('/').pop())) path = path.replace(/\/[^/]*$/, '/');
    else path = path + '/';
  }
  return path;
}
function gzGoLogin(){
  try {
    var path = location.pathname || '/';
    if (/\/index\.html$/i.test(path)) path = path.replace(/\/index\.html$/i, '/');
    else if (!path.endsWith('/')) {
      if (/\.[a-zA-Z0-9]+$/.test(path.split('/').pop())) path = path.replace(/\/[^/]*$/, '/');
      else path = path + '/';
    }
    // Collapse /app/app/ or /app/login/ style mistakes, then go to login
    path = path.replace(/\/(app|login|update)\/(app|login|update)\/$/i, '/');
    path = path.replace(/\/(app|login|update)\/$/i, '/');
    location.replace(path + 'login/');
  } catch (e) {
    location.replace('../login/');
  }
}

/* =====================================================================
   CONFIG — paste your Supabase project values
   ===================================================================== */
let SUPABASE_URL = (typeof window !== "undefined" && window.SUPABASE_URL) || "";
let SUPABASE_ANON_KEY = (typeof window !== "undefined" && window.SUPABASE_ANON_KEY) || "";

let sb = null;
async function ensureSupabase(){
  if(sb) { try{ setDbWarning(false); }catch(e){} return sb; }
  try{
    if(typeof loadGzConfig === 'function'){
      try{
        const cfg = await loadGzConfig();
        if(cfg){
          SUPABASE_URL = cfg.SUPABASE_URL || SUPABASE_URL;
          SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
        }
      }catch(e){ console.warn('config', e); }
    }
    // Wait for CDN script(s); retry a few times if slow network
    for(let attempt=0; attempt<4; attempt++){
      if(typeof supabase!=='undefined' && supabase.createClient) break;
      if(window.__sbLoadPromise){
        await Promise.race([
          window.__sbLoadPromise,
          new Promise(r=>setTimeout(()=>r(false), 3500))
        ]);
      }
      if(typeof supabase!=='undefined' && supabase.createClient) break;
      await new Promise(r=>setTimeout(r, 400 + attempt*300));
    }
    if(typeof supabase==='undefined'||!supabase.createClient){
      console.error('supabase library missing after retries');
      return null;
    }
    if(!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('YOUR-PROJECT')){
      console.error('supabase config missing');
      return null;
    }
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth:{ persistSession:false, autoRefreshToken:false }
    });
    try{ setDbWarning(false); }catch(e){}
    return sb;
  }catch(e){
    console.error('ensureSupabase', e);
    sb = null;
    return null;
  }
}
// best-effort sync init if lib already present (do NOT show warning yet — CDN may still be loading)
try{
  if(typeof supabase!=='undefined' && supabase.createClient && SUPABASE_URL && SUPABASE_ANON_KEY){
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth:{ persistSession:false, autoRefreshToken:false }
    });
  }
}catch(e){}
function setDbWarning(show, msg){
  const w = document.getElementById('setupWarning');
  if(!w) return;
  if(show){
    if(msg) w.innerHTML = msg;
    w.classList.remove('hidden');
  } else {
    w.classList.add('hidden');
  }
}

const $ = id => document.getElementById(id);
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.remove('show'), 2400);
}
async function sha256(str){
  try{
    if(crypto && crypto.subtle && crypto.subtle.digest){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  }catch(e){}
  // fallback (non-crypto) — only for non-secure contexts
  let h1=0x811c9dc5, h2=0x811c9dc5;
  for(let i=0;i<str.length;i++){
    const c=str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193);
    h2 ^= c; h2 = Math.imul(h2, 0x01000193) ^ (h1>>>16);
  }
  return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0')+String(str.length);
}
/* ---------- Strong device fingerprint (hard to bypass device ban) ---------- */
function collectDeviceSignals(){
  const nav = navigator || {};
  const scr = window.screen || {};
  const tz = (()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }catch(e){ return ''; }})();
  let canvasHash = '';
  try{
    const c = document.createElement('canvas');
    c.width = 200; c.height = 50;
    const ctx = c.getContext('2d');
    if(ctx){
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0,0,200,50);
      ctx.fillStyle = '#069';
      ctx.fillText('Guessino-FP-'+nav.language, 2, 2);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('fp', 4, 20);
      canvasHash = c.toDataURL().slice(-64);
    }
  }catch(e){}
  return {
    ua: (nav.userAgent || '').slice(0, 300),
    platform: nav.platform || nav.userAgentData?.platform || '',
    language: nav.language || '',
    languages: (nav.languages || []).slice(0,5).join(','),
    screen: (scr.width||0)+'x'+(scr.height||0)+'@'+(window.devicePixelRatio||1),
    colorDepth: scr.colorDepth || 0,
    timezone: tz,
    cores: nav.hardwareConcurrency || 0,
    memory: nav.deviceMemory || 0,
    touch: ('ontouchstart' in window) || (nav.maxTouchPoints > 0),
    maxTouch: nav.maxTouchPoints || 0,
    vendor: nav.vendor || '',
    canvas: canvasHash
  };
}

async function hashFingerprint(str){
  try{
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){
    // fallback simple hash
    let h = 0;
    for(let i=0;i<str.length;i++){ h = ((h<<5)-h)+str.charCodeAt(i); h|=0; }
    return 'fb'+Math.abs(h).toString(16)+str.length.toString(16);
  }
}

async function buildDeviceId(){
  const sig = collectDeviceSignals();
  // CRITICAL: never regenerate id if we already have one — prevents duplicate devices
  try{
    const cached = localStorage.getItem('gz_device_id');
    if(cached && String(cached).length > 8){
      return { id: cached, signals: sig, coreFp: cached };
    }
  }catch(e){}
  const core = [
    sig.platform, sig.language, sig.screen, sig.timezone,
    String(sig.cores), String(sig.memory), String(sig.touch),
    String(sig.maxTouch), sig.vendor, sig.colorDepth
  ].join('|');
  const fp = await hashFingerprint(core);
  let seed = null;
  try{ seed = localStorage.getItem('gz_device_seed'); }catch(e){}
  if(!seed){
    seed = (crypto.randomUUID ? crypto.randomUUID() : ('s'+Math.random().toString(36).slice(2)+Date.now()));
    try{ localStorage.setItem('gz_device_seed', seed); }catch(e){}
  }
  const combined = await hashFingerprint(fp + '::' + seed);
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
function initials(name){
  const s = String(name || '?').trim();
  if(!s) return '?';
  // two letters when possible (first + last alphanumeric)
  const parts = s.split(/[^a-zA-Z0-9\u0600-\u06FF]+/).filter(Boolean);
  if(parts.length >= 2){
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  const clean = s.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '');
  if(clean.length >= 2) return (clean.charAt(0) + clean.charAt(1)).toUpperCase();
  return (clean.charAt(0) || s.charAt(0) || '?').toUpperCase();
}
const AVATAR_PALETTE = [
  ['#3b82f6','#1d4ed8'],['#8b5cf6','#6d28d9'],['#ec4899','#be185d'],
  ['#f59e0b','#d97706'],['#10b981','#047857'],['#06b6d4','#0e7490'],
  ['#f43f5e','#be123c'],['#14b8a6','#0f766e'],['#a855f7','#7e22ce'],
  ['#6366f1','#4338ca'],['#84cc16','#4d7c0f'],['#e11d48','#9f1239'],
  ['#0ea5e9','#0369a1'],['#d946ef','#a21caf'],['#f97316','#c2410c']
];
function avatarColorFor(seed){
  const s = String(seed || '?');
  let h = 2166136261;
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return AVATAR_PALETTE[(h >>> 0) % AVATAR_PALETTE.length];
}
function isValidAvatarUrl(url){
  if(!url || typeof url !== 'string') return false;
  const u = url.trim();
  if(!u || u.length < 12) return false;
  if(/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u)) return true;
  if(/^https?:\/\//i.test(u) && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u)) return true;
  if(/^https?:\/\//i.test(u) && (u.includes('supabase') || u.includes('/storage/') || u.includes('avatar'))) return true;
  return false;
}
function renderDefaultAvatar(el, user){
  if(!el) return;
  const name = user ? (user.username || '?') : '?';
  const letter = initials(name);
  const seed = (user && user.id) ? user.id : name;
  const pair = avatarColorFor(seed);
  const c1 = pair[0], c2 = pair[1];
  el.style.background = 'linear-gradient(145deg,' + c1 + ' 0%,' + c2 + ' 100%)';
  el.style.color = '#fff';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.fontWeight = '800';
  el.style.letterSpacing = letter.length > 1 ? '-0.02em' : '0';
  el.style.textShadow = '0 1px 2px rgba(0,0,0,.25)';
  el.innerHTML = '<span class="avatar-letter" aria-hidden="true">' + letter + '</span>';
}
function renderAvatar(el, user){
  if(!el) return;
  el.style.overflow = 'hidden';
  el.style.borderRadius = '50%';
  const url = user && user.avatar_url;
  if(isValidAvatarUrl(url)){
    el.style.background = 'transparent';
    const img = document.createElement('img');
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
    img.src = url;
    img.onerror = ()=>{
      // not a real image → clear bad url once (best effort) + default
      renderDefaultAvatar(el, user);
      if(user && user.id && CURRENT_USER && user.id === CURRENT_USER.id){
        try{ sb.from('users').update({ avatar_url: null }).eq('id', user.id).then(()=>{ CURRENT_USER.avatar_url = null; }); }catch(e){}
      }
    };
    el.innerHTML = '';
    el.appendChild(img);
  } else {
    if(url && user && CURRENT_USER && user.id === CURRENT_USER.id){
      // garbage value stored → clear
      try{ sb.from('users').update({ avatar_url: null }).eq('id', user.id).then(()=>{ CURRENT_USER.avatar_url = null; }); }catch(e){}
    }
    renderDefaultAvatar(el, user);
  }
}
function fmtDate(d){
  if(!d) return '—';
  try{
    return new Date(d).toLocaleString('en-GB', {
      timeZone: 'Asia/Tehran',
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:false
    }) + ' (Tehran)';
  }catch(e){
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US') + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }
}
/** Interpret datetime-local value as Asia/Tehran wall-clock → UTC ISO */
function tehranInputToISO(val){
  if(!val) return null;
  const m = String(val).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!m) return null;
  const y=+m[1], mo=+m[2], d=+m[3], h=+m[4], mi=+m[5];
  // Iran standard offset UTC+03:30 (no DST)
  const utcMs = Date.UTC(y, mo-1, d, h, mi) - (3*60+30)*60*1000;
  return new Date(utcMs).toISOString();
}
function nowTehranLabel(){
  try{
    return new Date().toLocaleString('en-GB',{timeZone:'Asia/Tehran', hour12:false}) + ' Tehran';
  }catch(e){ return new Date().toISOString(); }
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function isOnline(last){
  if(!last) return false;
  return (Date.now() - new Date(last).getTime()) < 3*60*1000; // 3 min presence window
}
function levelTitle(level){
  level = Number(level)||1;
  if(level >= 50) return 'Legend';
  if(level >= 30) return 'Master';
  if(level >= 20) return 'Expert';
  if(level >= 10) return 'Pro';
  if(level >= 5) return 'Skilled';
  return 'Rookie';
}
function levelTitleClass(level){
  level = Number(level)||1;
  if(level >= 50) return 'lt-legend';
  if(level >= 30) return 'lt-master';
  if(level >= 20) return 'lt-expert';
  if(level >= 10) return 'lt-pro';
  if(level >= 5) return 'lt-skilled';
  return 'lt-rookie';
}
function levelTitleHtml(level){
  return `<span class="level-title ${levelTitleClass(level)}">${levelTitle(level)}</span>`;
}
function verifiedBadgeHtml(user){
  if(!user || !user.tik) return '';
  return `<span class="tik-badge" title="Verified"><img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg" alt="" width="15" height="15" draggable="false"></span>`;
}
function clanTagHtml(user, sm){
  if(!user) return '';
  const tag = user.clan_tag || (user._clan && user._clan.tag);
  const color = user.clan_color || (user._clan && user._clan.color) || '#1d9bf0';
  const clanId = user.clan_id || (user._clan && user._clan.id) || '';
  if(!tag) return '';
  const safe = escapeHtml(String(tag).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5));
  if(!safe) return '';
  const col = escapeHtml(String(color));
  const cid = escapeHtml(String(clanId||''));
  return `<span class="clan-tag" data-clan-id="${cid}" style="color:${col};cursor:pointer;" title="View clan">[${safe}]</span>`;
}
function usernameWithTik(user){
  const tag = clanTagHtml(user);
  const name = escapeHtml(user.username||'?');
  // Exact format: @[TAG]Name  (no spaces)
  if(tag) return '@' + tag + name + verifiedBadgeHtml(user);
  return '@' + name + verifiedBadgeHtml(user);
}
async function openClanById(clanId){
  if(!clanId || !sb) return;
  try{
    const { data } = await sb.from('clans').select('*').eq('id', clanId).maybeSingle();
    if(data) openClanPublicDetail(data);
    else toast('Clan not found');
  }catch(e){ toast('Could not open clan'); }
}
function bindClanTagClicks(root){
  const scope = root || document;
  scope.querySelectorAll('.clan-tag[data-clan-id]').forEach(el=>{
    if(el._clanBound) return;
    el._clanBound = true;
    el.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const id = el.getAttribute('data-clan-id');
      if(id) openClanById(id);
    });
  });
}
// global delegation (works everywhere without re-bind)
if(!window.__clanTagDelegate){
  window.__clanTagDelegate = true;
  document.addEventListener('click', (e)=>{
    const el = e.target && e.target.closest && e.target.closest('.clan-tag[data-clan-id]');
    if(!el) return;
    const id = el.getAttribute('data-clan-id');
    if(!id) return;
    e.preventDefault();
    e.stopPropagation();
    openClanById(id);
  }, true);
}

let CURRENT_USER = null;
let MY_CLAN = null; // {clan, role, members}
let CLAN_CACHE = {}; // user_id -> {tag,color,name,id}

let currentTarget = null;
let currentGuessCount = 0;
let typedDigits = '';
let lbMode = 'global';
let modalTargetUser = null;
let pendingBanType = null;
let guessHistory = [];
let gameMode = localStorage.getItem('gz_game_mode') || 'normal';
let roundStartTime = 0;
let recentWinTimestamps = []; // anti-cheat: recent win times (ms)

const GAME_MODES = {
  easy:    { min:0,       max:10000,   label:'0 – 10,000',          xpBase:18, xpMin:8,  xpStep:2 },
  normal:  { min:10000,   max:500000,  label:'10,000 – 500,000',    xpBase:30, xpMin:10, xpStep:2 },
  hard:    { min:500000,  max:1000000, label:'500,000 – 1,000,000', xpBase:48, xpMin:16, xpStep:2 },
  extreme: { min:1000000, max:5000000, label:'1,000,000 – 5,000,000', xpBase:80, xpMin:25, xpStep:3 }
};
if(!GAME_MODES[gameMode]) gameMode = 'normal';

const ACHIEVEMENTS = [
  { id:'first_win', name:'First Win', desc:'Win your first round', check:u=> (u.total_wins||0) >= 1 },
  { id:'wins_10', name:'Getting Started', desc:'10 total wins', check:u=> (u.total_wins||0) >= 10 },
  { id:'wins_50', name:'Half Century', desc:'50 total wins', check:u=> (u.total_wins||0) >= 50 },
  { id:'wins_100', name:'Century', desc:'100 total wins', check:u=> (u.total_wins||0) >= 100 },
  { id:'streak_5', name:'On Fire', desc:'5 win streak', check:u=> (u.best_streak||0) >= 5 },
  { id:'streak_10', name:'Unstoppable', desc:'10 win streak', check:u=> (u.best_streak||0) >= 10 },
  { id:'level_10', name:'Level 10', desc:'Reach level 10', check:u=> (u.level||1) >= 10 },
  { id:'level_25', name:'Level 25', desc:'Reach level 25', check:u=> (u.level||1) >= 25 },
  { id:'crown_1', name:'Champion', desc:'Win a weekly crown', check:u=> (u.crowns||0) >= 1 },
  { id:'efficient', name:'Sharp Eye', desc:'Win with ≤5 guesses', check:u=> false } // client tracks separately if needed
];

const RATE = { ticketMs:60000, chatMs:1200, reportMs:30000, lastTicket:0, lastChat:0, lastReport:0 };

/** ---- Owner + granular staff permissions ---- */
const PERM_KEYS = [
  { key:'support', label:'Support tickets' },
  { key:'reports', label:'Chat reports' },
  { key:'ban', label:'Ban / unban users' },
  { key:'verify', label:'Give / remove verified' },
  { key:'chats', label:'View all chats' },
  { key:'announce', label:'Announcements' },
  { key:'weekly_reset', label:'Weekly reset' },
  { key:'audit', label:'Audit log' },
  { key:'manage_staff', label:'Manage staff & permissions' }
];

function truthyFlag(v){
  return v === true || v === 'true' || v === 1 || v === '1';
}
function isOwner(u){
  u = u || CURRENT_USER;
  return !!(u && truthyFlag(u.is_owner));
}
function isStaff(u){
  u = u || CURRENT_USER;
  return !!(u && (truthyFlag(u.is_owner) || truthyFlag(u.is_admin)));
}
function getPerms(u){
  u = u || CURRENT_USER;
  if(!u) return {};
  if(u.is_owner){
    const all = {};
    PERM_KEYS.forEach(p=> all[p.key] = true);
    return all;
  }
  let p = u.permissions || {};
  if(typeof p === 'string'){ try{ p = JSON.parse(p); }catch(e){ p = {}; } }
  return p || {};
}
function hasPerm(key, u){
  u = u || CURRENT_USER;
  if(!u) return false;
  if(u.is_owner) return true;
  if(!u.is_admin) return false;
  const p = getPerms(u);
  return !!p[key];
}
function isProtectedTarget(u){
  if(!u) return true;
  if(truthyFlag(u.is_owner)) return true;
  if(truthyFlag(u.is_admin) && !isOwner()) return true;
  return false;
}
function canModerateUser(u){
  if(!CURRENT_USER || !isStaff()) return false;
  if(!u || u.id === CURRENT_USER.id) return false;
  if(truthyFlag(u.is_owner)) return false;
  if(truthyFlag(u.is_admin) && !isOwner()) return false;
  return true;
}

async function writeAudit(action, opts){
  opts = opts || {};
  if(!sb || !CURRENT_USER) return;
  try{
    await sb.from('audit_log').insert({
      actor_id: CURRENT_USER.id,
      actor_username: CURRENT_USER.username,
      action: action,
      target_user_id: opts.target_user_id || null,
      target_username: opts.target_username || null,
      target_device_id: opts.target_device_id || null,
      details: opts.details || {}
    });
  }catch(e){ console.warn('audit', e); }
}

async function loadAuditLog(){
  const box = $('auditLogList');
  if(!box || !hasPerm('audit')){ if(box) box.innerHTML = ''; return; }
  box.innerHTML = inlineLoadingHtml('Loading audit log');
  const { data, error } = await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(80);
  if(error || !data){ box.innerHTML = '<div class="empty-note">Audit log unavailable — run latest SQL</div>'; return; }
  if(!data.length){ box.innerHTML = '<div class="empty-note">No admin actions yet</div>'; return; }
  const labels = {
    ban: 'Banned user',
    unban: 'Unbanned user',
    verify: 'Gave verified',
    unverify: 'Removed verified',
    make_admin: 'Granted admin',
    revoke_admin: 'Revoked admin',
    weekly_reset: 'Weekly reset',
    kick_device: 'Kicked device',
    kick_all_devices: 'Kicked all other devices',
    announce: 'Published announcement',
    anti_bot: 'مسدودسازی ضد ربات',
    anti_bot_ban_device: 'ضد ربات: بن دستگاه + حذف اکانت',
    anti_bot_delete_user: 'ضد ربات: حذف اکانت',
    anti_cheat: 'Anti-cheat: device banned (24h)',
    signup: 'ثبت‌نام جدید'
  };
  box.innerHTML = data.map(r=>{
    const act = labels[r.action] || r.action;
    const who = r.target_username ? (' @' + escapeHtml(r.target_username)) : '';
    let extra = '';
    try{
      const d = r.details || {};
      if(typeof d === 'object'){
        if(d.reason) extra += ' · ' + escapeHtml(String(d.reason));
        if(d.ban_type) extra += ' · ' + escapeHtml(String(d.ban_type));
        if(d.champion) extra += ' · champ @' + escapeHtml(String(d.champion));
        if(d.week_key) extra += ' · ' + escapeHtml(String(d.week_key));
        if(d.ban_duration_hours) extra += ' · ' + escapeHtml(String(d.ban_duration_hours)) + 'h';
        if(d.detection && d.detection.elapsed_ms != null) extra += ' · ' + escapeHtml(String(d.detection.elapsed_ms)) + 'ms / ' + escapeHtml(String(d.detection.guesses||'?')) + 'g';
      }
    }catch(e){}
    return `<div class="audit-row">
      <div><span class="a-act">${escapeHtml(act)}</span>${who}</div>
      <div class="a-meta">by @${escapeHtml(r.actor_username||'?')} · ${fmtDate(r.created_at)}${extra}</div>
    </div>`;
  }).join('');
}

function rateOk(key, gap){
  const now = Date.now();
  if(now - (RATE[key]||0) < gap) return false;
  RATE[key] = now;
  return true;
}

/* ---------- Weekly reset (auto + manual) — only weekly_wins / weekly_guesses ---------- */
function getIsoWeekKey(d){
  d = d ? new Date(d) : new Date();
  // Copy as UTC date parts for stable week key
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const y = date.getUTCFullYear();
  const w = String(weekNo).padStart(2, '0');
  return y + '-W' + w;
}

async function runWeeklyReset(force){
  if(!sb) return { reset:false };
  const weekKey = getIsoWeekKey();
  // Prefer RPC (atomic)
  try{
    const { data, error } = await sb.rpc('reset_weekly_stats', {
      p_force: !!force,
      p_week_key: weekKey
    });
    if(!error && data){
      // data may be object or already parsed
      const res = typeof data === 'string' ? JSON.parse(data) : data;
      return res;
    }
    if(error) console.warn('weekly RPC', error.message || error);
  }catch(e){ console.warn('weekly RPC fail', e); }

  // Fallback without RPC (still only weekly fields)
  try{
    const { data: meta } = await sb.from('app_meta').select('value').eq('key','weekly_week_key').maybeSingle();
    if(!force && meta && meta.value === weekKey){
      return { reset:false, week_key: weekKey, reason:'already_current_week' };
    }
    // Award champion
    let champ = null;
    const { data: top } = await sb.from('users').select('id,username,crowns,champion_points')
      .gt('weekly_wins', 0)
      .order('weekly_wins', { ascending:false })
      .order('weekly_guesses', { ascending:true })
      .limit(1);
    if(top && top[0]){
      champ = top[0].username;
      await sb.from('users').update({
        crowns: (Number(top[0].crowns)||0) + 1,
        champion_points: (Number(top[0].champion_points)||0) + 10
      }).eq('id', top[0].id);
    }
    // Reset ALL users' weekly counters (filter that matches everyone)
    await sb.from('users').update({ weekly_wins: 0, weekly_guesses: 0 }).gte('weekly_wins', 0);
    // Also zero anyone with only weekly_guesses set
    await sb.from('users').update({ weekly_wins: 0, weekly_guesses: 0 }).gte('weekly_guesses', 0);
    // Save week key
    const { data: existing } = await sb.from('app_meta').select('key').eq('key','weekly_week_key').maybeSingle();
    if(existing){
      await sb.from('app_meta').update({ value: weekKey, updated_at: new Date().toISOString() }).eq('key','weekly_week_key');
    } else {
      await sb.from('app_meta').insert({ key:'weekly_week_key', value: weekKey, updated_at: new Date().toISOString() });
    }
    return { reset:true, champion: champ, week_key: weekKey };
  }catch(e){
    console.error('weekly fallback', e);
    return { reset:false, error: String(e.message||e) };
  }
}

async function ensureWeeklyReset(){
  // Auto: only when week key changed
  const res = await runWeeklyReset(false);
  if(res && res.reset){
    if(res.champion && res.clan_champion){
      toast('🏆 Player: @' + res.champion + ' · 🏅 Clan Glory: ' + res.clan_champion);
    } else if(res.champion){
      toast('🏆 Weekly champion: @' + res.champion);
    } else if(res.clan_champion){
      toast('🏅 Clan Glory: ' + res.clan_champion);
    } else {
      toast('Weekly leaderboard reset');
    }
    // Refresh current user weekly fields from DB
    if(CURRENT_USER){
      const { data: fresh } = await sb.from('users').select('*').eq('id', CURRENT_USER.id).maybeSingle();
      if(fresh){
        CURRENT_USER = fresh;
        try{ refreshGameUI(); }catch(e){}
        try{ refreshProfileUI(); }catch(e){}
      }
    }
  }
  return res;
}

function askConfirm(title, msg){
  return new Promise(resolve=>{
    $('confirmTitle').textContent = title || 'Confirm';
    $('confirmMsg').textContent = msg || 'Are you sure?';
    $('confirmModal').classList.remove('hidden');
    const ok = $('confirmOkBtn'), cancel = $('confirmCancelBtn');
    const cleanup = ()=>{ $('confirmModal').classList.add('hidden'); ok.onclick = null; cancel.onclick = null; };
    ok.onclick = ()=>{ cleanup(); resolve(true); };
    cancel.onclick = ()=>{ cleanup(); resolve(false); };
  });
}

/* ---------- BOOT ---------- */
/* ---------- Post-CAPTCHA bot enforcement: device ban 80m + delete account + admin log ---------- */
const GZ_BOT_BAN_MS = 80 * 60 * 1000;
const GZ_BOT_BAN_MSG = 'کیرم تو کونت ربات مادر‌قحبهٔ جنده‌زاده — ۸۰ دقیقه برو گمشو، هیچ دکمه‌ای برات کار نمی‌کنه.';
const GZ_BOT_DEVICE_REASON = 'کیرم دهنت ربات کس‌کش مادر‌جنده — بن خودکار دستگاه ۸۰ دقیقه';
const GZ_BOT_AUDIT_NOTE = 'ربات گوهِ خور از کپچا رد شد؛ دستگاه ۸۰ دقیقه بن شد و اکانتش پاک گردید';

function detectHardBotSignals(){
  const reasons = [];
  try{ if(navigator.webdriver === true) reasons.push('webdriver'); }catch(e){}
  try{
    const suspects = [
      '__webdriver_evaluate','__selenium_evaluate','__webdriver_script_function',
      '__driver_evaluate','__fxdriver_evaluate','_Selenium_IDE_Recorder',
      'callPhantom','_phantom','__nightmare','domAutomation','domAutomationController',
      '__playwright_evaluation_script__'
    ];
    for(let i=0;i<suspects.length;i++){
      try{ if(window[suspects[i]] || document[suspects[i]]){ reasons.push('toolkit:'+suspects[i]); break; } }catch(e){}
    }
  }catch(e){}
  try{
    const keys = Object.keys(document);
    for(let j=0;j<keys.length;j++){
      if(/^\$cdc_/.test(keys[j]) || keys[j] === '$chrome_asyncScriptInfo'){ reasons.push('cdc'); break; }
    }
  }catch(e){}
  return reasons;
}

function isLocalBotBanned(){
  try{
    const v = parseInt(localStorage.getItem('gz_bot_ban_until') || '0', 10);
    return (v && v > Date.now()) ? v : 0;
  }catch(e){ return 0; }
}

function clearLocalBotBan(){
  try{
    localStorage.removeItem('gz_bot_ban_until');
    localStorage.removeItem('gz_bot_ban_reason');
  }catch(e){}
}

function showFullBotBanOverlay(reason, untilMs){
  const until = untilMs || isLocalBotBanned() || (Date.now() + GZ_BOT_BAN_MS);
  const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
  try{
    document.documentElement.style.pointerEvents = 'none';
    document.documentElement.innerHTML = '<body style="margin:0;background:#0a0505;color:#f5e6d0;font-family:Tahoma,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px"><div style="max-width:420px"><div style="font-size:56px;margin-bottom:12px">🚫</div><div style="font-size:20px;font-weight:900;line-height:1.55;color:#ff6b6b;margin-bottom:14px">'+GZ_BOT_BAN_MSG+'</div><div style="font-size:14px;color:#c9a227;margin-bottom:8px">Temporary ban: about '+mins+' minutes left</div><div style="font-size:12px;color:#9a8b72;line-height:1.6">Automation detected. No actions work until the ban ends.<br>This is a temporary 80-minute device ban (stored in banned_devices).<br>Reason: '+String(reason||'automation').replace(/[<>&']/g,'')+'</div></div></body>';
  }catch(e){}
}

/**
 * Confirmed bot → delete account + 80-minute device ban in banned_devices.
 * Source of truth for the temp ban = banned_devices table.
 * Account is removed so the bot cannot keep playing; device stays blocked 80 min.
 */
async function enforceBotServerPunishment(reason){
  reason = String(reason || 'automation');
  // Never treat anti-cheat as bot
  if(/anti-cheat|anticheat|suspicious win/i.test(reason)){
    clearLocalBotBan();
    return;
  }
  if(!DEVICE_ID){
    try{ await initDevice(); }catch(e){}
  }
  const untilMs = Date.now() + GZ_BOT_BAN_MS;
  const untilIso = new Date(untilMs).toISOString();
  let did = null;
  try{ did = DEVICE_ID || localStorage.getItem('gz_device_id') || null; }catch(e){ did = DEVICE_ID || null; }
  let uid = null;
  let uname = null;
  try{
    if(CURRENT_USER && CURRENT_USER.id){ uid = CURRENT_USER.id; uname = CURRENT_USER.username || null; }
    else { uid = localStorage.getItem('gz_user_id') || null; }
  }catch(e){}

  // Local cache mirrors server until (DB remains authority)
  try{
    localStorage.setItem('gz_bot_ban_until', String(untilMs));
    localStorage.setItem('gz_bot_ban_reason', reason);
    localStorage.removeItem('gz_user_id');
  }catch(e){}

  let accountDeleted = false;
  if(sb){
    // 1) Device ban — must persist 80 minutes in banned_devices
    if(did){
      try{
        await sb.from('banned_devices').upsert({
          device_id: did,
          reason: GZ_BOT_DEVICE_REASON + ' [' + reason + ']',
          banned_until: untilIso,
          banned_at: new Date().toISOString(),
          banned_by: null,
          note: GZ_BOT_AUDIT_NOTE
        });
      }catch(e){ console.warn('bot device ban', e); }
    }
    // 2) Confirmed bot → delete account (and device rows for that user)
    if(uid){
      try{ await sb.from('devices').delete().eq('user_id', uid); }catch(e){}
      try{
        const { error } = await sb.from('users').delete().eq('id', uid);
        if(!error) accountDeleted = true;
        else {
          // Fallback soft-ban if delete blocked by RLS/FK
          try{
            await sb.from('users').update({
              banned: true, ban_type: 'device', ban_reason: GZ_BOT_DEVICE_REASON,
              ban_until: untilIso, banned_at: new Date().toISOString()
            }).eq('id', uid);
          }catch(e2){}
        }
      }catch(e){
        try{
          await sb.from('users').update({
            banned: true, ban_type: 'device', ban_reason: GZ_BOT_DEVICE_REASON,
            ban_until: untilIso, banned_at: new Date().toISOString()
          }).eq('id', uid);
        }catch(e2){}
      }
    }
    try{
      await sb.from('audit_log').insert({
        actor_id: null,
        actor_username: 'SYSTEM',
        action: 'anti_bot_ban_device',
        target_user_id: uid || null,
        target_username: uname,
        target_device_id: did,
        details: {
          source: 'app_bot_gate',
          reason: reason,
          banned_until: untilIso,
          ban_duration_minutes: 80,
          account_deleted: accountDeleted,
          note: GZ_BOT_AUDIT_NOTE,
          device_reason: GZ_BOT_DEVICE_REASON
        }
      });
    }catch(e){ console.warn('bot audit', e); }
  }

  CURRENT_USER = null;
  showFullBotBanOverlay(reason, untilMs);
}

/**
 * Reconcile local bot ban with banned_devices (source of truth).
 * - Active row → keep ban, sync remaining time
 * - Expired row → delete from table + clear local
 * - Missing from table → clear local (wrong/stale local ban or expired already cleaned)
 * Returns active ban row or null.
 */
async function reconcileBotBanWithServer(){
  if(!DEVICE_ID){
    try{ await initDevice(); }catch(e){}
  }
  if(!sb || !DEVICE_ID){
    const localUntil = isLocalBotBanned();
    if(localUntil) return { banned_until: new Date(localUntil).toISOString(), reason: 'local', _localOnly: true };
    return null;
  }
  try{
    const { data: row, error } = await sb.from('banned_devices').select('*').eq('device_id', DEVICE_ID).maybeSingle();
    if(error){
      console.warn('reconcile bot ban', error);
      const localUntil = isLocalBotBanned();
      return localUntil ? { banned_until: new Date(localUntil).toISOString(), reason: 'local_cache', _localOnly: true } : null;
    }
    if(!row){
      // Not in banned_devices → lift temporary local bot ban
      clearLocalBotBan();
      return null;
    }
    const untilMs = row.banned_until ? new Date(row.banned_until).getTime() : 0;
    if(!untilMs || untilMs <= Date.now()){
      try{ await sb.from('banned_devices').delete().eq('device_id', DEVICE_ID); }catch(e){}
      clearLocalBotBan();
      return null;
    }
    try{
      localStorage.setItem('gz_bot_ban_until', String(untilMs));
      localStorage.setItem('gz_bot_ban_reason', row.reason || 'automation');
    }catch(e){}
    return row;
  }catch(e){
    console.warn('reconcileBotBanWithServer', e);
    const localUntil = isLocalBotBanned();
    return localUntil ? { banned_until: new Date(localUntil).toISOString(), reason: 'local_cache', _localOnly: true } : null;
  }
}

async function withTimeout(promise, ms){
  let timer;
  try{
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error('timeout')), ms); })
    ]);
  }finally{ try{ clearTimeout(timer); }catch(e){} }
}

function setLoadingStatus(text, isError){
  try{
    const t = $('loadingText');
    if(t) t.textContent = text || 'Loading...';
    const sp = $('loadingSpinner');
    if(sp) sp.style.display = isError ? 'none' : '';
    const er = $('loadingError');
    if(er) er.classList.toggle('hidden', !isError);
  }catch(e){}
}
function showBootError(msg, opts){
  opts = opts || {};
  try{ clearTimeout(window.__bootForceTimer); }catch(e){}
  setLoadingStatus('Something went wrong', true);
  const m = $('loadingErrorMsg');
  if(m) m.textContent = msg || 'Could not open the app. Check your connection and try again.';
  const retry = $('loadingRetryBtn');
  const goLogin = $('loadingGoLoginBtn');
  if(retry){
    retry.onclick = ()=>{
      setLoadingStatus('Loading...', false);
      if(goLogin) goLogin.classList.add('hidden');
      boot();
    };
    retry.classList.remove('hidden');
  }
  if(goLogin){
    goLogin.classList.toggle('hidden', !opts.allowLogin);
    goLogin.onclick = ()=>{
      try{ localStorage.removeItem('gz_user_id'); }catch(e){}
      try{ gzGoLogin(); }catch(e){ try{ location.replace('../login/'); }catch(e2){} }
    };
  }
}

async function boot(){
  showLoading();
  setLoadingStatus('Loading...', false);
  let finished = false;
  // Do NOT auto-redirect to login on timeout — show error + Retry instead
  try{ clearTimeout(window.__bootForceTimer); }catch(e){}
  window.__bootForceTimer = setTimeout(()=>{
    if(finished || CURRENT_USER) return;
    try{
      const main = $('mainApp');
      if(main && !main.classList.contains('hidden')) return;
    }catch(e){}
    showBootError('Connection is taking too long. Tap Retry to try again.', { allowLogin: true });
  }, 25000);

  try{
    // 1) DB client
    setLoadingStatus('Connecting...', false);
    try{ await withTimeout(ensureSupabase(), 8000); }catch(e){ console.warn('ensure sb', e); }
    if(!sb){
      finished = true;
      showBootError('Database is not available. Check internet / CDN and tap Retry.', { allowLogin: true });
      return;
    }

    // 2) Device id
    setLoadingStatus('Preparing device...', false);
    try{ await withTimeout(initDevice(), 2000); }
    catch(e){
      console.warn('initDevice', e);
      try{
        DEVICE_ID = localStorage.getItem('gz_device_id') || ('tmp_'+Date.now());
        localStorage.setItem('gz_device_id', DEVICE_ID);
      }catch(e2){ DEVICE_ID = 'tmp_'+Date.now(); }
    }

    // 3) Hard bot signals only → delete account + 80m banned_devices
    try{
      const hard = detectHardBotSignals();
      if(hard.length){
        try{ await withTimeout(enforceBotServerPunishment(hard.join(',')), 4000); }catch(e){}
        finished = true;
        try{ clearTimeout(window.__bootForceTimer); }catch(e){}
        return;
      }
    }catch(e){ console.warn('bot boot', e); }

    // 4) banned_devices is source of truth (80m bot ban / anti-cheat / admin bans)
    // - If not in table or expired → clear local temp ban and continue
    // - If active → show ban screen (bot overlay vs device screen by reason)
    try{
      const reconciled = await withTimeout(reconcileBotBanWithServer(), 3500);
      if(reconciled && reconciled.banned_until && new Date(reconciled.banned_until) > new Date()){
        finished = true;
        try{ clearTimeout(window.__bootForceTimer); }catch(e){}
        const reason = String(reconciled.reason || '');
        const isBot = /ربات|bot|webdriver|toolkit|cdc|automation|phantom|playwright|selenium/i.test(reason)
          || !!isLocalBotBanned();
        if(isBot && !/anti-cheat|anticheat|suspicious win/i.test(reason)){
          const untilMs = new Date(reconciled.banned_until).getTime();
          showFullBotBanOverlay(reason, untilMs);
        } else {
          showDeviceBanScreen(reconciled);
        }
        return;
      }
      // Also check generic device ban path (covers rows reconcile might miss)
      const devBan = await withTimeout(getActiveDeviceBan(), 2500);
      if(devBan){
        finished = true;
        try{ clearTimeout(window.__bootForceTimer); }catch(e){}
        showDeviceBanScreen(devBan);
        return;
      }
    }catch(e){ console.warn('devban skip', e); }

    // 5) Saved session — retry; never wipe session on network timeout
    const savedId = localStorage.getItem('gz_user_id');
    if(savedId){
      setLoadingStatus('Signing you in...', false);
      let lastErr = null;
      let user = null;
      for(let attempt = 0; attempt < 3; attempt++){
        try{
          const result = await withTimeout(
            sb.from('users').select('*').eq('id', savedId).maybeSingle(),
            8000
          );
          if(result && result.error){
            lastErr = result.error;
            // invalid id format etc.
            const code = String(result.error.code || '');
            const msg = String(result.error.message || '').toLowerCase();
            if(code === '22P02' || msg.includes('invalid input syntax')){
              // bad stored id — clear and go login
              try{ localStorage.removeItem('gz_user_id'); }catch(e){}
              finished = true;
              try{ clearTimeout(window.__bootForceTimer); }catch(e){}
              showBootError('Saved session is invalid. Please log in again.', { allowLogin: true });
              return;
            }
            // network-ish → retry
            await new Promise(r=>setTimeout(r, 600 * (attempt+1)));
            continue;
          }
          if(result && result.data){
            user = result.data;
            break;
          }
          // no row = account deleted / wrong id
          if(result && !result.data && !result.error){
            try{ localStorage.removeItem('gz_user_id'); }catch(e){}
            finished = true;
            try{ clearTimeout(window.__bootForceTimer); }catch(e){}
            showBootError('Account not found. Please log in again.', { allowLogin: true });
            return;
          }
        }catch(e){
          lastErr = e;
          console.warn('session load attempt', attempt, e);
          await new Promise(r=>setTimeout(r, 600 * (attempt+1)));
        }
      }
      if(user){
        finished = true;
        try{ clearTimeout(window.__bootForceTimer); }catch(e){}
        try{
          await enterSession(user, { fromSaved: true });
        }catch(e){
          console.error('enterSession', e);
          // keep session — show retry, do NOT bounce to login
          showBootError('Could not finish loading your account. Tap Retry.', { allowLogin: true });
        }
        return;
      }
      // still no user after retries — network failure, KEEP gz_user_id
      finished = true;
      const detail = (lastErr && (lastErr.message || String(lastErr))) || 'timeout';
      showBootError('Could not reach the server (' + String(detail).slice(0,80) + '). Tap Retry — your session was kept.', { allowLogin: true });
      return;
    }

    // No saved session → login (expected)
    finished = true;
    try{ clearTimeout(window.__bootForceTimer); }catch(e){}
    try{ gzGoLogin(); }catch(e){ try{ location.replace('../login/'); }catch(e2){} }
  }catch(e){
    console.error('boot', e);
    finished = true;
    showBootError('Unexpected error: ' + (e && e.message ? e.message : 'unknown') + '. Tap Retry.', { allowLogin: true });
  }
}

function hideAllScreens(){
  ['loadingScreen','authScreen','banScreen','mainApp'].forEach(id=>$(id).classList.add('hidden'));
}
function showLoading(){
  hideAllScreens();
  $('loadingScreen').classList.remove('hidden');
}
function showDeviceBanScreen(devBan){
  hideAllScreens();
  $('banScreen').classList.remove('hidden');
  const reason = (devBan && devBan.reason) ? String(devBan.reason) : 'No reason';
  const isAntiCheat = /anti-cheat|anticheat|suspicious win/i.test(reason);
  $('banTypeText').textContent = isAntiCheat ? 'Device ban (Anti-Cheat)' : 'Device ban';
  $('banReasonText').textContent = reason;
  $('banUntilText').textContent = devBan.banned_until ? fmtDate(devBan.banned_until) : 'Permanent';
}
function showUserBanScreen(user){
  hideAllScreens();
  $('banScreen').classList.remove('hidden');
  $('banTypeText').textContent = user.ban_type === 'device' ? 'Device ban' : 'Account ban';
  $('banReasonText').textContent = user.ban_reason || 'No reason';
  $('banUntilText').textContent = user.ban_until ? fmtDate(user.ban_until) : 'Permanent';
}
function inlineLoadingHtml(text){
  return `<div class="inline-loading">${text||'Loading'}<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>`;
}

/* ---- Auto-expire bans (Tehran/server now) ---- */
async function expireExpiredBans(){
  if(!sb) return;
  try{
    try{
      const r = await Promise.race([
        sb.rpc('expire_expired_bans'),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('rpc_timeout')), 2500))
      ]);
      if(r && !r.error) return;
    }catch(e){}
    const nowIso = new Date().toISOString();
    // Only touch current user + current device (safe, fast)
    if(CURRENT_USER && CURRENT_USER.id){
      try{
        if(CURRENT_USER.banned && CURRENT_USER.ban_until && new Date(CURRENT_USER.ban_until) <= new Date()){
          await sb.from('users').update({
            banned:false, ban_type:null, ban_reason:null, ban_until:null, banned_at:null
          }).eq('id', CURRENT_USER.id);
          CURRENT_USER.banned = false;
        }
      }catch(e){}
    }
    if(DEVICE_ID){
      try{
        await sb.from('banned_devices').delete().eq('device_id', DEVICE_ID).lte('banned_until', nowIso);
      }catch(e){}
    }
  }catch(e){ console.warn('expire bans', e); }
}

async function getActiveDeviceBan(){
  if(!sb || !DEVICE_ID) return null;
  const { data: devBan } = await sb.from('banned_devices').select('*').eq('device_id', DEVICE_ID).maybeSingle();
  if(!devBan) return null;
  if(devBan.banned_until && new Date(devBan.banned_until) <= new Date()){
    try{ await sb.from('banned_devices').delete().eq('device_id', DEVICE_ID); }catch(e){}
    // also clear user device-ban if linked
    try{
      if(CURRENT_USER && CURRENT_USER.banned && CURRENT_USER.ban_type === 'device'){
        await sb.from('users').update({
          banned:false, ban_type:null, ban_reason:null, ban_until:null, banned_at:null
        }).eq('id', CURRENT_USER.id);
      }
    }catch(e){}
    return null;
  }
  return devBan;
}

/* ---------- AUTH ---------- */
let authMode = 'login';
function showAuth(mode){
  hideAllScreens();
  authMode = mode;
  $('authScreen').classList.remove('hidden');
  $('authError').classList.add('hidden');
  $('authSubmitBtn').textContent = mode === 'login' ? 'Log In' : 'Sign Up';
  $('authSwitchLine').innerHTML = mode === 'login'
    ? `Don't have an account? <a id="authSwitchLink">Sign up</a>`
    : `Already have an account? <a id="authSwitchLink">Log in</a>`;
  $('authSwitchLink').onclick = ()=> showAuth(mode === 'login' ? 'signup' : 'login');
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

$('authSubmitBtn').onclick = async ()=>{
  const username = $('authUsername').value.trim();
  const password = $('authPassword').value;
  const errBox = $('authError');
  errBox.classList.add('hidden');
  const uErr = validateUsername(username); if(uErr){ errBox.textContent=uErr; errBox.classList.remove('hidden'); return; }
  const pErr = validatePassword(password); if(pErr){ errBox.textContent=pErr; errBox.classList.remove('hidden'); return; }
  $('authSubmitBtn').disabled = true;
  try{
    if(!DEVICE_ID) await initDevice();
    const devBan = await getActiveDeviceBan();
    if(devBan){ showDeviceBanScreen(devBan); return; }
    const hash = await sha256(password);
    const lower = username.toLowerCase();
    if(authMode === 'signup'){
      // Case-insensitive duplicate check
      let exists = null;
      try{
        const r1 = await sb.from('users').select('id,username').eq('username_lower', lower).maybeSingle();
        exists = r1.data;
      }catch(e){}
      if(!exists){
        const r2 = await sb.from('users').select('id,username').ilike('username', username).limit(1);
        if(r2.data && r2.data.length) exists = r2.data[0];
      }
      if(exists) throw new Error('This username is already taken');
      const { data: newUser, error } = await sb.from('users').insert({
        username, password_hash: hash, device_id: DEVICE_ID
      }).select().single();
      if(error){
        if(error.code === '23505') throw new Error('This username is already taken');
        throw error;
      }
      localStorage.setItem('gz_user_id', newUser.id);
      await enterSession(newUser);
    } else {
      // Login: match username ignoring case
      let user = null;
      const r1 = await sb.from('users').select('*').eq('username_lower', lower).maybeSingle();
      user = r1.data;
      if(!user){
        const r2 = await sb.from('users').select('*').ilike('username', username).limit(1);
        if(r2.data && r2.data.length) user = r2.data[0];
      }
      if(!user || user.password_hash !== hash) throw new Error('Incorrect username or password');
      localStorage.setItem('gz_user_id', user.id);
      await enterSession(user);
    }
  }catch(e){
    errBox.textContent = e.message || 'Error';
    errBox.classList.remove('hidden');
  }finally{
    $('authSubmitBtn').disabled = false;
  }
};
$('banLogoutBtn').onclick = ()=>{ localStorage.removeItem('gz_user_id'); gzGoLogin(); };

/* ---------- SESSION ---------- */
async function enterSession(user, opts){
  try{ setDbWarning(false); }catch(e){}

  opts = opts || {};
  if(!DEVICE_ID){
    try{ await withTimeout(initDevice(), 1200); }catch(e){
      try{ DEVICE_ID = localStorage.getItem('gz_device_id') || ('tmp_'+Date.now()); }catch(e2){ DEVICE_ID = 'tmp_'+Date.now(); }
    }
  }

  // Post-CAPTCHA: hard bot only → delete account + 80m banned_devices
  // Local-only stale bans are cleared by reconcile (table is authority)
  try{
    const hard = detectHardBotSignals();
    if(hard.length){
      CURRENT_USER = user;
      await enforceBotServerPunishment(hard.join(','));
      return;
    }
    const reconciled = await withTimeout(reconcileBotBanWithServer(), 3000);
    if(reconciled && reconciled.banned_until && new Date(reconciled.banned_until) > new Date()){
      const reason = String(reconciled.reason || '');
      if(/anti-cheat|anticheat|suspicious win/i.test(reason)){
        showDeviceBanScreen(reconciled);
      } else {
        showFullBotBanOverlay(reason, new Date(reconciled.banned_until).getTime());
      }
      return;
    }
  }catch(e){ console.warn('bot enforce session', e); }

  // Quick ban checks (never hang)
  try{
    if(user.banned && user.ban_until && new Date(user.ban_until) <= new Date()){
      user = { ...user, banned:false, ban_type:null, ban_reason:null, ban_until:null, banned_at:null };
      try{
        await withTimeout(
          sb.from('users').update({
            banned:false, ban_type:null, ban_reason:null, ban_until:null, banned_at:null
          }).eq('id', user.id),
          2000
        );
      }catch(e){}
    }
  }catch(e){}
  try{
    const devBanNow = await withTimeout(getActiveDeviceBan(), 2000);
    if(devBanNow){ showDeviceBanScreen(devBanNow); return; }
  }catch(e){}
  if(user.banned){ showUserBanScreen(user); return; }
  // Register/un-revoke THIS device first (so login is never bounced by stale revoked row)
  try{ await withTimeout(registerCurrentDevice(user.id), 2500); }catch(e){}

  try{
    if(opts.fromSaved){
      const kicked = await withTimeout(checkDeviceRevoked(user.id), 2000);
      if(kicked) return;
    }
  }catch(e){}

  CURRENT_USER = user;

  // Show app UI immediately — never keep user on Loading
  hideAllScreens();
  try{ $('mainApp').classList.remove('hidden'); }catch(e){}
  try{ $('topbarUser').textContent = '@' + user.username; }catch(e){}
  try{ $('navAdmin').classList.toggle('hidden', !(user.is_owner || user.is_admin)); }catch(e){}
  try{ refreshGameUI(); }catch(e){}
  try{ startNewRound(); }catch(e){}
  try{ goPage('game'); }catch(e){}

  // Background session tasks (do not block first paint)
  (async ()=>{
    try{ await expireExpiredBans(); }catch(e){}
    try{
      await Promise.race([
        (async()=>{
          try{ await sb.from('users').update({ last_online: new Date().toISOString(), device_id: DEVICE_ID }).eq('id', user.id); }catch(e){}
          try{ await registerCurrentDevice(user.id); }catch(e){} // refresh last_seen
          try{ await ensureWeeklyReset(); }catch(e){}
          try{
            const { data: freshU } = await sb.from('users').select('*').eq('id', user.id).maybeSingle();
            if(freshU){ CURRENT_USER = freshU; try{ refreshGameUI(); }catch(e){} }
          }catch(e){}
        })(),
        new Promise(r=>setTimeout(r, 5000))
      ]);
    }catch(e){}
    try{ await loadMyClan(true); }catch(e){}
    try{ refreshNameDisplays(); }catch(e){}
    try{ refreshGameUI(); }catch(e){}
    try{ ensureUserRealtime(); }catch(e){}
    try{ ensureChatRealtime(); }catch(e){}
    try{ ensureChatFallbackPolling(); }catch(e){}
    try{ ensureNotifRealtime(); }catch(e){}
    try{ bindNotifUI(); }catch(e){}
    try{ refreshNotifBadge(); }catch(e){}
    try{ loadUnreadCounts(); }catch(e){}
    try{ refreshClanProfileUI(); }catch(e){}
    try{ refreshSupportBadge(); }catch(e){}
    try{ loadAnnouncement(); }catch(e){}
  })();

  if(!window.__visBound){
    window.__visBound = true;
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'visible' && CURRENT_USER){
        try{ syncCurrentUserFromServer(); }catch(e){}
        try{ ensureChatRealtime(); }catch(e){}
        try{ ensureChatFallbackPolling(); }catch(e){}
        try{ loadUnreadCounts(); }catch(e){}
      }
    });
  }
  if(window.__onlineTimer) clearInterval(window.__onlineTimer);
  window.__onlineTimer = setInterval(async ()=>{
    if(!CURRENT_USER) return;
    try{ await sb.from('users').update({ last_online: new Date().toISOString() }).eq('id', CURRENT_USER.id); }catch(e){}
    try{ await expireExpiredBans(); }catch(e){}
    try{ if(sb) await sb.rpc('cleanup_stale_duels', { p_pending_minutes: 30, p_active_minutes: 25 }); }catch(e){}
    try{ await syncCurrentUserFromServer(); }catch(e){}
  }, 15000);
  try{ expireExpiredBans(); }catch(e){}
}

function dedupeDevicesById(rows){
  if(!rows || !rows.length) return [];
  const map = new Map();
  for(const d of rows){
    const key = d.device_id || d.id;
    if(!key) continue;
    const prev = map.get(key);
    if(!prev){ map.set(key, d); continue; }
    // keep newest last_seen
    const t1 = new Date(prev.last_seen||0).getTime();
    const t2 = new Date(d.last_seen||0).getTime();
    if(t2 >= t1) map.set(key, d);
  }
  return Array.from(map.values()).sort((a,b)=> new Date(b.last_seen||0)-new Date(a.last_seen||0));
}

async function cleanupDuplicateDevices(userId){
  if(!sb || !userId) return;
  try{
    const { data } = await sb.from('devices').select('id,device_id,last_seen').eq('user_id', userId).order('last_seen',{ascending:false}).limit(100);
    if(!data || data.length < 2) return;
    const keep = new Set();
    const del = [];
    for(const d of data){
      const k = d.device_id || d.id;
      if(keep.has(k)) del.push(d.id);
      else keep.add(k);
    }
    if(del.length){
      // delete in chunks
      for(let i=0;i<del.length;i+=20){
        await sb.from('devices').delete().in('id', del.slice(i,i+20));
      }
    }
  }catch(e){ console.warn('dedupe devices', e); }
}

async function registerCurrentDevice(userId){
  if(!DEVICE_ID || !userId || !sb) return;
  const s = (DEVICE_INFO && DEVICE_INFO.signals) || collectDeviceSignals();
  const row = {
    device_id: DEVICE_ID,
    user_id: userId,
    user_agent: s.ua || null,
    platform: s.platform || null,
    language: s.language || null,
    screen: s.screen || null,
    timezone: s.timezone || null,
    hardware: 'cores:'+(s.cores||0)+' mem:'+(s.memory||0),
    touch: !!s.touch,
    last_seen: new Date().toISOString(),
    revoked: false,
    revoked_at: null
  };
  try{
    const { data: rows } = await sb.from('devices').select('id,first_seen').eq('device_id', DEVICE_ID).eq('user_id', userId).order('first_seen',{ascending:true});
    if(rows && rows.length){
      const keepId = rows[0].id;
      await sb.from('devices').update(row).eq('id', keepId);
      const extras = rows.slice(1).map(r=>r.id);
      if(extras.length) await sb.from('devices').delete().in('id', extras);
    } else {
      await sb.from('devices').insert({ ...row, first_seen: new Date().toISOString() });
    }
    // remove only revoked OTHER devices' clutter later; keep current active
    try{ await cleanupDuplicateDevices(userId); }catch(e){}
  }catch(e){ console.warn('device register', e); }
}

/** If this device was kicked from the account while a saved session exists, force logout */
async function checkDeviceRevoked(userId){
  if(!DEVICE_ID || !userId || !sb) return false;
  try{
    const { data: rows, error } = await sb.from('devices').select('id,revoked').eq('device_id', DEVICE_ID).eq('user_id', userId);
    if(error) return false; // network/RLS error → do not force logout
    if(!rows || !rows.length) return false; // no row yet — register will create
    if(rows.some(r => !r.revoked)) return false;
    // all revoked → kicked
    localStorage.removeItem('gz_user_id');
    CURRENT_USER = null;
    toast('This device was removed from the account');
    gzGoLogin();
    return true;
  }catch(e){ return false; }
}

/** First device that joined this account (oldest first_seen) owns kick rights */
async function getOwnerDeviceId(userId){
  if(!sb || !userId) return null;
  try{
    const { data } = await sb.from('devices').select('device_id,first_seen,last_seen')
      .eq('user_id', userId).eq('revoked', false)
      .order('first_seen', { ascending: true, nullsFirst: false })
      .limit(50);
    if(!data || !data.length) return DEVICE_ID;
    // prefer rows with first_seen; else oldest last_seen
    const sorted = [...data].sort((a,b)=>{
      const fa = a.first_seen ? new Date(a.first_seen).getTime() : Number.MAX_SAFE_INTEGER;
      const fb = b.first_seen ? new Date(b.first_seen).getTime() : Number.MAX_SAFE_INTEGER;
      if(fa !== fb) return fa - fb;
      return new Date(a.last_seen||0).getTime() - new Date(b.last_seen||0).getTime();
    });
    return sorted[0].device_id || DEVICE_ID;
  }catch(e){ return DEVICE_ID; }
}
async function isOwnerDevice(userId){
  const owner = await getOwnerDeviceId(userId || (CURRENT_USER && CURRENT_USER.id));
  return !!(owner && DEVICE_ID && owner === DEVICE_ID);
}

async function loadAccountDevices(){
  const box = $('accountDevicesList');
  if(!box || !CURRENT_USER) return;
  box.innerHTML = inlineLoadingHtml('Loading devices');
  const { data, error } = await sb.from('devices').select('*').eq('user_id', CURRENT_USER.id).eq('revoked', false).order('last_seen',{ascending:false}).limit(40);
  if(error || !data){ box.innerHTML = '<div class="empty-note">Could not load devices</div>'; return; }
  const list = dedupeDevicesById(data);
  try{ cleanupDuplicateDevices(CURRENT_USER.id); }catch(e){}
  if(!list.length){ box.innerHTML = '<div class="empty-note">No devices recorded yet</div>'; return; }
  let canKick = false;
  try{ canKick = await isOwnerDevice(CURRENT_USER.id); }catch(e){ canKick = false; }
  const kickAllBtn = $('kickAllDevicesBtn');
  if(kickAllBtn) kickAllBtn.classList.toggle('hidden', !canKick);
  box.innerHTML = list.map(d=>{
    const isThis = d.device_id === DEVICE_ID;
    const kicked = !!d.revoked;
    const title = escapeHtml(d.label || d.platform || 'Device');
    const meta = [
      escapeHtml(d.screen||''),
      escapeHtml(d.timezone||''),
      d.touch ? 'Touch' : 'Desktop',
      isThis ? 'This device' : ''
    ].filter(Boolean).join(' · ');
    const ua = escapeHtml((d.user_agent||'').slice(0,90));
    let actions = '';
    if(isThis){
      actions = '<span style="color:var(--green);font-weight:700;font-size:11px;">Current'+(canKick?' · Owner':'')+'</span>';
    } else if(kicked){
      actions = '<span style="color:var(--text-dim);font-size:11px;">Kicked</span>';
    } else if(canKick){
      actions = `<button type="button" class="btn btn-ghost" style="width:auto;padding:6px 10px;font-size:11px;border-radius:8px;" data-kick="${escapeHtml(d.id)}">Kick out</button>`;
    } else {
      actions = '<span style="color:var(--text-dim);font-size:11px;">—</span>';
    }
    return `<div class="device-row" style="padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:700;font-size:13px;color:var(--text);">${title} ${kicked?'<span style="color:var(--red);font-size:10px;">REVOKED</span>':''}</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${meta}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">Last seen: ${fmtDate(d.last_seen)}</div>
          <div style="font-size:9px;opacity:.55;margin-top:2px;word-break:break-all;">${ua}</div>
          <div style="font-size:9px;opacity:.4;word-break:break-all;">id: ${escapeHtml((d.device_id||'').slice(0,20))}…</div>
        </div>
        <div style="flex-shrink:0;">${actions}</div>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-kick]').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.getAttribute('data-kick');
      if(!(await isOwnerDevice(CURRENT_USER.id))){ toast('Only the account owner device can kick others'); return; }
      if(!(await askConfirm('Kick device', 'Remove this device from your account? It will be logged out on next open.'))) return;
      const { error } = await sb.from('devices').update({
        revoked: true,
        revoked_at: new Date().toISOString(),
        user_agent: null,
        platform: null,
        language: null,
        screen: null,
        timezone: null,
        hardware: null,
        label: null
      }).eq('id', id).eq('user_id', CURRENT_USER.id);
      if(error){ toast(error.message||'Failed'); return; }
      await writeAudit('kick_device', { target_user_id: CURRENT_USER.id, target_username: CURRENT_USER.username, details: { device_row: id } });
      toast('Device kicked out');
      loadAccountDevices();
  // recent game rounds
  (async ()=>{
    const box = $('profRecentRounds');
    if(!box) return;
    box.innerHTML = 'Loading…';
    try{
      const { data } = await sb.from('game_rounds').select('*').eq('user_id', CURRENT_USER.id).order('created_at',{ascending:false}).limit(8);
      if(!data || !data.length){ box.innerHTML = '<div class="empty-note" style="padding:12px;">No rounds logged yet</div>'; return; }
      box.innerHTML = data.map(r=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span><b>${escapeHtml(r.mode||'')}</b> · ${r.guesses} guesses</span>
        <span style="color:var(--text-dim);">+${r.xp_gained||0} XP · ${fmtDate(r.created_at)}</span>
      </div>`).join('');
    }catch(e){ box.innerHTML = '<div class="empty-note" style="padding:12px;">History unavailable</div>'; }
  })();

    };
  });
}

async function kickAllOtherDevices(){
  if(!CURRENT_USER) return;
  if(!(await isOwnerDevice(CURRENT_USER.id))){ toast('Only the account owner device can kick others'); return; }
  if(!(await askConfirm('Kick all others', 'Log out every other device on this account?'))) return;
  const { error } = await sb.from('devices').update({
    revoked: true,
    revoked_at: new Date().toISOString(),
    user_agent: null,
    platform: null,
    language: null,
    screen: null,
    timezone: null,
    hardware: null,
    label: null
  }).eq('user_id', CURRENT_USER.id).neq('device_id', DEVICE_ID).eq('revoked', false);
  if(error){ toast(error.message||'Failed'); return; }
  toast('Other devices kicked');
  await writeAudit('kick_all_devices', { target_user_id: CURRENT_USER.id, target_username: CURRENT_USER.username });
  loadAccountDevices();
}

/* ---------- NAV ---------- */
function goPage(page){
  ['Game','Leaderboard','Clans','Profile','Chat','Admin'].forEach(p=>{
    const sec = $('page'+p);
    const nav = $('nav'+p);
    if(sec) sec.classList.toggle('hidden', p.toLowerCase() !== page);
    if(nav) nav.classList.toggle('active', p.toLowerCase() === page);
  });
  if(page === 'leaderboard') loadLeaderboard();
  if(page === 'clans') loadClansPage();
  if(page === 'profile') refreshProfileUI();
  if(page === 'chat'){
    loadChatUsers();
    setChatMainTab(chatMainTab || 'dms');
  }
  if(page === 'admin') loadAdminDash();
}
$('navGame').onclick = ()=> goPage('game');
$('navLeaderboard').onclick = ()=> goPage('leaderboard');
$('navClans').onclick = ()=> goPage('clans');
$('navProfile').onclick = ()=> goPage('profile');
$('navChat').onclick = ()=> goPage('chat');
$('navAdmin').onclick = ()=> goPage('admin');

/* ---------- GAME ---------- */
function buildKeypad(){
  const wrap = $('keypad'); wrap.innerHTML = '';
  const layout = ['1','2','3','4','5','6','7','8','9','Clear','0','Set'];
  layout.forEach(k=>{
    const b = document.createElement('button');
    b.textContent = k;
    if(k==='Clear') b.classList.add('key-clear');
    if(k==='Set') b.classList.add('key-set');
    b.onclick = ()=>{
      if(k==='Clear'){ typedDigits=''; renderTypedDigits(); }
      else if(k==='Set'){ submitGuess(); }
      else if(typedDigits.length < 8){ typedDigits += k; renderTypedDigits(); }
    };
    wrap.appendChild(b);
  });
}
function renderTypedDigits(){
  const disp = $('guessDisplay');
  if(!typedDigits){
    disp.textContent = 'Enter the number using the buttons below';
    disp.classList.add('empty');
    disp.classList.remove('win-flash');
  } else {
    disp.textContent = Number(typedDigits).toLocaleString('en-US');
    disp.classList.remove('empty');
  }
}
function startNewRound(){
  const mode = GAME_MODES[gameMode] || GAME_MODES.normal;
  currentTarget = mode.min + Math.floor(Math.random() * (mode.max - mode.min + 1));
  currentGuessCount = 0;
  typedDigits = '';
  guessHistory = [];
  roundStartTime = Date.now();
  renderTypedDigits();
  renderGuessHistory();
  $('statThisGuesses').textContent = '0';
  const rl = $('resultLabel');
  rl.className = 'result-label';
  rl.textContent = '';
  const rh = $('rangeHint');
  if(rh) rh.textContent = mode.label + ' · up to ' + mode.xpBase + ' XP';
  updateStreakPill();
}
function renderGuessHistory(){
  const box = $('guessHistory');
  if(!box) return;
  if(!guessHistory.length){ box.innerHTML = ''; return; }
  box.innerHTML = guessHistory.map(h =>
    `<div class="gh-row"><b>${Number(h.guess).toLocaleString('en-US')}</b><span>${escapeHtml(h.result)}</span></div>`
  ).join('');
  box.scrollTop = box.scrollHeight;
}
function updateStreakPill(){
  const pill = $('streakPill');
  const val = CURRENT_USER ? (CURRENT_USER.current_streak||0) : 0;
  if(val > 0){
    pill.style.display = 'inline-flex';
    $('streakVal').textContent = val;
  } else {
    pill.style.display = 'none';
  }
}
function initModeTabs(){
  const wrap = $('modeTabs');
  if(!wrap) return;
  wrap.querySelectorAll('button').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.mode === gameMode);
    btn.onclick = async ()=>{
      const next = btn.dataset.mode;
      if(next === gameMode) return;
      if(currentGuessCount > 0 || guessHistory.length > 0){
        const ok = await askConfirm('Change mode', 'Changing mode starts a new round. Continue?');
        if(!ok) return;
      }
      gameMode = next;
      localStorage.setItem('gz_game_mode', gameMode);
      wrap.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.mode===gameMode));
      startNewRound();
      const m = GAME_MODES[gameMode];
      toast(gameMode.charAt(0).toUpperCase()+gameMode.slice(1)+' · XP up to '+m.xpBase);
    };
  });
}

async function submitGuess(){
  if(window._duelUiLocked) return;
  if(window.__guessBusy) return;
  if(!typedDigits){ toast('Enter a number'); return; }
  const mode = GAME_MODES[gameMode] || GAME_MODES.normal;
  const guess = Number(typedDigits);
  if(!Number.isFinite(guess) || guess < mode.min || guess > mode.max){
    toast('Number must be between '+mode.min.toLocaleString()+' and '+mode.max.toLocaleString());
    return;
  }
  const target = (typeof isDuelPlaying === 'function' && isDuelPlaying() && ACTIVE_DUEL)
    ? Number(ACTIVE_DUEL.target) : currentTarget;
  currentGuessCount++;
  if($('statThisGuesses')) $('statThisGuesses').textContent = currentGuessCount;
  const rl = $('resultLabel');
  if(rl) rl.classList.add('show');

  if(guess === target){
    if(rl){ rl.className = 'result-label show win'; rl.textContent = 'You Win! '+target.toLocaleString('en-US'); }
    if($('guessDisplay')) $('guessDisplay').classList.add('win-flash');
    guessHistory.push({guess, result:'Win'});
    renderGuessHistory();
    typedDigits = '';
    renderTypedDigits();
    if(typeof isDuelPlaying === 'function' && isDuelPlaying()){
      await claimDuelWinIfNeeded(currentGuessCount);
      return;
    }
    window.__guessBusy = true;
    try{ await registerWin(currentGuessCount, gameMode); }
    finally{ setTimeout(()=>{ startNewRound(); window.__guessBusy = false; }, 1700); }
  } else if(guess < target){
    if(rl){ rl.className = 'result-label show higher'; rl.textContent = '↑ Higher'; }
    guessHistory.push({guess, result:'↑ Higher'});
    renderGuessHistory();
    typedDigits = '';
    renderTypedDigits();
  } else {
    if(rl){ rl.className = 'result-label show lower'; rl.textContent = '↓ Lower'; }
    guessHistory.push({guess, result:'↓ Lower'});
    renderGuessHistory();
    typedDigits = '';
    renderTypedDigits();
  }
}

/* ========== ANTI-CHEAT SYSTEM v1.0 — fair, strict, English ========== */
const ANTI_CHEAT_BAN_MS = 24 * 60 * 60 * 1000; // 24 hours
const ANTI_CHEAT_REASON = 'Anti-cheat: suspicious win pattern detected';

/**
 * Detect unrealistic wins (too fast / too many in short window).
 * Returns { flagged: boolean, reason: string, details: object } or null if clean.
 */
function detectAntiCheat(guesses, modeKey){
  const now = Date.now();
  const elapsed = roundStartTime ? (now - roundStartTime) : 0;
  const g = Math.max(1, Number(guesses) || 1);
  const mode = modeKey || gameMode || 'normal';
  const details = {
    guesses: g,
    elapsed_ms: elapsed,
    mode: mode,
    target: currentTarget,
    timestamp: new Date().toISOString()
  };

  // 1) Impossible human speed: any win under 1.2s
  if(elapsed > 0 && elapsed < 1200){
    return { flagged: true, reason: 'win_too_fast_absolute', details: Object.assign({}, details, { threshold_ms: 1200 }) };
  }

  // 2) Very few guesses + very short time (scripted binary search / auto-clicker)
  if(g <= 2 && elapsed > 0 && elapsed < 2500){
    return { flagged: true, reason: 'win_too_fast_low_guesses', details: Object.assign({}, details, { threshold_ms: 2500, max_guesses: 2 }) };
  }
  if(g <= 4 && elapsed > 0 && elapsed < 4000){
    return { flagged: true, reason: 'win_too_fast_few_guesses', details: Object.assign({}, details, { threshold_ms: 4000, max_guesses: 4 }) };
  }
  if(g <= 6 && elapsed > 0 && elapsed < 5500){
    return { flagged: true, reason: 'win_too_fast_moderate', details: Object.assign({}, details, { threshold_ms: 5500, max_guesses: 6 }) };
  }

  // 3) Average time per guess unrealistically low (auto-submit)
  const avgPerGuess = elapsed / g;
  if(g >= 3 && avgPerGuess < 400){
    return { flagged: true, reason: 'avg_time_per_guess_too_low', details: Object.assign({}, details, { avg_ms: Math.round(avgPerGuess), threshold_ms: 400 }) };
  }

  // 4) Burst wins: more than 4 wins in the last 45 seconds
  recentWinTimestamps = (recentWinTimestamps || []).filter(t => now - t < 45000);
  recentWinTimestamps.push(now);
  if(recentWinTimestamps.length > 4){
    return { flagged: true, reason: 'win_burst_rate', details: Object.assign({}, details, { wins_in_window: recentWinTimestamps.length, window_ms: 45000 }) };
  }

  // 5) Extreme mode with near-perfect speed (harder range, still too fast)
  if(mode === 'extreme' && g <= 8 && elapsed > 0 && elapsed < 8000){
    return { flagged: true, reason: 'extreme_mode_too_fast', details: Object.assign({}, details, { threshold_ms: 8000 }) };
  }

  return null; // clean
}

/**
 * Apply 24h device ban + admin audit log. Does not award the win.
 * IMPORTANT: uses its own localStorage keys — never gz_bot_ban_* (those trigger bot enforcement / account delete).
 */
async function applyAntiCheatBan(flag){
  if(!flag || !flag.flagged) return;
  const untilMs = Date.now() + ANTI_CHEAT_BAN_MS;
  const untilIso = new Date(untilMs).toISOString();
  let did = null;
  try{ did = DEVICE_ID || localStorage.getItem('gz_device_id') || null; }catch(e){ did = DEVICE_ID || null; }
  const uid = CURRENT_USER ? CURRENT_USER.id : null;
  const uname = CURRENT_USER ? CURRENT_USER.username : null;
  const reasonFull = ANTI_CHEAT_REASON + ' (' + (flag.reason || 'suspicious') + ')';

  // Local anti-cheat lock only (NOT bot keys — bot path deletes accounts)
  try{
    localStorage.setItem('gz_anticheat_ban_until', String(untilMs));
    localStorage.setItem('gz_anticheat_ban_reason', reasonFull);
    localStorage.removeItem('gz_user_id');
    // Clear any accidental bot-ban keys so boot never treats this as a bot
    localStorage.removeItem('gz_bot_ban_until');
    localStorage.removeItem('gz_bot_ban_reason');
  }catch(e){}

  if(sb){
    if(did){
      try{
        await sb.from('banned_devices').upsert({
          device_id: did,
          reason: reasonFull,
          banned_until: untilIso,
          banned_at: new Date().toISOString(),
          banned_by: null,
          note: 'Automatic anti-cheat enforcement. Details: ' + JSON.stringify(flag.details || {})
        });
      }catch(e){ console.warn('anti-cheat device ban', e); }
    }
    if(uid){
      try{
        await sb.from('users').update({
          banned: true,
          ban_type: 'device',
          ban_reason: reasonFull,
          ban_until: untilIso,
          banned_at: new Date().toISOString()
        }).eq('id', uid);
      }catch(e){ console.warn('anti-cheat user ban', e); }
    }
    try{
      await sb.from('audit_log').insert({
        actor_id: null,
        actor_username: 'SYSTEM',
        action: 'anti_cheat',
        target_user_id: uid || null,
        target_username: uname,
        target_device_id: did,
        details: {
          source: 'client_anti_cheat_v1',
          reason: flag.reason || 'suspicious_win',
          banned_until: untilIso,
          ban_duration_hours: 24,
          note: 'Device banned for 24 hours due to anti-cheat detection',
          detection: flag.details || {}
        }
      });
    }catch(e){ console.warn('anti-cheat audit', e); }
  }

  CURRENT_USER = null;
  try{
    hideAllScreens();
    if($('banScreen')){
      $('banScreen').classList.remove('hidden');
      if($('banTypeText')) $('banTypeText').textContent = 'Device ban (Anti-Cheat)';
      if($('banReasonText')) $('banReasonText').textContent = reasonFull;
      if($('banUntilText')) $('banUntilText').textContent = fmtDate(untilIso) + ' (24 hours)';
    } else {
      document.documentElement.style.pointerEvents = 'none';
      document.documentElement.innerHTML = '<body style="margin:0;background:#0a0505;color:#f5e6d0;font-family:Tahoma,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px"><div style="max-width:440px"><div style="font-size:56px;margin-bottom:12px">🛡️</div><div style="font-size:20px;font-weight:900;line-height:1.5;color:#ff6b6b;margin-bottom:14px">Anti-Cheat: Device Banned</div><div style="font-size:14px;color:#c9a227;margin-bottom:8px">Your device has been temporarily banned for 24 hours.</div><div style="font-size:13px;color:#9a8b72;line-height:1.65">Suspicious win pattern was detected (too fast or unnatural rate). Fair play is required.<br><br>Ban ends: '+escapeHtml(fmtDate(untilIso))+'<br>Reason code: '+escapeHtml(String(flag.reason||'suspicious'))+'</div></div></body>';
    }
  }catch(e){}
  try{ toast('Anti-cheat: device banned for 24 hours'); }catch(e){}
}

async function registerWin(guesses, modeKey){
  const u = CURRENT_USER;
  if(!u) return;

  // --- Anti-cheat gate: never award the win if flagged ---
  try{
    const flag = detectAntiCheat(guesses, modeKey);
    if(flag && flag.flagged){
      await applyAntiCheatBan(flag);
      return; // stop — no XP, no stats, no clan XP
    }
  }catch(e){ console.warn('anti-cheat check', e); }

  const mode = GAME_MODES[modeKey || gameMode] || GAME_MODES.normal;
  const xpGained = Math.max(mode.xpBase - (guesses - 1) * mode.xpStep, mode.xpMin);

  let level = Number(u.level)||1;
  let level_xp = Number(u.level_xp)||0;
  let level_xp_needed = Number(u.level_xp_needed)||50;
  level_xp += xpGained;
  while(level_xp >= level_xp_needed){
    level_xp -= level_xp_needed;
    level += 1;
    level_xp_needed += 25;
  }

  const newStreak = (Number(u.current_streak)||0) + 1;
  const bestStreak = Math.max(Number(u.best_streak)||0, newStreak);

  // mode_stats
  let modeStats = u.mode_stats || {};
  if(typeof modeStats === 'string'){ try{ modeStats = JSON.parse(modeStats); }catch(e){ modeStats = {}; } }
  const mk = modeKey || gameMode;
  if(!modeStats[mk]) modeStats[mk] = { wins:0, guesses:0 };
  modeStats[mk].wins = (modeStats[mk].wins||0) + 1;
  modeStats[mk].guesses = (modeStats[mk].guesses||0) + guesses;

  // achievements
  let ach = Array.isArray(u.achievements) ? [...u.achievements] : [];
  const tmpUser = { ...u, total_wins:(u.total_wins||0)+1, level, best_streak:bestStreak, crowns:u.crowns||0 };
  ACHIEVEMENTS.forEach(a=>{
    if(!ach.includes(a.id) && a.check(tmpUser)) ach.push(a.id);
  });

  const updates = {
    xp: (Number(u.xp)||0) + xpGained,
    level, level_xp, level_xp_needed,
    total_wins: (Number(u.total_wins)||0) + 1,
    total_guesses: (Number(u.total_guesses)||0) + guesses,
    weekly_wins: (Number(u.weekly_wins)||0) + 1,
    weekly_guesses: (Number(u.weekly_guesses)||0) + guesses,
    current_streak: newStreak,
    best_streak: bestStreak,
    mode_stats: modeStats,
    achievements: ach,
    last_win: new Date().toISOString()
  };

  const { data: updated, error } = await sb.from('users').update(updates).eq('id', u.id).select().single();
  if(!error && updated){
    CURRENT_USER = updated;
    refreshGameUI();
    toast('+'+xpGained+' XP · Streak '+newStreak+' 🔥');
  }

  // optional game_rounds log
  try{
    await sb.from('game_rounds').insert({
      user_id: u.id, mode: mk, target: currentTarget, guesses, won: true, xp_gained: xpGained
    });
  }catch(e){}

  // Clan XP + weekly points (lifetime level/xp kept; weekly reset only clears weekly_points)
  try{
    await loadMyClan(false);
    if(MY_CLAN && MY_CLAN.clan && MY_CLAN.clan.id){
      const clanXp = Math.max(1, Math.floor(xpGained)); // full user XP goes to clan
      const { data: cRes } = await sb.rpc('add_clan_xp', {
        p_clan_id: MY_CLAN.clan.id,
        p_xp: clanXp,
        p_win: true
      });
      if(cRes && (cRes.ok || cRes['ok'])){
        // refresh local clan cache
        await loadMyClan(true);
      }
    }
  }catch(e){ console.warn('clan xp', e); }

  // Advance daily/weekly quests (safe if tables missing)
  try{ await bumpQuestProgressOnWin(guesses, newStreak); }catch(e){}
}


async function applyXpToCurrentUser(xpGained, crownsAdd){
  if(!CURRENT_USER || !sb) return null;
  xpGained = Math.max(0, Math.floor(Number(xpGained)||0));
  crownsAdd = Math.max(0, Math.floor(Number(crownsAdd)||0));
  if(xpGained <= 0 && crownsAdd <= 0) return CURRENT_USER;

  // Prefer fresh DB values so level bar stays correct
  let base = CURRENT_USER;
  try{
    const { data: fresh } = await sb.from('users')
      .select('id,xp,level,level_xp,level_xp_needed,crowns')
      .eq('id', CURRENT_USER.id).maybeSingle();
    if(fresh) base = Object.assign({}, CURRENT_USER, fresh);
  }catch(e){}

  let level = Number(base.level)||1;
  let level_xp = Number(base.level_xp)||0;
  let level_xp_needed = Number(base.level_xp_needed)||50;
  if(level_xp_needed < 1) level_xp_needed = 50;
  let xp = (Number(base.xp)||0) + xpGained;
  level_xp += xpGained;
  while(level_xp >= level_xp_needed){
    level_xp -= level_xp_needed;
    level += 1;
    level_xp_needed += 25;
  }
  const patch = {
    xp: xp,
    level: level,
    level_xp: level_xp,
    level_xp_needed: level_xp_needed
  };
  if(crownsAdd > 0) patch.crowns = (Number(base.crowns)||0) + crownsAdd;

  // Same style as registerWin (known working)
  let data = null, error = null;
  try{
    const res = await sb.from('users').update(patch).eq('id', CURRENT_USER.id).select().single();
    data = res.data; error = res.error;
  }catch(e){ error = e; }

  if(!error && data){
    CURRENT_USER = Object.assign({}, CURRENT_USER, data);
  } else {
    // fallback local + second try without select
    Object.assign(CURRENT_USER, patch);
    try{
      await sb.from('users').update(patch).eq('id', CURRENT_USER.id);
      const { data: again } = await sb.from('users')
        .select('xp,level,level_xp,level_xp_needed,crowns')
        .eq('id', CURRENT_USER.id).maybeSingle();
      if(again) Object.assign(CURRENT_USER, again);
    }catch(e2){ console.warn('applyXp retry', e2); }
  }
  try{ refreshGameUI(); }catch(e){}
  try{ if(typeof refreshProfileUI === 'function') refreshProfileUI(); }catch(e){}
  return CURRENT_USER;
}

/** Grant quest reward once — XP first, then claimed (so XP is never skipped) */
async function grantQuestReward(q, row){
  if(!CURRENT_USER || !sb || !q || !row) return false;
  if(row.claimed) return false;
  const done = row.completed || (Number(row.progress)||0) >= (Number(q.target_value)||1);
  if(!done) return false;
  try{
    // Fresh quest rewards from DB (avoid stale/missing reward_xp)
    let rewardXp = Number(q.reward_xp);
    let rewardCrowns = Number(q.reward_crowns);
    try{
      const { data: q2 } = await sb.from('quests')
        .select('id,code,title,reward_xp,reward_crowns')
        .eq('id', q.id).maybeSingle();
      if(q2){
        if(q2.reward_xp != null) rewardXp = Number(q2.reward_xp);
        if(q2.reward_crowns != null) rewardCrowns = Number(q2.reward_crowns);
        q = Object.assign({}, q, q2);
      }
    }catch(e){}
    rewardXp = Math.max(0, Math.floor(Number(rewardXp)||0));
    rewardCrowns = Math.max(0, Math.floor(Number(rewardCrowns)||0));

    // 1) Give XP to total + level bar
    const beforeXp = Number(CURRENT_USER.xp)||0;
    const beforeLv = Number(CURRENT_USER.level_xp)||0;
    await applyXpToCurrentUser(rewardXp, rewardCrowns);

    // 2) Mark claimed only after XP attempt
    const { data: locked, error } = await sb.from('user_quests').update({
      completed: true,
      claimed: true,
      updated_at: new Date().toISOString()
    }).eq('id', row.id).eq('claimed', false).select('*').maybeSingle();
    if(error){
      // still try claim without claimed filter
      try{
        await sb.from('user_quests').update({
          completed: true, claimed: true, updated_at: new Date().toISOString()
        }).eq('id', row.id);
      }catch(e2){}
    }

    const title = 'Quest reward';
    const body = (q.title || 'Quest') + (rewardXp ? (' · +' + rewardXp + ' XP') : '') + (rewardCrowns ? (' · +' + rewardCrowns + ' crowns') : '');
    try{
      await pushNotification(CURRENT_USER.id, 'quest_reward', title, body, {
        quest_id: q.id, code: q.code, reward_xp: rewardXp, reward_crowns: rewardCrowns,
        xp: CURRENT_USER.xp, level_xp: CURRENT_USER.level_xp, level_xp_needed: CURRENT_USER.level_xp_needed
      });
    }catch(e){}
    try{
      toast('🎯 +' + rewardXp + ' XP · ' + (CURRENT_USER.level_xp||0) + '/' + (CURRENT_USER.level_xp_needed||50));
    }catch(e){}
    try{ refreshNotifBadge(); }catch(e){}
    try{ refreshGameUI(); }catch(e){}
    return true;
  }catch(e){
    console.warn('grantQuestReward', e);
    return false;
  }
}

async function bumpQuestProgressOnWin(guesses, streak){
  if(!CURRENT_USER) return;
  const dailyKey = currentPeriodKey('daily');
  const weeklyKey = currentPeriodKey('weekly');
  const { data: quests } = await sb.from('quests').select('*').eq('active', true);
  if(!quests || !quests.length) return;

  for(const q of quests){
    const pk = q.type === 'weekly' ? weeklyKey : dailyKey;
    let add = 0;
    if(q.code === 'daily_win_3' || q.code === 'weekly_win_15' || q.code === 'daily_play_5') add = 1;
    else if(q.code === 'daily_guess_20') add = guesses;
    else if(q.code === 'daily_streak_2') add = streak >= 3 ? 1 : 0;
    else if(q.code === 'weekly_modes') add = 0;
    else if(q.code === 'weekly_duel_3') add = 0; // awarded from duel win
    else add = 1;

    if(add <= 0) continue;

    const { data: row } = await sb.from('user_quests')
      .select('*').eq('user_id', CURRENT_USER.id).eq('quest_id', q.id).eq('period_key', pk).maybeSingle();

    if(!row){
      const prog = Math.min(q.target_value, add);
      const completed = prog >= q.target_value;
      const { data: ins } = await sb.from('user_quests').insert({
        user_id: CURRENT_USER.id, quest_id: q.id, progress: prog,
        completed, claimed: false, period_key: pk
      }).select('*').maybeSingle();
      if(completed && ins){ try{ await grantQuestReward(q, ins); }catch(e){} }
    } else if(!row.claimed){
      const prog = Math.min(q.target_value, (Number(row.progress)||0) + add);
      const completed = prog >= q.target_value || row.completed;
      const { data: upd } = await sb.from('user_quests').update({
        progress: prog, completed, updated_at: new Date().toISOString()
      }).eq('id', row.id).select('*').maybeSingle();
      if(completed && upd){ try{ await grantQuestReward(q, upd); }catch(e){} }
    }
  }
}

function refreshGameUI(){
  const u = CURRENT_USER; if(!u) return;
  renderAvatar($('gameAvatar'), u);
  attachClanToUser(u);
  if($('gameUname')) $('gameUname').innerHTML = usernameWithTik(u);
  $('gameLevel').textContent = u.level;
  $('gameLevelTitle').innerHTML = levelTitleHtml(u.level);
  $('gameXpText').textContent = `${u.level_xp}/${u.level_xp_needed}`;
  $('gameXpBar').style.width = Math.min(100, (u.level_xp / Math.max(1,u.level_xp_needed))*100) + '%';
  $('statTotalWins').textContent = u.total_wins;
  $('statTotalGuesses').textContent = u.total_guesses;
  $('gameStreak').textContent = u.current_streak || 0;
  updateStreakPill();
}

/* ---------- LEADERBOARD ---------- */
$('tabGlobal').onclick = ()=>{ lbMode='global'; setLbTabs(); loadLeaderboard(); };
$('tabWeekly').onclick = ()=>{ lbMode='weekly'; setLbTabs(); loadLeaderboard(); };
function setLbTabs(){
  $('tabGlobal').classList.toggle('active', lbMode==='global');
  $('tabWeekly').classList.toggle('active', lbMode==='weekly');
  const sp = $('lbSearch');
  if(sp) sp.placeholder = 'Search username...';
}
let lbSearchTimer = null;
$('lbSearch').oninput = ()=>{ clearTimeout(lbSearchTimer); lbSearchTimer = setTimeout(()=> loadLeaderboard(), 280); };

async function loadClansPage(){
  const list = $('clansPageList');
  if(!list) return;
  list.innerHTML = inlineLoadingHtml('Loading clans');
  await loadMyClan(false);
  const search = ($('clansPageSearch') && $('clansPageSearch').value || '').trim();
  let query = sb.from('clans').select('*').order('level',{ascending:false}).order('xp',{ascending:false}).limit(150);
  if(search) query = query.or(`name.ilike.%${search}%,tag.ilike.%${search}%`);
  const { data: clans, error } = await query;
  list.innerHTML = '';
  if(error){
    list.innerHTML = `<div class="empty-note">${escapeHtml(error.message||'Error loading clans')}</div>`;
    return;
  }
  if(!clans || !clans.length){
    list.innerHTML = '<div class="empty-note">No clans yet — create one</div>';
  }

  // My clan card
  const card = $('myClanCard');
  const createBtn = $('clanCreateBtn');
  if(MY_CLAN && MY_CLAN.clan){
    const mc = MY_CLAN.clan;
    const live = (clans||[]).find(c=>c.id===mc.id) || mc;
    const rank = (clans||[]).findIndex(c=>c.id===mc.id);
    if(card){
      card.classList.remove('hidden');
      const tcol = escapeHtml(live.color||'#1d9bf0');
      const ttag = escapeHtml(String(live.tag||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5));
      card.innerHTML = `Your clan · <span style="color:${tcol};font-weight:800;">[${ttag}]</span> <span style="color:${tcol};font-weight:700;">${escapeHtml(live.name)}</span><br>
        Rank <b>#${rank>=0?rank+1:'—'}</b> · Lv <b>${live.level||1}</b> · <b>${(live.xp||0).toLocaleString()}</b> XP · ${live.member_count||0}/${live.max_members||12} · ${live.glory||0} 🏅`;
      card.onclick = ()=> openClanPublicDetail(live);
    }
    if(createBtn){ createBtn.style.display = 'none'; }
  } else {
    if(card) card.classList.add('hidden');
    if(createBtn){
      if(canCreateClan()){
        createBtn.style.display = '';
        createBtn.disabled = false;
        createBtn.textContent = 'Create clan';
      } else {
        createBtn.style.display = 'none';
      }
    }
  }

  (clans||[]).forEach((c, idx)=>{
    const row = document.createElement('div');
    row.className = 'lb-row';
    const rankClass = idx===0?'top1':idx===1?'top2':idx===2?'top3':'';
    const col = escapeHtml(c.color||'#1d9bf0');
    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${idx+1}</div>
      <div class="lb-name">
        <div class="u"><span class="clan-tag" data-clan-id="${escapeHtml(c.id)}" style="color:${col};font-weight:800;cursor:pointer;">[${escapeHtml(String(c.tag||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5))}]</span><span style="color:${col};font-weight:700;">${escapeHtml(c.name)}</span></div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Lv ${c.level||1} · ${(c.xp||0).toLocaleString()} XP · ${c.member_count||0}/${c.max_members||12} members · ${c.glory||0} 🏅</div>
      </div>
      <div class="lb-stats"><b>${c.level||1}</b><br><span style="font-size:10px;color:var(--text-dim)">level</span></div>`;
    row.onclick = ()=> openClanPublicDetail(c);
    list.appendChild(row);
  });
}
let clansSearchTimer = null;

async function loadLeaderboard(){
  const list = $('lbList');
  list.innerHTML = inlineLoadingHtml('Loading leaderboard');
  const search = $('lbSearch').value.trim();

  let query;
  if(lbMode === 'global'){
    query = sb.from('users').select('id,username,avatar_url,xp,level,level_xp,level_xp_needed,total_wins,total_guesses,weekly_wins,weekly_guesses,best_streak,current_streak,crowns,tik,is_admin,is_owner,last_online,banned,ban_type,achievements,display_badges,duel_wins,duel_losses,mode_stats').order('total_wins',{ascending:false}).order('total_guesses',{ascending:true}).limit(100);
  } else if(lbMode === 'weekly'){
    query = sb.from('users').select('id,username,avatar_url,xp,level,level_xp,level_xp_needed,total_wins,total_guesses,weekly_wins,weekly_guesses,best_streak,current_streak,crowns,tik,is_admin,is_owner,last_online,banned,ban_type,achievements,display_badges,duel_wins,duel_losses,mode_stats').gt('weekly_wins',0).order('weekly_wins',{ascending:false}).order('weekly_guesses',{ascending:true}).limit(100);
  } else {
    query = sb.from('users').select('id,username,avatar_url,xp,level,level_xp,level_xp_needed,total_wins,total_guesses,weekly_wins,weekly_guesses,best_streak,current_streak,crowns,tik,is_admin,is_owner,last_online,banned,ban_type,achievements,display_badges,duel_wins,duel_losses,mode_stats').gt('best_streak',0).order('best_streak',{ascending:false}).order('total_wins',{ascending:false}).limit(100);
  }
  if(search) query = query.ilike('username', `%${search}%`);
  const { data: rows, error } = await query;
  list.innerHTML = '';
  if(error || !rows || rows.length === 0){
    list.innerHTML = `<div class="empty-note">${lbMode==='weekly'?'No one has played this week yet':'No users found'}</div>`;
    return;
  }
  try{ await fetchClanForUsers(rows.map(r=>r.id)); rows.forEach(attachClanToUser); }catch(e){}
  updateMyRankCard();
  rows.forEach((u, idx)=>{
    const row = document.createElement('div');
    row.className = 'lb-row';
    const rankClass = idx===0?'top1':idx===1?'top2':idx===2?'top3':'';
    let primary, secondary;
    if(lbMode==='global'){ primary = u.total_wins; secondary = u.total_guesses + ' guesses'; }
    else if(lbMode==='weekly'){ primary = u.weekly_wins; secondary = u.weekly_guesses + ' guesses'; }
    else { primary = u.best_streak; secondary = u.total_wins + ' wins'; }
    const crownTag = (u.crowns||0) > 0 ? `<span class="crown-tag">🏆${u.crowns}</span>` : '';
    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${idx+1}</div>
      <div class="avatar sm" id="lbAv${idx}"></div>
      <div class="lb-name"><div class="u">${usernameWithTik(u)} ${crownTag}</div></div>
      <div class="lb-stats"><b>${primary}</b><br>${secondary}<br>Lv ${u.level||1}</div>
    `;
    row.onclick = ()=> openUserModal(u);
    list.appendChild(row);
    renderAvatar(row.querySelector(`#lbAv${idx}`), u);
  });
}

async function updateMyRankCard(){
  const card = $('myRankCard');
  if(!card || !CURRENT_USER){ if(card) card.classList.add('hidden'); return; }
  const u = CURRENT_USER;
  let rank = null;
  try{
    if(lbMode === 'global'){
      const { count, error } = await sb.from('users').select('*',{count:'exact',head:true})
        .or(`total_wins.gt.${u.total_wins},and(total_wins.eq.${u.total_wins},total_guesses.lt.${u.total_guesses})`);
      if(!error) rank = (count||0)+1;
    } else if(lbMode === 'weekly'){
      const { count, error } = await sb.from('users').select('*',{count:'exact',head:true})
        .gt('weekly_wins',0)
        .or(`weekly_wins.gt.${u.weekly_wins||0},and(weekly_wins.eq.${u.weekly_wins||0},weekly_guesses.lt.${u.weekly_guesses||0})`);
      if(!error) rank = (count||0)+1;
    } else {
      const { count, error } = await sb.from('users').select('*',{count:'exact',head:true})
        .gt('best_streak',0)
        .or(`best_streak.gt.${u.best_streak||0},and(best_streak.eq.${u.best_streak||0},total_wins.lt.${u.total_wins||0})`);
      if(!error) rank = (count||0)+1;
    }
  }catch(e){}
  const wins = lbMode==='global' ? u.total_wins : lbMode==='weekly' ? (u.weekly_wins||0) : (u.best_streak||0);
  const label = lbMode==='clans' ? 'clan' : (lbMode==='streak' ? 'best streak' : 'wins');
  card.classList.remove('hidden');
  card.innerHTML = `Your rank: <b>#${rank != null ? rank : '—'}</b> · Lv ${u.level||1} · ${wins} ${label} ${verifiedBadgeHtml(u)}`;
}

/* ---------- USER MODAL + ADMIN ---------- */
async function openUserModal(u){
  modalTargetUser = u;
  try{ await fetchClanForUsers([u.id]); attachClanToUser(u); }catch(e){}
  renderAvatar($('modalAvatar'), u);
  $('modalUname').innerHTML = usernameWithTik(u);
  // Role badge: only Owner / Staff — never on normal users
  (function(){
    const badge = $('modalAdminBadge');
    if(!badge) return;
    badge.style.cssText = '';
    if(u.is_owner){
      badge.textContent = '✦ Boss';
      badge.className = 'owner-badge';
    } else if(u.is_admin === true || u.is_admin === 'true' || u.is_admin === 1){
      badge.textContent = 'Staff';
      badge.className = 'admin-badge';
    } else {
      badge.textContent = '';
      badge.className = 'admin-badge hidden';
    }
  })();
  $('modalStatus').textContent = u.banned ? 'Banned' : (isOnline(u.last_online) ? 'Online' : 'Offline');
  $('modalLevel').innerHTML = u.level + ' · ' + levelTitleHtml(u.level);
  $('modalXp').textContent = `${u.xp} (progress ${u.level_xp}/${u.level_xp_needed})`;
  $('modalWins').textContent = u.total_wins;
  $('modalGuesses').textContent = u.total_guesses;
  $('modalStreak').textContent = (u.best_streak||0) + ' (current ' + (u.current_streak||0) + ')';
  $('modalCrowns').textContent = `${u.crowns||0} 🏆 (${u.champion_points||0} pts)`;
  try{
    let dw = $('modalDuelWins');
    if(!dw){
      const row = document.createElement('div');
      row.className = 'detail-row';
      row.innerHTML = '<span>Duel wins</span><span id="modalDuelWins">0</span>';
      const crownsRow = $('modalCrowns') && $('modalCrowns').closest('.detail-row');
      if(crownsRow && crownsRow.parentNode) crownsRow.parentNode.insertBefore(row, crownsRow.nextSibling);
      dw = $('modalDuelWins');
    }
    if(dw) dw.textContent = String(u.duel_wins||0) + ' ⚔️';
  }catch(e){}
  $('modalLastOnline').textContent = fmtDate(u.last_online);
  $('modalLastWin').textContent = fmtDate(u.last_win);
  // Achievements: only unlocked for this user
  (function(){
    const wrap = $('modalAchievementsWrap');
    const box = $('modalAchievements');
    if(!wrap || !box) return;
    let unlocked = Array.isArray(u.achievements) ? u.achievements : [];
    const earned = ACHIEVEMENTS.filter(a => unlocked.includes(a.id) || a.check(u));
    if(!earned.length){
      wrap.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    wrap.classList.remove('hidden');
    box.innerHTML = earned.map(a =>
      `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:18px;">🏆</span>
        <div><div style="font-size:12px;font-weight:700;">${escapeHtml(a.name)}</div>
        <div style="font-size:10px;color:var(--text-dim);">${escapeHtml(a.desc)}</div></div>
      </div>`
    ).join('');
  })();

  const showAdmin = canModerateUser(u) && (hasPerm('ban') || hasPerm('verify') || hasPerm('manage_staff'));
  const viewingProtectedAdmin = isStaff() && isProtectedTarget(u) && CURRENT_USER.id !== u.id;
  const canBan = canModerateUser(u) && hasPerm('ban');
  const canVerify = canModerateUser(u) && hasPerm('verify');
  const canManageStaff = isOwner() && u.id !== CURRENT_USER.id && !u.is_owner;
  $('adminBanSection').classList.toggle('hidden', !showAdmin);
  $('banForm').classList.add('hidden');
  $('btnUnban').classList.toggle('hidden', !(canBan && u.banned));
  // Clan invite from profile modal — only offer when it can actually succeed
  try{
    await loadMyClan(false);
    const wrap = $('modalClanActions');
    const invBtn = $('modalClanInviteBtn');
    const canInv = !!(MY_CLAN && myClanPerm('invite') && u.id !== CURRENT_USER.id && !u.clan_id);
    if(wrap && invBtn){
      wrap.classList.toggle('hidden', !canInv);
      if(canInv){
        invBtn.disabled = false;
        invBtn.textContent = 'Invite to my clan';
        // Reflect an already-pending invite immediately, instead of only failing after a click
        try{
          const { data: pend } = await sb.from('clan_invites').select('id')
            .eq('clan_id', MY_CLAN.clan.id).eq('invitee_id', u.id).eq('status','pending').maybeSingle();
          if(pend){ invBtn.disabled = true; invBtn.textContent = 'Invite pending'; }
        }catch(e){}
        invBtn.onclick = async ()=>{
          if(invBtn.disabled) return;
          if(!MY_CLAN || !myClanPerm('invite')){ toast('No invite permission'); return; }
          invBtn.disabled = true;
          const prevLabel = invBtn.textContent;
          invBtn.textContent = 'Sending…';
          try{
            const { data: already } = await sb.from('clan_members').select('id').eq('user_id', u.id).maybeSingle();
            if(already){ toast('User already in a clan'); invBtn.textContent = 'Already in a clan'; return; }
            const { data: pend } = await sb.from('clan_invites').select('id').eq('clan_id', MY_CLAN.clan.id).eq('invitee_id', u.id).eq('status','pending').maybeSingle();
            if(pend){ toast('Invite already pending'); invBtn.textContent = 'Invite pending'; return; }
            const { data: inv, error } = await sb.from('clan_invites').insert({
              clan_id: MY_CLAN.clan.id, inviter_id: CURRENT_USER.id, invitee_id: u.id, status:'pending'
            }).select().single();
            if(error){ toast(error.message||'Invite failed'); invBtn.disabled = false; invBtn.textContent = prevLabel; return; }
            const ok = await pushNotification(u.id, 'clan_invite', 'Clan invite',
              '@'+CURRENT_USER.username+' invited you to '+MY_CLAN.clan.name+' ['+MY_CLAN.clan.tag+']',
              { invite_id: inv.id, clan_id: MY_CLAN.clan.id, from_user_id: CURRENT_USER.id, status:'pending' });
            await logClanHistory(MY_CLAN.clan.id, 'invite', { target_user_id: u.id, target_username: u.username });
            toast(ok ? 'Invite sent' : 'Invite saved (notification may be delayed)');
            invBtn.textContent = 'Invite sent';
          }catch(e){
            console.warn(e);
            toast('Invite failed');
            invBtn.disabled = false;
            invBtn.textContent = prevLabel;
          }
        };
      }
    }
  }catch(e){ console.warn(e); }
  // Hide individual buttons by permission
  if($('btnBanDevice')) $('btnBanDevice').style.display = canBan ? '' : 'none';
  if($('btnBanNormal')) $('btnBanNormal').style.display = canBan ? '' : 'none';
  if($('btnToggleTik')){
    $('btnToggleTik').style.display = canVerify ? '' : 'none';
    $('btnToggleTik').textContent = u.tik ? 'Remove Verified' : 'Give Verified';
  }
  if($('btnToggleAdmin')){
    // Only owner can grant/revoke staff
    $('btnToggleAdmin').style.display = canManageStaff ? '' : 'none';
    $('btnToggleAdmin').textContent = u.is_admin ? 'Revoke Staff' : 'Make Staff';
  }
  // Permission editor (owner only)
  let permBox = $('staffPermEditor');
  if(!permBox){
    permBox = document.createElement('div');
    permBox.id = 'staffPermEditor';
    permBox.className = 'hidden';
    permBox.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);';
    const banSec = $('adminBanSection');
    if(banSec) banSec.appendChild(permBox);
  }
  if(canManageStaff){
    permBox.classList.remove('hidden');
    const perms = getPerms(u);
    permBox.innerHTML = `<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text);">Staff permissions</div>` +
      PERM_KEYS.filter(p=>p.key!=='manage_staff').map(p=>`
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;padding:5px 0;cursor:pointer;">
          <input type="checkbox" data-perm="${p.key}" ${perms[p.key]?'checked':''} ${u.is_admin?'':'disabled'}>
          <span>${p.label}</span>
        </label>`).join('') +
      `<button type="button" class="btn btn-primary" id="savePermsBtn" style="margin-top:8px;font-size:13px;">Save permissions</button>
       <div style="font-size:10px;color:var(--text-dim);margin-top:6px;">User must be Staff first. Only the Boss can change these.</div>`;
    const saveBtn = permBox.querySelector('#savePermsBtn');
    if(saveBtn){
      saveBtn.onclick = async ()=>{
        if(!isOwner()){ toast('Only Boss can edit permissions'); return; }
        if(!u.is_admin){ toast('Make them Staff first'); return; }
        const next = {};
        permBox.querySelectorAll('[data-perm]').forEach(cb=>{ next[cb.getAttribute('data-perm')] = cb.checked; });
        next.manage_staff = false; // never grant manage_staff to non-owner
        const { error } = await sb.from('users').update({ permissions: next }).eq('id', u.id);
        if(error){ toast(error.message||'Failed'); return; }
        u.permissions = next;
        await writeAudit('edit_permissions', { target_user_id: u.id, target_username: u.username, details: next });
        toast('Permissions saved');
        openUserModal(u);
      };
    }
  } else {
    permBox.classList.add('hidden');
    permBox.innerHTML = '';
  }
  let prot = $('adminProtectedNote');
  if(!prot){
    prot = document.createElement('div');
    prot.id = 'adminProtectedNote';
    prot.style.cssText = 'margin-top:12px;padding:10px 12px;border-radius:12px;border:1px solid var(--border);font-size:12px;color:var(--text-dim);text-align:center;';
    const banSec = $('adminBanSection');
    if(banSec && banSec.parentNode) banSec.parentNode.insertBefore(prot, banSec);
  }
  if(viewingProtectedAdmin){
    prot.classList.remove('hidden');
    prot.textContent = u.is_owner
      ? 'Boss account — fully protected.'
      : 'Staff account — only the Boss can moderate staff.';
  } else {
    prot.classList.add('hidden');
    prot.textContent = '';
  }
  // Devices (admin sees all of user's devices)
  const devWrap = $('modalDevicesWrap');
  const devBox = $('modalDevices');
  if(devWrap && devBox){
    if(showAdmin || (CURRENT_USER && CURRENT_USER.id === u.id)){
      devWrap.classList.remove('hidden');
      devBox.innerHTML = 'Loading…';
      sb.from('devices').select('*').eq('user_id', u.id).eq('revoked', false).order('last_seen',{ascending:false}).limit(40).then(({data})=>{
        if(!data || !data.length){ devBox.innerHTML = '<div>No devices logged</div>'; return; }
        try{ cleanupDuplicateDevices(u.id); }catch(e){}
        const list = dedupeDevicesById(data);
        if(!list.length){ devBox.innerHTML = '<div>No devices logged</div>'; return; }
        devBox.innerHTML = list.map(d=>{
          const kicked = d.revoked ? ' · REVOKED' : '';
          return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div><b style="color:var(--text);">${escapeHtml((d.platform||'?'))}</b> · ${escapeHtml(d.screen||'')}${kicked}</div>
            <div style="font-size:10px;">${escapeHtml((d.user_agent||'').slice(0,90))}</div>
            <div style="font-size:10px;">Last: ${fmtDate(d.last_seen)} · ${d.touch?'Touch':'Desktop'}</div>
            <div style="font-size:9px;opacity:.55;word-break:break-all;">${escapeHtml((d.device_id||'').slice(0,24))}…</div>
            ${showAdmin && !d.revoked ? `<button type="button" class="btn btn-ghost" style="width:auto;padding:5px 10px;font-size:11px;margin-top:4px;" data-adm-kick="${escapeHtml(d.id)}">Kick device</button>` : ''}
          </div>`;
        }).join('');
        devBox.querySelectorAll('[data-adm-kick]').forEach(btn=>{
          btn.onclick = async ()=>{
            if(!canModerateUser(u) || !hasPerm('ban')){ toast('No permission'); return; }
            if(!(await askConfirm('Kick device','Revoke this device session?'))) return;
            await sb.from('devices').update({
              revoked:true, revoked_at: new Date().toISOString(),
              user_agent:null, platform:null, language:null, screen:null, timezone:null, hardware:null, label:null
            }).eq('id', btn.getAttribute('data-adm-kick'));
            await writeAudit('kick_device', { target_user_id: u.id, target_username: u.username, details: { device_row: btn.getAttribute('data-adm-kick') } });
            toast('Device kicked');
            openUserModal(u);
          };
        });
      }).catch(()=>{ devBox.innerHTML = 'Could not load devices'; });
    } else {
      devWrap.classList.add('hidden');
    }
  }
  $('userModal').classList.remove('hidden');
}
$('closeUserModal').onclick = ()=> $('userModal').classList.add('hidden');
$('userModal').addEventListener('click', e=>{ if(e.target.id==='userModal') $('userModal').classList.add('hidden'); });

$('btnBanDevice').onclick = ()=>{ pendingBanType='device'; $('banForm').classList.remove('hidden'); };
$('btnBanNormal').onclick = ()=>{ pendingBanType='normal'; $('banForm').classList.remove('hidden'); };

$('confirmBanBtn').onclick = async ()=>{
  const u = modalTargetUser;
  if(!canModerateUser(u) || !hasPerm('ban')){ toast('No permission to ban'); return; }
  const reason = $('banReasonInput').value.trim() || 'No reason';
  const untilVal = $('banUntilInput').value;
  const until = untilVal ? tehranInputToISO(untilVal) : null;
  if(!(await askConfirm('Confirm ban', `Ban @${u.username} (${pendingBanType})?`))) return;
  const confirmBtn = $('confirmBanBtn');
  if(confirmBtn.disabled) return;
  confirmBtn.disabled = true;
  try{

  if(pendingBanType === 'device'){
    // Ban ALL known device fingerprints for this user
    const idsToBan = new Set();
    if(u.device_id) idsToBan.add(u.device_id);
    try{
      const { data: devs } = await sb.from('devices').select('device_id,user_agent,platform,screen').eq('user_id', u.id);
      (devs||[]).forEach(d=>{ if(d.device_id) idsToBan.add(d.device_id); });
    }catch(e){}
    for(const did of idsToBan){
      let meta = { user_agent:null, platform:null, screen:null };
      try{
        const { data: one } = await sb.from('devices').select('user_agent,platform,screen').eq('device_id', did).limit(1).maybeSingle();
        if(one) meta = one;
      }catch(e){}
      await sb.from('banned_devices').upsert({
        device_id: did,
        reason,
        banned_until: until,
        banned_at: new Date().toISOString(),
        banned_by: CURRENT_USER.id,
        user_agent: meta.user_agent || null,
        platform: meta.platform || null,
        screen: meta.screen || null,
        note: 'user:'+u.username
      });
    }
    await sb.from('users').update({
      banned:true, ban_type:'device', ban_reason:reason, ban_until:until, banned_at:new Date().toISOString()
    }).eq('id', u.id);
  } else {
    await sb.from('users').update({
      banned:true, ban_type:'normal', ban_reason:reason, ban_until:until, banned_at:new Date().toISOString()
    }).eq('id', u.id);
  }
  try{
    await sb.from('ban_history').insert({
      user_id:u.id, device_id:u.device_id, action:'ban', ban_type:pendingBanType, reason, until_at:until, admin_id:CURRENT_USER.id
    });
  }catch(e){}
  await writeAudit('ban', {
    target_user_id: u.id, target_username: u.username, target_device_id: u.device_id,
    details: { ban_type: pendingBanType, reason, until }
  });
  toast('User banned');
  $('userModal').classList.add('hidden');
  $('banForm').classList.add('hidden');
  $('banReasonInput').value=''; $('banUntilInput').value='';
  loadLeaderboard();
  }catch(e){ console.warn(e); toast('Ban failed'); }
  finally{ confirmBtn.disabled = false; }
};

$('btnUnban').onclick = async ()=>{
  const u = modalTargetUser;
  if(!canModerateUser(u) || !hasPerm('ban')){ toast('No permission to ban'); return; }
  if(!(await askConfirm('Remove ban', `Unban @${u.username}?`))) return;
  const unbanBtn = $('btnUnban');
  if(unbanBtn.disabled) return;
  unbanBtn.disabled = true;
  try{
  await sb.from('users').update({
    banned:false, ban_type:null, ban_reason:null, ban_until:null, banned_at:null
  }).eq('id', u.id);
  // Clear every known fingerprint for this user
  const ids = new Set();
  if(u.device_id) ids.add(u.device_id);
  try{
    const { data: devs } = await sb.from('devices').select('device_id').eq('user_id', u.id);
    (devs||[]).forEach(d=>{ if(d.device_id) ids.add(d.device_id); });
  }catch(e){}
  for(const did of ids){
    await sb.from('banned_devices').delete().eq('device_id', did);
  }
  try{
    await sb.from('ban_history').insert({
      user_id:u.id, device_id:u.device_id, action:'unban', admin_id:CURRENT_USER.id
    });
  }catch(e){}
  await writeAudit('unban', { target_user_id: u.id, target_username: u.username, target_device_id: u.device_id });
  toast('Ban removed');
  $('userModal').classList.add('hidden');
  loadLeaderboard();
  }catch(e){ console.warn(e); toast('Unban failed'); }
  finally{ unbanBtn.disabled = false; }
};

$('btnToggleTik').onclick = async ()=>{
  const u = modalTargetUser;
  if(!CURRENT_USER?.is_admin) return;
  if(!canModerateUser(u) || !hasPerm('verify')){ toast('No permission to verify'); return; }
  const next = !u.tik;
  if(!(await askConfirm(next?'Verify user':'Remove verification', `${next?'Give':'Remove'} verified badge for @${u.username}?`))) return;
  const tikBtn = $('btnToggleTik');
  if(tikBtn.disabled) return;
  tikBtn.disabled = true;
  try{
    await sb.from('users').update({ tik: next }).eq('id', u.id);
    u.tik = next;
    await writeAudit(next ? 'verify' : 'unverify', { target_user_id: u.id, target_username: u.username });
    toast(next ? 'Verified' : 'Verification removed');
    await openUserModal(u);
  }catch(e){ console.warn(e); toast('Action failed'); }
  finally{ tikBtn.disabled = false; }
};

$('btnToggleAdmin').onclick = async ()=>{
  const u = modalTargetUser;
  if(!isOwner()){ toast('Only the Boss can manage staff'); return; }
  if(!u || u.id === CURRENT_USER.id || u.is_owner){ toast('Not allowed'); return; }
  const next = !u.is_admin;
  if(!(await askConfirm(next?'Make Staff':'Revoke Staff', (next?'Grant staff role to @':'Remove staff role from @')+u.username+'?'))) return;
  const adminBtn = $('btnToggleAdmin');
  if(adminBtn.disabled) return;
  adminBtn.disabled = true;
  try{
  const defaultPerms = next ? {
    support: true, reports: true, ban: false, verify: false,
    chats: false, announce: false, weekly_reset: false, audit: true, manage_staff: false
  } : {};
  const { error } = await sb.from('users').update({
    is_admin: next,
    permissions: defaultPerms
  }).eq('id', u.id);
  if(error){ toast(error.message||'Failed'); return; }
  u.is_admin = next;
  u.permissions = defaultPerms;
  await writeAudit(next ? 'make_admin' : 'revoke_admin', { target_user_id: u.id, target_username: u.username, details: defaultPerms });
  toast(next ? 'Staff granted — set permissions below' : 'Staff revoked');
  await openUserModal(u);
  }catch(e){ console.warn(e); toast('Action failed'); }
  finally{ adminBtn.disabled = false; }
};

/* ---------- PROFILE ---------- */
function refreshProfileUI(){
  const u = CURRENT_USER; if(!u) return;
  renderAvatar($('profAvatar'), u);
  $('profLevel').textContent = u.level;
  $('profXpText').textContent = `${u.level_xp}/${u.level_xp_needed}`;
  $('profWins').textContent = u.total_wins;
  $('profGuesses').textContent = u.total_guesses;
  $('profCrowns').textContent = `${u.crowns||0} 🏆`;
  const wins = Number(u.total_wins||0), guesses = Number(u.total_guesses||0);
  $('profAvg').textContent = wins > 0 ? (guesses/wins).toFixed(1) : '—';
  $('profStreak').textContent = u.best_streak || 0;
  $('profCurStreak').textContent = u.current_streak || 0;
  $('profWeeklyWins').textContent = String(u.weekly_wins||0);
  $('profWeeklyGuesses').textContent = String(u.weekly_guesses||0);
  $('profXpTotal').textContent = u.xp || 0;
  $('editUsername').value = u.username;
  $('editPassword').value = '';
  $('profLevelTitle').innerHTML = levelTitleHtml(u.level);
  try{
    if(u && CURRENT_USER && u.id === CURRENT_USER.id && CURRENT_USER.clan_tag){
      u.clan_tag = CURRENT_USER.clan_tag;
      u.clan_color = CURRENT_USER.clan_color;
      u.clan_id = CURRENT_USER.clan_id;
    } else if(u){
      attachClanToUser(u);
    }
  }catch(e){}
  const pu = $('profUname');
  if(pu){
    pu.innerHTML = usernameWithTik(u) + (truthyFlag(u.is_owner) ? ' <span class="owner-badge">✦ Boss</span>' : (truthyFlag(u.is_admin) ? ' <span class="admin-badge">Staff</span>' : ''));
  }
  // achievements
  const grid = $('achGrid');
  if(grid){
    const unlocked = Array.isArray(u.achievements) ? u.achievements : [];
    grid.innerHTML = ACHIEVEMENTS.map(a=>{
      const ok = unlocked.includes(a.id) || a.check(u);
      return `<div class="ach-item ${ok?'':'locked'}">
        <div class="ach-ic">${ok?'🏆':'🔒'}</div>
        <div><div class="ach-name">${escapeHtml(a.name)}</div><div class="ach-desc">${escapeHtml(a.desc)}</div></div>
      </div>`;
    }).join('');
  }
  // this device info
  const pd = $('profDevices');
  if(pd){
    const s = DEVICE_INFO.signals || {};
    pd.innerHTML = `<div><b style="color:var(--text);">${escapeHtml(s.platform||'Device')}</b> · ${escapeHtml(s.screen||'')}</div>
      <div>${escapeHtml(s.timezone||'')} · ${s.touch?'Touch':'No touch'} · ${s.cores||'?'} cores</div>
      <div style="font-size:10px;margin-top:4px;opacity:.7;word-break:break-all;">ID: ${escapeHtml((DEVICE_ID||'').slice(0,24))}…</div>
      <div style="font-size:10px;opacity:.5;margin-top:2px;">Device bans use this fingerprint.</div>`;
  }
  loadAccountDevices();
  // recent game rounds
  (async ()=>{
    const box = $('profRecentRounds');
    if(!box) return;
    box.innerHTML = 'Loading…';
    try{
      const { data } = await sb.from('game_rounds').select('*').eq('user_id', CURRENT_USER.id).order('created_at',{ascending:false}).limit(8);
      if(!data || !data.length){ box.innerHTML = '<div class="empty-note" style="padding:12px;">No rounds logged yet</div>'; return; }
      box.innerHTML = data.map(r=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span><b>${escapeHtml(r.mode||'')}</b> · ${r.guesses} guesses</span>
        <span style="color:var(--text-dim);">+${r.xp_gained||0} XP · ${fmtDate(r.created_at)}</span>
      </div>`).join('');
    }catch(e){ box.innerHTML = '<div class="empty-note" style="padding:12px;">History unavailable</div>'; }
  })();

  const kab = $('kickAllDevicesBtn');
  if(kab && !kab._bound){ kab._bound = true; kab.onclick = ()=> kickAllOtherDevices(); }
  refreshSupportBadge();
  refreshClanProfileUI();
}

$('avatarUploadLabel').onclick = ()=> $('avatarUpload').click();
$('avatarUpload').onchange = async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  if(file.size > 2_200_000){ toast('Image must be under ~2MB'); return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    const { data: updated, error } = await sb.from('users').update({ avatar_url: reader.result }).eq('id', CURRENT_USER.id).select().single();
    if(!error){ CURRENT_USER = updated; refreshProfileUI(); refreshGameUI(); toast('Picture updated'); }
  };
  reader.readAsDataURL(file);
};

$('saveUsernameBtn').onclick = async ()=>{
  const newName = $('editUsername').value.trim();
  const err = validateUsername(newName);
  if(err){ toast(err); return; }
  if(newName.toLowerCase() !== CURRENT_USER.username.toLowerCase()){
    let exists = null;
    const r1 = await sb.from('users').select('id').eq('username_lower', newName.toLowerCase()).maybeSingle();
    exists = r1.data;
    if(!exists){
      const r2 = await sb.from('users').select('id').ilike('username', newName).limit(1);
      if(r2.data && r2.data.length && r2.data[0].id !== CURRENT_USER.id) exists = r2.data[0];
    }
    if(exists){ toast('This username is already taken'); return; }
  }
  const { data: updated, error } = await sb.from('users').update({ username: newName }).eq('id', CURRENT_USER.id).select().single();
  if(error){ toast(error.code==='23505'?'Username taken':'Error'); return; }
  CURRENT_USER = updated;
  refreshProfileUI(); refreshGameUI();
  $('topbarUser').textContent = '@' + updated.username;
  toast('Username updated');
};

$('savePasswordBtn').onclick = async ()=>{
  const newPass = $('editPassword').value;
  const err = validatePassword(newPass);
  if(err){ toast(err); return; }
  const hash = await sha256(newPass);
  const { error } = await sb.from('users').update({ password_hash: hash }).eq('id', CURRENT_USER.id);
  if(error){ toast('Error saving password'); return; }
  $('editPassword').value = '';
  toast('Password updated');
};

$('logoutBtn').onclick = async ()=>{
  try{
    if(CURRENT_USER && DEVICE_ID && sb){
      // Remove this device from account sessions (only logged-in devices remain)
      await sb.from('devices').delete()
        .eq('user_id', CURRENT_USER.id)
        .eq('device_id', DEVICE_ID);
    }
  }catch(e){ console.warn('logout device cleanup', e); }
  try{ localStorage.removeItem('gz_user_id'); }catch(e){}
  CURRENT_USER = null;
  try{ if(window.__onlineTimer) clearInterval(window.__onlineTimer); }catch(e){}
  try{ if(window.__gzChannels){ window.__gzChannels.forEach(ch=>{ try{ sb.removeChannel(ch); }catch(e){} }); window.__gzChannels=[]; } }catch(e){}
  gzGoLogin();
};

/* ---------- CHAT ---------- */
let chatPartner = null, chatReplyTarget = null, chatMsgMap = {}, chatChannelSubscribed = false, chatRealtimeChannel = null;
let chatConversationLoading = false, chatPendingLiveMessages = [];
let userRealtimeSubscribed = false;
let userRealtimeChannel = null;
let pendingChatImage = null, unreadCounts = {}, adminWatchMode = false, adminWatchPair = null;

async function loadUnreadCounts(){
  if(!CURRENT_USER || !sb){ updateChatTabBadge(); return; }
  const { data, error } = await sb.from('messages').select('sender_id').eq('receiver_id', CURRENT_USER.id).eq('is_read', false);
  unreadCounts = {};
  if(!error && data) data.forEach(r=>{ unreadCounts[r.sender_id] = (unreadCounts[r.sender_id]||0)+1; });
  updateChatTabBadge();
  // Keep per-user red badges synchronized without rebuilding the chat list.
  document.querySelectorAll('[id^="unreadBadge-"]').forEach(b=>{
    const uid = b.id.slice('unreadBadge-'.length);
    const n = unreadCounts[uid] || 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('hide', n <= 0);
  });
}
function updateChatTabBadge(){
  const badge = $('chatTabBadge'); if(!badge) return;
  let total = 0; Object.values(unreadCounts).forEach(n=> total+=n);
  if(total>0){ badge.textContent = total>99?'99+':String(total); badge.classList.remove('hide'); }
  else badge.classList.add('hide');
}

let chatSearchTimer = null;
$('chatSearch').oninput = ()=>{ clearTimeout(chatSearchTimer); chatSearchTimer = setTimeout(()=> loadChatUsers(), 280); };

async function loadChatUsers(){
  const list = $('chatUserList');
  ensureChatRealtime();
  list.innerHTML = inlineLoadingHtml('Loading users');
  await loadUnreadCounts();
  const search = $('chatSearch').value.trim();
  let query = sb.from('users').select('id,username,avatar_url,xp,level,level_xp,level_xp_needed,total_wins,total_guesses,weekly_wins,weekly_guesses,best_streak,current_streak,crowns,tik,is_admin,is_owner,last_online,banned,ban_type,achievements,display_badges,duel_wins,duel_losses,mode_stats').neq('id', CURRENT_USER.id).order('last_online',{ascending:false}).limit(200);
  if(search) query = query.ilike('username', `%${search}%`);
  const { data: rows, error } = await query;
  list.innerHTML = '';
  if(error || !rows || !rows.length){ list.innerHTML = '<div class="empty-note">No users found</div>'; return; }
  try{ await fetchClanForUsers(rows.map(r=>r.id)); rows.forEach(attachClanToUser); }catch(e){}
  rows.forEach((u, idx)=>{
    const row = document.createElement('div');
    row.className = 'lb-row';
    const count = unreadCounts[u.id]||0;
    const online = isOnline(u.last_online);
    const seen = online ? 'Online now' : (u.last_online ? ('Seen '+fmtDate(u.last_online)) : 'Offline');
    row.innerHTML = `
      <div class="avatar sm" id="chatAv${idx}"></div>
      <div class="lb-name">
        <div class="u">${usernameWithTik(u)} <span class="online-dot ${online?'':'off'}" title="${online?'Online':'Offline'}"></span></div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${escapeHtml(seen)} · Lv ${u.level||1}</div>
      </div>
      <span class="unread-badge ${count>0?'':'hide'}" id="unreadBadge-${u.id}">${count}</span>
    `;
    row.onclick = ()=> openConversation(u);
    list.appendChild(row);
    renderAvatar(row.querySelector(`#chatAv${idx}`), u);
  });
}

async function applyLiveUserUpdate(row){
  if(!row || !CURRENT_USER || row.id !== CURRENT_USER.id) return;
  const prev = CURRENT_USER;
  // Preserve client-only clan fields (users table has no clan_tag)
  const keepClan = {
    clan_tag: prev.clan_tag,
    clan_color: prev.clan_color,
    clan_id: prev.clan_id,
    clan_name: prev.clan_name,
    clan_role: prev.clan_role,
    _clan: prev._clan
  };
  CURRENT_USER = { ...CURRENT_USER, ...row, ...keepClan };

  // Ban took effect while online — or auto-clear if expired
  if(row.banned){
    const expired = row.ban_until && new Date(row.ban_until) <= new Date();
    if(expired){
      try{
        await sb.from('users').update({
          banned:false, ban_type:null, ban_reason:null, ban_until:null, banned_at:null
        }).eq('id', row.id);
        if(row.ban_type === 'device' && DEVICE_ID){
          await sb.from('banned_devices').delete().eq('device_id', DEVICE_ID);
        }
        try{ await expireExpiredBans(); }catch(e){}
      }catch(e){}
      CURRENT_USER.banned = false;
      CURRENT_USER.ban_type = null;
      CURRENT_USER.ban_reason = null;
      CURRENT_USER.ban_until = null;
      try{
        if($('banScreen') && !$('banScreen').classList.contains('hidden')){
          hideAllScreens();
          $('mainApp').classList.remove('hidden');
          toast('Ban expired — welcome back');
        }
      }catch(e){}
    } else {
      toast('Your account has been restricted');
      showUserBanScreen(CURRENT_USER);
      return;
    }
  }

  // Admin / verify live updates
  if(prev.is_admin !== CURRENT_USER.is_admin){
    if($('navAdmin')) $('navAdmin').classList.toggle('hidden', !isStaff());
    if(!isStaff() && $('pageAdmin') && !$('pageAdmin').classList.contains('hidden')) goPage('game');
    toast(CURRENT_USER.is_admin ? 'You are now an admin' : 'Admin access removed');
  }
  if(prev.tik !== CURRENT_USER.tik){
    toast(CURRENT_USER.tik ? 'You received verified badge' : 'Verified badge removed');
  }
  if(prev.username && CURRENT_USER.username && prev.username !== CURRENT_USER.username){
    toast('Username updated');
  }

  // Live UI refresh (keep clan tag on topbar / game name)
  try{ refreshGameUI(); }catch(e){}
  try{ refreshNameDisplays(); }catch(e){}
  try{
    if($('pageProfile') && !$('pageProfile').classList.contains('hidden')) refreshProfileUI();
  }catch(e){}
}

async function syncCurrentUserFromServer(){
  if(!CURRENT_USER || !sb) return;
  try{
    const { data } = await sb.from('users').select('*').eq('id', CURRENT_USER.id).maybeSingle();
    if(data) await applyLiveUserUpdate(data);
  }catch(e){}
  try{
    if(DEVICE_ID){
      const { data: dev } = await sb.from('devices').select('revoked').eq('device_id', DEVICE_ID).eq('user_id', CURRENT_USER.id).maybeSingle();
      if(dev && dev.revoked){
        localStorage.removeItem('gz_user_id');
        CURRENT_USER = null;
        toast('You were logged out from this device');
        gzGoLogin();
      }
    }
  }catch(e){}
}

function ensureUserRealtime(){
  if(!sb || !CURRENT_USER) return;
  // Always re-bind channel for current user id
  try{
    if(userRealtimeChannel){
      sb.removeChannel(userRealtimeChannel);
      userRealtimeChannel = null;
      userRealtimeSubscribed = false;
    }
  }catch(e){}

  const uid = CURRENT_USER.id;
  userRealtimeChannel = sb.channel('user-live-'+uid)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'users', filter: 'id=eq.'+uid
    }, payload=>{
      if(payload.new) applyLiveUserUpdate(payload.new);
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'devices', filter: 'device_id=eq.'+DEVICE_ID
    }, payload=>{
      const row = payload.new || payload.old;
      if(!row) return;
      if(row.user_id && CURRENT_USER && row.user_id !== CURRENT_USER.id) return;
      if(row.revoked){
        localStorage.removeItem('gz_user_id');
        CURRENT_USER = null;
        toast('You were logged out from this device');
        gzGoLogin();
      }
    })
    .subscribe((status)=>{
      // fallback if realtime not enabled
      if(status === 'SUBSCRIBED') userRealtimeSubscribed = true;
    });
  userRealtimeSubscribed = true;
}

function ensureChatRealtime(){
  if(!sb || !CURRENT_USER) return;
  if(chatRealtimeChannel && chatChannelSubscribed) return;

  // Keep one lightweight user-scoped channel alive for the whole app.
  // This is intentionally started after login, not only when Chat is opened.
  const uid = CURRENT_USER.id;
  const channelName = 'messages-realtime-'+uid;
  try{
    if(chatRealtimeChannel) sb.removeChannel(chatRealtimeChannel);
  }catch(e){}

  chatChannelSubscribed = false;
  chatRealtimeChannel = sb.channel(channelName)
    .on('postgres_changes', {
      event:'INSERT', schema:'public', table:'messages',
      filter:'receiver_id=eq.'+uid
    }, payload=>{
      const m = payload.new;
      if(!m || !CURRENT_USER || m.receiver_id !== CURRENT_USER.id || m.sender_id === CURRENT_USER.id) return;

      const convoOpen = !!(chatPartner && m.sender_id === chatPartner.id &&
        $('chatConversation') && !$('chatConversation').classList.contains('hidden'));

      if(convoOpen){
        // If the initial conversation query is still running, queue the event so it
        // cannot be lost when the first render completes.
        if(chatConversationLoading){
          if(!chatPendingLiveMessages.some(x=>x.id===m.id)) chatPendingLiveMessages.push(m);
          return;
        }
        // Message is visible immediately; mark it read without blocking the UI.
        if(!chatMsgMap[m.id]){
          chatMsgMap[m.id] = m;
          appendMessageBubble(m);
          requestAnimationFrame(scrollChatToBottom);
        }
        sb.from('messages').update({ is_read:true }).eq('id', m.id).then(()=>{}).catch(()=>{});
        return;
      }

      // Unread badge works even when the user is on another page.
      unreadCounts[m.sender_id] = (unreadCounts[m.sender_id]||0) + 1;
      const badge = document.getElementById('unreadBadge-'+m.sender_id);
      if(badge){
        badge.textContent = unreadCounts[m.sender_id] > 99 ? '99+' : String(unreadCounts[m.sender_id]);
        badge.classList.remove('hide');
        const senderRow = badge.closest('.lb-row');
        const chatList = $('chatUserList');
        if(senderRow && chatList && chatList.firstElementChild !== senderRow){
          chatList.insertBefore(senderRow, chatList.firstElementChild);
        }
      }
      updateChatTabBadge();
    })
    .on('postgres_changes', {
      event:'DELETE', schema:'public', table:'messages'
    }, payload=>{
      const id = payload?.old?.id;
      if(!id) return;
      const el = document.getElementById('msg-'+id);
      if(el) el.remove();
      delete chatMsgMap[id];
    })
    .subscribe(status=>{
      if(status === 'SUBSCRIBED'){
        chatChannelSubscribed = true;
        return;
      }
      if(status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
        chatChannelSubscribed = false;
        chatRealtimeChannel = null;
        // Supabase can temporarily lose the websocket on mobile/background.
        // Rebind on the next frame without reloading the page.
        setTimeout(()=>{
          if(CURRENT_USER && sb && !chatChannelSubscribed) ensureChatRealtime();
        }, 1200);
      }
    });
}

// Lightweight fallback for mobile networks/projects where Realtime temporarily drops.
// It never reloads the page or rebuilds the user list.
function ensureChatFallbackPolling(){
  if(window.__chatFallbackPoll) clearInterval(window.__chatFallbackPoll);
  window.__chatFallbackPoll = setInterval(async ()=>{
    if(!CURRENT_USER || document.visibilityState !== 'visible') return;
    try{
      await loadUnreadCounts();
      if(chatPartner && !adminWatchMode && $('chatConversation') && !$('chatConversation').classList.contains('hidden')){
        const last = $('chatMessages').querySelector('.msg:last-of-type');
        let lastTime = last?.dataset?.createdAt || null;
        let q = sb.from('messages').select('*')
          .or(`and(sender_id.eq.${CURRENT_USER.id},receiver_id.eq.${chatPartner.id}),and(sender_id.eq.${chatPartner.id},receiver_id.eq.${CURRENT_USER.id})`)
          .order('created_at',{ascending:true}).limit(50);
        if(lastTime) q = q.gt('created_at', lastTime);
        const {data} = await q;
        if(data && data.length){
          let added=false;
          data.forEach(m=>{ if(!chatMsgMap[m.id]){ chatMsgMap[m.id]=m; appendMessageBubble(m); added=true; } });
          if(added) requestAnimationFrame(scrollChatToBottom);
          const incoming=data.filter(m=>m.sender_id===chatPartner.id && m.receiver_id===CURRENT_USER.id);
          if(incoming.length) await sb.from('messages').update({is_read:true}).in('id',incoming.map(x=>x.id));
        }
      }
    }catch(e){}
  }, 5000);
}

async function openConversation(user, opts){
  opts = opts || {};
  adminWatchMode = !!opts.watch;
  adminWatchPair = opts.pair || null;
  chatPartner = user;
  chatReplyTarget = null;
  $('replyBar').classList.add('hidden');
  renderAvatar($('convoAvatar'), user);
  $('convoName').textContent = opts.title || ('@' + user.username);
  const inputRow = document.querySelector('.chat-input-row');
  if(inputRow) inputRow.style.display = adminWatchMode ? 'none' : 'flex';
  $('chatMessages').innerHTML = inlineLoadingHtml('Loading messages');
  $('chatConversation').classList.remove('hidden');
  chatConversationLoading = true;
  chatPendingLiveMessages = [];

  let query;
  if(adminWatchMode && adminWatchPair){
    const a = adminWatchPair.a, b = adminWatchPair.b;
    query = sb.from('messages').select('*')
      .or(`and(sender_id.eq.${a},receiver_id.eq.${b}),and(sender_id.eq.${b},receiver_id.eq.${a})`)
      .order('created_at',{ascending:true}).limit(500);
  } else {
    query = sb.from('messages').select('*')
      .or(`and(sender_id.eq.${CURRENT_USER.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${CURRENT_USER.id})`)
      .order('created_at',{ascending:true}).limit(500);
  }
  const { data: rows, error } = await query;
  // Render the initial history, then merge any Realtime events that arrived while it loaded.
  const liveQueue = chatPendingLiveMessages.slice();
  chatPendingLiveMessages = [];
  chatConversationLoading = false;
  chatMsgMap = {};
  $('chatMessages').innerHTML = '';
  if(!error && rows){
    rows.forEach(m=>{ chatMsgMap[m.id]=m; appendMessageBubble(m); });
    liveQueue.forEach(m=>{ if(!chatMsgMap[m.id]){ chatMsgMap[m.id]=m; appendMessageBubble(m); } });
    if(!rows.length && !liveQueue.length) $('chatMessages').innerHTML = '<div class="empty-note">No messages yet</div>';
  } else if(error) {
    $('chatMessages').innerHTML = '<div class="empty-note">Error loading</div>';
    liveQueue.forEach(m=>{ if(!chatMsgMap[m.id]){ chatMsgMap[m.id]=m; appendMessageBubble(m); } });
  }
  scrollChatToBottom();
  if(!adminWatchMode){
    ensureChatRealtime();
    await sb.from('messages').update({ is_read:true }).eq('sender_id', user.id).eq('receiver_id', CURRENT_USER.id).eq('is_read', false);
    unreadCounts[user.id] = 0;
    const badge = document.getElementById('unreadBadge-'+user.id);
    if(badge){ badge.textContent='0'; badge.classList.add('hide'); }
    updateChatTabBadge();
  }
}
function closeConversation(){
  chatConversationLoading = false;
  chatPendingLiveMessages = [];
  $('chatConversation').classList.add('hidden');
  chatPartner = null; adminWatchMode = false; adminWatchPair = null;
  const inputRow = document.querySelector('.chat-input-row');
  if(inputRow) inputRow.style.display = 'flex';
}
$('chatBackBtn').onclick = closeConversation;
function scrollChatToBottom(){ const box=$('chatMessages'); box.scrollTop = box.scrollHeight; }

function appendMessageBubble(m){
  const mine = adminWatchMode
    ? (adminWatchPair && m.sender_id === adminWatchPair.a)
    : (m.sender_id === CURRENT_USER.id);
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (mine ? 'mine' : 'theirs');
  wrap.id = 'msg-' + m.id;
  if(m.created_at) wrap.dataset.createdAt = m.created_at;
  let quoteHtml = '';
  if(m.reply_to_id && chatMsgMap[m.reply_to_id]){
    const orig = chatMsgMap[m.reply_to_id];
    const preview = orig.content ? escapeHtml(orig.content).slice(0,80) : '📷 Photo';
    quoteHtml = `<div class="msg-quote">${preview}</div>`;
  }
  const imgHtml = m.image_url ? `<img src="${m.image_url}" class="msg-img" alt="">` : '';
  const textHtml = m.content ? `<div class="msg-text">${escapeHtml(m.content)}</div>` : '';
  const canDelete = adminWatchMode ? (CURRENT_USER && CURRENT_USER.is_admin) : (mine || (CURRENT_USER && CURRENT_USER.is_admin));
  const canReport = !adminWatchMode && !mine && chatPartner;
  wrap.innerHTML = `${quoteHtml}${imgHtml}${textHtml}
    <div class="msg-actions">
      <span class="msg-act-reply" data-id="${m.id}">↩ Reply</span>
      ${canDelete?`<span class="msg-act-del" data-id="${m.id}">🗑</span>`:''}
      ${canReport?`<span class="msg-act-report" data-id="${m.id}">⚑</span>`:''}
    </div>`;
  wrap.querySelector('.msg-act-reply').onclick = ()=> startReply(m);
  const delBtn = wrap.querySelector('.msg-act-del');
  if(delBtn) delBtn.onclick = ()=> deleteMessage(m.id);
  const repBtn = wrap.querySelector('.msg-act-report');
  if(repBtn) repBtn.onclick = ()=> reportUser(chatPartner, m);
  $('chatMessages').appendChild(wrap);
}
function startReply(m){
  chatReplyTarget = m;
  $('replyBar').classList.remove('hidden');
  $('replyBarName').textContent = m.sender_id === CURRENT_USER.id ? 'You' : ('@'+chatPartner.username);
  $('replyBarText').textContent = m.content ? m.content.slice(0,80) : '📷 Photo';
}
$('cancelReplyBtn').onclick = ()=>{ chatReplyTarget=null; $('replyBar').classList.add('hidden'); };

async function reportUser(user, message){
  if(!user || !CURRENT_USER) return;
  if(!rateOk('lastReport', RATE.reportMs)){ toast('Please wait before reporting again'); return; }
  const reason = prompt('Report reason (optional):');
  if(reason === null) return;
  if(!(await askConfirm('Report user', 'Report @'+user.username+'?'))) return;
  let snapshot = null, imageUrl = null;
  if(message){
    if(message.content) snapshot = String(message.content).slice(0,500);
    if(message.image_url){ imageUrl = message.image_url; if(!snapshot) snapshot = '[Photo]'; }
  }
  const row = {
    reporter_id: CURRENT_USER.id, reported_id: user.id,
    reason: (reason&&reason.trim())?reason.trim():'No reason',
    message_id: message?message.id:null, message_snapshot: snapshot, message_image_url: imageUrl, status:'open'
  };
  let { error } = await sb.from('reports').insert(row);
  if(error){ delete row.message_image_url; ({error}=await sb.from('reports').insert(row)); }
  if(error){ delete row.message_snapshot; const {error:e2}=await sb.from('reports').insert(row); if(e2) toast(e2.message||'Failed'); else toast('Report submitted'); }
  else toast('Report submitted');
}

async function deleteMessage(id){
  const m = chatMsgMap[id]; if(!m) return;
  const isOwner = m.sender_id === CURRENT_USER.id;
  const isAdmin = CURRENT_USER && CURRENT_USER.is_admin;
  if(!isOwner && !isAdmin) return;
  const q = sb.from('messages').delete().eq('id', id);
  if(!isAdmin) q.eq('sender_id', CURRENT_USER.id);
  const { error } = await q;
  if(error){ toast('Delete failed'); return; }
  const el = document.getElementById('msg-'+id); if(el) el.remove();
  delete chatMsgMap[id];
}

$('chatSendBtn').onclick = ()=> sendChatMessage();
$('chatTextInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChatMessage(); });

async function sendChatMessage(){
  if(adminWatchMode){ toast('Cannot send in watch mode'); return; }
  const text = $('chatTextInput').value.trim();
  if(!text) return;
  if(!chatPartner) return;
  if(window.__chatSending) return;
  if(!rateOk('lastChat', RATE.chatMs)){ toast('Slow down'); return; }
  const btn = $('chatSendBtn');
  const input = $('chatTextInput');
  window.__chatSending = true;
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="gz-spin" aria-hidden="true"></span>'; }
  if(input) input.disabled = true;
  try{
    const payload = {
      sender_id: CURRENT_USER.id, receiver_id: chatPartner.id,
      content: text, image_url: null,
      reply_to_id: chatReplyTarget ? chatReplyTarget.id : null
    };
    const { data: saved, error } = await sb.from('messages').insert(payload).select().single();
    if(error){ toast('Send failed'); return; }
    chatMsgMap[saved.id] = saved;
    appendMessageBubble(saved);
    scrollChatToBottom();
    if(input) input.value = '';
    chatReplyTarget = null;
    const rb = $('replyBar'); if(rb) rb.classList.add('hidden');
  }catch(e){ toast('Send failed'); }
  finally{
    window.__chatSending = false;
    if(btn){ btn.disabled = false; btn.innerHTML = '➤'; }
    if(input) input.disabled = false;
  }
}

/* ---------- SUPPORT ---------- */
let supportMode = 'user', currentTicket = null;

async function refreshSupportBadge(){
  const dots = [$('topSupportDot')].filter(Boolean);
  if(!CURRENT_USER){ dots.forEach(d=>d.classList.add('hide')); return; }
  try{
    const { data: tickets } = await sb.from('support_tickets')
      .select('id,status')
      .or(`user_id.eq.${CURRENT_USER.id},account_name.eq.${CURRENT_USER.username}`)
      .eq('status','active');
    let hasNew = false;
    if(tickets && tickets.length){
      for(const t of tickets){
        const { data: msgs } = await sb.from('support_messages').select('sender_type,created_at').eq('ticket_id', t.id).order('created_at',{ascending:false}).limit(1);
        if(msgs && msgs[0] && msgs[0].sender_type === 'admin'){
          const key = 'gz_sup_seen_'+t.id;
          const seen = localStorage.getItem(key);
          if(!seen || seen < msgs[0].created_at){ hasNew = true; break; }
        }
      }
    }
    dots.forEach(d=> d.classList.toggle('hide', !hasNew));
  }catch(e){ dots.forEach(d=>d.classList.add('hide')); }
}
function markSupportTicketSeen(ticket){
  if(!ticket) return;
  localStorage.setItem('gz_sup_seen_'+ticket.id, new Date().toISOString());
  refreshSupportBadge();
}

function openSupportNew(){
  $('supportNewModal').classList.remove('hidden');
  const nameInput = $('supAccountName');
  if(CURRENT_USER && CURRENT_USER.username){ nameInput.value = CURRENT_USER.username; nameInput.readOnly = true; }
  else { nameInput.value = ''; nameInput.readOnly = false; }
  $('supTitle').value = ''; $('supBody').value = '';
}
function closeSupportNew(){ $('supportNewModal').classList.add('hidden'); }
$('closeSupportNew').onclick = closeSupportNew;
$('supportNewModal').addEventListener('click', e=>{ if(e.target.id==='supportNewModal') closeSupportNew(); });
['authSupportBtn','banSupportBtn'].forEach(id=>{ const el=$(id); if(el) el.onclick = openSupportNew; });

function refreshSupportMenu(){
  const el = (id)=>$(id);
  if(el('menuAdminTickets')) el('menuAdminTickets').classList.toggle('hidden', !hasPerm('support'));
  if(el('menuAdminReports')) el('menuAdminReports').classList.toggle('hidden', !hasPerm('reports'));
  if(el('menuAdminChats')) el('menuAdminChats').classList.toggle('hidden', !hasPerm('chats'));
  if(el('menuAdminDash')) el('menuAdminDash').classList.toggle('hidden', !isStaff());
}
function closeSupportMenu(){ const m=$('supportMenu'); if(m) m.classList.add('hidden'); }
function toggleSupportMenu(){
  const m = $('supportMenu'); if(!m) return;
  m.classList.toggle('hidden');
  refreshSupportMenu();
}
if($('topSupportBtn')){
  $('topSupportBtn').onclick = (e)=>{
    e.stopPropagation();
    if($('mainApp') && !$('mainApp').classList.contains('hidden')) toggleSupportMenu();
    else openSupportNew();
  };
}
document.addEventListener('click', (e)=>{
  const m = $('supportMenu');
  if(!m || m.classList.contains('hidden')) return;
  if(!m.contains(e.target) && e.target.id !== 'topSupportBtn') closeSupportMenu();
});
if($('menuNewTicket')) $('menuNewTicket').onclick = ()=>{ closeSupportMenu(); openSupportNew(); };
if($('menuMyTickets')) $('menuMyTickets').onclick = ()=>{ closeSupportMenu(); openSupportList('user'); };
if($('menuAdminTickets')) $('menuAdminTickets').onclick = ()=>{ closeSupportMenu(); openSupportList('admin'); };
if($('menuAdminReports')) $('menuAdminReports').onclick = ()=>{ closeSupportMenu(); openReportsList(); };
if($('menuAdminChats')) $('menuAdminChats').onclick = ()=>{ closeSupportMenu(); openAdminAllChats(); };
if($('menuAdminDash')) $('menuAdminDash').onclick = ()=>{ closeSupportMenu(); goPage('admin'); };

$('supViewMyBtn').onclick = ()=>{ closeSupportNew(); openSupportList('user'); };

$('supSubmitBtn').onclick = async ()=>{
  const account_name = $('supAccountName').value.trim();
  const title = $('supTitle').value.trim();
  const body = $('supBody').value.trim();
  if(!account_name || account_name.length < 2){ toast('Enter account name'); return; }
  if(!title){ toast('Enter a title'); return; }
  if(!body){ toast('Enter a message'); return; }
  if(!rateOk('lastTicket', RATE.ticketMs)){ toast('Please wait before another ticket'); return; }
  if(CURRENT_USER){
    const { count } = await sb.from('support_tickets').select('*',{count:'exact',head:true}).eq('user_id', CURRENT_USER.id).in('status',['open','active']);
    if((count||0) >= 3){ toast('You already have 3 open tickets'); return; }
  }
  $('supSubmitBtn').disabled = true;
  try{
    const { data: ticket, error } = await sb.from('support_tickets').insert({
      account_name, title, status:'open', user_id: CURRENT_USER ? CURRENT_USER.id : null
    }).select().single();
    if(error) throw error;
    const { error: e2 } = await sb.from('support_messages').insert({
      ticket_id: ticket.id, sender_type:'user', sender_id: CURRENT_USER?CURRENT_USER.id:null, content: body
    });
    if(e2) throw e2;
    toast('Support request submitted');
    closeSupportNew();
  }catch(e){ toast(e.message||'Failed'); }
  finally{ $('supSubmitBtn').disabled = false; }
};

async function openSupportList(mode){
  if(mode==='admin' && !hasPerm('support')){ toast('No permission'); return; }
  supportMode = mode;
  $('supportListTitle').textContent = mode==='admin' ? 'Support requests' : 'My tickets';
  $('supportListBody').innerHTML = inlineLoadingHtml('Loading');
  $('supportListModal').classList.remove('hidden');
  let query = sb.from('support_tickets').select('*').order('updated_at',{ascending:false}).limit(100);
  if(mode === 'user'){
    if(!CURRENT_USER){ $('supportListBody').innerHTML = '<div class="empty-note">Log in to see tickets</div>'; return; }
    query = query.or(`user_id.eq.${CURRENT_USER.id},account_name.eq.${CURRENT_USER.username}`);
  }
  const { data, error } = await query;
  if(error || !data || !data.length){
    $('supportListBody').innerHTML = `<div class="empty-note">${error?'Error':'No tickets yet'}</div>`;
    return;
  }
  $('supportListBody').innerHTML = '';
  data.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'support-ticket-row';
    row.innerHTML = `<div class="t-title">${escapeHtml(t.title)} <span class="support-status ${t.status}">${t.status}</span></div>
      <div class="t-meta">@${escapeHtml(t.account_name)} · ${fmtDate(t.created_at)}</div>`;
    row.onclick = ()=> openSupportDetail(t);
    $('supportListBody').appendChild(row);
  });
}
$('closeSupportList').onclick = ()=> $('supportListModal').classList.add('hidden');
$('supportListModal').addEventListener('click', e=>{ if(e.target.id==='supportListModal') $('supportListModal').classList.add('hidden'); });

async function openSupportDetail(ticket){
  currentTicket = ticket;
  markSupportTicketSeen(ticket);
  $('supportListModal').classList.add('hidden');
  $('supDetailTitle').textContent = ticket.title;
  $('supDetailMeta').innerHTML = `@${escapeHtml(ticket.account_name)} · <span class="support-status ${ticket.status}">${ticket.status}</span> · ${fmtDate(ticket.created_at)}`;
  $('supportMsgList').innerHTML = inlineLoadingHtml('Loading');
  $('supportDetailModal').classList.remove('hidden');
  const canReply = ticket.status === 'open' || ticket.status === 'active';
  const isAdmin = CURRENT_USER && CURRENT_USER.is_admin;
  $('supReplyWrap').classList.toggle('hidden', !canReply);
  $('supClosedNote').classList.toggle('hidden', canReply);
  $('supAdminActions').classList.toggle('hidden', !isAdmin);
  const { data: msgs, error } = await sb.from('support_messages').select('*').eq('ticket_id', ticket.id).order('created_at',{ascending:true});
  const list = $('supportMsgList');
  list.innerHTML = '';
  if(error || !msgs){ list.innerHTML = '<div class="empty-note">Error</div>'; return; }
  msgs.forEach(m=>{
    const div = document.createElement('div');
    div.className = 'support-msg ' + (m.sender_type==='admin'?'admin':'user');
    div.innerHTML = `<div class="who">${m.sender_type==='admin'?'Admin':'User'}</div><div>${escapeHtml(m.content)}</div>`;
    list.appendChild(div);
  });
  list.scrollTop = list.scrollHeight;
}
$('closeSupportDetail').onclick = ()=> $('supportDetailModal').classList.add('hidden');
$('supportDetailModal').addEventListener('click', e=>{ if(e.target.id==='supportDetailModal') $('supportDetailModal').classList.add('hidden'); });

$('supReplyBtn').onclick = async ()=>{
  if(!currentTicket) return;
  if(currentTicket.status !== 'open' && currentTicket.status !== 'active'){ toast('Ticket closed'); return; }
  const text = $('supReplyInput').value.trim();
  if(!text){ toast('Write a reply'); return; }
  const isAdmin = CURRENT_USER && CURRENT_USER.is_admin;
  const { error } = await sb.from('support_messages').insert({
    ticket_id: currentTicket.id, sender_type: isAdmin?'admin':'user',
    sender_id: CURRENT_USER?CURRENT_USER.id:null, content: text
  });
  if(error){ toast('Failed'); return; }
  if(isAdmin && currentTicket.status === 'open'){
    await sb.from('support_tickets').update({ status:'active', updated_at: new Date().toISOString() }).eq('id', currentTicket.id);
    currentTicket.status = 'active';
  } else {
    await sb.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', currentTicket.id);
  }
  $('supReplyInput').value = '';
  openSupportDetail(currentTicket);
};
$('supRejectBtn').onclick = async ()=>{
  if(!currentTicket || !CURRENT_USER?.is_admin) return;
  if(!(await askConfirm('Reject','Reject this ticket?'))) return;
  await sb.from('support_tickets').update({ status:'rejected', updated_at: new Date().toISOString() }).eq('id', currentTicket.id);
  toast('Rejected'); currentTicket.status='rejected'; openSupportDetail(currentTicket);
};
$('supDeleteBtn').onclick = async ()=>{
  if(!currentTicket || !CURRENT_USER?.is_admin) return;
  if(!(await askConfirm('Delete','Permanently delete ticket?'))) return;
  await sb.from('support_messages').delete().eq('ticket_id', currentTicket.id);
  await sb.from('support_tickets').delete().eq('id', currentTicket.id);
  toast('Deleted'); $('supportDetailModal').classList.add('hidden'); openSupportList('admin');
};

/* ---------- REPORTS ---------- */
let reportsFilter = 'open', currentReport = null, reportUserCache = {};
$('closeReportsList') && ($('closeReportsList').onclick = ()=> $('reportsListModal').classList.add('hidden'));
$('reportsListModal') && $('reportsListModal').addEventListener('click', e=>{ if(e.target.id==='reportsListModal') $('reportsListModal').classList.add('hidden'); });
$('closeReportDetail') && ($('closeReportDetail').onclick = ()=> $('reportDetailModal').classList.add('hidden'));
$('reportDetailModal') && $('reportDetailModal').addEventListener('click', e=>{ if(e.target.id==='reportDetailModal') $('reportDetailModal').classList.add('hidden'); });
if($('repTabOpen')){
  $('repTabOpen').onclick = ()=>{ reportsFilter='open'; $('repTabOpen').classList.add('active'); $('repTabAll').classList.remove('active'); openReportsList(); };
  $('repTabAll').onclick = ()=>{ reportsFilter='all'; $('repTabAll').classList.add('active'); $('repTabOpen').classList.remove('active'); openReportsList(); };
}

async function openReportsList(){
  if(!hasPerm('reports')){ toast('No permission'); return; }
  $('reportsListBody').innerHTML = inlineLoadingHtml('Loading');
  $('reportsListModal').classList.remove('hidden');
  let query = sb.from('reports').select('*').order('created_at',{ascending:false}).limit(100);
  if(reportsFilter==='open') query = query.eq('status','open');
  const { data, error } = await query;
  if(error || !data || !data.length){
    $('reportsListBody').innerHTML = '<div class="empty-note">'+(error?'Error':'No reports')+'</div>';
    return;
  }
  const ids = new Set();
  data.forEach(r=>{ if(r.reporter_id) ids.add(r.reporter_id); if(r.reported_id) ids.add(r.reported_id); });
  reportUserCache = {};
  if(ids.size){
    const { data: users } = await sb.from('users').select('*').in('id', Array.from(ids));
    (users||[]).forEach(u=>{ reportUserCache[u.id]=u; });
  }
  $('reportsListBody').innerHTML = '';
  data.forEach(r=>{
    const reporter = reportUserCache[r.reporter_id];
    const reported = reportUserCache[r.reported_id];
    const row = document.createElement('div');
    row.className = 'support-ticket-row';
    row.innerHTML = `<div class="t-title">@${escapeHtml(reported?reported.username:'?')} <span class="support-status ${r.status}">${escapeHtml(r.status)}</span></div>
      <div class="t-meta">By @${escapeHtml(reporter?reporter.username:'?')} · ${fmtDate(r.created_at)}</div>`;
    row.onclick = ()=> openReportDetail(r);
    $('reportsListBody').appendChild(row);
  });
}

async function openReportDetail(r){
  currentReport = r;
  $('reportsListModal').classList.add('hidden');
  const reporter = reportUserCache[r.reporter_id]||{};
  const reported = reportUserCache[r.reported_id]||{};
  let msgHtml = '';
  if(r.message_image_url) msgHtml += `<div style="margin-top:10px;"><b>Photo</b><br><img src="${String(r.message_image_url).replace(/"/g,'&quot;')}" style="max-width:100%;border-radius:10px;margin-top:6px;"></div>`;
  if(r.message_snapshot) msgHtml += `<div style="margin-top:10px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px;"><b>Content</b><div style="margin-top:6px;white-space:pre-wrap;">${escapeHtml(r.message_snapshot)}</div></div>`;
  $('reportDetailBody').innerHTML = `
    <div class="detail-row"><span>Status</span><span class="support-status ${r.status}">${escapeHtml(r.status)}</span></div>
    <div class="detail-row"><span>Reported</span><span>@${escapeHtml(reported.username||'?')} ${verifiedBadgeHtml(reported)}</span></div>
    <div class="detail-row"><span>Reporter</span><span>@${escapeHtml(reporter.username||'?')}</span></div>
    <div class="detail-row"><span>Reason</span><span>${escapeHtml(r.reason||'—')}</span></div>
    <div class="detail-row"><span>Date</span><span>${fmtDate(r.created_at)}</span></div>
    ${msgHtml}`;
  $('reportDetailModal').classList.remove('hidden');
}
async function setReportStatus(status){
  if(!currentReport || !CURRENT_USER?.is_admin) return;
  const { error } = await sb.from('reports').update({ status }).eq('id', currentReport.id);
  if(error){ toast(error.message||'Failed'); return; }
  toast('Report '+status); currentReport.status = status; openReportDetail(currentReport);
}
if($('repMarkReviewed')) $('repMarkReviewed').onclick = ()=> setReportStatus('reviewed');
if($('repDismiss')) $('repDismiss').onclick = async ()=>{ if(await askConfirm('Dismiss','Dismiss this report?')) setReportStatus('dismissed'); };
if($('repDelete')) $('repDelete').onclick = async ()=>{
  if(!currentReport || !CURRENT_USER?.is_admin) return;
  if(!(await askConfirm('Delete','Delete report?'))) return;
  await sb.from('reports').delete().eq('id', currentReport.id);
  toast('Deleted'); $('reportDetailModal').classList.add('hidden'); openReportsList();
};
if($('repOpenUser')) $('repOpenUser').onclick = ()=>{
  if(!currentReport) return;
  const u = reportUserCache[currentReport.reported_id];
  if(u){ $('reportDetailModal').classList.add('hidden'); openUserModal(u); }
};
if($('repMsgReporter')) $('repMsgReporter').onclick = ()=>{
  const u = reportUserCache[currentReport?.reporter_id];
  if(!u) return; $('reportDetailModal').classList.add('hidden'); goPage('chat'); openConversation(u);
};
if($('repMsgReported')) $('repMsgReported').onclick = ()=>{
  const u = reportUserCache[currentReport?.reported_id];
  if(!u) return; $('reportDetailModal').classList.add('hidden'); goPage('chat'); openConversation(u);
};

async function openAdminAllChats(){
  if(!hasPerm('chats')){ toast('No permission'); return; }
  $('adminChatsList').innerHTML = inlineLoadingHtml('Loading');
  $('adminChatsModal').classList.remove('hidden');
  const { data: rows, error } = await sb.from('messages').select('sender_id,receiver_id,content,image_url,created_at').order('created_at',{ascending:false}).limit(400);
  if(error || !rows){ $('adminChatsList').innerHTML = '<div class="empty-note">Error or empty</div>'; return; }
  const pairMap = new Map();
  rows.forEach(m=>{
    const a=m.sender_id, b=m.receiver_id;
    const key = a<b ? a+'|'+b : b+'|'+a;
    if(!pairMap.has(key)) pairMap.set(key, {a,b,last:m.created_at, preview: m.content||(m.image_url?'[Photo]':'')});
  });
  const ids = new Set(); pairMap.forEach(p=>{ ids.add(p.a); ids.add(p.b); });
  const { data: users } = await sb.from('users').select('id,username,tik,avatar_url,is_admin').in('id', Array.from(ids));
  const umap = {}; (users||[]).forEach(u=>{ umap[u.id]=u; });
  const list = $('adminChatsList'); list.innerHTML = '';
  if(!pairMap.size){ list.innerHTML = '<div class="empty-note">No chats</div>'; return; }
  [...pairMap.values()].forEach(p=>{
    const ua = umap[p.a]||{username:'?'}; const ub = umap[p.b]||{username:'?'};
    const row = document.createElement('div');
    row.className = 'support-ticket-row';
    row.innerHTML = `<div class="t-title">@${escapeHtml(ua.username)} ↔ @${escapeHtml(ub.username)}</div>
      <div class="t-meta">${fmtDate(p.last)} · ${escapeHtml((p.preview||'').slice(0,50))}</div>`;
    row.onclick = ()=>{
      $('adminChatsModal').classList.add('hidden');
      openConversation(ub, { watch:true, pair:{a:p.a,b:p.b}, title:'@'+ua.username+' ↔ @'+ub.username+' (watch)' });
    };
    list.appendChild(row);
  });
}
if($('closeAdminChats')) $('closeAdminChats').onclick = ()=> $('adminChatsModal').classList.add('hidden');
if($('adminChatsModal')) $('adminChatsModal').addEventListener('click', e=>{ if(e.target.id==='adminChatsModal') $('adminChatsModal').classList.add('hidden'); });

/* ---------- ADMIN DASHBOARD ---------- */
async function loadAdminDash(){
  if(!isStaff()){ toast('Staff only'); goPage('game'); return; }
  let ob = $('ownerBanner');
  if(!ob){
    ob = document.createElement('div');
    ob.id = 'ownerBanner';
    const page = $('pageAdmin');
    if(page) page.insertBefore(ob, page.firstChild);
  }
  if(isOwner()){
    ob.className = '';
    ob.style.cssText = 'margin:12px 16px;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,rgba(124,58,237,.2),rgba(219,39,119,.15));border:1px solid rgba(124,58,237,.4);font-size:13px;';
    ob.innerHTML = '<b class="owner-badge">✦ Boss</b> <span style="margin-left:8px;color:var(--text-dim);">Full control · manage staff permissions from any user profile</span>';
  } else {
    ob.style.cssText = 'margin:12px 16px;padding:10px 14px;border-radius:14px;border:1px solid var(--border);font-size:12px;color:var(--text-dim);';
    const p = getPerms();
    const active = Object.keys(p).filter(k=>p[k]).join(', ') || 'none';
    ob.innerHTML = '<span class="admin-badge">Staff</span> <span style="margin-left:8px;">Your access: '+escapeHtml(active)+'</span>';
  }
  // Show/hide tools by permission
  const show = (id, on)=>{ const e=$(id); if(e) e.style.display = on ? '' : 'none'; };
  show('admBtnTickets', hasPerm('support'));
  show('admBtnReports', hasPerm('reports'));
  show('admBtnChats', hasPerm('chats'));
  show('admBtnResetWeekly', hasPerm('weekly_reset'));
  show('admBtnAnnounce', hasPerm('announce'));
  show('admBtnSearchUser', isStaff());
  const auditWrap = $('auditLogList');
  if(auditWrap && auditWrap.previousElementSibling){
    // hide audit section title+list if no perm
  }
  if(!hasPerm('audit') && $('auditLogList')){
    $('auditLogList').innerHTML = '';
  }

  try{
    const [uRes, tRes, rRes, bRes, dRes, wRes] = await Promise.all([
      sb.from('users').select('*',{count:'exact',head:true}),
      sb.from('support_tickets').select('*',{count:'exact',head:true}).in('status',['open','active']),
      sb.from('reports').select('*',{count:'exact',head:true}).eq('status','open'),
      sb.from('users').select('*',{count:'exact',head:true}).eq('banned',true),
      sb.from('devices').select('*',{count:'exact',head:true}),
      sb.from('users').select('*',{count:'exact',head:true}).gt('weekly_wins',0)
    ]);
    $('admUsers').textContent = uRes.count ?? '—';
    $('admTickets').textContent = tRes.count ?? '—';
    $('admReports').textContent = rRes.count ?? '—';
    $('admBanned').textContent = bRes.count ?? '—';
    const extra = $('adminExtraStats');
    if(extra){
      const { data: meta } = await sb.from('app_meta').select('value').eq('key','weekly_week_key').maybeSingle();
      extra.innerHTML = `<div class="admin-stat"><b>${dRes.count ?? '—'}</b><span>Devices</span></div>
        <div class="admin-stat"><b>${wRes.count ?? '—'}</b><span>Active this week</span></div>
        <div class="admin-stat" style="grid-column:1/-1;"><b style="font-size:14px;">${escapeHtml(meta?.value||getIsoWeekKey())}</b><span>Week key (auto-reset)</span></div>`;
    }
  }catch(e){}
  const list = $('adminRecentUsers');
  list.innerHTML = inlineLoadingHtml('Loading');
  const { data: recent } = await sb.from('users').select('id,username,avatar_url,xp,level,level_xp,level_xp_needed,total_wins,total_guesses,weekly_wins,weekly_guesses,best_streak,current_streak,crowns,tik,is_admin,is_owner,last_online,banned,ban_type,achievements,display_badges,duel_wins,duel_losses,mode_stats').order('last_online',{ascending:false}).limit(40);
  list.innerHTML = '';
  (recent||[]).forEach((u,idx)=>{
    const row = document.createElement('div');
    row.className = 'lb-row';
    const online = isOnline(u.last_online);
    row.innerHTML = `
      <div class="avatar sm" id="admAv${idx}"></div>
      <div class="lb-name">
        <div class="u">${usernameWithTik(u)} ${u.is_owner?'<span class="owner-badge">✦ Boss</span>':(u.is_admin?'<span class="admin-badge">Staff</span>':'')} ${u.banned?'🚫':''}</div>
        <div style="font-size:10px;color:var(--text-dim);">${online?'Online':fmtDate(u.last_online)} · ${u.weekly_wins||0} week wins</div>
      </div>
      <div class="lb-stats">${u.total_wins} wins<br>Lv ${u.level}</div>`;
    row.onclick = ()=> openUserModal(u);
    list.appendChild(row);
    renderAvatar(row.querySelector(`#admAv${idx}`), u);
  });
  loadAuditLog();
}
$('admBtnTickets').onclick = ()=> openSupportList('admin');
$('admBtnReports').onclick = ()=> openReportsList();
$('admBtnChats').onclick = ()=> openAdminAllChats();
$('admBtnResetWeekly').onclick = async ()=>{
  if(!hasPerm('weekly_reset')){ toast('No permission'); return; }
  if(!(await askConfirm('Reset weekly','Award 🏆 to current #1 and reset ONLY weekly wins/guesses for everyone?'))) return;
  try{
    const res = await runWeeklyReset(true); // force
    if(res && res.reset){
      await writeAudit('weekly_reset', { details: { champion: res.champion || null, week_key: res.week_key || null, force: true } });
      if(res.champion || res.clan_champion){
        let msg = 'Week reset';
        if(res.champion) msg += ' · 🏆 @' + res.champion;
        if(res.clan_champion) msg += ' · 🏅 ' + res.clan_champion;
        toast(msg);
      } else toast('Weekly stats reset (no champion)');
    } else {
      toast(res && res.error ? res.error : 'Reset finished');
    }
    // refresh self
    if(CURRENT_USER){
      const { data: fresh } = await sb.from('users').select('*').eq('id', CURRENT_USER.id).maybeSingle();
      if(fresh){ CURRENT_USER = fresh; refreshGameUI(); refreshProfileUI(); }
    }
    loadAdminDash();
  }catch(e){ toast(e.message||'Reset failed'); }
};
$('admBtnAnnounce').onclick = ()=>{ if(!hasPerm('announce')){ toast('No permission'); return; } $('announceModal').classList.remove('hidden'); };
$('closeAnnounce').onclick = ()=> $('announceModal').classList.add('hidden');
$('annSubmit').onclick = async ()=>{
  const title = $('annTitle').value.trim();
  const body = $('annBody').value.trim();
  if(!title||!body){ toast('Fill title and body'); return; }
  // Remove previous announcements from database
  await sb.from('announcements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error } = await sb.from('announcements').insert({
    title, body, active:true, created_by: CURRENT_USER.id
  });
  if(error){ toast(error.message||'Failed'); return; }
  await writeAudit('announce', { details: { title } });
  toast('Announcement published');
  $('announceModal').classList.add('hidden');
  loadAnnouncement();
};
$('admBtnSearchUser').onclick = async ()=>{
  const name = prompt('Username to find:');
  if(!name) return;
  const { data } = await sb.from('users').select('*').ilike('username', `%${name.trim()}%`).limit(5);
  if(!data||!data.length){ toast('Not found'); return; }
  openUserModal(data[0]);
};

async function loadAnnouncement(){
  const banner = $('annBanner');
  if(!banner) return;
  try{
    const { data } = await sb.from('announcements').select('*').eq('active', true).order('created_at',{ascending:false}).limit(1);
    if(data && data[0]){
      banner.classList.remove('hidden');
      banner.innerHTML = `<strong>${escapeHtml(data[0].title)}</strong> — ${escapeHtml(data[0].body)}`;
    } else banner.classList.add('hidden');
  }catch(e){ banner.classList.add('hidden'); }
}

/* ---------- THEME (dark / light) ---------- */
function getSavedTheme(){
  try{ return localStorage.getItem('gz_theme') || 'dark'; }catch(e){ return 'dark'; }
}
function applyTheme(theme){
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('gz_theme', t); }catch(e){}
    const moon = '<span class="top-ic"><svg viewBox="0 0 24 24"><path d="M21 14.5A8.5 8.5 0 1110 3a7 7 0 0011 11.5z"/></svg></span>';
  const sun = '<span class="top-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></span>';
  const b1 = $('themeToggleBtn');
  if(b1) b1.innerHTML = (t === 'light' ? moon : sun);
  const b2 = $('themeToggleBtn2');
  if(b2) b2.textContent = (t==='light'?'Switch to dark theme':'Switch to light theme');
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'light' ? 'dark' : 'light');
}
applyTheme(getSavedTheme());
document.addEventListener('DOMContentLoaded', ()=>{
  applyTheme(getSavedTheme());
});
setTimeout(()=>{
  const b1 = $('themeToggleBtn'); if(b1) b1.onclick = toggleTheme;
  const b2 = $('themeToggleBtn2'); if(b2) b2.onclick = toggleTheme;
}, 0);

/* ---------- CLANS ---------- */
const CLAN_COLORS = ['#1d9bf0','#00ba7c','#f4212e','#a855f7','#f7c948','#ff8c42','#ec4899','#14b8a6','#6366f1','#84cc16'];

function normalizeClanTag(t){
  return String(t||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
}
function validateClanName(n){
  n = String(n||'').trim();
  if(n.length < 3 || n.length > 24) return 'Name must be 3–24 characters';
  if(!/^[a-zA-Z0-9 _\-]+$/.test(n)) return 'Name: letters, numbers, space, - _ only';
  return null;
}
function normalizeHexColor(v){
  let s = String(v||'').trim().replace(/\s+/g,'');
  if(!s) return null;
  if(s[0] !== '#') s = '#' + s;
  // #RGB -> #RRGGBB
  if(/^#[0-9a-fA-F]{3}$/.test(s)){
    s = '#' + s[1]+s[1]+s[2]+s[2]+s[3]+s[3];
  }
  // #RRGGBB
  if(/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  // #RRGGBBAA optional strip alpha
  if(/^#[0-9a-fA-F]{8}$/.test(s)) return s.slice(0,7).toLowerCase();
  return null;
}

/* ---------- Clan ranks & history ---------- */
const DEFAULT_RANKS = {
  "1": { title: "Recruit", color: "#8b98a5", perms: { invite:false, kick:false, edit:false, manage_ranks:false, accept_requests:false } },
  "2": { title: "Member", color: "#8b98a5", perms: { invite:false, kick:false, edit:false, manage_ranks:false, accept_requests:false } },
  "3": { title: "Veteran", color: "#34d399", perms: { invite:false, kick:false, edit:false, manage_ranks:false, accept_requests:true } },
  "4": { title: "Officer", color: "#60a5fa", perms: { invite:true, kick:true, edit:false, manage_ranks:false, accept_requests:true } },
  "5": { title: "Co-Leader", color: "#a78bfa", perms: { invite:true, kick:true, edit:true, manage_ranks:false, accept_requests:true } },
  "6": { title: "Leader", color: "#f7c948", perms: { invite:true, kick:true, edit:true, manage_ranks:true, accept_requests:true } }
};
function getClanRanksConfig(clan){
  const cfg = (clan && clan.ranks_config) ? clan.ranks_config : DEFAULT_RANKS;
  const out = {};
  for(let i=1;i<=6;i++){
    const k = String(i);
    const base = DEFAULT_RANKS[k];
    const custom = cfg[k] || {};
    out[k] = {
      title: (custom.title && String(custom.title).trim()) || base.title,
      color: normalizeHexColor(custom.color) || base.color,
      perms: Object.assign({}, base.perms, custom.perms || {})
    };
  }
  // Rank 6 always full power
  out["6"].perms = { invite:true, kick:true, edit:true, manage_ranks:true, accept_requests:true };
  return out;
}
function memberRank(mem){
  if(!mem) return 2;
  if(mem.rank != null && mem.rank >= 1) return Math.min(6, Math.max(1, Number(mem.rank)||2));
  if(mem.role === 'leader') return 6;
  if(mem.role === 'officer') return 5;
  return 2;
}
function myClanPerm(key){
  if(!MY_CLAN || !MY_CLAN.clan) return false;
  const r = memberRank(MY_CLAN);
  const cfg = getClanRanksConfig(MY_CLAN.clan);
  const info = cfg[String(r)] || DEFAULT_RANKS["2"];
  if(r >= 6) return true;
  return !!(info.perms && info.perms[key]);
}
function rankTitle(clan, rank){
  const cfg = getClanRanksConfig(clan);
  const info = cfg[String(rank)] || DEFAULT_RANKS["2"];
  return info.title || ('Rank '+rank);
}
function rankColor(clan, rank){
  const cfg = getClanRanksConfig(clan);
  const info = cfg[String(rank)] || DEFAULT_RANKS["2"];
  return info.color || '#8b98a5';
}
async function logClanHistory(clanId, action, opts){
  opts = opts || {};
  if(!sb || !clanId) return;
  try{
    await sb.from('clan_history').insert({
      clan_id: clanId,
      actor_id: CURRENT_USER ? CURRENT_USER.id : null,
      actor_username: CURRENT_USER ? CURRENT_USER.username : null,
      action: action,
      target_user_id: opts.target_user_id || null,
      target_username: opts.target_username || null,
      details: opts.details || {}
    });
  }catch(e){ console.warn('clan history', e); }
}
async function loadClanHistory(clanId, limit){
  limit = limit || 40;
  const { data, error } = await sb.from('clan_history').select('*').eq('clan_id', clanId).order('created_at',{ascending:false}).limit(limit);
  if(error) return [];
  return data || [];
}
function formatClanHistoryRow(h){
  const who = h.actor_username ? '@'+h.actor_username : 'Someone';
  const tgt = h.target_username ? '@'+h.target_username : '';
  const map = {
    create: who+' created the clan',
    join: (tgt||who)+' joined the clan',
    leave: (tgt||who)+' left the clan',
    kick: who+' kicked '+tgt,
    invite: who+' invited '+tgt,
    accept_request: who+' accepted '+tgt,
    reject_request: who+' rejected '+tgt,
    cancel_request: who+' cancelled request for '+tgt,
    edit_clan: who+' edited clan details',
    edit_ranks: who+' updated rank titles/perms',
    set_rank: who+' set '+tgt+' to rank '+(h.details && h.details.rank != null ? h.details.rank : '?'),
    transfer: who+' transferred leadership to '+tgt,
    disband: who+' disbanded the clan'
  };
  return map[h.action] || (who+' · '+h.action);
}

function canCreateClan(u){
  u = u || CURRENT_USER;
  if(!u) return false;
  const lvl = Number(u.level||1);
  const xp = Number(u.xp||0);
  return lvl >= 5 && xp >= 50;
}
function validateClanTag(t){
  t = normalizeClanTag(t);
  if(t.length < 2 || t.length > 5) return 'Tag must be 2–5 alphanumeric';
  return null;
}

async function loadMyClan(force){
  if(!CURRENT_USER || !sb){ return MY_CLAN; }
  try{
    const { data: mem, error: memErr } = await sb.from('clan_members').select('*').eq('user_id', CURRENT_USER.id).maybeSingle();
    // Network / RLS error → keep previous clan state (prevents tag flicker)
    if(memErr){
      console.warn('loadMyClan mem', memErr);
      return MY_CLAN;
    }
    if(!mem){
      MY_CLAN = null;
      CLAN_CACHE[CURRENT_USER.id] = null;
      CURRENT_USER.clan_tag = null;
      CURRENT_USER.clan_color = null;
      CURRENT_USER.clan_id = null;
      CURRENT_USER.clan_name = null;
      CURRENT_USER.clan_role = null;
      try{ refreshNameDisplays(); }catch(e){}
      return null;
    }
    const { data: clan, error: clanErr } = await sb.from('clans').select('*').eq('id', mem.clan_id).maybeSingle();
    if(clanErr){
      console.warn('loadMyClan clan', clanErr);
      return MY_CLAN;
    }
    if(!clan){
      MY_CLAN = null;
      CLAN_CACHE[CURRENT_USER.id] = null;
      CURRENT_USER.clan_tag = null;
      CURRENT_USER.clan_color = null;
      CURRENT_USER.clan_id = null;
      CURRENT_USER.clan_name = null;
      try{ refreshNameDisplays(); }catch(e){}
      return null;
    }
    MY_CLAN = { clan, role: mem.role, rank: memberRank(mem), member_id: mem.id };
    mem.rank = memberRank(mem);
    CLAN_CACHE[CURRENT_USER.id] = { id: clan.id, tag: clan.tag, color: clan.color, name: clan.name };
    CURRENT_USER.clan_tag = clan.tag;
    CURRENT_USER.clan_color = clan.color;
    CURRENT_USER.clan_id = clan.id;
    CURRENT_USER.clan_name = clan.name;
    CURRENT_USER.clan_role = mem.role;
    try{ refreshNameDisplays(); }catch(e){}
    return MY_CLAN;
  }catch(e){
    // Never wipe clan on transient errors — keeps [TAG] stable
    console.warn('loadMyClan', e);
    return MY_CLAN;
  }
}

/** Re-paint username + clan tag everywhere after MY_CLAN loads */
function refreshNameDisplays(){
  try{
    if(!CURRENT_USER) return;
    attachClanToUser(CURRENT_USER);
    const u = CURRENT_USER;
    if($('gameUname')) $('gameUname').innerHTML = usernameWithTik(u);
    if($('topbarUser')){
      const tag = u.clan_tag ? ('['+String(u.clan_tag).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5)+']') : '';
      $('topbarUser').textContent = '@' + tag + (u.username||'');
    }
    const pu = $('profUname');
    if(pu){
      pu.innerHTML = usernameWithTik(u) + (truthyFlag(u.is_owner) ? ' <span class="owner-badge">✦ Boss</span>' : (truthyFlag(u.is_admin) ? ' <span class="admin-badge">Staff</span>' : ''));
    }
  }catch(e){}
}

async function fetchClanForUsers(userIds){
  if(!sb || !userIds || !userIds.length) return;
  const missing = userIds.filter(id => id && !(id in CLAN_CACHE));
  if(!missing.length) return;
  try{
    const { data: mems } = await sb.from('clan_members').select('user_id,clan_id').in('user_id', missing);
    if(!mems || !mems.length){
      missing.forEach(id => { CLAN_CACHE[id] = null; });
      return;
    }
    const clanIds = [...new Set(mems.map(m=>m.clan_id))];
    const { data: clans } = await sb.from('clans').select('id,tag,color,name').in('id', clanIds);
    const cmap = {};
    (clans||[]).forEach(c => { cmap[c.id] = c; });
    const umap = {};
    mems.forEach(m => { umap[m.user_id] = cmap[m.clan_id] || null; });
    missing.forEach(id => {
      const c = umap[id];
      CLAN_CACHE[id] = c ? { id:c.id, tag:c.tag, color:c.color, name:c.name } : null;
    });
  }catch(e){ console.warn('fetchClanForUsers', e); }
}

function attachClanToUser(u){
  if(!u || !u.id) return u;
  let c = CLAN_CACHE[u.id];
  // Prefer live MY_CLAN for self (stable, avoids flicker while cache is empty)
  if(CURRENT_USER && u.id === CURRENT_USER.id && MY_CLAN && MY_CLAN.clan){
    const mc = MY_CLAN.clan;
    c = { id: mc.id, tag: mc.tag, color: mc.color, name: mc.name };
    CLAN_CACHE[u.id] = c;
  }
  if(c){
    u.clan_tag = c.tag; u.clan_color = c.color; u.clan_id = c.id; u.clan_name = c.name;
  } else if(c === null){
    // Only clear when we positively know there is no clan
    u.clan_tag = null; u.clan_color = null; u.clan_id = null; u.clan_name = null;
  }
  // if c === undefined → leave existing u.clan_* untouched
  return u;
}

async function refreshClanProfileUI(){
  const box = $('clanProfileBox');
  if(!box){
    // profile section removed — keep MY_CLAN in sync for Clans tab
    try{ await loadMyClan(false); }catch(e){}
    return;
  }
  if(!CURRENT_USER){ box.innerHTML = '<div class="empty-note">Log in first</div>'; return; }
  box.innerHTML = inlineLoadingHtml('Loading clan');
  await loadMyClan(true);
  if(!MY_CLAN){
    box.innerHTML = `<div style="font-size:13px;color:var(--text-dim);line-height:1.6;">
      You are not in a clan.<br>Create one or browse and request to join.<br>
      <span style="font-size:11px;">Max one clan per account. Leader can kick members, transfer ownership, or disband.</span>
    </div>`;
    if($('clanCreateBtn')) $('clanCreateBtn').style.display = '';
    return;
  }
  const c = MY_CLAN.clan;
  const role = MY_CLAN.role;
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <span class="clan-tag" style="background:${escapeHtml(c.color)};font-size:13px;padding:4px 10px;">${escapeHtml(c.tag)}</span>
      <div>
        <div style="font-weight:800;font-size:15px;">${escapeHtml(c.name)}</div>
        <div style="font-size:11px;color:var(--text-dim);">${escapeHtml(role)} · ${c.member_count||'?'} / ${c.max_members} · ${c.is_open?'Open':'Invite'}</div>
      </div>
    </div>
    <div class="clan-stat-row">
      <span class="clan-stat-pill">Lv <b>${c.level||1}</b></span>
      <span class="clan-stat-pill"><b>${c.level_xp||0}</b>/${c.level_xp_needed||100} XP</span>
      <span class="clan-stat-pill"><b>${(c.xp||0).toLocaleString()}</b> total</span>
      <span class="clan-stat-pill"><b>${c.weekly_points||0}</b> week</span>
      <span class="clan-stat-pill"><b>${c.glory||0}</b> 🏅</span>
    </div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:6px;">${escapeHtml(c.description||'')}</div>`;
  if($('clanCreateBtn')) $('clanCreateBtn').style.display = 'none';
}

function openClanCreate(edit){
  if(!CURRENT_USER){ toast('Log in first'); return; }
  if(!edit && MY_CLAN){ toast('Leave your clan first to create a new one'); return; }
  if(!edit && !canCreateClan()){ toast('Need Level 5 and 50 XP to create a clan'); return; }
  $('clanCreateTitle').textContent = edit ? 'Edit clan' : 'Create clan';
  if(edit && MY_CLAN){
    const c = MY_CLAN.clan;
    $('clanNameInput').value = c.name;
    $('clanTagInput').value = c.tag;
    const col = normalizeHexColor(c.color) || '#1d9bf0';
    $('clanColorInput').value = col;
    if($('clanColorHex')) $('clanColorHex').value = col;
    $('clanDescInput').value = c.description || '';
    $('clanOpenCheck').checked = !!c.is_open;
    updateClanColorPreview();
    $('clanCreateSubmit').textContent = 'Save changes';
    $('clanCreateSubmit').dataset.mode = 'edit';
  } else {
    $('clanNameInput').value = '';
    $('clanTagInput').value = '';
    $('clanColorInput').value = '#1d9bf0';
    if($('clanColorHex')) $('clanColorHex').value = '#1d9bf0';
    $('clanDescInput').value = '';
    $('clanOpenCheck').checked = false;
    updateClanColorPreview();
    $('clanCreateSubmit').textContent = 'Create';
    $('clanCreateSubmit').dataset.mode = 'create';
  }
  $('clanCreateModal').classList.remove('hidden');
}
function closeClanCreate(){ $('clanCreateModal').classList.add('hidden'); }

function updateClanColorPreview(){
  const col = normalizeHexColor(($('clanColorHex') && $('clanColorHex').value) || ($('clanColorInput') && $('clanColorInput').value) || '#1d9bf0') || '#1d9bf0';
  const t = normalizeClanTag(($('clanTagInput') && $('clanTagInput').value) || '') || 'TAG';
  const n = (($('clanNameInput') && $('clanNameInput').value) || 'Name').trim() || 'Name';
  const prev = $('clanColorPreview');
  if(prev){
    prev.style.color = col;
    prev.style.background = 'transparent';
    prev.textContent = '[' + t + ']' + n;
  }
  if($('clanColorInput')) $('clanColorInput').value = col;
  if($('clanColorHex')) $('clanColorHex').value = col;
}
if($('clanColorInput')) $('clanColorInput').oninput = ()=>{
  if($('clanColorHex')) $('clanColorHex').value = $('clanColorInput').value;
  updateClanColorPreview();
};
if($('clanColorHex')){
  $('clanColorHex').oninput = ()=>{
    // allow free typing of any hex-like text
    let raw = ($('clanColorHex').value || '').trim();
    const n = normalizeHexColor(raw);
    if(n){
      if($('clanColorInput')) $('clanColorInput').value = n;
      updateClanColorPreview();
    } else {
      // still update preview text with typed value color attempt
      const prev = $('clanColorPreview');
      const t = normalizeClanTag(($('clanTagInput')&&$('clanTagInput').value)||'') || 'TAG';
      const name = (($('clanNameInput')&&$('clanNameInput').value)||'Name').trim() || 'Name';
      if(prev){ prev.textContent = '['+t+']'+name; }
    }
  };
  $('clanColorHex').onblur = ()=>{
    const n = normalizeHexColor($('clanColorHex').value);
    if(!n){
      toast('Use hex like #000 or #1d9bf0');
      const fallback = normalizeHexColor(($('clanColorInput')&&$('clanColorInput').value)||'#1d9bf0') || '#1d9bf0';
      $('clanColorHex').value = fallback;
      if($('clanColorInput')) $('clanColorInput').value = fallback;
    } else {
      $('clanColorHex').value = n;
      if($('clanColorInput')) $('clanColorInput').value = n;
    }
    updateClanColorPreview();
  };
}
if($('clanTagInput')) $('clanTagInput').oninput = ()=> updateClanColorPreview();
if($('clanNameInput')) $('clanNameInput').oninput = ()=> updateClanColorPreview();

async function submitClanCreate(){
  if(!CURRENT_USER) return;
  const name = $('clanNameInput').value.trim();
  const tag = normalizeClanTag($('clanTagInput').value);
  const color = normalizeHexColor(($('clanColorHex')&&$('clanColorHex').value) || ($('clanColorInput')&&$('clanColorInput').value) || '#1d9bf0');
  if(!color){ toast('Invalid color hex e.g. #ff0000'); return; }
  const description = ($('clanDescInput').value||'').trim().slice(0,200);
  const is_open = !!$('clanOpenCheck').checked;
  const errN = validateClanName(name); if(errN){ toast(errN); return; }
  const errT = validateClanTag(tag); if(errT){ toast(errT); return; }
  const mode = $('clanCreateSubmit').dataset.mode || 'create';
  $('clanCreateSubmit').disabled = true;
  try{
    if(mode === 'edit'){
      if(!MY_CLAN || !myClanPerm('edit')){ toast('No permission to edit clan'); return; }
      const { error } = await sb.from('clans').update({
        name, tag, color, description, is_open, updated_at: new Date().toISOString()
      }).eq('id', MY_CLAN.clan.id);
      if(error){
        if(error.code==='23505') toast('Name or tag already taken');
        else toast(error.message||'Failed');
        return;
      }
      await logClanHistory(MY_CLAN.clan.id, 'edit_clan', { details: { name, tag, color } });
      toast('Clan updated');
      await loadMyClan(true);
      try{ refreshGameUI(); }catch(e){}
      closeClanCreate();
      if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
      return;
    }
    // create
    if(MY_CLAN){ toast('Already in a clan'); return; }
    const { data: clan, error } = await sb.from('clans').insert({
      name, tag, color, description, is_open, leader_id: CURRENT_USER.id, member_count: 1,
      ranks_config: DEFAULT_RANKS
    }).select().single();
    if(error){
      if(error.code==='23505') toast('Name or tag already taken');
      else toast(error.message||'Failed');
      return;
    }
    const { error: e2 } = await sb.from('clan_members').insert({
      clan_id: clan.id, user_id: CURRENT_USER.id, role: 'leader', rank: 6
    });
    await logClanHistory(clan.id, 'create', { details: { name, tag } });
    if(e2){
      await sb.from('clans').delete().eq('id', clan.id);
      toast(e2.message||'Failed to join as leader');
      return;
    }
    toast('Clan created!');
    await loadMyClan(true);
    try{ refreshGameUI(); }catch(e){}
    closeClanCreate();
    if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
    else goPage('clans');
  }catch(e){ toast(e.message||'Error'); }
  finally{ $('clanCreateSubmit').disabled = false; }
}

async function openClanBrowse(){
  $('clanBrowseModal').classList.remove('hidden');
  await loadClanBrowse();
}
function closeClanBrowse(){ $('clanBrowseModal').classList.add('hidden'); }

async function loadClanBrowse(){
  const list = $('clanBrowseList');
  if(!list) return;
  list.innerHTML = inlineLoadingHtml('Loading');
  const q = ($('clanSearchInput')&&$('clanSearchInput').value||'').trim();
  let query = sb.from('clans').select('*').order('member_count',{ascending:false}).limit(50);
  if(q) query = query.or(`name.ilike.%${q}%,tag.ilike.%${q}%`);
  const { data, error } = await query;
  if(error || !data){ list.innerHTML = '<div class="empty-note">Error loading</div>'; return; }
  if(!data.length){ list.innerHTML = '<div class="empty-note">No clans found</div>'; return; }
  list.innerHTML = '';
  data.forEach(c=>{
    const full = (c.member_count||0) >= (c.max_members||12);
    const row = document.createElement('div');
    row.className = 'support-ticket-row';
    row.innerHTML = `<div class="t-title"><span class="clan-tag" style="background:${escapeHtml(c.color)};">${escapeHtml(c.tag)}</span> ${escapeHtml(c.name)}
      <span style="font-size:11px;color:var(--text-dim);font-weight:500;"> ${c.member_count}/${c.max_members}</span></div>
      <div class="t-meta">${c.is_open?'Open join':'Request to join'} · ${escapeHtml((c.description||'').slice(0,60))}</div>`;
    row.onclick = ()=> joinOrRequestClan(c);
    list.appendChild(row);
  });
}
if($('clanSearchInput')){
  let tmr=null;
  $('clanSearchInput').oninput = ()=>{ clearTimeout(tmr); tmr=setTimeout(loadClanBrowse, 280); };
}

async function joinOrRequestClan(clan){
  if(!CURRENT_USER){ toast('Log in first'); return; }
  await loadMyClan();
  if(MY_CLAN){ toast('Leave your current clan first'); return; }
  if((clan.member_count||0) >= (clan.max_members||12)){ toast('Clan is full'); return; }
  if(clan.is_open){
    if(!(await askConfirm('Join clan', 'Join '+clan.name+' ['+clan.tag+']?'))) return;
    const { error } = await sb.from('clan_members').insert({
      clan_id: clan.id, user_id: CURRENT_USER.id, role: 'member', rank: 2
    });
    if(error){ toast(error.message||'Failed (maybe already in a clan)'); return; }
    await logClanHistory(clan.id, 'join', { target_user_id: CURRENT_USER.id, target_username: CURRENT_USER.username });
    toast('Joined '+clan.name);
    closeClanBrowse();
    await loadMyClan(true);
    refreshClanProfileUI(); refreshGameUI(); refreshProfileUI();
    return;
  }
  // request
  const msg = prompt('Optional message to leader:') || '';
  const { data: existing } = await sb.from('clan_join_requests').select('id,status')
    .eq('clan_id', clan.id).eq('user_id', CURRENT_USER.id).eq('status','pending').maybeSingle();
  if(existing){ toast('You already have a pending request'); return; }
  const { data: req, error } = await sb.from('clan_join_requests').insert({
    clan_id: clan.id, user_id: CURRENT_USER.id, message: msg.slice(0,200), status:'pending'
  }).select().single();
  if(error){ toast(error.message||'Failed'); return; }
  // Notify leader + officers
  try{
    const { data: staff } = await sb.from('clan_members').select('user_id,role,rank').eq('clan_id', clan.id);
    for(const s of (staff||[])){
      const rk = memberRank(s);
      if(rk < 3 && rk !== 6) continue; // veteran+ or check on receive
      await pushNotification(s.user_id, 'clan_request', 'Clan join request',
        '@'+CURRENT_USER.username+' wants to join '+clan.name,
        { request_id: req.id, clan_id: clan.id, from_user_id: CURRENT_USER.id });
    }
  }catch(e){}
  toast('Join request sent — leaders will see it in Notifications');
}

async function openClanManage(){
  await loadMyClan(true);
  if(!MY_CLAN){ toast('You are not in a clan'); return; }
  $('clanManageTitle').textContent = MY_CLAN.clan.name + ' [' + MY_CLAN.clan.tag + ']';
  $('clanManageModal').classList.remove('hidden');
  await renderClanManage();
}
function closeClanManage(){ $('clanManageModal').classList.add('hidden'); }

async function renderClanManage(){
  const body = $('clanManageBody');
  if(!body || !MY_CLAN) return;
  body.innerHTML = inlineLoadingHtml('Loading');
  await loadMyClan(true);
  if(!MY_CLAN){ body.innerHTML = '<div class="empty-note">Not in a clan</div>'; return; }
  const clan = MY_CLAN.clan;
  const myRank = memberRank(MY_CLAN);
  const ranksCfg = getClanRanksConfig(clan);
  const canKick = myClanPerm('kick');
  const canInvite = myClanPerm('invite');
  const canEdit = myClanPerm('edit');
  const canRanks = myClanPerm('manage_ranks');
  const canAccept = myClanPerm('accept_requests');
  const isLeader = myRank >= 6;

  const { data: members } = await sb.from('clan_members').select('*').eq('clan_id', clan.id).order('rank',{ascending:false}).order('joined_at',{ascending:true});
  const uids = (members||[]).map(m=>m.user_id);
  let users = [];
  if(uids.length){
    const { data } = await sb.from('users').select('id,username,tik,avatar_url,level,last_online').in('id', uids);
    users = data || [];
  }
  const umap = {}; users.forEach(u=>umap[u.id]=u);
  const history = await loadClanHistory(clan.id, 30);

  let html = `<div class="clan-detail-hero" style="text-align:left;padding-bottom:12px;">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="color:${escapeHtml(clan.color)};font-weight:900;font-size:16px;">[${escapeHtml(String(clan.tag||'').toUpperCase())}]</span>
      <div style="flex:1;min-width:120px;">
        <div style="font-weight:800;font-size:17px;color:${escapeHtml(clan.color)};">${escapeHtml(clan.name)}</div>
        <div style="font-size:11px;color:var(--text-dim);">${clan.is_open?'Open':'Invite only'} · Your rank: <b style="color:${escapeHtml(rankColor(clan,myRank))}">${myRank} · ${escapeHtml(rankTitle(clan,myRank))}</b></div>
      </div>
    </div>
    <div class="clan-stat-row" style="justify-content:flex-start;margin-top:10px;">
      <span class="clan-stat-pill">Lv <b>${clan.level||1}</b></span>
      <span class="clan-stat-pill"><b>${clan.level_xp||0}</b>/${clan.level_xp_needed||100}</span>
      <span class="clan-stat-pill"><b>${(clan.xp||0).toLocaleString()}</b> XP</span>
      <span class="clan-stat-pill"><b>${clan.weekly_points||0}</b> week</span>
      <span class="clan-stat-pill"><b>${clan.glory||0}</b> 🏅</span>
      <span class="clan-stat-pill">${clan.member_count||0}/${clan.max_members||12}</span>
    </div>
    ${clan.description?`<div style="font-size:12px;color:var(--text-dim);margin-top:8px;line-height:1.5;">${escapeHtml(clan.description)}</div>`:''}
  </div>`;

  if(inThis){
    const permissionNames=[];
    if(myClanPerm('invite')) permissionNames.push('Invite');
    if(myClanPerm('kick')) permissionNames.push('Kick');
    if(myClanPerm('accept_requests')) permissionNames.push('Requests');
    if(myClanPerm('edit')) permissionNames.push('Edit clan');
    if(myClanPerm('manage_ranks')) permissionNames.push('Ranks');
    html += `<div class="clan-permission-card">
      <div class="clan-permission-head"><span class="ic-svg"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg></span><b>Your access</b><span class="clan-rank-chip" style="color:${escapeHtml(rankColor(c,myRank))}">R${myRank} · ${escapeHtml(rankTitle(c,myRank))}</span></div>
      <div class="clan-permission-list">${permissionNames.length ? permissionNames.map(x=>`<span>${escapeHtml(x)}</span>`).join('') : '<span>Member access</span>'}</div>
    </div>`;
  } else if(isStaff()){
    html += `<div class="clan-permission-card admin"><div class="clan-permission-head"><span class="ic-svg"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z"/><path d="M8 12h8M12 8v8"/></svg></span><b>Admin view</b><span class="clan-rank-chip">Staff</span></div><div class="clan-permission-list"><span>Clan moderation</span><span>Disband control</span></div></div>`;
  }

  html += `<div class="section-title" style="border:none;padding:0 0 6px;margin:0;font-size:14px;">Members (${(members||[]).length})</div><div class="clan-members-scroll">`;
  (members||[]).forEach(m=>{
    const u = umap[m.user_id] || {username:'?'};
    const rk = memberRank(m);
    const rTitle = rankTitle(clan, rk);
    const rCol = rankColor(clan, rk);
    const canKickThis = canKick && rk < 6 && m.user_id !== CURRENT_USER.id && (isLeader || rk < myRank);
    const canSetRank = isLeader && m.user_id !== CURRENT_USER.id && rk < 6;
    html += `<div class="clan-member-row">
      <div class="avatar sm" id="cmAv-${m.user_id}" style="width:28px;height:28px;font-size:11px;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;">@${escapeHtml(u.username)}</div>
        <div style="font-size:10px;color:var(--text-dim);">Lv ${u.level||1} · <span style="color:${escapeHtml(rCol)};font-weight:800;">R${rk} ${escapeHtml(rTitle)}</span></div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
        ${canSetRank?`<select data-act="setrank" data-uid="${m.user_id}" data-uname="${escapeHtml(u.username)}" style="font-size:11px;padding:3px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);max-width:90px;">
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${rk===n?'selected':''}>R${n}</option>`).join('')}
        </select>`:''}
        ${canKickThis?`<button data-act="kick" data-uid="${m.user_id}" data-uname="${escapeHtml(u.username)}" style="font-size:10px;padding:4px 7px;border-radius:8px;border:none;background:var(--red);color:#fff;">Kick</button>`:''}
      </div>
    </div>`;
  });
  html += `</div>`;

  if(canAccept){
    const { data: reqs } = await sb.from('clan_join_requests').select('*').eq('clan_id', clan.id).eq('status','pending').order('created_at',{ascending:true});
    html += `<div class="section-title" style="border:none;padding:12px 0 6px;margin:0;font-size:14px;">Join requests (${(reqs||[]).length})</div>`;
    if(!reqs || !reqs.length) html += `<div style="font-size:12px;color:var(--text-dim);">No pending requests</div>`;
    else {
      const rids = reqs.map(r=>r.user_id);
      const { data: rus } = await sb.from('users').select('id,username,level').in('id', rids);
      const rmap = {}; (rus||[]).forEach(u=>rmap[u.id]=u);
      reqs.forEach(r=>{
        const u = rmap[r.user_id]||{username:'?'};
        html += `<div class="clan-req-row">
          <div style="font-weight:700;">@${escapeHtml(u.username)} <span style="font-size:11px;color:var(--text-dim);">Lv ${u.level||1}</span></div>
          <div style="font-size:11px;color:var(--text-dim);margin:4px 0;">${escapeHtml(r.message||'No message')}</div>
          <div style="display:flex;gap:6px;">
            <button data-act="accept" data-rid="${r.id}" data-uid="${r.user_id}" style="flex:1;padding:7px;border-radius:8px;border:none;background:var(--green);color:#fff;font-weight:700;font-size:12px;">Accept</button>
            <button data-act="reject" data-rid="${r.id}" style="flex:1;padding:7px;border-radius:8px;border:none;background:var(--red);color:#fff;font-weight:700;font-size:12px;">Reject</button>
          </div>
        </div>`;
      });
    }
  }

  // History
  html += `<div class="section-title" style="border:none;padding:12px 0 6px;margin:0;font-size:14px;">Clan history</div>
    <div class="clan-members-scroll" style="max-height:160px;">`;
  if(!history.length) html += `<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">No history yet</div>`;
  history.forEach(h=>{
    html += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;line-height:1.4;">
      <div>${escapeHtml(formatClanHistoryRow(h))}</div>
      <div style="color:var(--text-dim);">${fmtDate(h.created_at)}</div>
    </div>`;
  });
  html += `</div>`;

  // Rank editor (leader)
  if(canRanks){
    html += `<div class="section-title" style="border:none;padding:12px 0 6px;margin:0;font-size:14px;">Ranks setup (1–5)</div>
      <p style="font-size:11px;color:var(--text-dim);margin:0 0 8px;">Rank 6 is Leader (fixed). Set title, color & permissions for ranks 1–5.</p>
      <div id="rankEditBox">`;
    for(let n=1;n<=5;n++){
      const info = ranksCfg[String(n)];
      const perms = info.perms || {};
      html += `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;">
        <div style="font-weight:800;margin-bottom:6px;">Rank ${n}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <input data-rank-title="${n}" value="${escapeHtml(info.title)}" maxlength="16" placeholder="Title" style="flex:1;min-width:100px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:8px;font-size:12px;">
          <input data-rank-color="${n}" value="${escapeHtml(info.color)}" maxlength="16" placeholder="#hex" style="width:90px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:8px;font-size:12px;font-family:monospace;">
        </div>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-rank-perm="${n}" data-perm="invite" ${perms.invite?'checked':''}> Invite</label>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-rank-perm="${n}" data-perm="kick" ${perms.kick?'checked':''}> Kick</label>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-rank-perm="${n}" data-perm="accept_requests" ${perms.accept_requests?'checked':''}> Accept req</label>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-rank-perm="${n}" data-perm="edit" ${perms.edit?'checked':''}> Edit clan</label>
      </div>`;
    }
    html += `<button class="btn btn-primary" id="saveRanksBtn" style="margin:0;">Save ranks</button></div>`;
  }

  html += `<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;">`;
  /* Invite only from Leaderboard user profile modal */
  if(canEdit) html += `<button class="btn btn-ghost" id="clanEditBtn" style="margin:0;">Edit name / tag / color</button>`;
  if(isLeader){
    html += `<button class="btn btn-ghost" id="clanTransferBtn" style="margin:0;">Transfer leadership</button>`;
    html += `<button class="btn btn-primary" id="clanDisbandBtn" style="margin:0;background:var(--red);">Disband clan</button>`;
  } else {
    html += `<button class="btn btn-primary" id="clanLeaveBtn" style="margin:0;background:var(--orange);">Leave clan</button>`;
  }
  html += `</div>`;

  body.innerHTML = html;
  (members||[]).forEach(m=>{
    const u = umap[m.user_id];
    const el = document.getElementById('cmAv-'+m.user_id);
    if(el && u) renderAvatar(el, u);
  });

  body.querySelectorAll('[data-act]').forEach(btn=>{
    const act = btn.dataset.act || btn.getAttribute('data-act');
    if(btn.tagName === 'SELECT'){
      btn.onchange = async ()=>{
        const uid = btn.dataset.uid;
        const uname = btn.dataset.uname;
        const newRank = Number(btn.value);
        if(!isLeader || newRank < 1 || newRank > 5) return;
        await sb.from('clan_members').update({ rank: newRank, role: newRank>=5?'officer':'member' }).eq('clan_id', clan.id).eq('user_id', uid);
        await logClanHistory(clan.id, 'set_rank', { target_user_id: uid, target_username: uname, details: { rank: newRank } });
        toast('Rank set to '+newRank);
        renderClanManage();
      };
      return;
    }
    btn.onclick = async ()=>{
      const act = btn.dataset.act;
      const uid = btn.dataset.uid;
      const rid = btn.dataset.rid;
      const uname = btn.dataset.uname || '';
      if(act === 'kick'){
        if(!(await askConfirm('Kick','Remove @'+uname+' from the clan?'))) return;
        const { error } = await sb.from('clan_members').delete().eq('clan_id', clan.id).eq('user_id', uid);
        if(error){ toast(error.message||'Failed'); return; }
        await logClanHistory(clan.id, 'kick', { target_user_id: uid, target_username: uname });
        try{ await pushNotification(uid, 'clan_kicked', 'Removed from clan', 'You were removed from '+clan.name, { clan_id: clan.id }); }catch(e){}
        toast('Member kicked');
        renderClanManage();
        return;
      }
      if(act === 'accept'){
        await handleAcceptReq(rid, uid, clan.id, null);
        try{ await renderClanManage(); }catch(e){}
        return;
      }
      if(act === 'reject'){
        await handleRejectReq(rid, null);
        await logClanHistory(clan.id, 'reject_request', { target_user_id: uid });
        try{ await renderClanManage(); }catch(e){}
        return;
      }
    };
  });

  const saveRanks = $('saveRanksBtn');
  if(saveRanks) saveRanks.onclick = async ()=>{
    const cfg = getClanRanksConfig(clan);
    for(let n=1;n<=5;n++){
      const titleEl = body.querySelector(`[data-rank-title="${n}"]`);
      const colorEl = body.querySelector(`[data-rank-color="${n}"]`);
      const title = (titleEl && titleEl.value.trim()) || DEFAULT_RANKS[String(n)].title;
      const color = normalizeHexColor(colorEl && colorEl.value) || DEFAULT_RANKS[String(n)].color;
      const perms = { invite:false, kick:false, edit:false, manage_ranks:false, accept_requests:false };
      body.querySelectorAll(`[data-rank-perm="${n}"]`).forEach(cb=>{
        perms[cb.dataset.perm] = !!cb.checked;
      });
      perms.manage_ranks = false; // only leader
      cfg[String(n)] = { title: title.slice(0,16), color, perms };
    }
    cfg["6"] = DEFAULT_RANKS["6"];
    const { error } = await sb.from('clans').update({ ranks_config: cfg, updated_at: new Date().toISOString() }).eq('id', clan.id);
    if(error){ toast(error.message||'Failed'); return; }
    await logClanHistory(clan.id, 'edit_ranks', { details: { ranks: Object.keys(cfg) } });
    toast('Ranks saved');
    await loadMyClan(true);
    renderClanManage();
  };

  const editBtn = $('clanEditBtn');
  if(editBtn) editBtn.onclick = ()=>{ closeClanManage(); openClanCreate(true); };
  const leaveBtn = $('clanLeaveBtn');
  if(leaveBtn) leaveBtn.onclick = async ()=>{
    if(!(await askConfirm('Leave','Leave this clan?'))) return;
    const { error } = await sb.from('clan_members').delete().eq('clan_id', clan.id).eq('user_id', CURRENT_USER.id);
    if(error){ toast(error.message||'Failed'); return; }
    await logClanHistory(clan.id, 'leave', { target_user_id: CURRENT_USER.id, target_username: CURRENT_USER.username });
    MY_CLAN = null;
    if(CURRENT_USER){ CURRENT_USER.clan_tag=null; CURRENT_USER.clan_color=null; }
    toast('Left clan');
    closeClanManage();
    try{ refreshGameUI(); }catch(e){}
    if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
  };
  const disbandBtn = $('clanDisbandBtn');
  if(disbandBtn) disbandBtn.onclick = async ()=>{
    if(!(await askConfirm('Disband','Permanently delete this clan?'))) return;
    await logClanHistory(clan.id, 'disband', {});
    await sb.from('clan_join_requests').delete().eq('clan_id', clan.id);
    await sb.from('clan_invites').delete().eq('clan_id', clan.id);
    await sb.from('clan_history').delete().eq('clan_id', clan.id);
    await sb.from('clan_members').delete().eq('clan_id', clan.id);
    await sb.from('clans').delete().eq('id', clan.id);
    MY_CLAN = null;
    toast('Clan disbanded');
    closeClanManage();
    if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
  };
  const transferBtn = $('clanTransferBtn');
  if(transferBtn) transferBtn.onclick = async ()=>{
    const name = prompt('Username of new leader (must be a member):');
    if(!name) return;
    const { data: targetU } = await sb.from('users').select('id,username').ilike('username', name.trim()).limit(1).maybeSingle();
    if(!targetU){ toast('User not found'); return; }
    if(targetU.id === CURRENT_USER.id){ toast('Already leader'); return; }
    const { data: mem } = await sb.from('clan_members').select('*').eq('clan_id', clan.id).eq('user_id', targetU.id).maybeSingle();
    if(!mem){ toast('That user is not in this clan'); return; }
    if(!(await askConfirm('Transfer','Make @'+targetU.username+' the new leader? You become Rank 5.'))) return;
    await sb.from('clans').update({ leader_id: targetU.id, updated_at: new Date().toISOString() }).eq('id', clan.id);
    await sb.from('clan_members').update({ rank: 6, role: 'leader' }).eq('clan_id', clan.id).eq('user_id', targetU.id);
    await sb.from('clan_members').update({ rank: 5, role: 'officer' }).eq('clan_id', clan.id).eq('user_id', CURRENT_USER.id);
    await logClanHistory(clan.id, 'transfer', { target_user_id: targetU.id, target_username: targetU.username });
    toast('Leadership transferred');
    await loadMyClan(true);
    renderClanManage();
  };
  const inviteBtn = $('clanInviteBtn');
  if(inviteBtn) inviteBtn.onclick = async ()=>{
    const name = prompt('Username to invite:');
    if(!name) return;
    const { data: targetU } = await sb.from('users').select('id,username').ilike('username', name.trim()).limit(1).maybeSingle();
    if(!targetU){ toast('User not found'); return; }
    if(targetU.id === CURRENT_USER.id){ toast('Cannot invite yourself'); return; }
    const { data: already } = await sb.from('clan_members').select('id').eq('user_id', targetU.id).maybeSingle();
    if(already){ toast('User already in a clan'); return; }
    const { data: pend } = await sb.from('clan_invites').select('id').eq('clan_id', clan.id).eq('invitee_id', targetU.id).eq('status','pending').maybeSingle();
    if(pend){ toast('Invite already pending'); return; }
    const { data: inv, error } = await sb.from('clan_invites').insert({
      clan_id: clan.id, inviter_id: CURRENT_USER.id, invitee_id: targetU.id, status:'pending'
    }).select().single();
    if(error){ toast(error.message||'Failed'); return; }
    const ok = await pushNotification(targetU.id, 'clan_invite', 'Clan invite',
      '@'+CURRENT_USER.username+' invited you to '+clan.name+' ['+clan.tag+']',
      { invite_id: inv.id, clan_id: clan.id, from_user_id: CURRENT_USER.id, status:'pending' });
    await logClanHistory(clan.id, 'invite', { target_user_id: targetU.id, target_username: targetU.username });
    toast(ok ? ('Invite sent to @'+targetU.username) : 'Invite created — notification may need a moment');
  };
}

setTimeout(()=>{
  if($('clanCreateBtn')) $('clanCreateBtn').onclick = ()=> openClanCreate(false);
  if($('clanBrowseBtn')) $('clanBrowseBtn').onclick = ()=> openClanBrowse();
  if($('clansPageSearch') && !$('clansPageSearch')._bound){
    $('clansPageSearch')._bound = true;
    $('clansPageSearch').oninput = ()=>{ clearTimeout(clansSearchTimer); clansSearchTimer = setTimeout(()=> loadClansPage(), 280); };
  }
  if($('closeClanCreate')) $('closeClanCreate').onclick = closeClanCreate;
  if($('closeClanBrowse')) $('closeClanBrowse').onclick = closeClanBrowse;
  if($('closeClanManage')) $('closeClanManage').onclick = closeClanManage;
  if($('clanCreateSubmit')) $('clanCreateSubmit').onclick = submitClanCreate;
  if($('clanCreateModal')) $('clanCreateModal').addEventListener('click', e=>{ if(e.target.id==='clanCreateModal') closeClanCreate(); });
  if($('clanBrowseModal')) $('clanBrowseModal').addEventListener('click', e=>{ if(e.target.id==='clanBrowseModal') closeClanBrowse(); });
  if($('clanManageModal')) $('clanManageModal').addEventListener('click', e=>{ if(e.target.id==='clanManageModal') closeClanManage(); });
}, 50);

/* Enrich leaderboard / chat / modal with clan tags */
const _origRefreshGameUI = typeof refreshGameUI === 'function' ? refreshGameUI : null;

/* ---------- NOTIFICATIONS ---------- */
let notifLoaded = false;
async function pushNotification(userId, type, title, body, data){
  if(!sb || !userId) return false;
  try{
    const row = {
      user_id: userId,
      type: type || 'system',
      title: title || 'Notification',
      body: body || '',
      data: data || {},
      is_read: false
    };
    const { error } = await sb.from('notifications').insert(row);
    if(error){
      console.warn('notif insert', error);
      // retry without data if jsonb issue
      try{
        const { error: e2 } = await sb.from('notifications').insert({
          user_id: userId, type: row.type, title: row.title, body: row.body, is_read: false
        });
        if(e2){ console.warn('notif retry', e2); return false; }
        return true;
      }catch(e3){ return false; }
    }
    return true;
  }catch(e){ console.warn('notif', e); return false; }
}

function updateNotifBadge(n){
  const b = $('notifBadge');
  if(!b) return;
  const num = Number(n)||0;
  if(num > 0){
    b.textContent = num > 99 ? '99+' : String(num);
    b.classList.remove('hide');
  } else {
    b.textContent = '0';
    b.classList.add('hide');
  }
}
async function refreshNotifBadge(){
  if(!CURRENT_USER || !sb){ updateNotifBadge(0); return; }
  let n = 0;
  try{
    const { count, error } = await sb.from('notifications')
      .select('*', { count:'exact', head:true })
      .eq('user_id', CURRENT_USER.id)
      .eq('is_read', false);
    if(!error) n = count || 0;
  }catch(e){}
  try{
    const { count: c2 } = await sb.from('clan_invites')
      .select('*', { count:'exact', head:true })
      .eq('invitee_id', CURRENT_USER.id)
      .eq('status', 'pending');
    // at least show pending invites
    n = Math.max(n, c2 || 0);
  }catch(e){}
  updateNotifBadge(n);
}

async function loadNotifications(){
  const panel = $('notifPanel');
  if(!panel) return;
  const header = (title) => `<div class="notif-panel-header"><b>${title||'Notifications'}</b><button type="button" class="notif-close-x" aria-label="Close">✕</button></div>`;
  const bindClose = ()=>{
    panel.querySelectorAll('.notif-close-x').forEach(btn=>{
      btn.onclick = (e)=>{ e.stopPropagation(); panel.classList.add('hidden'); };
    });
  };

  if(!CURRENT_USER){
    panel.innerHTML = header() + '<div class="notif-empty">Log in to see notifications</div>';
    bindClose(); return;
  }
  if(!sb){
    panel.innerHTML = header() + '<div class="notif-empty">Database not connected</div>';
    bindClose(); return;
  }

  panel.innerHTML = header() + inlineLoadingHtml('Loading');
  bindClose();

  try{
    // 1) DB notifications
    let rows = [];
    let notifError = null;
    try{
      const res = await sb.from('notifications').select('*').eq('user_id', CURRENT_USER.id)
        .order('created_at', { ascending:false }).limit(40);
      notifError = res.error;
      rows = res.data || [];
    }catch(e){ notifError = e; }

    // 2) Pending clan invites for me (always merge — source of truth)
    let pendingInvites = [];
    try{
      const { data: invs } = await sb.from('clan_invites').select('*')
        .eq('invitee_id', CURRENT_USER.id).eq('status','pending')
        .order('created_at',{ascending:false}).limit(20);
      pendingInvites = invs || [];
    }catch(e){}

    // Build synthetic notif rows for invites missing from notifications list
    const existingInviteIds = new Set();
    rows.forEach(n=>{
      if(n.type==='clan_invite' && n.data && n.data.invite_id) existingInviteIds.add(n.data.invite_id);
    });
    for(const inv of pendingInvites){
      if(existingInviteIds.has(inv.id)) continue;
      let clanName = 'a clan', clanTag = '';
      try{
        const { data: c } = await sb.from('clans').select('name,tag,color').eq('id', inv.clan_id).maybeSingle();
        if(c){ clanName = c.name; clanTag = c.tag; }
      }catch(e){}
      let fromName = 'Someone';
      try{
        const { data: u } = await sb.from('users').select('username').eq('id', inv.inviter_id).maybeSingle();
        if(u) fromName = u.username;
      }catch(e){}
      rows.unshift({
        id: 'invite-'+inv.id,
        user_id: CURRENT_USER.id,
        type: 'clan_invite',
        title: 'Clan invite',
        body: '@'+fromName+' invited you to '+clanName+(clanTag?(' ['+clanTag+']'):''),
        data: { invite_id: inv.id, clan_id: inv.clan_id, from_user_id: inv.inviter_id, status:'pending' },
        is_read: false,
        created_at: inv.created_at,
        _synthetic: true
      });
    }

    if(notifError && !rows.length && !pendingInvites.length){
      const msg = (notifError.message||'').toLowerCase();
      const missing = msg.includes('does not exist') || msg.includes('schema cache') || notifError.code==='42P01' || notifError.code==='PGRST205';
      panel.innerHTML = header() + `<div class="notif-empty">${missing
        ? 'Run latest supabase_schema.sql (notifications table).'
        : ('Error: '+escapeHtml(notifError.message||'Unable to load'))}</div>`;
      bindClose();
      updateNotifBadge(pendingInvites.length);
      return;
    }

    if(!rows.length){
      panel.innerHTML = header() + '<div class="notif-empty">No notifications yet</div>';
      bindClose();
      updateNotifBadge(0);
      return;
    }

    const unread = rows.filter(n => !n.is_read).length + pendingInvites.filter(inv => !existingInviteIds.has(inv.id)).length;
    // unique unread estimate
    updateNotifBadge(Math.max(unread, pendingInvites.length));

    const inviteStatus = {};
    pendingInvites.forEach(i => { inviteStatus[i.id] = i.status; });
    const inviteIds = rows.filter(n => n.type==='clan_invite' && n.data && n.data.invite_id).map(n=>n.data.invite_id);
    try{
      if(inviteIds.length){
        const { data: invs } = await sb.from('clan_invites').select('id,status').in('id', inviteIds);
        (invs||[]).forEach(i => { inviteStatus[i.id] = i.status; });
      }
    }catch(e){}

    const reqIds = rows.filter(n => !n.is_read && n.type==='clan_request' && n.data && n.data.request_id).map(n=>n.data.request_id);
    const reqStatus = {};
    try{
      if(reqIds.length){
        const { data: reqs } = await sb.from('clan_join_requests').select('id,status').in('id', reqIds);
        (reqs||[]).forEach(r => { reqStatus[r.id] = r.status; });
      }
    }catch(e){}

    const listHtml = rows.map(n=>{
      const d = n.data || {};
      let actions = '';
      let resolvedLabel = '';
      if(n.type === 'clan_invite' && d.invite_id){
        const st = inviteStatus[d.invite_id] || (n.is_read ? 'done' : 'pending');
        if(st === 'pending'){
          actions = `<div class="n-actions">
            <button type="button" style="background:var(--green)" data-nact="accept_invite" data-nid="${n._synthetic?'':n.id}" data-iid="${d.invite_id}" data-cid="${d.clan_id||''}">Accept</button>
            <button type="button" style="background:var(--red)" data-nact="reject_invite" data-nid="${n._synthetic?'':n.id}" data-iid="${d.invite_id}">Reject</button>
          </div>`;
        } else {
          resolvedLabel = `<div class="n-body" style="margin-top:4px;">Status: ${escapeHtml(String(st))}</div>`;
        }
      }
      
      if(n.type === 'duel_invite' && d.room_id){
        if(!n.is_read){
          actions = `<div class="n-actions">
            <button type="button" style="background:var(--green)" data-nact="accept_duel" data-nid="${n.id}" data-rid="${d.room_id}" data-mode="${escapeHtml(d.mode||'normal')}" data-from="${escapeHtml(d.from_username||'')}">Accept</button>
            <button type="button" style="background:var(--red)" data-nact="reject_duel" data-nid="${n.id}" data-rid="${d.room_id}">Decline</button>
          </div>`;
        } else {
          resolvedLabel = `<div class="n-body" style="margin-top:4px;">Duel invite</div>`;
        }
      }
if(n.type === 'clan_request' && d.request_id){
        const st = reqStatus[d.request_id] || (n.is_read ? 'done' : 'pending');
        if(st === 'pending' && !n.is_read){
          actions = `<div class="n-actions">
            <button type="button" style="background:var(--green)" data-nact="accept_req" data-nid="${n.id}" data-rid="${d.request_id}" data-uid="${d.from_user_id||''}" data-cid="${d.clan_id||''}">Accept</button>
            <button type="button" style="background:var(--red)" data-nact="reject_req" data-nid="${n.id}" data-rid="${d.request_id}">Reject</button>
          </div>`;
        } else if(st !== 'pending'){
          resolvedLabel = `<div class="n-body" style="margin-top:4px;">Status: ${escapeHtml(String(st))}</div>`;
        }
      }
      return `<div class="notif-item ${n.is_read?'':'unread'}" data-id="${n.id}">
        <div class="n-title">${escapeHtml(n.title||'Notification')}</div>
        <div class="n-body">${escapeHtml(n.body||'')} · ${fmtDate(n.created_at)}</div>
        ${resolvedLabel}${actions}
      </div>`;
    }).join('');

    panel.innerHTML = header() + listHtml +
      `<div style="padding:8px;text-align:center;"><button type="button" id="notifMarkAll" class="btn-ghost" style="width:auto;padding:6px 12px;font-size:12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);">Mark all read</button></div>`;
    bindClose();

    panel.querySelectorAll('[data-nact]').forEach(btn=>{
      btn.onclick = async (e)=>{
        e.stopPropagation();
        const act = btn.dataset.nact;
        const row = btn.closest('.notif-item');
        if(row) row.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try{
          if(act==='accept_invite') await handleAcceptInvite(btn.dataset.iid, btn.dataset.cid, btn.dataset.nid||null);
          if(act==='reject_invite') await handleRejectInvite(btn.dataset.iid, btn.dataset.nid||null);
          if(act==='accept_req') await handleAcceptReq(btn.dataset.rid, btn.dataset.uid, btn.dataset.cid, btn.dataset.nid);
          if(act==='reject_req') await handleRejectReq(btn.dataset.rid, btn.dataset.nid);
          if(act==='accept_duel'){
            _pendingDuelInviteRoomId = btn.dataset.rid;
            if(btn.dataset.nid){ try{ await sb.from('notifications').update({ is_read:true }).eq('id', btn.dataset.nid); }catch(e){} }
            await acceptDuelInvite();
          }
          if(act==='reject_duel'){
            _pendingDuelInviteRoomId = btn.dataset.rid;
            if(btn.dataset.nid){ try{ await sb.from('notifications').update({ is_read:true }).eq('id', btn.dataset.nid); }catch(e){} }
            await declineDuelInvite();
          }
        }catch(err){ toast((err && err.message) || 'Failed'); }
        if(row){
          row.style.opacity = '0.45';
          row.innerHTML = '<div class="n-title">Done</div><div class="n-body">Updated</div>';
          setTimeout(()=>{ try{ row.remove(); }catch(e){} }, 350);
        }
        try{ await refreshNotifBadge(); }catch(e){}
        setTimeout(()=> loadNotifications(), 450);
      };
    });

    const ma = $('notifMarkAll');
    if(ma) ma.onclick = async ()=>{
      try{
        await sb.from('notifications').update({ is_read:true }).eq('user_id', CURRENT_USER.id).eq('is_read', false);
      }catch(e){}
      updateNotifBadge(0);
      loadNotifications();
    };
  }catch(e){
    console.warn('loadNotifications', e);
    panel.innerHTML = header() + `<div class="notif-empty">Error: ${escapeHtml((e && e.message) || 'Failed to load')}</div>`;
    bindClose();
  }
}

function toggleNotifPanel(){
  const panel = $('notifPanel');
  if(!panel) return;
  panel.classList.toggle('hidden');
  if(!panel.classList.contains('hidden')) loadNotifications();
}
async function handleAcceptInvite(inviteId, clanId, notifId){
  await loadMyClan(false);
  if(MY_CLAN){
    toast('You are already in a clan — invite cancelled');
    await sb.from('clan_invites').update({ status:'cancelled', resolved_at: new Date().toISOString() }).eq('id', inviteId);
    if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
    return false;
  }
  const { data: inv } = await sb.from('clan_invites').select('*').eq('id', inviteId).eq('status','pending').maybeSingle();
  if(!inv){ toast('Invite expired'); if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId); return false; }
  const { data: already } = await sb.from('clan_members').select('id').eq('user_id', CURRENT_USER.id).maybeSingle();
  if(already){
    toast('Already in a clan — invite cancelled');
    await sb.from('clan_invites').update({ status:'cancelled', resolved_at: new Date().toISOString() }).eq('id', inviteId);
    if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
    return false;
  }
  const { data: clan } = await sb.from('clans').select('*').eq('id', inv.clan_id).maybeSingle();
  if(!clan){ toast('Clan gone'); return false; }
  if((clan.member_count||0) >= (clan.max_members||12)){ toast('Clan is full'); return false; }
  const { error } = await sb.from('clan_members').insert({ clan_id: inv.clan_id, user_id: CURRENT_USER.id, role:'member' });
  if(error){
    toast(error.message||'Failed');
    await sb.from('clan_invites').update({ status:'cancelled', resolved_at: new Date().toISOString() }).eq('id', inviteId);
    if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
    return false;
  }
  await sb.from('clan_invites').update({ status:'accepted', resolved_at: new Date().toISOString() }).eq('id', inviteId);
  if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
  await pushNotification(inv.inviter_id, 'system', 'Invite accepted', '@'+CURRENT_USER.username+' joined your clan', { clan_id: inv.clan_id });
  toast('Joined clan!');
  await loadMyClan(true);
  try{ refreshGameUI(); }catch(e){}
  if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
  return true;
}
async function handleRejectInvite(inviteId, notifId){
  await sb.from('clan_invites').update({ status:'rejected', resolved_at: new Date().toISOString() }).eq('id', inviteId);
  if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
  toast('Invite declined');
}
async function handleAcceptReq(reqId, uid, clanId, notifId){
  if(!MY_CLAN || !myClanPerm('accept_requests')){ toast('No permission'); return false; }
  // Re-check request still pending
  const { data: reqRow } = await sb.from('clan_join_requests').select('*').eq('id', reqId).maybeSingle();
  if(!reqRow || reqRow.status !== 'pending'){
    toast('Request already resolved');
    if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
    return false;
  }
  const { data: already } = await sb.from('clan_members').select('id,clan_id').eq('user_id', uid).maybeSingle();
  if(already){
    toast('User is already in another clan — request cancelled');
    await sb.from('clan_join_requests').update({
      status:'cancelled', resolved_at: new Date().toISOString(), resolved_by: CURRENT_USER.id
    }).eq('id', reqId);
    if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
    try{ await pushNotification(uid, 'system', 'Join request cancelled', 'You were already in a clan', { request_id: reqId }); }catch(e){}
    return false;
  }
  const clan = MY_CLAN.clan;
  // fresh capacity
  const { data: freshClan } = await sb.from('clans').select('member_count,max_members,name,id').eq('id', clan.id).maybeSingle();
  const mc = (freshClan && freshClan.member_count) || clan.member_count || 0;
  const mx = (freshClan && freshClan.max_members) || clan.max_members || 12;
  if(mc >= mx){ toast('Clan is full'); return false; }
  // resolve username for history
  let targetName = '';
  try{
    const { data: tu } = await sb.from('users').select('username').eq('id', uid).maybeSingle();
    targetName = tu ? tu.username : '';
  }catch(e){}
  const { error } = await sb.from('clan_members').insert({ clan_id: clan.id, user_id: uid, role:'member', rank: 2 });
  if(error){
    toast(error.message || 'Failed — user may already be in a clan');
    await sb.from('clan_join_requests').update({
      status:'cancelled', resolved_at: new Date().toISOString(), resolved_by: CURRENT_USER.id
    }).eq('id', reqId);
    if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
    await logClanHistory(clan.id, 'cancel_request', { target_user_id: uid, target_username: targetName });
    return false;
  }
  await sb.from('clan_join_requests').update({
    status:'accepted', resolved_at: new Date().toISOString(), resolved_by: CURRENT_USER.id
  }).eq('id', reqId);
  await logClanHistory(clan.id, 'accept_request', { target_user_id: uid, target_username: targetName });
  if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
  // mark any other notifications about this request as read
  try{
    await sb.from('notifications').update({ is_read:true })
      .eq('user_id', CURRENT_USER.id).eq('type','clan_request').eq('is_read', false);
  }catch(e){}
  await pushNotification(uid, 'clan_accepted', 'Joined clan', 'Your request to join '+(freshClan?.name||clan.name)+' was accepted', { clan_id: clan.id });
  toast('Accepted');
  if($('clanManageModal') && !$('clanManageModal').classList.contains('hidden')){
    try{ await renderClanManage(); }catch(e){}
  }
  return true;
}
async function handleRejectReq(reqId, notifId){
  await sb.from('clan_join_requests').update({
    status:'rejected', resolved_at: new Date().toISOString(), resolved_by: CURRENT_USER.id
  }).eq('id', reqId);
  if(notifId) await sb.from('notifications').update({ is_read:true }).eq('id', notifId);
  try{
    await sb.from('notifications').update({ is_read:true })
      .eq('user_id', CURRENT_USER.id).eq('type','clan_request').eq('is_read', false);
  }catch(e){}
  toast('Rejected');
  if($('clanManageModal') && !$('clanManageModal').classList.contains('hidden')){
    try{ await renderClanManage(); }catch(e){}
  }
  return true;
}

async function openClanPublicDetail(clan){
  const body = $('clanManageBody');
  if(!body){ toast(clan.name); return; }
  $('clanManageTitle').textContent = '';
  $('clanManageModal').classList.remove('hidden');
  body.innerHTML = inlineLoadingHtml('Loading');
  const { data: fresh } = await sb.from('clans').select('*').eq('id', clan.id).maybeSingle();
  const c = fresh || clan;
  try{ await loadMyClan(true); }catch(e){}
  const inThis = MY_CLAN && MY_CLAN.clan && MY_CLAN.clan.id === c.id;
  const myRank = inThis ? memberRank(MY_CLAN) : 0;
  const isLeader = inThis && myRank >= 6;
  const canKick = inThis && myClanPerm('kick');
  const canEdit = inThis && myClanPerm('edit');
  const canRanks = inThis && myClanPerm('manage_ranks');
  const canAccept = inThis && myClanPerm('accept_requests');
  $('clanManageTitle').textContent = '['+String(c.tag||'').toUpperCase()+'] '+c.name;
  const { data: members } = await sb.from('clan_members').select('*').eq('clan_id', c.id).order('rank',{ascending:false}).order('joined_at',{ascending:true});
  const uids = (members||[]).map(m=>m.user_id);
  let users = [];
  if(uids.length){
    const { data } = await sb.from('users').select('id,username,tik,level,last_online,avatar_url').in('id', uids);
    users = data||[];
  }
  const umap = {}; users.forEach(u=>umap[u.id]=u);
  const history = await loadClanHistory(c.id, 25);
  const ranksCfg = getClanRanksConfig(c);
  const col = escapeHtml(c.color||'#1d9bf0');

  let html = `<div class="clan-detail-hero">
    <div style="font-size:22px;font-weight:900;color:${col};letter-spacing:-.3px;">
      <span style="cursor:pointer;">[${escapeHtml(String(c.tag||'').toUpperCase())}]</span>${escapeHtml(c.name)}
    </div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:6px;">
      ${c.is_open?'Open join':'Invite / request only'}
      · ${c.member_count||0}/${c.max_members||12} members
      ${c.created_at?' · Founded '+fmtDate(c.created_at):''}
    </div>
    <div class="clan-stat-row">
      <span class="clan-stat-pill">Level <b>${c.level||1}</b></span>
      <span class="clan-stat-pill"><b>${c.level_xp||0}</b>/${c.level_xp_needed||100} XP</span>
      <span class="clan-stat-pill"><b>${(c.xp||0).toLocaleString()}</b> total</span>
      <span class="clan-stat-pill"><b>${c.weekly_points||0}</b> week</span>
      <span class="clan-stat-pill"><span class="ic-svg"><svg viewBox="0 0 24 24"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v6a5 5 0 01-10 0z"/><path d="M7 7H4a3 3 0 003 4"/><path d="M17 7h3a3 3 0 01-3 4"/></svg></span><b>${c.glory||0}</b> Glory</span>
      <span class="clan-stat-pill"><b>${c.total_wins||0}</b> wins</span>
    </div>
    ${c.description?`<div style="font-size:13px;color:var(--text-dim);margin-top:10px;line-height:1.55;text-align:left;">${escapeHtml(c.description)}</div>`:''}
  </div>`;

  // Rank legend
  html += `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;line-height:1.6;">`;
  for(let n=6;n>=1;n--){
    const info = ranksCfg[String(n)];
    html += `<span style="display:inline-block;margin:2px 6px 2px 0;"><b style="color:${escapeHtml(info.color)}">R${n}</b> ${escapeHtml(info.title)}</span>`;
  }
  html += `</div>`;

  html += `<div class="section-title" style="border:none;padding:0 0 6px;margin:0;font-size:14px;">Members (${(members||[]).length})</div>
    <div class="clan-members-scroll">`;
  (members||[]).forEach(m=>{
    const u = umap[m.user_id]||{username:'?'};
    const rk = memberRank(m);
    const rTitle = rankTitle(c, rk);
    const rCol = rankColor(c, rk);
    const canKickThis = canKick && m.user_id !== CURRENT_USER.id && rk < 6 && (isLeader || rk < myRank);
    const canSetRank = isLeader && m.user_id !== CURRENT_USER.id && rk < 6;
    const canTransfer = isLeader && m.user_id !== CURRENT_USER.id && rk < 6;
    const hasActions = canKickThis || canSetRank || canTransfer;
    html += `<div class="clan-member-row">
      <div class="avatar sm" id="pubAv-${m.user_id}" style="width:28px;height:28px;font-size:11px;"></div>
      <div style="flex:1;min-width:0;font-weight:700;">@${escapeHtml(u.username)}
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">Lv ${u.level||1} · <span style="color:${escapeHtml(rCol)};font-weight:800;">R${rk} · ${escapeHtml(rTitle)}</span></div>
      </div>
      ${hasActions?`<div class="clan-member-actions">
        <button type="button" class="clan-more-btn" data-clan-menu="${m.user_id}" aria-label="Member actions">⋯</button>
        <div class="clan-action-menu hidden" id="clanMenu-${m.user_id}">
          ${canSetRank?`<div style="font-size:10px;color:var(--text-dim);padding:5px 8px 3px;display:flex;align-items:center;gap:6px;"><span class="action-ic"><svg viewBox="0 0 24 24"><path d="M12 3l2.2 4.5L19 8.2l-3.5 3.4.8 4.8L12 14.2l-4.3 2.2.8-4.8L5 8.2l4.8-.7L12 3z"/></svg></span>Set rank</div>
          <select class="rank-select" data-clan-act="setrank" data-uid="${m.user_id}" data-uname="${escapeHtml(u.username)}" data-current-rank="${rk}">
            <option value="" disabled selected hidden>Choose new rank…</option>
            ${[1,2,3,4,5].map(n=>`<option value="${n}">R${n} · ${escapeHtml(rankTitle(c,n))}${rk===n?' · current':''}</option>`).join('')}
          </select>`:''}
          ${canTransfer?`<button type="button" data-clan-act="transfer" data-uid="${m.user_id}" data-uname="${escapeHtml(u.username)}"><span class="action-ic"><svg viewBox="0 0 24 24"><path d="M12 3l2.2 4.5L19 8.2l-3.5 3.4.8 4.8L12 14.2l-4.3 2.2.8-4.8L12 3z"/><path d="M4 21h16"/></svg></span>Transfer leadership</button>`:''}
          ${canKickThis?`<button type="button" class="danger" data-clan-act="kick" data-uid="${m.user_id}" data-uname="${escapeHtml(u.username)}"><span class="action-ic"><svg viewBox="0 0 24 24"><path d="M7 4v8M10 4v7M13 5v6M16 7v5"/><path d="M7 12l-2 2a3 3 0 000 4l2 2h8a3 3 0 003-3v-5"/></svg></span>Kick</button>`:''}
        </div>
      </div>`:''}
    </div>`;
  });
  if(!(members||[]).length) html += `<div class="empty-note" style="padding:16px;">No members</div>`;
  html += `</div>`;

  html += `<div class="section-title" style="border:none;padding:12px 0 6px;margin:0;font-size:14px;">History</div>
    <div class="clan-members-scroll" style="max-height:150px;">`;
  if(!history.length) html += `<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">No events yet</div>`;
  history.forEach(h=>{
    html += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;">
      <div>${escapeHtml(formatClanHistoryRow(h))}</div>
      <div style="color:var(--text-dim);">${fmtDate(h.created_at)}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;">`;
  if(!inThis && !MY_CLAN){
    if(c.is_open){
      html += `<button class="btn btn-primary" id="clanJoinOpenBtn" style="margin:0;">Join clan</button>`;
    } else {
      html += `<button class="btn btn-primary" id="clanRequestBtn" style="margin:0;">Request to join</button>`;
    }
  } else if(!inThis && MY_CLAN){
    html += `<div style="font-size:12px;color:var(--text-dim);text-align:center;">Leave your current clan to join another</div>`;
  }
  if(inThis && canRanks){
    html += `<div class="section-title" style="border:none;padding:12px 0 6px;margin:0;font-size:14px;"><span class="ic-svg"><svg viewBox="0 0 24 24"><path d="M12 3l2.2 4.5L19 8.2l-3.5 3.4.8 4.8L12 14.2l-4.3 2.2.8-4.8L5 8.2l4.8-.7L12 3z"/></svg></span>Ranks setup (1–5)</div>
      <p style="font-size:11px;color:var(--text-dim);margin:0 0 8px;">Rank 6 is Leader (fixed). Set title, color & permissions for ranks 1–5.</p>
      <div id="publicRankEditBox">`;
    for(let n=1;n<=5;n++){
      const info=ranksCfg[String(n)], perms=info.perms||{};
      html += `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;">
        <div style="font-weight:800;margin-bottom:6px;">Rank ${n}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <input data-public-rank-title="${n}" value="${escapeHtml(info.title)}" maxlength="16" placeholder="Title" style="flex:1;min-width:100px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:8px;font-size:12px;">
          <input data-public-rank-color="${n}" value="${escapeHtml(info.color)}" maxlength="16" placeholder="#hex" style="width:90px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:8px;font-size:12px;font-family:monospace;">
        </div>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-public-rank-perm="${n}" data-perm="invite" ${perms.invite?'checked':''}> Invite</label>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-public-rank-perm="${n}" data-perm="kick" ${perms.kick?'checked':''}> Kick</label>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-public-rank-perm="${n}" data-perm="accept_requests" ${perms.accept_requests?'checked':''}> Accept req</label>
        <label style="font-size:11px;margin-right:8px;"><input type="checkbox" data-public-rank-perm="${n}" data-perm="edit" ${perms.edit?'checked':''}> Edit clan</label>
      </div>`;
    }
    html += `<button class="btn btn-primary" id="publicSaveRanksBtn" style="margin:0;">Save ranks</button></div>`;
  }
  if(inThis){
    html += `<button class="btn btn-primary" id="clanDetailChatBtn" style="margin:0;">Clan chat</button>`;
    if(canEdit) html += `<button class="btn btn-ghost" id="clanEditBtn" style="margin:0;"><span class="ic-svg"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/></svg></span>Edit name / tag / color</button>`;
    if(isLeader){
      html += `<button class="btn btn-ghost" id="clanTransferSelfBtn" style="margin:0;"><span class="action-ic"><svg viewBox="0 0 24 24"><path d="M12 3l2.2 4.5L19 8.2l-3.5 3.4.8 4.8L12 14.2l-4.3 2.2.8-4.8L12 3z"/><path d="M4 21h16"/></svg></span>Transfer leadership</button>`;
      html += `<button class="btn btn-primary" id="clanDisbandBtn" style="margin:0;background:var(--red);"><span class="ic-svg"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></span>Disband clan</button>`;
    } else {
      html += `<button class="btn btn-primary" id="clanLeaveBtn" style="margin:0;background:var(--orange);"><span class="ic-svg"><svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M21 3v18"/></svg></span>Leave clan</button>`;
    }
  }
  if(isStaff() && hasPerm('ban') && !inThis){
    html += `<button class="btn btn-ghost" id="clanAdminForceDisband" style="margin:0;color:var(--red);">Admin: disband clan</button>`;
  }
  html += `</div>`;
  body.innerHTML = html;
  (members||[]).forEach(m=>{
    const u = umap[m.user_id];
    const el = document.getElementById('pubAv-'+m.user_id);
    if(el && u) renderAvatar(el, u);
  });
  body.querySelectorAll('[data-clan-menu]').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      body.querySelectorAll('.clan-action-menu').forEach(menu=>{
        if(menu.id !== 'clanMenu-'+btn.dataset.clanMenu) menu.classList.add('hidden');
      });
      const menu = $('clanMenu-'+btn.dataset.clanMenu);
      if(menu) menu.classList.toggle('hidden');
    };
  });
  body.querySelectorAll('[data-clan-act="setrank"]').forEach(el=>{
    el.onchange = async (e)=>{
      e.stopPropagation();
      const newRank = Number(el.value);
      const uid = el.dataset.uid;
      const uname = el.dataset.uname || '';
      const oldRank = Number(el.dataset.currentRank || 0);
      if(!isLeader || newRank < 1 || newRank > 5 || newRank === oldRank) return;
      el.disabled = true;
        const { error } = await sb.from('clan_members').update({ rank:newRank, role:newRank>=5?'officer':'member' }).eq('clan_id',c.id).eq('user_id',uid);
        if(error){ el.disabled=false; el.value=String(oldRank); toast(error.message||'Failed'); return; }
        await logClanHistory(c.id,'set_rank',{target_user_id:uid,target_username:uname,details:{rank:newRank}});
        try{ await pushNotification(uid,'clan_rank','Clan rank updated','Your rank in '+c.name+' is now R'+newRank,{clan_id:c.id,rank:newRank}); }catch(e){}
        toast('Rank updated to R'+newRank);
        openClanPublicDetail(c);
      };
  });
  body.querySelectorAll('[data-clan-act]:not([data-clan-act="setrank"])').forEach(el=>{
    el.onclick = async (e)=>{
      e.stopPropagation();
      const act = el.dataset.clanAct;
      const uid = el.dataset.uid;
      const uname = el.dataset.uname || '';
      if(act === 'transfer'){
        if(!isLeader || uid === CURRENT_USER.id) return;
        if(!(await askConfirm('Transfer leadership','Make @'+uname+' the new leader?'))) return;
        const { error:e1 } = await sb.from('clan_members').update({rank:6,role:'leader'}).eq('clan_id',c.id).eq('user_id',uid);
        if(e1){ toast(e1.message||'Failed'); return; }
        const { error:e2 } = await sb.from('clan_members').update({rank:5,role:'officer'}).eq('clan_id',c.id).eq('user_id',CURRENT_USER.id);
        if(e2){ toast(e2.message||'Failed'); return; }
        await logClanHistory(c.id,'transfer_leadership',{target_user_id:uid,target_username:uname});
        try{ await pushNotification(uid,'clan_leader','You are the new clan leader','You are now the leader of '+c.name,{clan_id:c.id}); }catch(e){}
        toast('Leadership transferred');
        await loadMyClan(true);
        openClanPublicDetail(c);
        return;
      }
      if(act === 'kick'){
        if(!canKick || uid === CURRENT_USER.id) return;
        const targetRow = (members||[]).find(x=>x.user_id===uid);
        const targetRank = targetRow ? memberRank(targetRow) : 0;
        if(targetRank >= 6 || (!isLeader && targetRank >= myRank)) return;
        if(!(await askConfirm('Kick','Remove @'+uname+' from the clan?'))) return;
        const { error } = await sb.from('clan_members').delete().eq('clan_id',c.id).eq('user_id',uid);
        if(error){ toast(error.message||'Failed'); return; }
        await logClanHistory(c.id,'kick',{target_user_id:uid,target_username:uname});
        try{ await pushNotification(uid,'clan_kicked','Removed from clan','You were removed from '+c.name,{clan_id:c.id}); }catch(e){}
        toast('Member kicked');
        openClanPublicDetail(c);
      }
    };
  });
  document.addEventListener('click', window.__clanMenuOutsideHandler = function(e){
    if(!body.contains(e.target)) return;
    if(e.target.closest && e.target.closest('.clan-more-btn')) return;
    body.querySelectorAll('.clan-action-menu').forEach(menu=>menu.classList.add('hidden'));
  }, {once:true});
  if($('clanJoinOpenBtn')) $('clanJoinOpenBtn').onclick = async ()=>{ await joinOrRequestClan(c); openClanPublicDetail(c); };
  if($('clanRequestBtn')) $('clanRequestBtn').onclick = async ()=>{ await joinOrRequestClan(c); };
  if($('clanDetailChatBtn')) $('clanDetailChatBtn').onclick = ()=>{ openClanChat(); };
  if($('clanEditBtn')) $('clanEditBtn').onclick = ()=>{ closeClanManage(); openClanCreate(true); };
  if($('clanLeaveBtn')) $('clanLeaveBtn').onclick = async ()=>{
    if(!(await askConfirm('Leave','Leave this clan?'))) return;
    const { error } = await sb.from('clan_members').delete().eq('clan_id',c.id).eq('user_id',CURRENT_USER.id);
    if(error){ toast(error.message||'Failed'); return; }
    await logClanHistory(c.id,'leave',{target_user_id:CURRENT_USER.id,target_username:CURRENT_USER.username});
    MY_CLAN=null; CURRENT_USER.clan_tag=null; CURRENT_USER.clan_color=null; CURRENT_USER.clan_id=null;
    toast('Left clan'); closeClanManage();
    try{ refreshGameUI(); refreshProfileUI(); }catch(e){}
  };
  if($('clanDisbandBtn')) $('clanDisbandBtn').onclick = async ()=>{
    if(!(await askConfirm('Disband','Permanently delete this clan?'))) return;
    await logClanHistory(c.id,'disband',{});
    await sb.from('clan_join_requests').delete().eq('clan_id',c.id);
    await sb.from('clan_invites').delete().eq('clan_id',c.id);
    await sb.from('clan_history').delete().eq('clan_id',c.id);
    await sb.from('clan_members').delete().eq('clan_id',c.id);
    const { error } = await sb.from('clans').delete().eq('id',c.id);
    if(error){ toast(error.message||'Failed'); return; }
    MY_CLAN=null; toast('Clan disbanded'); closeClanManage();
    if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
  };
  if($('clanTransferSelfBtn')) $('clanTransferSelfBtn').onclick = async ()=>{
    const name = prompt('Username of new leader (must be a member):');
    if(!name) return;
    const { data: targetU } = await sb.from('users').select('id,username').ilike('username',name.trim()).limit(1).maybeSingle();
    if(!targetU){ toast('User not found'); return; }
    if(targetU.id===CURRENT_USER.id){ toast('Already leader'); return; }
    const mem=(members||[]).find(x=>x.user_id===targetU.id);
    if(!mem){ toast('That user is not in this clan'); return; }
    if(!(await askConfirm('Transfer','Make @'+targetU.username+' the new leader?'))) return;
    await sb.from('clan_members').update({rank:6,role:'leader'}).eq('clan_id',c.id).eq('user_id',targetU.id);
    await sb.from('clan_members').update({rank:5,role:'officer'}).eq('clan_id',c.id).eq('user_id',CURRENT_USER.id);
    await logClanHistory(c.id,'transfer_leadership',{target_user_id:targetU.id,target_username:targetU.username});
    toast('Leadership transferred');
    await loadMyClan(true); openClanPublicDetail(c);
  };
  if($('publicSaveRanksBtn')) $('publicSaveRanksBtn').onclick = async ()=>{
    const cfg = getClanRanksConfig(c);
    for(let n=1;n<=5;n++){
      const titleEl=body.querySelector(`[data-public-rank-title="${n}"]`);
      const colorEl=body.querySelector(`[data-public-rank-color="${n}"]`);
      const title=(titleEl && titleEl.value.trim()) || DEFAULT_RANKS[String(n)].title;
      const color=normalizeHexColor(colorEl && colorEl.value) || DEFAULT_RANKS[String(n)].color;
      const perms={invite:false,kick:false,edit:false,manage_ranks:false,accept_requests:false};
      body.querySelectorAll(`[data-public-rank-perm="${n}"]`).forEach(cb=>{ perms[cb.dataset.perm]=!!cb.checked; });
      perms.manage_ranks=false;
      cfg[String(n)]={title:title.slice(0,16),color,perms};
    }
    const {error}=await sb.from('clans').update({ranks_config:cfg,updated_at:new Date().toISOString()}).eq('id',c.id);
    if(error){toast(error.message||'Failed');return;}
    await logClanHistory(c.id,'edit_ranks',{details:{ranks:Object.keys(cfg)}});
    toast('Ranks saved');
    await loadMyClan(true);
    openClanPublicDetail(c);
  };
  if($('clanAdminForceDisband')) $('clanAdminForceDisband').onclick = async ()=>{
    if(!(await askConfirm('Disband','Admin: permanently delete this clan?'))) return;
    await sb.from('clan_join_requests').delete().eq('clan_id', c.id);
    await sb.from('clan_invites').delete().eq('clan_id', c.id);
    await sb.from('clan_history').delete().eq('clan_id', c.id);
    await sb.from('clan_members').delete().eq('clan_id', c.id);
    await sb.from('clans').delete().eq('id', c.id);
    await writeAudit('clan_disband', { details: { clan_id: c.id, name: c.name } });
    toast('Clan disbanded');
    closeClanManage();
    if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
  };
}

function ensureNotifRealtime(){
  if(!sb || !CURRENT_USER) return;
  const uid = CURRENT_USER.id;

  // Avoid duplicate channels
  try{
    if(window.__gzChannels){
      window.__gzChannels.forEach(ch=>{ try{ sb.removeChannel(ch); }catch(e){} });
    }
  }catch(e){}
  window.__gzChannels = [];

  const sub = (name, builder)=>{
    try{
      const ch = builder(sb.channel(name));
      ch.subscribe((status)=>{ /* ignore */ });
      window.__gzChannels.push(ch);
    }catch(e){ console.warn('rt', name, e); }
  };

  sub('notifications-live-'+uid, ch => ch
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:'user_id=eq.'+uid }, payload=>{
      try{ refreshNotifBadge(); }catch(e){}
      const n = payload.new;
      if(n && document.visibilityState === 'visible') toast('🔔 ' + (n.title || 'Notification'));
      const panel = $('notifPanel');
      if(panel && !panel.classList.contains('hidden')) try{ loadNotifications(); }catch(e){}
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'notifications', filter:'user_id=eq.'+uid }, ()=>{
      try{ refreshNotifBadge(); }catch(e){}
    })
  );

  sub('clan-member-live-'+uid, ch => ch
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'clan_members', filter:'user_id=eq.'+uid }, async ()=>{
      MY_CLAN = null;
      if(CURRENT_USER){ CURRENT_USER.clan_tag=null; CURRENT_USER.clan_color=null; CURRENT_USER.clan_id=null; }
      delete CLAN_CACHE[uid];
      toast('You were removed from the clan');
      try{ refreshGameUI(); }catch(e){}
      if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
      if($('pageProfile') && !$('pageProfile').classList.contains('hidden')) try{ refreshProfileUI(); }catch(e){}
      if($('clanManageModal') && !$('clanManageModal').classList.contains('hidden')) closeClanManage();
    })
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'clan_members', filter:'user_id=eq.'+uid }, async ()=>{
      await loadMyClan(true);
      toast('You joined a clan');
      try{ refreshGameUI(); }catch(e){}
      if($('pageClans') && !$('pageClans').classList.contains('hidden')) loadClansPage();
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'clan_members', filter:'user_id=eq.'+uid }, async (payload)=>{
      const prev = MY_CLAN && MY_CLAN.rank;
      await loadMyClan(true);
      const next = MY_CLAN && MY_CLAN.rank;
      if(prev != null && next != null && prev !== next){
        toast('Your clan rank is now R'+next+' · '+(MY_CLAN.clan ? rankTitle(MY_CLAN.clan, next) : ''));
      }
      try{ refreshGameUI(); }catch(e){}
      if($('clanManageModal') && !$('clanManageModal').classList.contains('hidden')) try{ renderClanManage(); }catch(e){}
    })
  );

  sub('clan-invites-live-'+uid, ch => ch
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'clan_invites', filter:'invitee_id=eq.'+uid }, async (payload)=>{
      // fallback if notification insert failed
      try{ refreshNotifBadge(); }catch(e){}
      toast('Clan invite received');
      const panel = $('notifPanel');
      if(panel && !panel.classList.contains('hidden')) try{ loadNotifications(); }catch(e){}
      // ensure a notification exists
      try{
        const inv = payload.new;
        if(inv && inv.id){
          const { count } = await sb.from('notifications').select('*',{count:'exact',head:true})
            .eq('user_id', uid).eq('type','clan_invite').eq('is_read', false);
          if((count||0) === 0){
            await pushNotification(uid, 'clan_invite', 'Clan invite', 'You received a clan invite', {
              invite_id: inv.id, clan_id: inv.clan_id, from_user_id: inv.inviter_id, status:'pending'
            });
            try{ refreshNotifBadge(); }catch(e){}
          }
        }
      }catch(e){}
    })
  );

  sub('clans-live-global', ch => ch
    .on('postgres_changes', { event:'*', schema:'public', table:'clans' }, ()=>{
      if($('pageClans') && !$('pageClans').classList.contains('hidden')){
        clearTimeout(window.__clansLiveT);
        window.__clansLiveT = setTimeout(()=> loadClansPage(), 350);
      }
    })
  );

  sub('clan-requests-live', ch => ch
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'clan_join_requests' }, async payload=>{
      const row = payload.new;
      if(!row || !MY_CLAN || !MY_CLAN.clan) return;
      if(row.clan_id !== MY_CLAN.clan.id) return;
      if(!myClanPerm('accept_requests')) return;
      try{ refreshNotifBadge(); }catch(e){}
      toast('New join request');
      if($('clanManageModal') && !$('clanManageModal').classList.contains('hidden')) try{ renderClanManage(); }catch(e){}
    })
  );

  // Polling fallback every 12s for badge (if realtime not enabled on project)
  if(window.__notifPoll) clearInterval(window.__notifPoll);
  window.__notifPoll = setInterval(()=>{
    if(!CURRENT_USER) return;
    if(document.visibilityState !== 'visible') return;
    try{ refreshNotifBadge(); }catch(e){}
  }, 12000);
}

function bindNotifUI(){

  const nb = $('notifToggleBtn');
  if(nb && !nb._bound){
    nb._bound = true;
    nb.onclick = (e)=>{ e.stopPropagation(); toggleNotifPanel(); };
  }
  const tb = $('themeToggleBtn');
  if(tb && !tb._bound){
    tb._bound = true;
    tb.onclick = ()=> toggleTheme();
  }
}
bindNotifUI();
document.addEventListener('click', (e)=>{
  const panel = $('notifPanel');
  if(!panel || panel.classList.contains('hidden')) return;
  if(!panel.contains(e.target) && e.target.id !== 'notifToggleBtn' && !(e.target.closest && e.target.closest('#notifToggleBtn'))){
    panel.classList.add('hidden');
  }
});

/* ---------- QUESTS (new feature, graceful if tables missing) ---------- */
function currentPeriodKey(type){
  const d = new Date();
  if(type === 'weekly'){
    // ISO week
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((t - yearStart) / 86400000) + 1)/7);
    return t.getUTCFullYear() + '-W' + String(weekNo).padStart(2,'0');
  }
  return d.toISOString().slice(0,10);
}

async function loadQuestsUI(){
  const box = $('questList');
  if(!box || !CURRENT_USER) return;
  box.innerHTML = '<div class="empty-note">Loading quests…</div>';
  try{
    const { data: quests, error } = await sb.from('quests').select('*').eq('active', true).order('type').order('target_value');
    if(error || !quests || !quests.length){
      box.innerHTML = `<div class="empty-note"><div class="big">🎯</div>Quests will appear after you run the new SQL schema.<br><small>No existing data was changed.</small></div>`;
      return;
    }
    const dailyKey = currentPeriodKey('daily');
    const weeklyKey = currentPeriodKey('weekly');
    const { data: progress } = await sb.from('user_quests')
      .select('*')
      .eq('user_id', CURRENT_USER.id)
      .in('period_key', [dailyKey, weeklyKey]);

    const progMap = {};
    (progress||[]).forEach(p => { progMap[p.quest_id + '|' + p.period_key] = p; });

    // Auto-create missing progress rows lightly
    for(const q of quests){
      const pk = q.type === 'weekly' ? weeklyKey : dailyKey;
      const key = q.id + '|' + pk;
      if(!progMap[key]){
        try{
          const { data: ins } = await sb.from('user_quests').insert({
            user_id: CURRENT_USER.id, quest_id: q.id, progress: 0, period_key: pk
          }).select().single();
          if(ins) progMap[key] = ins;
        }catch(e){}
      }
    }

    // Claim any completed-but-unclaimed rewards (e.g. weekly XP missed before)
    for(const q of quests){
      const pk = q.type === 'weekly' ? weeklyKey : dailyKey;
      const row = progMap[q.id + '|' + pk];
      if(!row || row.claimed) continue;
      const done = row.completed || (Number(row.progress)||0) >= (Number(q.target_value)||1);
      if(done){
        try{
          const ok = await grantQuestReward(q, row);
          if(ok){
            row.claimed = true; row.completed = true;
            progMap[q.id + '|' + pk] = row;
          }
        }catch(e){}
      }
    }

    box.innerHTML = quests.map(q=>{
      const pk = q.type === 'weekly' ? weeklyKey : dailyKey;
      const p = progMap[q.id + '|' + pk] || { progress:0, completed:false, claimed:false };
      const pct = Math.min(100, Math.round((p.progress / Math.max(1,q.target_value)) * 100));
      const done = p.completed || p.progress >= q.target_value;
      const claimed = !!p.claimed;
      const reward = (q.reward_xp?`+${q.reward_xp} XP`:'') + (q.reward_crowns?` · ⚔️${q.reward_crowns}`:'');
      const typeLabel = q.type === 'weekly' ? 'Weekly' : (q.type === 'daily' ? 'Daily' : q.type);
      const status = claimed ? 'Claimed' : (done ? 'Reward ready' : (reward || 'Reward'));
      return `<div class="quest-card ${done?'done':''} ${claimed?'claimed':''}">
        <div class="q-title">${escapeHtml(q.title)} <span style="font-size:10px;color:var(--text-dim);margin-left:4px;">${escapeHtml(typeLabel)}</span></div>
        <div class="q-desc">${escapeHtml(q.description||'')}</div>
        <div class="quest-progress"><i style="width:${pct}%"></i></div>
        <div class="quest-meta">
          <span>${Math.min(p.progress||0,q.target_value)}/${q.target_value}${done?' ✓':''}</span>
          <span class="quest-reward">${escapeHtml(status)}</span>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    box.innerHTML = `<div class="empty-note"><div class="big">🎯</div>Quests unavailable right now.<br><small>Run supabase_schema.sql to enable.</small></div>`;
  }
}

// Hook into profile refresh
const _origRefreshProfileUI = typeof refreshProfileUI === 'function' ? refreshProfileUI : null;
if(_origRefreshProfileUI){
  // already defined earlier; we call loadQuestsUI from a safe place
}

/* ========== SELECTED FEATURES v3.2 ========== */
async function enhanceAdminExtra(){
  const extra = $('adminExtraStats');
  if(!extra) return;
  try{
    const fiveMinAgo = new Date(Date.now() - 5*60*1000).toISOString();
    const dayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();
    const [onlineRes, gamesRes, clansRes, newUsersRes, susRes] = await Promise.all([
      sb.from('users').select('*',{count:'exact',head:true}).gt('last_online', fiveMinAgo).eq('banned', false),
      sb.from('game_rounds').select('*',{count:'exact',head:true}).gt('created_at', dayAgo),
      sb.from('clans').select('*',{count:'exact',head:true}),
      sb.from('users').select('*',{count:'exact',head:true}).gt('created_at', dayAgo),
      sb.from('suspicious_flags').select('*',{count:'exact',head:true}).eq('status','open')
    ]);
    extra.innerHTML = `
      <div class="admin-stat"><b>${onlineRes.count ?? '—'}</b><span>Online now</span></div>
      <div class="admin-stat"><b>${gamesRes.count ?? '—'}</b><span>Games today</span></div>
      <div class="admin-stat"><b>${clansRes.count ?? '—'}</b><span>Total clans</span></div>
      <div class="admin-stat"><b>${newUsersRes.count ?? '—'}</b><span>New users 24h</span></div>
      <div class="admin-stat"><b>${susRes.count ?? '—'}</b><span>Suspicious</span></div>
    `;
  }catch(e){
    extra.innerHTML = '<div class="empty-note" style="grid-column:1/-1;padding:12px;">Run latest SQL for full stats</div>';
  }
}

/* --- 15 Moderation queue --- */
async function openModQueue(){
  if(!isStaff()) return toast('Staff only');
  $('modQueueModal').classList.remove('hidden');
  const box = $('modQueueList');
  box.innerHTML = inlineLoadingHtml('Loading');
  try{
    const [reps, tix] = await Promise.all([
      sb.from('reports').select('*').eq('status','open').order('created_at',{ascending:false}).limit(40),
      sb.from('support_tickets').select('*').in('status',['open','active']).order('updated_at',{ascending:false}).limit(40)
    ]);
    const items = [];
    (reps.data||[]).forEach(r=> items.push({type:'report', at:r.created_at, title:r.reason||'Report', id:r.id, raw:r}));
    (tix.data||[]).forEach(t=> items.push({type:'ticket', at:t.updated_at||t.created_at, title:t.title, id:t.id, raw:t}));
    items.sort((a,b)=> new Date(b.at)-new Date(a.at));
    if(!items.length){ box.innerHTML = '<div class="empty-note">Queue is clear ✨</div>'; return; }
    box.innerHTML = items.map(it=>`
      <div class="lb-row" style="cursor:pointer;" data-type="${it.type}" data-id="${it.id}">
        <div class="lb-name">
          <div class="u"><span class="detail-chip ${it.type==='report'?'':'green'}">${it.type}</span> ${escapeHtml(it.title||'')}</div>
          <div style="font-size:10px;color:var(--text-dim);">${fmtDate(it.at)}</div>
        </div>
      </div>`).join('');
    box.querySelectorAll('.lb-row').forEach(row=>{
      row.onclick = ()=>{
        if(row.dataset.type==='report') openReportsList();
        else openSupportList('admin');
      };
    });
  }catch(e){ box.innerHTML = '<div class="empty-note">Error loading queue</div>'; }
}

/* --- 10 Online users --- */
async function openOnlineUsers(){
  if(!isStaff()) return toast('Staff only');
  $('onlineUsersModal').classList.remove('hidden');
  await loadOnlineUsers();
}
async function loadOnlineUsers(){
  const box = $('onlineUsersList');
  if(!box) return;
  box.innerHTML = inlineLoadingHtml('Loading');
  const q = ($('onlineSearch')&&$('onlineSearch').value||'').trim().toLowerCase();
  const since = new Date(Date.now()-5*60*1000).toISOString();
  let query = sb.from('users').select('*').gt('last_online', since).eq('banned',false).order('last_online',{ascending:false}).limit(80);
  const { data, error } = await query;
  if(error){ box.innerHTML = `<div class="empty-note">${escapeHtml(error.message)}</div>`; return; }
  let list = data||[];
  if(q) list = list.filter(u=> (u.username||'').toLowerCase().includes(q));
  if(!list.length){ box.innerHTML = '<div class="empty-note">No one online</div>'; return; }
  box.innerHTML = '';
  list.forEach((u,i)=>{
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML = `<div class="avatar sm" id="onAv${i}"></div>
      <div class="lb-name"><div class="u"><span class="online-dot"></span>${usernameWithTik(u)}</div>
      <div style="font-size:10px;color:var(--text-dim);">Lv ${u.level} · ${u.weekly_wins||0} week wins</div></div>
      <div class="lb-stats">${u.total_wins} wins</div>`;
    row.onclick = ()=> openUserModal(u);
    box.appendChild(row);
    renderAvatar(row.querySelector('#onAv'+i), u);
  });
}
$('onlineSearch') && ($('onlineSearch').oninput = ()=>{ clearTimeout(window.__onT); window.__onT=setTimeout(loadOnlineUsers,250); });

/* --- 13 Bulk actions --- */
async function runBulkAction(){
  if(!isStaff()) return toast('Staff only');
  const names = ($('bulkUsernames').value||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const action = $('bulkAction').value;
  const msg = ($('bulkMessage').value||'').trim();
  if(!names.length) return toast('Enter usernames');
  if((action==='notify'||action==='tag') && !msg) return toast('Enter message/tag');
  let ok=0, fail=0;
  for(const name of names){
    try{
      const { data:u } = await sb.from('users').select('*').ilike('username', name).limit(1).maybeSingle();
      if(!u){ fail++; continue; }
      if(action==='notify'){
        await sb.from('notifications').insert({ user_id:u.id, type:'admin', title:'Staff message', body:msg });
        ok++;
      } else if(action==='ban' && hasPerm('ban')){
        const until = new Date(Date.now()+24*60*60*1000).toISOString();
        await sb.from('users').update({ banned:true, ban_type:'normal', ban_reason:msg||'Bulk temp ban', ban_until:until }).eq('id',u.id);
        await sb.from('ban_history').insert({ user_id:u.id, action:'ban', ban_type:'normal', reason:msg||'Bulk', until_at:until, admin_id:CURRENT_USER.id });
        ok++;
      } else if(action==='tag'){
        await sb.from('user_tags').upsert({ user_id:u.id, tag:msg, created_by:CURRENT_USER.id }, { onConflict:'user_id,tag' });
        ok++;
      }
    }catch(e){ fail++; }
  }
  toast(`Done: ${ok} ok, ${fail} failed`);
  await writeAudit('bulk_'+action, { details:{ count:ok, names } });
}

/* --- 23 Suspicious --- */
async function openSuspicious(){
  if(!isStaff()) return toast('Staff only');
  $('suspiciousModal').classList.remove('hidden');
  const box = $('suspiciousList');
  box.innerHTML = inlineLoadingHtml('Loading');
  try{
    // also try auto-flag current scan lightly
    try{ if(DEVICE_ID) await sb.rpc('flag_device_multi_accounts', { p_device_id: DEVICE_ID, p_min_accounts: 3 }); }catch(e){}
    const { data, error } = await sb.from('suspicious_flags').select('*').eq('status','open').order('created_at',{ascending:false}).limit(50);
    if(error){ box.innerHTML = `<div class="empty-note">${escapeHtml(error.message||'Run SQL v3.1+')}</div>`; return; }
    if(!data||!data.length){ box.innerHTML = '<div class="empty-note">No open flags</div>'; return; }
    box.innerHTML = data.map(f=>`
      <div class="lb-row">
        <div class="lb-name">
          <div class="u"><span class="detail-chip" style="background:rgba(244,33,46,.15);color:var(--red);">${escapeHtml(f.severity||'med')}</span> ${escapeHtml(f.flag_type)}</div>
          <div style="font-size:10px;color:var(--text-dim);">${fmtDate(f.created_at)} · device ${escapeHtml((f.device_id||'').slice(0,12))}…</div>
        </div>
        <button class="btn btn-ghost" style="width:auto;padding:6px 10px;font-size:11px;" data-id="${f.id}">Resolve</button>
      </div>`).join('');
    box.querySelectorAll('button[data-id]').forEach(btn=>{
      btn.onclick = async (e)=>{ e.stopPropagation(); await sb.from('suspicious_flags').update({ status:'resolved' }).eq('id', btn.dataset.id); openSuspicious(); };
    });
  }catch(e){ box.innerHTML = '<div class="empty-note">Unavailable</div>'; }
}

/* --- 62 Daily report --- */
async function openDailyReport(){
  if(!isOwner() && !isStaff()) return toast('Staff only');
  $('dailyReportModal').classList.remove('hidden');
  const box = $('dailyReportBody');
  box.innerHTML = 'Loading…';
  try{
    const { data, error } = await sb.rpc('owner_daily_report');
    if(error || !data){
      // fallback manual
      const five = new Date(Date.now()-5*60*1000).toISOString();
      const day = new Date(Date.now()-24*60*60*1000).toISOString();
      const [u,on,nw,g,r,t,b] = await Promise.all([
        sb.from('users').select('*',{count:'exact',head:true}),
        sb.from('users').select('*',{count:'exact',head:true}).gt('last_online',five),
        sb.from('users').select('*',{count:'exact',head:true}).gt('created_at',day),
        sb.from('game_rounds').select('*',{count:'exact',head:true}).gt('created_at',day),
        sb.from('reports').select('*',{count:'exact',head:true}).eq('status','open'),
        sb.from('support_tickets').select('*',{count:'exact',head:true}).in('status',['open','active']),
        sb.from('users').select('*',{count:'exact',head:true}).eq('banned',true)
      ]);
      box.innerHTML = `
        <div><b>Total users:</b> ${u.count??'—'}</div>
        <div><b>Online (5m):</b> ${on.count??'—'}</div>
        <div><b>New 24h:</b> ${nw.count??'—'}</div>
        <div><b>Games 24h:</b> ${g.count??'—'}</div>
        <div><b>Open reports:</b> ${r.count??'—'}</div>
        <div><b>Open tickets:</b> ${t.count??'—'}</div>
        <div><b>Banned users:</b> ${b.count??'—'}</div>
        <div style="margin-top:8px;font-size:11px;color:var(--text-dim);">Generated ${new Date().toLocaleString()}</div>`;
      return;
    }
    const d = data;
    box.innerHTML = `
      <div><b>Total users:</b> ${d.total_users}</div>
      <div><b>Online (5m):</b> ${d.online_5m}</div>
      <div><b>New 24h:</b> ${d.new_24h}</div>
      <div><b>Games 24h:</b> ${d.games_24h} (wins ${d.wins_24h})</div>
      <div><b>Open reports:</b> ${d.open_reports}</div>
      <div><b>Open tickets:</b> ${d.open_tickets}</div>
      <div><b>Banned users:</b> ${d.banned_users}</div>
      <div><b>Banned devices:</b> ${d.banned_devices}</div>
      <div><b>Suspicious open:</b> ${d.open_suspicious}</div>
      <div><b>Clans:</b> ${d.total_clans}</div>
      <div><b>Messages 24h:</b> ${d.messages_24h}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-dim);">${d.generated_at||''}</div>`;
  }catch(e){ box.innerHTML = 'Error: '+escapeHtml(String(e.message||e)); }
}

/* --- 60 Device ban history --- */
async function searchDeviceHistory(){
  const did = ($('deviceHistoryInput').value||'').trim();
  const box = $('deviceHistoryList');
  if(!did) return toast('Enter device_id');
  box.innerHTML = inlineLoadingHtml('Searching');
  try{
    const { data: hist } = await sb.from('ban_history').select('*').eq('device_id', did).order('created_at',{ascending:false}).limit(50);
    const { data: ban } = await sb.from('banned_devices').select('*').eq('device_id', did).maybeSingle();
    let html = '';
    if(ban) html += `<div class="card" style="padding:10px;margin-bottom:8px;border-color:var(--red);"><b>Currently banned</b><br>Reason: ${escapeHtml(ban.reason||'—')}<br>At: ${fmtDate(ban.banned_at)}</div>`;
    if(!hist||!hist.length) html += '<div class="empty-note">No ban history for this device</div>';
    else html += hist.map(h=>`<div class="lb-row"><div class="lb-name"><div class="u">${escapeHtml(h.action)} · ${escapeHtml(h.ban_type||'')}</div>
      <div style="font-size:10px;color:var(--text-dim);">${fmtDate(h.created_at)} · ${escapeHtml(h.reason||'')}</div></div></div>`).join('');
    box.innerHTML = html;
  }catch(e){ box.innerHTML = '<div class="empty-note">Error</div>'; }
}

/* --- 6 Clan chat (rich) --- */
let _clanChatMemberMap = {}; // user_id -> {user, rank, role}

function clanMemberMeta(userId){
  return _clanChatMemberMap[userId] || null;
}

function renderClanChatBubble(m, clan){
  const isSys = m.msg_type && m.msg_type !== 'chat';
  if(isSys){
    return `<div style="text-align:center;font-size:11px;color:var(--text-dim);padding:6px 8px;opacity:.9;">${escapeHtml(m.body)}</div>`;
  }
  const mine = CURRENT_USER && m.sender_id === CURRENT_USER.id;
  const meta = clanMemberMeta(m.sender_id);
  const u = meta && meta.user ? meta.user : { username: m.sender_username||'?', tik:false };
  const rk = meta ? (meta.rank||2) : 2;
  const rTitle = clan ? rankTitle(clan, rk) : (meta && meta.role) || 'Member';
  const rCol = clan ? rankColor(clan, rk) : '#8b98a5';
  const nameHtml = usernameWithTik(u);
  const timeStr = m.created_at ? fmtDate(m.created_at) : '';
  return `<div class="clan-msg ${mine?'mine':''}" style="align-self:${mine?'flex-end':'flex-start'};max-width:88%;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
      <span style="font-size:12px;font-weight:800;">${nameHtml}</span>
      <span class="detail-chip" style="background:${escapeHtml(rCol)}22;color:${escapeHtml(rCol)};padding:1px 7px;font-size:10px;">R${rk} · ${escapeHtml(rTitle)}</span>
      ${u.level?`<span style="font-size:10px;color:var(--text-dim);">Lv ${u.level}</span>`:''}
    </div>
    <div style="background:${mine?'rgba(29,155,240,.18)':'var(--bg-elev)'};border:1px solid ${mine?'rgba(29,155,240,.35)':'var(--border)'};padding:9px 12px;border-radius:14px;border-bottom-${mine?'right':'left'}-radius:4px;font-size:13.5px;line-height:1.45;word-break:break-word;">${escapeHtml(m.body)}</div>
    <div style="font-size:9px;color:var(--text-dim);margin-top:3px;text-align:${mine?'right':'left'};opacity:.75;">${escapeHtml(timeStr)}</div>
  </div>`;
}

async function hydrateClanChatMembers(clanId){
  _clanChatMemberMap = {};
  try{
    const { data: mems } = await sb.from('clan_members').select('*').eq('clan_id', clanId);
    if(!mems||!mems.length) return;
    const ids = mems.map(m=>m.user_id);
    const { data: users } = await sb.from('users').select('id,username,tik,level,avatar_url,is_admin,is_owner').in('id', ids);
    const umap = {}; (users||[]).forEach(u=> umap[u.id]=u);
    mems.forEach(m=>{
      _clanChatMemberMap[m.user_id] = { user: umap[m.user_id]||{username:'?'}, rank: memberRank(m), role: m.role };
    });
  }catch(e){}
}

async function fetchClanMessages(clanId){
  const { data, error } = await sb.from('clan_messages').select('*').eq('clan_id', clanId).order('created_at',{ascending:true}).limit(120);
  return { data: data||[], error };
}

async function openClanChat(){
  // Only from clan details — members only
  if(!MY_CLAN || !MY_CLAN.clan) return toast('Join a clan first');
  $('clanChatModal').classList.remove('hidden');
  const c = MY_CLAN.clan;
  const col = c.color||'#1d9bf0';
  $('clanChatTitle').innerHTML = `<span style="color:${escapeHtml(col)};font-weight:800;">[${escapeHtml(String(c.tag||'').toUpperCase())}]</span> ${escapeHtml(c.name)}`;
  await loadClanChatInto($('clanChatMessages'), c);
}

async function loadClanChatInto(box, clan){
  if(!box || !clan) return;
  box.innerHTML = inlineLoadingHtml('Loading clan chat');
  await hydrateClanChatMembers(clan.id);
  const { data, error } = await fetchClanMessages(clan.id);
  if(error){ box.innerHTML = `<div class="empty-note">${escapeHtml(error.message||'Run SQL for clan_messages')}</div>`; return; }
  if(!data.length){ box.innerHTML = '<div class="empty-note"><div class="big">💬</div>No messages yet — say hi to your clan!</div>'; return; }
  box.innerHTML = data.map(m=> renderClanChatBubble(m, clan)).join('');
  box.scrollTop = box.scrollHeight;
}

async function loadClanChat(){
  if(!MY_CLAN||!MY_CLAN.clan) return;
  await loadClanChatInto($('clanChatMessages'), MY_CLAN.clan);
}

async function sendClanChatFrom(inputEl, refreshFn){
  if(!MY_CLAN||!CURRENT_USER) return toast('Join a clan first');
  const body = (inputEl && inputEl.value || '').trim();
  if(!body) return;
  if(window.__clanChatSending) return;
  window.__clanChatSending = true;
  const sendBtns = [$('clanChatSendBtn'), $('chatClanSendBtn')].filter(Boolean);
  sendBtns.forEach(b=>{ b.disabled = true; b.dataset._old = b.innerHTML; b.innerHTML = '<span class="gz-spin" aria-hidden="true"></span>'; });
  const boxes = [$('clanChatMessages'), $('chatClanMessages')].filter(Boolean);
  const tempId = 'tmp_'+Date.now();
  const pendingHtml = `<div class="clan-msg pending" data-temp="${tempId}" style="opacity:.85">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
      <b>@${escapeHtml(CURRENT_USER.username)}</b>
      <span class="gz-spin" style="width:12px;height:12px;border-width:2px;"></span>
      <span style="font-size:11px;color:var(--text-dim);">sending…</span>
    </div>
    <div>${escapeHtml(body)}</div>
  </div>`;
  if(inputEl) inputEl.value = '';
  boxes.forEach(box=>{
    if(!box) return;
    // remove empty note
    const empty = box.querySelector('.empty-note');
    if(empty) empty.remove();
    if(box.querySelector('.inline-loading')) box.innerHTML = '';
    box.insertAdjacentHTML('beforeend', pendingHtml);
    box.scrollTop = box.scrollHeight;
  });
  try{
    const { data, error } = await sb.from('clan_messages').insert({
      clan_id: MY_CLAN.clan.id,
      sender_id: CURRENT_USER.id,
      sender_username: CURRENT_USER.username,
      msg_type: 'chat',
      body
    }).select().single();
    if(error){
      boxes.forEach(box=>{
        const el = box && box.querySelector('[data-temp="'+tempId+'"]');
        if(el) el.remove();
      });
      toast(error.message||'Send failed');
      return;
    }
    // replace pending with real bubble (no full refresh)
    boxes.forEach(box=>{
      if(!box) return;
      const el = box.querySelector('[data-temp="'+tempId+'"]');
      if(el && typeof renderClanChatBubble === 'function'){
        el.outerHTML = renderClanChatBubble(data, MY_CLAN.clan);
      } else if(el){
        el.classList.remove('pending');
        el.removeAttribute('data-temp');
        const spin = el.querySelector('.gz-spin');
        if(spin) spin.remove();
        const st = el.querySelector('span[style*="sending"]');
        if(st) st.textContent = 'sent';
      }
    });
    boxes.forEach(box=>{ if(box) box.scrollTop = box.scrollHeight; });
  }catch(e){
    boxes.forEach(box=>{
      const el = box && box.querySelector('[data-temp="'+tempId+'"]');
      if(el) el.remove();
    });
    toast('Send failed');
  }finally{
    window.__clanChatSending = false;
    sendBtns.forEach(b=>{ b.disabled = false; b.innerHTML = b.dataset._old || 'Send'; });
    if(inputEl) inputEl.disabled = false;
  }
}

async function sendClanChat(){
  await sendClanChatFrom($('clanChatInput'), loadClanChat);
}

/* Chat tab: Messages | Clan */
let chatMainTab = 'dms';
function setChatMainTab(tab){
  chatMainTab = tab;
  const dms = tab === 'dms';
  if($('chatTabDMs')) $('chatTabDMs').classList.toggle('active', dms);
  if($('chatTabClan')) $('chatTabClan').classList.toggle('active', !dms);
  if($('chatDMsPane')) $('chatDMsPane').classList.toggle('hidden', !dms);
  if($('chatClanPane')) $('chatClanPane').classList.toggle('hidden', dms);
  if(!dms) loadChatClanPane();
}

async function loadChatClanPane(){
  const header = $('chatClanHeader');
  const box = $('chatClanMessages');
  const composer = $('chatClanComposer');
  const locked = $('chatClanLocked');
  if(!header||!box) return;

  await loadMyClan(false);
  if(!MY_CLAN || !MY_CLAN.clan){
    header.classList.add('hidden');
    box.classList.add('hidden');
    if(composer) composer.classList.add('hidden');
    if(locked){
      locked.classList.remove('hidden');
      locked.innerHTML = `<div class="big">🏰</div>You are not in a clan yet.<br><span style="font-size:12px;">Join or create a clan, then chat with members here.</span>
        <button type="button" class="btn btn-primary" id="chatClanGoClans" style="margin-top:12px;">Browse clans</button>`;
      const go = $('chatClanGoClans');
      if(go) go.onclick = ()=> goPage('clans');
    }
    return;
  }
  if(locked) locked.classList.add('hidden');
  header.classList.remove('hidden');
  box.classList.remove('hidden');
  if(composer) composer.classList.remove('hidden');

  const c = MY_CLAN.clan;
  const col = escapeHtml(c.color||'#1d9bf0');
  const tag = escapeHtml(String(c.tag||'').toUpperCase());
  const myRk = memberRank(MY_CLAN);
  const myTitle = rankTitle(c, myRk);
  header.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:900;font-size:15px;"><span style="color:${col};">[${tag}]</span> ${escapeHtml(c.name)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">Lv ${c.level||1} · ${c.member_count||0} members · Your rank: <b style="color:${escapeHtml(rankColor(c,myRk))}">R${myRk} ${escapeHtml(myTitle)}</b></div>
      </div>
      <button type="button" class="btn btn-ghost" id="chatClanOpenDetail" style="width:auto;padding:8px 12px;margin:0;font-size:12px;">Clan page</button>
    </div>`;
  const det = $('chatClanOpenDetail');
  if(det) det.onclick = ()=> openClanPublicDetail(c);

  await loadClanChatInto(box, c);
}

async function sendChatClanPane(){
  await sendClanChatFrom($('chatClanInput'), async ()=>{
    if(MY_CLAN&&MY_CLAN.clan) await loadClanChatInto($('chatClanMessages'), MY_CLAN.clan);
  });
}

/* --- 33 Welcome message: post system msg when member joins (hook) --- */
async function postClanWelcome(clan, newUser){
  if(!clan || !clan.welcome_enabled || !clan.welcome_message) return;
  try{
    await sb.from('clan_messages').insert({
      clan_id: clan.id, sender_id: null, sender_username: 'System',
      msg_type: 'welcome', body: (clan.welcome_message||'').replace(/\{user\}/g, newUser?.username||'member')
    });
  }catch(e){}
}

/* --- 20 Display badges --- */
function renderProfDisplayBadges(){
  const box = $('profDisplayBadges');
  if(!box || !CURRENT_USER) return;
  let badges = CURRENT_USER.display_badges;
  if(typeof badges === 'string') try{ badges = JSON.parse(badges); }catch(e){ badges = []; }
  if(!Array.isArray(badges) || !badges.length){ box.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No display badges selected</span>'; return; }
  const unlocked = Array.isArray(CURRENT_USER.achievements) ? CURRENT_USER.achievements : [];
  box.innerHTML = badges.map(id=>{
    const a = (typeof ACHIEVEMENTS!=='undefined'?ACHIEVEMENTS:[]).find(x=>x.id===id);
    return `<span class="detail-chip gold">${a?escapeHtml(a.name):id}</span>`;
  }).join('');
}
function openDisplayBadgesPicker(){
  if(!CURRENT_USER) return;
  $('displayBadgesModal').classList.remove('hidden');
  const box = $('displayBadgesList');
  let selected = CURRENT_USER.display_badges;
  if(typeof selected==='string') try{selected=JSON.parse(selected);}catch(e){selected=[];}
  if(!Array.isArray(selected)) selected = [];
  const unlocked = Array.isArray(CURRENT_USER.achievements) ? CURRENT_USER.achievements : [];
  const list = (typeof ACHIEVEMENTS!=='undefined'?ACHIEVEMENTS:[]).filter(a=>{
    try{ return unlocked.includes(a.id) || (typeof a.check==='function' && a.check(CURRENT_USER)); }
    catch(e){ return unlocked.includes(a.id); }
  });
  box.innerHTML = list.map(a=>{
    const on = selected.includes(a.id);
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" value="${escapeHtml(a.id)}" ${on?'checked':''}> <span>${escapeHtml(a.name)}</span>
      <span style="font-size:11px;color:var(--text-dim);margin-left:auto;">${escapeHtml(a.desc||'')}</span></label>`;
  }).join('') || '<div class="empty-note">Unlock achievements first</div>';
  box.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const n = box.querySelectorAll('input[type=checkbox]:checked').length;
      if(n > 3){ cb.checked = false; toast('Max 3 badges'); }
    });
  });
}
async function saveDisplayBadges(){
  if(!CURRENT_USER || !sb) return;
  const checks = [...document.querySelectorAll('#displayBadgesList input[type=checkbox]:checked')].map(c=>c.value);
  if(checks.length > 3) return toast('Max 3 badges');
  const btn = $('saveDisplayBadgesBtn');
  if(btn){ btn.disabled = true; }
  try{
    const { data, error } = await sb.from('users').update({ display_badges: checks }).eq('id', CURRENT_USER.id).select('id,display_badges,achievements,username').single();
    if(error){
      // column missing or RLS
      toast(error.message || 'Could not save badges — run latest SQL (display_badges column)');
      return;
    }
    CURRENT_USER.display_badges = (data && data.display_badges != null) ? data.display_badges : checks;
    if(typeof CURRENT_USER.display_badges === 'string'){
      try{ CURRENT_USER.display_badges = JSON.parse(CURRENT_USER.display_badges); }catch(e){ CURRENT_USER.display_badges = checks; }
    }
    if(!Array.isArray(CURRENT_USER.display_badges)) CURRENT_USER.display_badges = checks;
    $('displayBadgesModal').classList.add('hidden');
    renderProfDisplayBadges();
    toast('Badges saved');
  }catch(e){
    toast('Save failed');
  }finally{
    if(btn) btn.disabled = false;
  }
}

/* --- 40 User tags: show in user modal if present --- */
async function loadUserTags(userId, container){
  if(!container) return;
  try{
    const { data } = await sb.from('user_tags').select('*').eq('user_id', userId);
    if(!data||!data.length){ container.innerHTML = ''; return; }
    container.innerHTML = data.map(t=>`<span class="detail-chip" style="background:${escapeHtml(t.color||'#1d9bf0')}22;color:${escapeHtml(t.color||'#1d9bf0')}">${escapeHtml(t.tag)}</span>`).join('');
  }catch(e){ container.innerHTML = ''; }
}

/* Wire buttons */
(function bindNewFeatureButtons(){
  const on = (id, fn)=>{ const e=$(id); if(e && !e._nf){ e._nf=true; e.onclick = fn; } };
  on('admBtnModQueue', openModQueue);
  on('admBtnOnline', openOnlineUsers);
  on('admBtnBulk', ()=>{ if(!isStaff())return toast('Staff only'); $('bulkActionsModal').classList.remove('hidden'); });
  on('admBtnSuspicious', openSuspicious);
  on('admBtnDailyReport', openDailyReport);
  on('admBtnDeviceHistory', ()=>{ if(!isStaff())return toast('Staff only'); $('deviceHistoryModal').classList.remove('hidden'); });
  on('closeModQueue', ()=> $('modQueueModal').classList.add('hidden'));
  on('closeOnlineUsers', ()=> $('onlineUsersModal').classList.add('hidden'));
  on('closeBulk', ()=> $('bulkActionsModal').classList.add('hidden'));
  on('closeSuspicious', ()=> $('suspiciousModal').classList.add('hidden'));
  on('closeDailyReport', ()=> $('dailyReportModal').classList.add('hidden'));
  on('closeDeviceHistory', ()=> $('deviceHistoryModal').classList.add('hidden'));
  on('closeClanChat', ()=> $('clanChatModal').classList.add('hidden'));
  on('closeDisplayBadges', ()=> $('displayBadgesModal').classList.add('hidden'));
  on('bulkRunBtn', runBulkAction);
  on('deviceHistorySearchBtn', searchDeviceHistory);
  on('clanChatSendBtn', sendClanChat);
  on('chatClanSendBtn', sendChatClanPane);
  on('chatTabDMs', ()=> setChatMainTab('dms'));
  on('chatTabClan', ()=> setChatMainTab('clan'));
  on('editDisplayBadgesBtn', openDisplayBadgesPicker);
  on('saveDisplayBadgesBtn', saveDisplayBadges);
  const cin = $('clanChatInput');
  if(cin && !cin._nf){ cin._nf=true; cin.onkeydown = e=>{ if(e.key==='Enter') sendClanChat(); }; }
  const cin2 = $('chatClanInput');
  if(cin2 && !cin2._nf){ cin2._nf=true; cin2.onkeydown = e=>{ if(e.key==='Enter') sendChatClanPane(); }; }
})();

// Active tab style for chat
(function(){
  const style = document.createElement('style');
  style.textContent = `
    .chat-tab-btn.active{background:rgba(29,155,240,.15)!important;color:var(--text)!important;border-color:rgba(29,155,240,.4)!important;}
    #chatClanMessages .clan-msg{animation:fadeInMsg .2s ease;}
    @keyframes fadeInMsg{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  `;
  document.head.appendChild(style);
})();

// Patch loadAdminDash + goPage
(function(){
  const orig = window.loadAdminDash || (typeof loadAdminDash==='function'?loadAdminDash:null);
  if(typeof orig === 'function'){
    window.loadAdminDash = async function(){
      await orig.apply(this, arguments);
      enhanceAdminExtra();
      // re-bind in case DOM refreshed
      setTimeout(()=>{
        const map = {
          admBtnModQueue: openModQueue, admBtnOnline: openOnlineUsers,
          admBtnBulk: ()=>{$('bulkActionsModal').classList.remove('hidden');},
          admBtnSuspicious: openSuspicious, admBtnDailyReport: openDailyReport,
          admBtnDeviceHistory: ()=>{$('deviceHistoryModal').classList.remove('hidden');}
        };
        Object.keys(map).forEach(id=>{ const e=$(id); if(e) e.onclick = map[id]; });
      }, 50);
    };
  }
  const origGo = window.goPage;
  if(typeof origGo === 'function'){
    window.goPage = function(page){
      const r = origGo.apply(this, arguments);
      if(page === 'profile'){ setTimeout(()=>{ loadQuestsUI(); renderProfDisplayBadges(); }, 80); }
      if(page === 'admin') setTimeout(()=> enhanceAdminExtra(), 120);
      return r;
    };
  }
})();

/* ---------- Single-panel rule: only one modal/panel at a time ---------- */
(function setupExclusivePanels(){
  // Panels that should NOT force-close others when they open (confirm sits on top)
  const KEEP_OTHERS_WHEN_OPEN = new Set(['confirmModal']);
  // When these open, close other modals but not confirm if somehow open
  const PANEL_SELECTORS = '.modal-bg, #chatConversation';

  function closeAllPanels(exceptEl){
    document.querySelectorAll(PANEL_SELECTORS).forEach(el=>{
      if(exceptEl && (el === exceptEl || el.contains(exceptEl))) return;
      // never auto-hide confirm from this path if we're opening something else... 
      // actually user wants first closed when second opens — confirm is special
      if(el.id === 'confirmModal' && exceptEl && exceptEl.id !== 'confirmModal'){
        // closing a detail modal shouldn't leave confirm stuck; hide confirm too if switching panels
        // but opening confirm should not close userModal — handled by KEEP_OTHERS
      }
      el.classList.add('hidden');
    });
  }

  window.closeAllModals = function(exceptId){
    document.querySelectorAll('.modal-bg').forEach(el=>{
      if(exceptId && el.id === exceptId) return;
      el.classList.add('hidden');
    });
    const chat = document.getElementById('chatConversation');
    if(chat && (!exceptId || exceptId !== 'chatConversation')) chat.classList.add('hidden');
  };

  // Observe every modal-bg + chatConversation: when "hidden" is removed, close siblings
  function watchPanel(el){
    if(!el || el._exclusiveWatch) return;
    el._exclusiveWatch = true;
    const obs = new MutationObserver(()=>{
      if(el.classList.contains('hidden')) return;
      // newly visible
      if(KEEP_OTHERS_WHEN_OPEN.has(el.id)) return; // confirm overlays without closing parent
      document.querySelectorAll(PANEL_SELECTORS).forEach(other=>{
        if(other === el) return;
        if(other.id === 'confirmModal') return; // don't kill confirm if it's open (rare)
        other.classList.add('hidden');
      });
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  function watchAll(){
    document.querySelectorAll('.modal-bg').forEach(watchPanel);
    const chat = document.getElementById('chatConversation');
    if(chat) watchPanel(chat);
  }
  watchAll();

  // Also catch dynamically... panels are static in this app
  // Click on modal backdrop: optional close is already per-modal

  // When navigating main tabs, close any open modal
  const origGo = window.goPage;
  if(typeof origGo === 'function'){
    window.goPage = function(page){
      try{ window.closeAllModals(); }catch(e){}
      return origGo.apply(this, arguments);
    };
  }
})();

/* ---------- INIT ---------- */

/* ========== LIVE DUEL 1v1 (v3.3) ========== */
let ACTIVE_DUEL = null;
let DUEL_TARGET_USER = null;
let _duelChannel = null;
let _duelUiLocked = false;
let _pendingDuelInviteRoomId = null;
let _duelWatchTimer = null;

function isDuelActive(){
  return !!(ACTIVE_DUEL && (ACTIVE_DUEL.status === 'active' || ACTIVE_DUEL.status === 'pending'));
}
function isDuelPlaying(){
  return !!(ACTIVE_DUEL && ACTIVE_DUEL.status === 'active');
}
function duelOpponentId(){
  if(!ACTIVE_DUEL || !CURRENT_USER) return null;
  return ACTIVE_DUEL.creator_id === CURRENT_USER.id ? ACTIVE_DUEL.opponent_id : ACTIVE_DUEL.creator_id;
}
function setDuelUiLocked(on, title, sub){
  _duelUiLocked = !!on;
  window.__guessBusy = !!on;
  const ov = $('duelLockedOverlay');
  if(ov){
    ov.classList.toggle('show', !!on);
    if(title && $('duelLockTitle')) $('duelLockTitle').textContent = title;
    if(sub && $('duelLockSub')) $('duelLockSub').textContent = sub;
  }
  // disable keypad
  const kp = $('keypad');
  if(kp) kp.querySelectorAll('button').forEach(b=>{ b.disabled = !!on; });
  const mt = $('modeTabs');
  if(mt) mt.querySelectorAll('button').forEach(b=>{ b.disabled = !!on || isDuelPlaying(); });
}
function showDuelBanner(){
  const b = $('duelBanner');
  if(!b) return;
  if(!ACTIVE_DUEL || ACTIVE_DUEL.status === 'cancelled' || ACTIVE_DUEL.status === 'finished'){
    b.classList.remove('show');
    return;
  }
  b.classList.add('show');
  const mode = (ACTIVE_DUEL.mode||'normal');
  if($('duelBannerMode')) $('duelBannerMode').textContent = 'Mode: ' + mode.charAt(0).toUpperCase()+mode.slice(1) + (ACTIVE_DUEL.status==='pending'?' · waiting for opponent…':' · race!');
  if($('duelBannerVs')){
    $('duelBannerVs').textContent = ACTIVE_DUEL.status==='pending' ? ' · Invite pending' : ' · vs opponent';
  }
  const cancel = $('duelCancelBtn');
  if(cancel){
    // creator can cancel pending; either can leave/cancel when active
    const canCancel = ACTIVE_DUEL.creator_id === CURRENT_USER.id || ACTIVE_DUEL.status === 'active';
    cancel.style.display = canCancel ? '' : 'none';
  }
}
function clearDuelLocal(keepOverlayMs){
  const was = ACTIVE_DUEL;
  ACTIVE_DUEL = null;
  window.__duelEnteredId = null; window.__duelFinishedId = null; window.__duelCancelledId = null;
  try{ if(_duelWatchTimer){ clearInterval(_duelWatchTimer); _duelWatchTimer=null; } }catch(e){}
  try{ if(_duelChannel){ sb.removeChannel(_duelChannel); } }catch(e){}
  _duelChannel = null;
  showDuelBanner();
  if(keepOverlayMs){
    setTimeout(()=>{ setDuelUiLocked(false); }, keepOverlayMs);
  } else {
    setDuelUiLocked(false);
  }
  // restore mode tabs
  const mt = $('modeTabs');
  if(mt) mt.querySelectorAll('button').forEach(b=>{ b.disabled = false; });
  return was;
}

async function openDuelCreateModal(u){
  if(!CURRENT_USER || !u) return;
  if(u.id === CURRENT_USER.id) return toast('Cannot duel yourself');
  // Viewer is always treated as online while using the app
  if(!isOnline(u.last_online)) return toast('Opponent must be online');
  if(isDuelActive()) return toast('You already have an active duel');
  DUEL_TARGET_USER = u;
  if($('duelTargetName')) $('duelTargetName').textContent = '@'+(u.username||'user');
  // default mode = current gameMode
  const wrap = $('duelModeSelect');
  if(wrap){
    wrap.querySelectorAll('button').forEach(btn=>{
      btn.classList.toggle('active', btn.dataset.mode === (gameMode||'normal'));
      btn.onclick = ()=>{
        wrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
      };
    });
  }
  $('duelCreateModal').classList.remove('hidden');
}

async function sendDuelRequest(){
  if(!CURRENT_USER || !DUEL_TARGET_USER){ toast('No target user'); return; }
  if(!sb){ toast('Database not connected'); return; }
  const wrap = $('duelModeSelect');
  let mode = 'normal';
  if(wrap){
    const act = wrap.querySelector('button.active');
    if(act) mode = act.dataset.mode || 'normal';
  }
  const btn = $('duelSendBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  try{
    // Mark ourselves online + cancel our own stale pending rooms (>30 min)
    try{
      await sb.from('users').update({ last_online: new Date().toISOString() }).eq('id', CURRENT_USER.id);
      CURRENT_USER.last_online = new Date().toISOString();
    }catch(e){}
    try{
      const stale = new Date(Date.now() - 30*60*1000).toISOString();
      await sb.from('duel_rooms').update({ status:'cancelled', locked:true, finished_at: new Date().toISOString() })
        .in('status', ['pending','active'])
        .or('creator_id.eq.'+CURRENT_USER.id+',opponent_id.eq.'+CURRENT_USER.id)
        .lt('created_at', stale);
    }catch(e){}

    const { data: opp } = await sb.from('users').select('id,username,last_online,banned').eq('id', DUEL_TARGET_USER.id).maybeSingle();
    if(!opp || opp.banned) { toast('User unavailable'); return; }
    if(!isOnline(opp.last_online)){ toast('Opponent is offline'); return; }

    let room = null;
    // Prefer RPC if schema applied
    try{
      const { data, error } = await sb.rpc('create_duel_v2', {
        p_creator_id: CURRENT_USER.id,
        p_opponent_id: DUEL_TARGET_USER.id,
        p_mode: mode,
        p_online_minutes: 5
      });
      if(error){
        console.warn('create_duel_v2', error);
        // fall through to direct insert
        if(String(error.message||'').toLowerCase().includes('function') || error.code === 'PGRST202'){
          room = null; // will use fallback
        } else {
          // other RPC error — still try fallback for robustness
          room = null;
        }
      } else {
        const res = data || {};
        if(!res.ok){
          const reasons = {
            opponent_offline: 'Opponent is offline',
            creator_offline: 'You appear offline — wait a moment and try again',
            busy: 'One of you already has a pending/active duel — cancel it first',
            banned: 'Account banned',
            self: 'Cannot duel yourself',
            user_not_found: 'User not found'
          };
          toast(reasons[res.reason] || ('Cannot create: '+(res.reason||'error')));
          return;
        }
        room = res.room;
      }
    }catch(e){ console.warn('rpc', e); room = null; }

    // Fallback: direct insert (works if table exists + RLS open)
    if(!room){
      // check busy
      const { data: busy } = await sb.from('duel_rooms').select('id').in('status',['pending','active'])
        .or('creator_id.eq.'+CURRENT_USER.id+',opponent_id.eq.'+CURRENT_USER.id+',creator_id.eq.'+DUEL_TARGET_USER.id+',opponent_id.eq.'+DUEL_TARGET_USER.id)
        .limit(1).maybeSingle();
      if(busy && busy.id){
        toast('One of you already has a pending/active duel — cancel it first');
        return;
      }
      const ranges = { easy:[0,10000], normal:[10000,500000], hard:[500000,1000000], extreme:[1000000,5000000] };
      const r = ranges[mode] || ranges.normal;
      const target = r[0] + Math.floor(Math.random() * (r[1]-r[0]+1));
      const { data: ins, error: ie } = await sb.from('duel_rooms').insert({
        creator_id: CURRENT_USER.id,
        opponent_id: DUEL_TARGET_USER.id,
        mode: mode,
        target: target,
        status: 'pending'
      }).select().single();
      if(ie){
        toast(ie.message || 'Failed — run SQL v3.3 (duel_rooms) in Supabase');
        console.error('duel insert', ie);
        return;
      }
      room = ins;
    }

    ACTIVE_DUEL = room;
    if($('duelCreateModal')) $('duelCreateModal').classList.add('hidden');
    toast('Duel request sent to @'+(DUEL_TARGET_USER.username||'user'));
    await pushNotification(DUEL_TARGET_USER.id, 'duel_invite', '⚔️ Duel request',
      '@'+CURRENT_USER.username+' challenges you to a '+mode+' duel. Accept?',
      { room_id: room.id, from_user_id: CURRENT_USER.id, from_username: CURRENT_USER.username, mode: mode, status: 'pending' });
    subscribeDuelRoom(room.id);
    showDuelBanner();
  }catch(e){
    console.error(e);
    toast(String(e.message||e));
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Send duel request'; }
  }
}

function subscribeDuelRoom(roomId){
  try{ if(_duelChannel){ sb.removeChannel(_duelChannel); } }catch(e){}
  _duelChannel = null;
  if(!roomId || !sb) return;
  try{
    const ch = sb.channel('duel-'+roomId)
      .on('postgres_changes', { event:'*', schema:'public', table:'duel_rooms', filter:'id=eq.'+roomId }, payload=>{
        const row = payload.new || payload.old;
        if(!row) return;
        handleDuelRoomUpdate(row, payload.eventType || payload.event);
      })
      .subscribe();
    _duelChannel = ch;
    startDuelWatch();
  }catch(e){ console.warn('duel rt', e); startDuelWatch(); }
}

function startDuelWatch(){
  try{ if(_duelWatchTimer) clearInterval(_duelWatchTimer); }catch(e){}
  window.__duelOfflineStrikes = 0;
  const OFFLINE_MS = 120000;   // 2 min without last_online
  const NEED_STRIKES = 3;      // need 3 consecutive polls (~6s) before cancel
  const GRACE_MS = 90000;      // no auto-cancel in first 90s of room life / accept
  const tick = async ()=>{
    if(!ACTIVE_DUEL || !CURRENT_USER || !sb) return;
    try{
      // keep me marked online while in duel
      try{
        await sb.from('users').update({ last_online: new Date().toISOString() }).eq('id', CURRENT_USER.id);
        CURRENT_USER.last_online = new Date().toISOString();
      }catch(e){}
      const { data: room, error: roomErr } = await sb.from('duel_rooms').select('*').eq('id', ACTIVE_DUEL.id).maybeSingle();
      if(roomErr){ console.warn('duel poll room', roomErr); return; }
      if(!room){
        // transient fetch miss — do not cancel immediately
        window.__duelOfflineStrikes = (window.__duelOfflineStrikes||0) + 1;
        if(window.__duelOfflineStrikes >= 5){
          clearDuelLocal(0);
          toast('Duel room closed');
          try{ startNewRound(); }catch(e){}
        }
        return;
      }
      window.__duelOfflineStrikes = 0;
      const prevStatus = ACTIVE_DUEL.status;
      if(room.status !== prevStatus || room.locked !== ACTIVE_DUEL.locked || room.winner_id !== ACTIVE_DUEL.winner_id){
        await handleDuelRoomUpdate(room, 'POLL');
        return;
      }
      if(room.status === 'finished' || room.status === 'cancelled') return;

      // grace: do not auto-cancel right after create/accept
      const t0 = room.accepted_at || room.updated_at || room.created_at;
      if(t0 && (Date.now() - new Date(t0).getTime()) < GRACE_MS){
        window.__duelOppMiss = 0;
        return;
      }

      const otherId = room.creator_id === CURRENT_USER.id ? room.opponent_id : room.creator_id;
      if(!otherId) return;
      const { data: other, error: oErr } = await sb.from('users').select('last_online').eq('id', otherId).maybeSingle();
      if(oErr || !other){
        // unknown / network — do not treat as offline
        return;
      }
      if(!other.last_online){
        // never cancel solely because last_online is null
        return;
      }
      const otherAge = Date.now() - new Date(other.last_online).getTime();
      if(otherAge > OFFLINE_MS){
        window.__duelOppMiss = (window.__duelOppMiss||0) + 1;
        if(window.__duelOppMiss < NEED_STRIKES) return;
        await sb.from('duel_rooms').update({
          status:'cancelled', locked:true, finished_at:new Date().toISOString(), updated_at:new Date().toISOString()
        }).eq('id', room.id).in('status',['pending','active']);
        await handleDuelRoomUpdate(Object.assign({}, room, { status:'cancelled', locked:true }), 'POLL');
      } else {
        window.__duelOppMiss = 0;
      }
    }catch(e){ console.warn('duel watch', e); }
  };
  _duelWatchTimer = setInterval(tick, 2000);
  tick();
  if(!window.__duelVisBound){
    window.__duelVisBound = true;
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'visible' && ACTIVE_DUEL) tick();
    });
  }
}

async function handleDuelRoomUpdate(row, eventType){
  if(!row) return;
  const prev = ACTIVE_DUEL;
  const prevStatus = prev && prev.status;
  ACTIVE_DUEL = Object.assign({}, ACTIVE_DUEL||{}, row);

  if(row.status === 'active'){
    enterDuelGame(row);
  } else if(row.status === 'finished'){
    if(window.__duelFinishedId === row.id) return;
    window.__duelFinishedId = row.id;
    await onDuelFinished(row);
  } else if(row.status === 'cancelled'){
    if(window.__duelCancelledId === row.id) return;
    window.__duelCancelledId = row.id;
    const wasPlaying = prevStatus === 'active' || prevStatus === 'pending';
    clearDuelLocal(0);
    if(wasPlaying) toast('Duel cancelled');
    if(prevStatus === 'active'){
      try{ startNewRound(); }catch(e){}
    }
  }
  showDuelBanner();
}

function enterDuelGame(room){
  if(!room || !CURRENT_USER) return;
  // avoid re-entering same active room repeatedly
  if(ACTIVE_DUEL && ACTIVE_DUEL.id === room.id && ACTIVE_DUEL.status === 'active' && room.status === 'active' && window.__duelEnteredId === room.id){
    ACTIVE_DUEL = Object.assign({}, ACTIVE_DUEL, room);
    showDuelBanner();
    return;
  }
  window.__duelEnteredId = room.id;
  window.__duelOppMiss = 0;
  window.__duelOfflineStrikes = 0;
  ACTIVE_DUEL = room;
  // mark me online immediately so the other side does not auto-cancel
  try{
    sb.from('users').update({ last_online: new Date().toISOString() }).eq('id', CURRENT_USER.id);
    CURRENT_USER.last_online = new Date().toISOString();
  }catch(e){}
  gameMode = room.mode || 'normal';
  try{ localStorage.setItem('gz_game_mode', gameMode); }catch(e){}
  const wrap = $('modeTabs');
  if(wrap){
    wrap.querySelectorAll('button').forEach(b=>{
      b.classList.toggle('active', b.dataset.mode === gameMode);
      b.disabled = true; // cannot change mode mid-duel
    });
  }
  currentTarget = Number(room.target);
  currentGuessCount = 0;
  typedDigits = '';
  guessHistory = [];
  roundStartTime = Date.now();
  renderTypedDigits();
  renderGuessHistory();
  if($('statThisGuesses')) $('statThisGuesses').textContent = '0';
  const rl = $('resultLabel');
  if(rl){ rl.className='result-label'; rl.textContent=''; }
  const m = GAME_MODES[gameMode] || GAME_MODES.normal;
  const rh = $('rangeHint');
  if(rh) rh.textContent = m.label + ' · DUEL · first correct wins';
  setDuelUiLocked(false);
  showDuelBanner();
  // navigate to game page without refresh
  try{ goPage('game'); }catch(e){}
  toast('⚔️ Duel started — same number, first correct wins!');
}

async function onDuelFinished(room){
  setDuelUiLocked(true, 'Result confirmed', 'Closing duel room…');
  const iWon = room.winner_id === CURRENT_USER.id;
  const rl = $('resultLabel');
  if(rl){
    rl.className = 'result-label show ' + (iWon ? 'win' : 'lower');
    rl.textContent = iWon ? ('You Win! '+Number(room.target).toLocaleString('en-US')) : ('Opponent won · number was '+Number(room.target).toLocaleString('en-US'));
  }
  if(iWon){
    try{
      const guesses = (room.creator_id === CURRENT_USER.id) ? (room.creator_guesses||currentGuessCount) : (room.opponent_guesses||currentGuessCount);
      await registerWin(guesses || currentGuessCount || 1, room.mode);
    }catch(e){}
    // refresh duel_wins (RPC may have already +1; fallback only if still same)
    try{
      const prev = Number(CURRENT_USER.duel_wins)||0;
      let { data: u2 } = await sb.from('users').select('duel_wins,duel_losses').eq('id', CURRENT_USER.id).maybeSingle();
      if(u2 && (Number(u2.duel_wins)||0) > prev){
        CURRENT_USER.duel_wins = u2.duel_wins;
      } else {
        // client fallback award
        const dw = prev + 1;
        const { data: u3 } = await sb.from('users').update({ duel_wins: dw }).eq('id', CURRENT_USER.id).select('duel_wins').single();
        CURRENT_USER.duel_wins = (u3 && u3.duel_wins) || dw;
      }
    }catch(e){}
    toast('🏆 Duel win! ⚔️ '+(CURRENT_USER.duel_wins||1));
    try{
      const weeklyKey = currentPeriodKey('weekly');
      const { data: dq } = await sb.from('quests').select('id,target_value').eq('code','weekly_duel_3').eq('active',true).maybeSingle();
      if(dq){
        const { data: row } = await sb.from('user_quests').select('*').eq('user_id',CURRENT_USER.id).eq('quest_id',dq.id).eq('period_key',weeklyKey).maybeSingle();
        if(!row){
          const prog = 1;
          const completed = prog >= dq.target_value;
          const { data: ins } = await sb.from('user_quests').insert({ user_id:CURRENT_USER.id, quest_id:dq.id, progress:prog, completed, claimed:false, period_key:weeklyKey }).select('*').maybeSingle();
          if(completed && ins){ try{ await grantQuestReward(dq, ins); }catch(e){} }
        } else if(!row.claimed){
          const prog = Math.min(dq.target_value, (Number(row.progress)||0)+1);
          const completed = prog >= dq.target_value;
          const { data: upd } = await sb.from('user_quests').update({ progress:prog, completed, updated_at:new Date().toISOString() }).eq('id', row.id).select('*').maybeSingle();
          if(completed && upd){ try{ await grantQuestReward(dq, upd); }catch(e){} }
        }
      }
    }catch(e){}
  } else {
    try{
      if(CURRENT_USER && (CURRENT_USER.current_streak||0) > 0){
        await sb.from('users').update({ current_streak: 0 }).eq('id', CURRENT_USER.id);
        CURRENT_USER.current_streak = 0;
        updateStreakPill();
      }
      const prev = Number(CURRENT_USER.duel_losses)||0;
      let { data: u2 } = await sb.from('users').select('duel_losses').eq('id', CURRENT_USER.id).maybeSingle();
      if(u2 && (Number(u2.duel_losses)||0) > prev){
        CURRENT_USER.duel_losses = u2.duel_losses;
      } else {
        const dl = prev + 1;
        await sb.from('users').update({ duel_losses: dl }).eq('id', CURRENT_USER.id);
        CURRENT_USER.duel_losses = dl;
      }
    }catch(e){}
    toast('Duel lost — better luck next time');
  }
  setTimeout(()=>{
    clearDuelLocal(0);
    try{ startNewRound(); }catch(e){}
  }, 2200);
}

async function cancelActiveDuel(){
  if(!ACTIVE_DUEL || !CURRENT_USER) return;
  const id = ACTIVE_DUEL.id;
  try{
    let ok = false;
    try{
      const { data, error } = await sb.rpc('cancel_duel', { p_room_id: id, p_user_id: CURRENT_USER.id });
      if(!error && data && data.ok) ok = true;
    }catch(e){}
    if(!ok){
      const { error } = await sb.from('duel_rooms').update({
        status:'cancelled', locked:true, finished_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('id', id);
      if(error){ toast(error.message||'Cancel failed'); return; }
    }
    const other = duelOpponentId();
    if(other){
      try{ await pushNotification(other, 'duel_cancel', 'Duel cancelled', '@'+CURRENT_USER.username+' cancelled the duel', { room_id: id }); }catch(e){}
    }
    clearDuelLocal(0);
    toast('Duel cancelled');
    try{ startNewRound(); }catch(e){}
  }catch(e){ toast(String(e.message||e)); }
}

async function claimDuelWinIfNeeded(guesses){
  if(!isDuelPlaying() || !CURRENT_USER) return false;
  setDuelUiLocked(true, 'Checking result…', 'Waiting for server to confirm the winner');
  const g = guesses || currentGuessCount || 1;
  try{
    let room = null;
    let winnerId = null;
    try{
      const { data, error } = await sb.rpc('claim_duel_win', {
        p_room_id: ACTIVE_DUEL.id,
        p_user_id: CURRENT_USER.id,
        p_guesses: g
      });
      if(!error && data){
        if(data.ok && data.room){ room = data.room; winnerId = data.winner_id; }
        else if(data.reason === 'locked' || data.reason === 'not_active'){
          if(data.winner_id){
            ACTIVE_DUEL = Object.assign({}, ACTIVE_DUEL, { status:'finished', winner_id: data.winner_id, locked:true });
            await onDuelFinished(ACTIVE_DUEL);
          }
          return false;
        }
      }
    }catch(e){ console.warn('claim rpc', e); }
    if(!room){
      // fallback atomic-ish: only update if still active and not locked
      const patch = {
        locked: true,
        status: 'finished',
        winner_id: CURRENT_USER.id,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if(ACTIVE_DUEL.creator_id === CURRENT_USER.id) patch.creator_guesses = g;
      else patch.opponent_guesses = g;
      const { data: upd, error: ue } = await sb.from('duel_rooms').update(patch)
        .eq('id', ACTIVE_DUEL.id).eq('status','active').eq('locked', false).select().single();
      if(ue || !upd){
        const { data: cur } = await sb.from('duel_rooms').select('*').eq('id', ACTIVE_DUEL.id).maybeSingle();
        if(cur && cur.status === 'finished'){
          await handleDuelRoomUpdate(cur, 'UPDATE');
          return false;
        }
        toast((ue && ue.message) || 'Could not confirm win');
        setDuelUiLocked(false);
        return false;
      }
      // fallback path: award duel_wins here (RPC path awards in SQL)
      try{
        const { data: me } = await sb.from('users').select('duel_wins').eq('id', CURRENT_USER.id).maybeSingle();
        await sb.from('users').update({ duel_wins: (Number(me&&me.duel_wins)||0)+1 }).eq('id', CURRENT_USER.id);
        const oid = ACTIVE_DUEL.creator_id === CURRENT_USER.id ? ACTIVE_DUEL.opponent_id : ACTIVE_DUEL.creator_id;
        const { data: op } = await sb.from('users').select('duel_losses').eq('id', oid).maybeSingle();
        if(oid) await sb.from('users').update({ duel_losses: (Number(op&&op.duel_losses)||0)+1 }).eq('id', oid);
      }catch(e){}
      room = upd;
      winnerId = upd.winner_id;
    }
    await handleDuelRoomUpdate(room, 'UPDATE');
    return true;
  }catch(e){
    toast(String(e.message||e));
    setDuelUiLocked(false);
    return false;
  }
}

async function showDuelInviteModal(roomId, fromUsername, mode){
  _pendingDuelInviteRoomId = roomId;
  const t = $('duelInviteText');
  if(t) t.innerHTML = '<b>@'+escapeHtml(fromUsername||'Someone')+'</b> challenged you to a <b>'+escapeHtml(mode||'normal')+'</b> duel.<br><br>Accept and both of you will enter the game live.';
  $('duelInviteModal').classList.remove('hidden');
}

async function acceptDuelInvite(){
  if(!_pendingDuelInviteRoomId || !CURRENT_USER) return;
  const roomId = _pendingDuelInviteRoomId;
  if($('duelInviteModal')) $('duelInviteModal').classList.add('hidden');
  try{
    try{
      await sb.from('users').update({ last_online: new Date().toISOString() }).eq('id', CURRENT_USER.id);
      CURRENT_USER.last_online = new Date().toISOString();
    }catch(e){}
    let room = null;
    try{
      const { data, error } = await sb.rpc('accept_duel', { p_room_id: roomId, p_user_id: CURRENT_USER.id });
      if(!error && data && data.ok) room = data.room;
      else if(data && !data.ok){
        toast(data.reason === 'not_pending' ? 'Invite expired' : ('Cannot accept: '+(data.reason||'')));
        return;
      }
    }catch(e){ console.warn('accept rpc', e); }
    if(!room){
      // fallback direct update
      const { data: cur } = await sb.from('duel_rooms').select('*').eq('id', roomId).maybeSingle();
      if(!cur || cur.status !== 'pending'){ toast('Invite expired'); return; }
      if(cur.opponent_id !== CURRENT_USER.id){ toast('Not your invite'); return; }
      const { data: upd, error: ue } = await sb.from('duel_rooms').update({
        status: 'active', started_at: new Date().toISOString(), accepted_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('id', roomId).eq('status','pending').select().single();
      if(ue || !upd){ toast((ue && ue.message) || 'Accept failed'); return; }
      room = upd;
    }
    try{
      await sb.from('notifications').update({ is_read: true })
        .eq('user_id', CURRENT_USER.id).eq('type','duel_invite');
    }catch(e){}
    // ping creator so they leave "waiting" state without refresh
    try{
      const creatorId = room.creator_id;
      if(creatorId && creatorId !== CURRENT_USER.id){
        await pushNotification(creatorId, 'duel_accepted', '⚔️ Duel accepted!',
          '@'+CURRENT_USER.username+' accepted your duel',
          { room_id: room.id, status: 'active', mode: room.mode });
      }
    }catch(e){}
    subscribeDuelRoom(room.id);
    await handleDuelRoomUpdate(room, 'UPDATE');
  }catch(e){ toast(String(e.message||e)); }
}

async function declineDuelInvite(){
  if(!_pendingDuelInviteRoomId || !CURRENT_USER) {
    $('duelInviteModal').classList.add('hidden');
    return;
  }
  const roomId = _pendingDuelInviteRoomId;
  $('duelInviteModal').classList.add('hidden');
  try{
    await sb.rpc('cancel_duel', { p_room_id: roomId, p_user_id: CURRENT_USER.id });
    try{
      await sb.from('notifications').update({ is_read: true })
        .eq('user_id', CURRENT_USER.id).eq('type','duel_invite');
    }catch(e){}
    toast('Duel declined');
  }catch(e){}
  _pendingDuelInviteRoomId = null;
}

// Best-effort cancel duel when tab closes
function beaconCancelDuel(){
  try{
    if(!ACTIVE_DUEL || !CURRENT_USER) return;
    if(ACTIVE_DUEL.status !== 'active' && ACTIVE_DUEL.status !== 'pending') return;
    const roomId = ACTIVE_DUEL.id;
    const uid = CURRENT_USER.id;
    const base = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') || '';
    const key = (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '') || '';
    if(!base || !key || !roomId) return;
    const body = JSON.stringify({ p_room_id: roomId, p_user_id: uid });
    const url = base + '/rest/v1/rpc/cancel_duel';
    if(navigator.sendBeacon){
      try{
        const blob = new Blob([body], { type: 'application/json' });
        // sendBeacon cannot set headers reliably; use fetch keepalive
      }catch(e){}
    }
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=minimal'
      },
      body,
      keepalive: true
    }).catch(()=>{});
  }catch(e){}
}
window.addEventListener('pagehide', beaconCancelDuel);
window.addEventListener('beforeunload', beaconCancelDuel);
// Prefer visibility + explicit cancel button; also cancel when leaving game page while active
const _origGoPageDuel = typeof goPage === 'function' ? goPage : null;

// Bind UI
(function bindDuelUI(){
  // Event delegation — modals may load after script; always works
  document.addEventListener('click', function(e){
    const t = e.target && (e.target.id ? e.target : (e.target.closest && e.target.closest('[id]')));
    if(!t || !t.id) return;
    if(t.id === 'closeDuelCreate'){ e.preventDefault(); const m=$('duelCreateModal'); if(m) m.classList.add('hidden'); }
    if(t.id === 'duelSendBtn'){ e.preventDefault(); sendDuelRequest(); }
    if(t.id === 'duelAcceptBtn'){ e.preventDefault(); acceptDuelInvite(); }
    if(t.id === 'duelDeclineBtn'){ e.preventDefault(); declineDuelInvite(); }
    if(t.id === 'duelCancelBtn'){
      e.preventDefault();
      (async ()=>{
        if(!(await askConfirm('Cancel duel', 'Close and delete this duel room?'))) return;
        await cancelActiveDuel();
      })();
    }
  });
})();

// Patch startNewRound to not randomize while duel active
(function patchStartNewRound(){
  const orig = startNewRound;
  if(typeof orig !== 'function') return;
  window.startNewRound = function(){
    if(isDuelPlaying()){
      // keep same target
      currentGuessCount = 0;
      typedDigits = '';
      guessHistory = [];
      renderTypedDigits();
      renderGuessHistory();
      if($('statThisGuesses')) $('statThisGuesses').textContent = '0';
      const rl = $('resultLabel');
      if(rl){ rl.className='result-label'; rl.textContent=''; }
      return;
    }
    return orig.apply(this, arguments);
  };
})();

// Patch openUserModal to add Duel button
(function patchOpenUserModal(){
  const orig = openUserModal;
  if(typeof orig !== 'function') return;
  window.openUserModal = async function(u){
    await orig.apply(this, arguments);
    // inject duel button near message / profile actions
    let box = $('duelActionBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'duelActionBox';
      box.style.cssText = 'margin-top:14px;padding:0 2px 8px;';
      const mb = document.querySelector('#userModal .modal-box');
      if(mb) mb.appendChild(box);
      else {
        const host = $('modalStatus') && $('modalStatus').parentNode;
        if(host && host.parentNode) host.parentNode.appendChild(box);
      }
    }
    const self = CURRENT_USER && u && u.id === CURRENT_USER.id;
    const oppOnline = !self && u && isOnline(u.last_online);
    if(self || !oppOnline){
      box.innerHTML = self ? '' : '<div style="font-size:11px;color:var(--text-dim);text-align:center;margin-top:6px;">⚔️ Duel only when opponent is online</div>';
      return;
    }
    box.innerHTML = `<button type="button" class="btn btn-primary" id="challengeDuelBtn" style="margin-top:4px;">⚔️ Challenge to Duel</button>
      <div style="font-size:11px;color:var(--text-dim);text-align:center;margin-top:6px;">Live 1v1 · first correct guess wins</div>`;
    const btn = $('challengeDuelBtn');
    if(btn) btn.onclick = ()=>{ 
      try{ document.getElementById('userModal') && document.getElementById('userModal').classList.add('hidden'); }catch(e){}
      openDuelCreateModal(u);
    };
  };
})();

// Patch loadNotifications to handle duel_invite actions
(function patchLoadNotifications(){
  const orig = loadNotifications;
  if(typeof orig !== 'function') return;
  window.loadNotifications = async function(){
    await orig.apply(this, arguments);
    // enhance duel_invite items with Accept/Decline if still present
    const panel = $('notifPanel');
    if(!panel) return;
    panel.querySelectorAll('.notif-item').forEach(item=>{
      if(item._duelBound) return;
      const title = (item.querySelector('.n-title')||{}).textContent || '';
      if(title.indexOf('Duel') === -1 && title.indexOf('duel') === -1 && title.indexOf('⚔️') === -1) return;
      item._duelBound = true;
    });
  };
})();

// Realtime: open invite modal on duel_invite notification insert
(function patchNotifRealtimeForDuel(){
  const orig = ensureNotifRealtime;
  if(typeof orig !== 'function') return;
  window.ensureNotifRealtime = function(){
    orig.apply(this, arguments);
    if(!sb || !CURRENT_USER) return;
    try{
      const ch = sb.channel('duel-invite-'+CURRENT_USER.id)
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:'user_id=eq.'+CURRENT_USER.id }, async payload=>{
          const n = payload.new;
          if(!n) return;
          let data = n.data || {};
          if(typeof data === 'string'){ try{ data = JSON.parse(data); }catch(e){ data={}; } }
          try{ refreshNotifBadge(); }catch(e){}
          if(n.type === 'duel_invite'){
            const roomId = data.room_id;
            if(!roomId) return;
            subscribeDuelRoom(roomId);
            showDuelInviteModal(roomId, data.from_username || 'Someone', data.mode || 'normal');
            try{ toast('⚔️ Duel request!'); }catch(e){}
            return;
          }
          if(n.type === 'duel_accepted'){
            const roomId = data.room_id;
            if(!roomId) return;
            try{
              const { data: room } = await sb.from('duel_rooms').select('*').eq('id', roomId).maybeSingle();
              if(room){
                subscribeDuelRoom(room.id);
                await handleDuelRoomUpdate(room, 'NOTIF');
              }
            }catch(e){}
            try{ toast('⚔️ Opponent accepted!'); }catch(e){}
            return;
          }
          if(n.type === 'duel_cancel'){
            const roomId = data.room_id;
            if(ACTIVE_DUEL && (!roomId || ACTIVE_DUEL.id === roomId)){
              await handleDuelRoomUpdate(Object.assign({}, ACTIVE_DUEL, { status:'cancelled', locked:true }), 'NOTIF');
            }
            try{ toast('Duel cancelled'); }catch(e){}
          }
        })
        .subscribe();
      if(!window.__gzChannels) window.__gzChannels = [];
      window.__gzChannels.push(ch);
    }catch(e){}
  };
})();

// When leaving game page during active duel → cancel
(function patchGoPageDuelLeave(){
  const orig = window.goPage;
  if(typeof orig !== 'function') return;
  window.goPage = function(page){
    try{
      if(isDuelPlaying() && page !== 'game'){
        // leaving game during duel = forfeit / cancel
        cancelActiveDuel();
      }
    }catch(e){}
    return orig.apply(this, arguments);
  };
})();

// Recover pending/active duel on boot
async function recoverActiveDuel(){
  if(!CURRENT_USER || !sb) return;
  try{
    const { data } = await sb.from('duel_rooms').select('*')
      .in('status', ['pending','active'])
      .or('creator_id.eq.'+CURRENT_USER.id+',opponent_id.eq.'+CURRENT_USER.id)
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if(data){
      ACTIVE_DUEL = data;
      subscribeDuelRoom(data.id);
      if(data.status === 'active') enterDuelGame(data);
      else showDuelBanner();
    }
  }catch(e){}
}

// Call recover after boot if possible
(function hookBootRecover(){
  const orig = typeof boot === 'function' ? boot : null;
  // poll for CURRENT_USER after load
  let tries = 0;
  const t = setInterval(()=>{
    tries++;
    if(CURRENT_USER){ clearInterval(t); recoverActiveDuel(); try{ ensureNotifRealtime(); }catch(e){} }
    if(tries > 40) clearInterval(t);
  }, 500);
})();

try{ buildKeypad(); }catch(e){ console.warn(e); }
try{ initModeTabs(); }catch(e){ console.warn(e); }
try{ boot(); }catch(e){
  console.error('boot call', e);
  try{ gzGoLogin(); }catch(e2){ try{ location.replace('../login/'); }catch(e3){} }
}