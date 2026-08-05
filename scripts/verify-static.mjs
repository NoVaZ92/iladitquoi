import { access } from 'node:fs/promises';

const requiredFiles = ['finalized.html', 'profile.html', 'auth.html', 'src/auth.js', 'api/health.js', 'api/ready.js', 'api/config.js', 'api/feed.js', 'api/submit.js', 'lib/supabase-config.js', 'lib/auth-user.js', 'supabase/migrations/0001_initial_schema.sql', 'supabase/migrations/0002_authentication.sql'];
await Promise.all(requiredFiles.map((file) => access(file)));
console.log(`Static deployment verified: ${requiredFiles.length} required files present.`);
