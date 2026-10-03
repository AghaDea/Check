const $=s=>document.querySelector(s);
const fileInput=$("#file"), drop=$("#drop"), pick=$("#pick"), preview=$("#preview"), status=$("#status");

pick.onclick=()=>fileInput.click();
drop.ondragover=e=>{e.preventDefault();drop.classList.add("drag")};
drop.ondragleave=()=>drop.classList.remove("drag");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("drag");if(e.dataTransfer.files[0]) upload(e.dataTransfer.files[0])};
fileInput.onchange=()=>fileInput.files[0]&&upload(fileInput.files[0]);

function msg(t,good=false){status.textContent=t;status.className="status "+(good?"good":"")}
function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function randomId(){return crypto.randomUUID().replaceAll("-","").slice(0,12)}

async function upload(file){
  if(!ALLOWED_PREFIXES.some(x=>file.type.startsWith(x))){msg("Only image and video files are allowed.");return}
  if(file.size>MAX_BYTES){msg("File is larger than 16 MB.");return}
  preview.classList.remove("hidden");
  preview.innerHTML=`<div class="progress"><div></div></div><span>${esc(file.name)} · ${(file.size/1048576).toFixed(2)} MB</span>`;
  msg("Uploading…");
  const id=randomId(), ext=(file.name.split(".").pop()||"bin").toLowerCase();
  const storagePath=`${id}.${ext}`;
  const {error:up}=await supabaseClient.storage.from(STORAGE_BUCKET).upload(storagePath,file,{contentType:file.type,upsert:false});
  if(up){msg("Upload failed: "+up.message);return}
  const {error:db}=await supabaseClient.from("files").insert({
    id, storage_path:storagePath, original_name:file.name, mime_type:file.type, size_bytes:file.size
  });
  if(db){await supabaseClient.storage.from(STORAGE_BUCKET).remove([storagePath]);msg("Database error: "+db.message);return}
  const url=`${location.origin}${location.pathname.replace(/\/?[^/]*$/,"/")}view.html?id=${encodeURIComponent(storagePath)}`;
  preview.innerHTML=`<div class="success">✓ Uploaded</div><div class="linkbox">${esc(url)}</div><button class="btn full" onclick="navigator.clipboard.writeText('${url.replaceAll("'","\\'")}');msg('Link copied.',true)">Copy link</button><a class="btn ghost full" href="${url}">Open file</a>`;
  msg("Upload complete.",true);
}