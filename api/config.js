export default function handler(_request, response) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return response.status(503).json({ configured: false });
  response.status(200).json({ configured: true, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
}
