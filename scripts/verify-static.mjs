import { access } from 'node:fs/promises';

const requiredFiles = [
  'theme.css', 'finalized.html', 'profile.html', 'member.html', 'auth.html', 'rules.html', 'legal.html', 'admin.html',
  'src/admin.js', 'src/auth.js', 'src/feed.js', 'src/member.js', 'src/profile.js', 'src/theme.js', 'assets/admin-frame-gold.gif',
  'api/health.js', 'api/config.js', 'api/feed.js', 'api/anecdote.js', 'api/report.js', 'api/submit.js', 'api/private.js', 'api/private-share.js', 'api/account.js', 'api/admin/queue.js', 'api/admin/decision.js', 'api/admin/report.js',
  'lib/supabase-config.js', 'lib/auth-user.js', 'lib/moderator.js', 'lib/professions.js', 'lib/privacy-filter.js', 'lib/rate-limit.js', 'lib/vote-handler.js', 'lib/public-profile.js', 'lib/public-profile-handler.js', 'lib/admin-management.js', 'scripts/generate-admin-frame.mjs',
  'supabase/migrations/0001_initial_schema.sql', 'supabase/migrations/0002_authentication.sql', 'supabase/migrations/0003_publication_timestamp.sql', 'supabase/migrations/0004_profile_avatars.sql', 'supabase/migrations/0005_persistent_votes.sql', 'supabase/migrations/0006_refused_anecdote_retention.sql', 'supabase/migrations/0007_rate_limits.sql', 'supabase/migrations/0008_private_note_management.sql', 'supabase/migrations/0009_profile_privilege_protection.sql', 'supabase/migrations/0010_account_deletion.sql', 'supabase/migrations/0011_saved_anecdotes.sql', 'supabase/migrations/0012_hidden_moderation_status.sql', 'supabase/migrations/0013_moderation_notifications.sql', 'supabase/migrations/0014_owner_public_anecdote_deletion.sql', 'supabase/migrations/0015_rate_limit_repair.sql', 'supabase/migrations/0016_public_profiles_badges_and_contributors.sql', 'supabase/migrations/0017_admin_frame_catalog.sql'
];
await Promise.all(requiredFiles.map((file) => access(file)));
console.log(`Static deployment verified: ${requiredFiles.length} required files present.`);
