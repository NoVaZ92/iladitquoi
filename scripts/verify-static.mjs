import { access } from 'node:fs/promises';

const requiredFiles = [
  'finalized.html', 'profile.html', 'auth.html', 'rules.html', 'admin.html',
  'src/admin.js', 'src/auth.js', 'src/feed.js', 'src/profile.js',
  'api/health.js', 'api/ready.js', 'api/config.js', 'api/feed.js', 'api/anecdote.js', 'api/report.js', 'api/submit.js', 'api/admin/queue.js', 'api/admin/decision.js', 'api/admin/report.js',
  'lib/supabase-config.js', 'lib/auth-user.js', 'lib/moderator.js', 'lib/professions.js', 'lib/privacy-filter.js',
  'supabase/migrations/0001_initial_schema.sql', 'supabase/migrations/0002_authentication.sql', 'supabase/migrations/0003_publication_timestamp.sql'
];
await Promise.all(requiredFiles.map((file) => access(file)));
console.log(`Static deployment verified: ${requiredFiles.length} required files present.`);
