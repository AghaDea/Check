const $=s=>document.querySelector(s), input=$("#file"), drop=$("#drop");
$("#pick").onclick=()=>input.click();
drop.ondragover=e=>{e.preventDefault();drop.classList.add("drag")};
drop.ondragleave=()=>drop.classList.remove("drag");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("drag");if(e.dataTransfer.files[0])upload(e.dataTransfer.files[0])};
input.onchange=()=>input.files[0]&&upload(input.files[0]);
const status=t=>$("#status").textContent=t;
const esc=s=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function upload(f){
 if(!(f.type.startsWith("image/")||f.type.startsWith("video/")))return status("Only image/video files are allowed.");
 if(f.size>MAX)return status("Maximum size is 16 MB.");
 status("Uploading…");
 const id=crypto.randomUUID().replaceAll("-","").slice(0,12);
 const ext=(f.name.split(".").pop()||"bin").toLowerCase();
 const path=id+"."+ext;
 let r=await sb.storage.from(BUCKET).upload(path,f,{contentType:f.type,upsert:false});
 if(r.error)return status(r.error.message);
 r=await sb.from("files").insert({id,storage_path:path,original_name:f.name,mime_type:f.type,size_bytes:f.size});
 if(r.error){await sb.storage.from(BUCKET).remove([path]);return status(r.error.message)}
 const universal=`${SUPABASE_URL}/functions/v1/view?id=${encodeURIComponent(id)}`;
 $("#result").innerHTML=`<div class="result"><b>Uploaded ✓</b><div class="label">Universal link</div><div class="link">${esc(universal)}</div><button class="btn full" id="copy">Copy link</button><a class="btn ghost full" target="_blank" href="${universal}">Open</a></div>`;
 $("#copy").onclick=async()=>{await navigator.clipboard.writeText(universal);status("Copied ✓")};
 status("Done");
}