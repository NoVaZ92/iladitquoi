export function getSupabaseConfig(environment = process.env) {
  return {
    url: environment.SUPABASE_URL || environment.NEXT_PUBLIC_SUPABASE_URL || '',
    publishableKey:
      environment.SUPABASE_PUBLISHABLE_KEY ||
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      environment.SUPABASE_ANON_KEY ||
      environment.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
    secretKey: environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY || ''
  };
}

export function getSupabaseAdminHeaders(secretKey) {
  const headers = { apikey: secretKey };
  if (!secretKey.startsWith('sb_secret_')) headers.authorization = `Bearer ${secretKey}`;
  return headers;
}
