import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")!,KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,ADMIN=Deno.env.get("ADMIN_SECRET")||"",BUCKET="uploads",MAX=100*1024*1024;
const db=createClient(URL,KEY),allow=new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"]);
const C={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-admin-secret","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS"};
const out=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...C,"Content-Type":"application/json"}});
const clean=(n:string)=>n.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"file";
function ip(r:Request){return r.headers.get("x-forwarded-for")?.split(",")[0].trim()||r.headers.get("cf-connecting-ip")||null}
function magic(b:Uint8Array){let h=Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");if(h.startsWith("ffd8ff"))return"image/jpeg";if(h.startsWith("89504e47"))return"image/png";if(h.startsWith("47494638"))return"image/gif";if(h.startsWith("52494646")&&h.slice(16,24)=="57454250")return"image/webp";if(h.startsWith("1a45dfa3"))return"video/webm";if(h.slice(8,24).includes("66747970"))return"video/mp4";return null}
const pub=p=>`${URL}/storage/v1/object/public/${BUCKET}/${p}`;
serve(async r=>{
 if(r.method=="OPTIONS")return new Response("ok",{headers:C});try{let u=new URL(r.url);
 if(u.pathname.endsWith("/list")){let q=await db.from("media_files").select("id,original_name,mime,size_bytes,public_url,thumbnail_url,created_at").order("created_at",{ascending:false}).limit(100);if(q.error)throw q.error;return out({items:(q.data||[]).map(x=>({id:x.id,name:x.original_name,mime:x.mime,size:x.size_bytes,url:x.public_url,short_url:x.public_url,thumbnail_url:x.thumbnail_url,created_at:x.created_at}))})}
 if(u.pathname.endsWith("/admin")&&r.method=="GET"){if(r.headers.get("x-admin-secret")!==ADMIN)return out({error:"Unauthorized"},401);let q=await db.from("media_files").select("*").order("created_at",{ascending:false}).limit(1000);if(q.error)throw q.error;return out({items:q.data||[]})}
 if(u.pathname.includes("/admin/")&&r.method=="DELETE"){if(r.headers.get("x-admin-secret")!==ADMIN)return out({error:"Unauthorized"},401);let id=u.pathname.split("/admin/")[1],q=await db.from("media_files").select("storage_path").eq("id",id).single();if(q.error)return out({error:"Not found"},404);let rm=await db.storage.from(BUCKET).remove([q.data.storage_path]);if(rm.error)throw rm.error;let d=await db.from("media_files").delete().eq("id",id);if(d.error)throw d.error;return out({ok:true})}
 if(r.method!="POST")return out({error:"Method not allowed"},405);
 let f=await r.formData(),file=f.get("file"),mime=String(f.get("mime")||""),device=String(f.get("device_id")||"").slice(0,128);
 if(!(file instanceof File)||file.size<1||file.size>MAX)return out({error:"Invalid size/file"},413);
 if(!allow.has(mime))return out({error:"Only images/videos are allowed"},415);
 let m=magic(new Uint8Array(await file.slice(0,64).arrayBuffer()));if(!m||!allow.has(m))return out({error:"File signature rejected"},415);
 if((mime.startsWith("image/")&&m!=mime)||(mime=="video/webm"&&m!="video/webm")||((mime=="video/mp4"||mime=="video/quicktime")&&m!="video/mp4"))return out({error:"File content does not match type"},415);
 let id=crypto.randomUUID(),path=`Uploads/${id}-${clean(file.name)}`,up=await db.storage.from(BUCKET).upload(path,file.stream(),{contentType:mime,upsert:false});if(up.error)throw up.error;
 let row={id,storage_path:path,original_name:file.name,safe_name:clean(file.name),mime,size_bytes:file.size,public_url:pub(path),device_id:device||"unknown",ip_address:ip(r),user_agent:r.headers.get("user-agent")};
 let ins=await db.from("media_files").insert(row);if(ins.error){await db.storage.from(BUCKET).remove([path]);throw ins.error}return out({ok:true,id,url:pub(path)})
 }catch(e){return out({error:String(e?.message||e)},500)}});
