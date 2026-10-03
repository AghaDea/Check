// Paste your Supabase project values here.
const SUPABASE_URL = "https://ihbsxjgzrhnssluqooqh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hHyHJI5JkxgLNrXAwZrGWQ_vbD3kdrj";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_BUCKET = "files";
const MAX_BYTES = 16 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "video/"];
