const $=s=>document.querySelector(s);
const status=$("#status");
function msg(t,good=false){status.textContent=t;status.className="status "+(good?"good":"")}
function fmt(n){if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(1)+" KB";return (n/1048576).toFixed(2)+" MB"}
function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

(async()=>{
 const requested=new URLSearchParams(location.search).get("id");
 if(!requested){msg("File ID is missing.");return}
 const {data:row,error}=await supabaseClient.from("files").select("*").eq("storage_path",requested).single();
 if(error||!row){msg("File not found.");return}
 await supabaseClient.rpc("increment_file_views",{p_id:row.id});
 $("#views").textContent=(row.views||0)+1;
 $("#downloads").textContent=row.downloads||0;
 $("#size").textContent=fmt(row.size_bytes);
 $("#name").textContent=row.original_name;
 $("#date").textContent=new Date(row.created_at).toLocaleString();
 $("#type").textContent=row.mime_type;
 const {data:pub}=supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(row.storage_path);
 const url=pub.publicUrl;
 $("#download").href=url;
 $("#download").onclick=async()=>{await supabaseClient.rpc("increment_file_downloads",{p_id:row.id})};
 if(row.mime_type.startsWith("image/")){
   $("#media").innerHTML=`<img src="${url}" alt="${esc(row.original_name)}">`;
 }else if(row.mime_type.startsWith("video/")){
   $("#media").innerHTML=`<video src="${url}" controls playsinline preload="metadata"></video>`;
 }else {msg("Unsupported file type.");return}
 msg("Ready",true);
})().catch(e=>msg(e.message||"Something went wrong."));
