const SUPABASE_URL="https://ihbsxjgzrhnssluqooqh.supabase.co/functions/v1/view";
const SUPABASE_ANON_KEY="sb_publishable_hHyHJI5JkxgLNrXAwZrGWQ_vbD3kdrj";
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const BUCKET="files";
const MAX=16*1024*1024;