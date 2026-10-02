import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret, x-client-device",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "uploads";
const MAX = 100 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"]);

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
}
function detect(bytes: Uint8Array): string | null {
  const h = Array.from(bytes).map(x => x.toString(16).padStart(2,"0")).join("");
  if (h.startsWith("ffd8ff")) return "image/jpeg";
  if (h.startsWith("89504e47")) return "image/png";
  if (h.startsWith("47494638")) return "image/gif";
  if (h.startsWith("52494646") && h.slice(16,24) === "57454250") return "image/webp";
  if (h.startsWith("1a45dfa3")) return "video/webm";
  if (h.slice(8,24).includes("66747970")) return "video/mp4";
  return null;
}
function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });

  try {
    const url = new URL(req.url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const path = url.pathname.replace(/\/+$/, "");

    if (path.endsWith("/list") && req.method === "GET") {
      const { data, error } = await supabase.from("media_files")
        .select("id,original_name,mime,size_bytes,public_url,thumbnail_url,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ items: (data || []).map(x => ({
        id:x.id,name:x.original_name,mime:x.mime,size:x.size_bytes,url:x.public_url,
        thumbnail_url:x.thumbnail_url,created_at:x.created_at,short_url:x.public_url
      }))});
    }

    if (path.endsWith("/admin") && req.method === "GET") {
      if (req.headers.get("x-admin-secret") !== Deno.env.get("ADMIN_SECRET"))
        return json({ error: "Unauthorized" }, 401);
      const { data, error } = await supabase.from("media_files").select("*")
        .order("created_at", { ascending: false }).limit(1000);
      if (error) return json({ error:error.message },500);
      return json({items:data||[]});
    }

    if (path.includes("/admin/") && req.method === "DELETE") {
      if (req.headers.get("x-admin-secret") !== Deno.env.get("ADMIN_SECRET"))
        return json({ error:"Unauthorized" },401);
      const id = path.split("/").pop();
      const { data, error } = await supabase.from("media_files").select("storage_path").eq("id",id).single();
      if (error || !data) return json({error:"File not found"},404);
      await supabase.storage.from(BUCKET).remove([data.storage_path]);
      const del = await supabase.from("media_files").delete().eq("id",id);
      if (del.error) return json({error:del.error.message},500);
      return json({ok:true});
    }

    if (req.method !== "POST") return json({error:"Method not allowed"},405);

    const form = await req.formData();
    const file = form.get("file");
    const deviceId = String(form.get("device_id") || req.headers.get("x-client-device") || "");
    if (!(file instanceof File)) return json({error:"No file"},400);
    if (file.size <= 0 || file.size > MAX) return json({error:"File size is invalid or above 100MB"},400);
    if (!ALLOWED.has(file.type)) return json({error:"File type is not allowed"},415);

    const first = new Uint8Array(await file.slice(0,64).arrayBuffer());
    const detected = detect(first);
    if (!detected) return json({error:"Invalid media signature"},415);
    if (detected === "video/mp4" && file.type !== "video/mp4" && file.type !== "video/quicktime")
      return json({error:"MIME/signature mismatch"},415);
    if (detected !== "video/mp4" && detected !== "video/webm" && detected !== file.type)
      return json({error:"MIME/signature mismatch"},415);

    const id = crypto.randomUUID();
    const safe = cleanName(file.name);
    const storagePath = `Uploads/${id}-${safe}`;

    const up = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type, upsert: false
    });
    if (up.error) return json({error:up.error.message},500);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const row = {
      id, storage_path:storagePath, original_name:file.name, safe_name:safe,
      mime:file.type, size_bytes:file.size, public_url:pub.publicUrl,
      device_id:deviceId || null, ip_address:getIp(req),
      user_agent:req.headers.get("user-agent"), thumbnail_url:null
    };
    const ins = await supabase.from("media_files").insert(row);
    if (ins.error) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return json({error:ins.error.message},500);
    }
    return json({ok:true,id,url:pub.publicUrl},201);
  } catch (e) {
    return json({error:e instanceof Error ? e.message : String(e)},500);
  }
});
