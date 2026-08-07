import { createClient } from '@supabase/supabase-js';
import { populateProfessionSelect } from '../lib/professions.js';

const AUTH_PAGE = '/auth.html';
const PROFILE_PAGE = '/profile.html';
const LEGACY_PRIVATE_KEYS = ['iladitquoi.private-notes', 'anecdotes-du-soin.private-notes'];
const LOCAL_ACCOUNT_KEYS = ['iladitquoi.saved-posts', 'anecdotes-du-soin.saved-posts', ...LEGACY_PRIVATE_KEYS];
const SAVED_KEY = 'iladitquoi.saved-posts';
const LEGACY_SAVED_KEY = 'anecdotes-du-soin.saved-posts';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
let supabase;
let currentSession = null;
let currentProfile = null;
let pendingConfirmationEmail = '';

function safeNext(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return PROFILE_PAGE;
  return value;
}

function redirectTarget() {
  return safeNext(new URLSearchParams(window.location.search).get('next'));
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor((Number(xp) || 0) / 100) + 1);
}

function progressWithinLevel(xp) {
  return Math.min(100, Math.max(0, Number(xp) || 0) % 100);
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
}

function setAvatar(element, pseudonym, avatarUrl = '') {
  if (!element) return;
  const initial = (pseudonym || '·').charAt(0).toUpperCase();
  element.textContent = initial;
  element.classList.toggle('has-image', Boolean(avatarUrl));
  element.style.backgroundImage = avatarUrl ? `url(${JSON.stringify(avatarUrl)})` : '';
}

function setAvatarPreview(avatarUrl, pseudonym) {
  setAvatar(document.querySelector('[data-avatar-preview]'), pseudonym, avatarUrl);
}

function frenchAuthError(error) {
  const code = error?.code || '';
  if (code === 'invalid_credentials') return 'Adresse e-mail ou mot de passe incorrect.';
  if (code === 'email_not_confirmed') return 'Confirmez votre adresse e-mail avant de vous connecter.';
  if (code === 'user_already_exists' || code === 'email_exists') return 'Un compte existe déjà avec cette adresse e-mail.';
  if (code === 'weak_password') return 'Choisissez un mot de passe plus robuste.';
  if (code === 'over_email_send_rate_limit' || error?.status === 429) return 'Trop de messages ont été demandés. Réessayez dans quelques minutes.';
  if (code === 'validation_failed') return 'Vérifiez les informations saisies.';
  if (String(error?.message || '').toLowerCase().includes('duplicate key')) return 'Ce pseudonyme est déjà utilisé.';
  return error?.message || 'Une erreur est survenue. Réessayez.';
}

async function createBrowserClient() {
  const response = await fetch('/api/configuration', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error('Supabase n’est pas configuré sur ce déploiement.');
  const config = await response.json();
  if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Configuration Supabase incomplète.');
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      flowType: 'pkce'
    }
  });
}

async function fetchProfile(session) {
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,pseudonym,profession,role,xp,avatar_url,created_at')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function updateAccountChrome(session, profile) {
  const signedIn = Boolean(session);
  const pseudonym = profile?.pseudonym || (signedIn ? 'Mon compte' : 'Se connecter');
  const level = levelFromXp(profile?.xp);
  const meta = signedIn
    ? profile?.profession
      ? `${profile.profession} · Niveau ${level}`
      : 'Profil à compléter'
    : 'Créer un compte';

  document.querySelectorAll('[data-auth-link]').forEach((link) => {
    link.href = signedIn ? PROFILE_PAGE : `${AUTH_PAGE}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    link.setAttribute('aria-label', signedIn ? `Ouvrir le profil de ${pseudonym}` : 'Se connecter ou créer un compte');
  });
  setText('[data-auth-name]', pseudonym);
  setText('[data-auth-meta]', meta);
  document.querySelectorAll('[data-auth-avatar]').forEach((element) => setAvatar(element, signedIn ? pseudonym : '→', profile?.avatar_url));
  setText('[data-auth-level]', signedIn ? level : 0);
  setText('[data-auth-xp]', Number(profile?.xp) || 0);
  document.querySelectorAll('.xp-line').forEach((element) => {
    element.style.setProperty('--xp-progress', `${signedIn ? progressWithinLevel(profile?.xp) : 0}%`);
  });
  document.querySelectorAll('[data-auth-guest]').forEach((element) => { element.hidden = signedIn; });
  document.querySelectorAll('[data-auth-member]').forEach((element) => { element.hidden = !signedIn; });
  document.querySelectorAll('[data-admin-link]').forEach((link) => { link.hidden = !['moderator', 'admin'].includes(profile?.role); });

  const anonymous = document.querySelector('#anonymous-toggle');
  const privateOption = document.querySelector('#visibility-choice option[value="private"]');
  if (anonymous) {
    anonymous.disabled = !signedIn;
    if (!signedIn) anonymous.checked = true;
    anonymous.dispatchEvent(new Event('change'));
  }
  if (privateOption) privateOption.disabled = !signedIn;
  const visibility = document.querySelector('#visibility-choice');
  if (!signedIn && visibility?.value === 'private') {
    visibility.value = 'public';
    visibility.dispatchEvent(new Event('change'));
  }
}

function bindGlobalAccountActions() {
  document.querySelectorAll('[data-auth-signout]').forEach((button) => {
    if (button.dataset.authBound === 'true') return;
    button.dataset.authBound = 'true';
    button.addEventListener('click', async () => {
      button.disabled = true;
      await supabase.auth.signOut();
      window.location.replace('/');
    });
  });
}

function formatDate(value) {
  if (!value) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function emptyState(message) {
  const element = document.createElement('div');
  element.className = 'private-empty';
  element.textContent = message;
  return element;
}

function showProfileStatus(message, success = false) {
  const status = document.querySelector('[data-profile-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-success', success);
}

function confirmProfileAction({ dialogId, cancelId, closeId, confirmId, fallback }) {
  const dialog = document.querySelector(dialogId);
  const cancel = document.querySelector(cancelId);
  const close = document.querySelector(closeId);
  const confirm = document.querySelector(confirmId);
  if (!dialog?.showModal || !cancel || !close || !confirm) {
    return Promise.resolve(window.confirm(fallback));
  }

  return new Promise((resolve) => {
    const controller = new AbortController();
    const finish = (confirmed) => {
      controller.abort();
      if (dialog.open) dialog.close();
      resolve(confirmed);
    };
    const options = { signal: controller.signal };
    cancel.addEventListener('click', () => finish(false), options);
    close.addEventListener('click', () => finish(false), options);
    confirm.addEventListener('click', () => finish(true), options);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    }, options);
    dialog.showModal();
  });
}

function confirmPublicAnecdoteDeletion() {
  return confirmProfileAction({
    dialogId: '#delete-public-anecdote-dialog',
    cancelId: '#cancel-public-anecdote-delete',
    closeId: '#close-public-anecdote-delete',
    confirmId: '#confirm-public-anecdote-delete',
    fallback: 'Supprimer définitivement cette anecdote ?'
  });
}

function confirmPrivateDeletion() {
  return confirmProfileAction({
    dialogId: '#delete-private-note-dialog',
    cancelId: '#cancel-private-note-delete',
    closeId: '#close-private-note-delete',
    confirmId: '#confirm-private-note-delete',
    fallback: 'Supprimer définitivement cette note privée ?'
  });
}

function confirmPrivateLinkRevocation() {
  return confirmProfileAction({
    dialogId: '#revoke-private-links-dialog',
    cancelId: '#cancel-private-link-revoke',
    closeId: '#close-private-link-revoke',
    confirmId: '#confirm-private-link-revoke',
    fallback: 'Révoquer les liens de partage de cette note ?'
  });
}

function confirmAccountDeletion() {
  const dialog = document.querySelector('#delete-account-dialog');
  const cancel = document.querySelector('#cancel-account-delete');
  const close = document.querySelector('#close-account-delete');
  const confirm = document.querySelector('#confirm-account-delete');
  const input = document.querySelector('#account-delete-confirmation');
  if (!dialog?.showModal || !cancel || !close || !confirm || !input) {
    return Promise.resolve(window.prompt('Tapez SUPPRIMER pour effacer définitivement votre compte.') === 'SUPPRIMER');
  }

  return new Promise((resolve) => {
    const controller = new AbortController();
    const finish = (confirmed) => {
      controller.abort();
      if (dialog.open) dialog.close();
      resolve(confirmed);
    };
    const options = { signal: controller.signal };
    input.value = '';
    confirm.disabled = true;
    input.addEventListener('input', () => { confirm.disabled = input.value.trim() !== 'SUPPRIMER'; }, options);
    cancel.addEventListener('click', () => finish(false), options);
    close.addEventListener('click', () => finish(false), options);
    confirm.addEventListener('click', () => finish(true), options);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    }, options);
    dialog.showModal();
    input.focus();
  });
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportPersonalData(button) {
  if (!currentSession) return;
  button.disabled = true;
  showProfileStatus('Préparation de votre export…');
  try {
    const [anecdotesResult, votesResult, reportsResult, linksResult, savedResult, notificationsResult] = await Promise.all([
      supabase.from('anecdotes').select('id,author_label,profession,theme,body,visibility,moderation_status,moderation_reason,vote_score,submitted_at,published_at,updated_at').eq('author_id', currentSession.user.id).order('submitted_at', { ascending: false }),
      supabase.from('votes').select('anecdote_id,value,created_at').eq('user_id', currentSession.user.id).order('created_at', { ascending: false }),
      supabase.from('reports').select('id,anecdote_id,reason,created_at,resolved_at').eq('reporter_id', currentSession.user.id).order('created_at', { ascending: false }),
      supabase.from('private_share_links').select('id,anecdote_id,expires_at,revoked_at,created_at,last_opened_at').order('created_at', { ascending: false }),
      supabase.from('saved_anecdotes').select('anecdote_id,created_at').eq('user_id', currentSession.user.id).order('created_at', { ascending: false }),
      supabase.from('account_notifications').select('id,anecdote_id,kind,message,created_at').eq('user_id', currentSession.user.id).order('created_at', { ascending: false })
    ]);
    const failure = [anecdotesResult, votesResult, reportsResult, linksResult, savedResult, notificationsResult].find((result) => result.error);
    if (failure?.error) throw failure.error;
    const selection = (() => {
      try { return JSON.parse(localStorage.getItem('iladitquoi.saved-posts') || '[]'); } catch { return []; }
    })();
    downloadJson(`iladitquoi-donnees-${new Date().toISOString().slice(0, 10)}.json`, {
      exported_at: new Date().toISOString(),
      account: {
        id: currentSession.user.id,
        email: currentSession.user.email || null,
        profile: currentProfile
      },
      anecdotes: anecdotesResult.data || [],
      votes: votesResult.data || [],
      reports: reportsResult.data || [],
      private_share_links: linksResult.data || [],
      saved_anecdotes: savedResult.data || [],
      moderation_notifications: notificationsResult.data || [],
      local_selections: Array.isArray(selection) ? selection : []
    });
    showProfileStatus('Votre export a été téléchargé.', true);
  } catch {
    showProfileStatus('Votre export n’a pas pu être préparé. Rechargez la page puis réessayez.');
  } finally {
    button.disabled = false;
  }
}

async function deleteAccount(button) {
  if (!currentSession || !await confirmAccountDeletion()) return;
  button.disabled = true;
  showProfileStatus('Suppression définitive du compte…');
  try {
    const response = await fetch('/api/account', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${currentSession.access_token}` }
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'account_deletion_failed');
      error.retryAfter = Number(data.retryAfter) || 0;
      throw error;
    }
    LOCAL_ACCOUNT_KEYS.forEach((key) => localStorage.removeItem(key));
    await supabase.auth.signOut({ scope: 'local' });
    window.location.replace('/?account-deleted=1');
  } catch (error) {
    button.disabled = false;
    const minutes = Math.max(1, Math.ceil((error.retryAfter || 1) / 60));
    showProfileStatus(error.message === 'rate_limit_exceeded'
      ? `Trop de demandes de suppression. Réessayez dans ${minutes} min.`
      : 'Votre compte n’a pas pu être supprimé. Rechargez la page puis réessayez.');
  }
}

async function deleteOwnedPublicAnecdote(anecdote, button) {
  if (!currentSession || !await confirmPublicAnecdoteDeletion()) return;
  button.disabled = true;
  showProfileStatus('Suppression de l’anecdote…');
  try {
    const { data, error } = await supabase
      .from('anecdotes')
      .delete()
      .eq('id', anecdote.id)
      .eq('author_id', currentSession.user.id)
      .eq('visibility', 'public')
      .in('moderation_status', ['published', 'refused', 'hidden'])
      .select('id');
    if (error || !data?.length) throw error || new Error('anecdote_not_deleted');
    showProfileStatus('Votre anecdote a été supprimée.', true);
    await renderProfilePage(currentSession, currentProfile);
  } catch {
    button.disabled = false;
    showProfileStatus('Cette anecdote n’a pas pu être supprimée. Rechargez la page puis réessayez.');
  }
}

async function deletePrivateAnecdote(anecdote, button) {
  if (!currentSession || !await confirmPrivateDeletion()) return;
  button.disabled = true;
  showProfileStatus('Suppression de la note privée…');
  try {
    const { data, error } = await supabase
      .from('anecdotes')
      .delete()
      .eq('id', anecdote.id)
      .eq('author_id', currentSession.user.id)
      .eq('visibility', 'private')
      .select('id');
    if (error || !data?.length) throw error || new Error('private_note_not_deleted');
    showProfileStatus('La note privée et ses liens ont été supprimés.', true);
    await renderProfilePage(currentSession, currentProfile);
  } catch {
    button.disabled = false;
    showProfileStatus('Cette note privée n’a pas pu être supprimée. Rechargez la page puis réessayez.');
  }
}

async function revokePrivateLinks(anecdote, button) {
  if (!currentSession || !await confirmPrivateLinkRevocation()) return;
  button.disabled = true;
  showProfileStatus('Révocation des liens privés…');
  try {
    const { data, error } = await supabase
      .from('private_share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('anecdote_id', anecdote.id)
      .is('revoked_at', null)
      .select('id');
    if (error) throw error;
    showProfileStatus(data?.length ? 'Les liens privés ont été révoqués.' : 'Aucun lien privé actif à révoquer.', true);
    await renderProfilePage(currentSession, currentProfile);
  } catch {
    button.disabled = false;
    showProfileStatus('Les liens privés n’ont pas pu être révoqués. Rechargez la page puis réessayez.');
  }
}

function legacyPrivateNotes() {
  for (const key of LEGACY_PRIVATE_KEYS) {
    try {
      const notes = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(notes) && notes.length) return { key, notes };
    } catch { /* unreadable storage behaves as an empty legacy notebook */ }
  }
  return { key: LEGACY_PRIVATE_KEYS[0], notes: [] };
}

function localSavedPosts() {
  for (const key of [SAVED_KEY, LEGACY_SAVED_KEY]) {
    try {
      const posts = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(posts) && posts.length) return posts;
    } catch { /* unreadable storage behaves as an empty selection list */ }
  }
  return [];
}

async function migrateLocalSavedPosts(session) {
  if (!session) return;
  const ids = [...new Set(localSavedPosts().map((post) => post?.id).filter((id) => UUID_PATTERN.test(id)))].slice(0, 100);
  if (!ids.length) return;
  const { data: existing, error } = await supabase
    .from('saved_anecdotes')
    .select('anecdote_id')
    .in('anecdote_id', ids);
  if (error) return;
  const known = new Set((existing || []).map((item) => item.anecdote_id));
  await Promise.all(ids.filter((id) => !known.has(id)).map((anecdoteId) => supabase
    .from('saved_anecdotes')
    .insert({ user_id: session.user.id, anecdote_id: anecdoteId })));
}

async function migrateLegacyPrivateNotes(session, profile) {
  if (!session || !profile?.profession) return;
  const { key, notes } = legacyPrivateNotes();
  if (!notes.length) return;
  const remaining = [];
  for (const note of notes) {
    const text = typeof note?.text === 'string' ? note.text.trim() : '';
    if (!text) continue;
    try {
      const response = await fetch('/api/private', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ text, theme: note.theme || 'leger' })
      });
      if (!response.ok) remaining.push(note);
    } catch {
      remaining.push(note);
    }
  }
  try {
    if (remaining.length) localStorage.setItem(key, JSON.stringify(remaining));
    else LEGACY_PRIVATE_KEYS.forEach((legacyKey) => localStorage.removeItem(legacyKey));
  } catch { /* a later authenticated session can retry the migration */ }
}

function profileEntry(anecdote) {
  const article = document.createElement('article');
  const isPrivate = anecdote.visibility === 'private';
  const status = anecdote.moderation_status || 'pending';
  article.className = `profile-entry ${isPrivate ? 'is-private' : `is-${status}`}`;
  const header = document.createElement('div');
  header.className = 'profile-entry-top';
  const main = document.createElement('div');
  main.className = 'profile-entry-main';
  const meta = document.createElement('div');
  meta.className = 'profile-entry-meta';
  meta.textContent = `${anecdote.profession} · ${anecdote.theme} · ${formatDate(anecdote.submitted_at)}`;
  const copy = document.createElement('p');
  copy.textContent = anecdote.body;
  main.append(meta, copy);
  const state = document.createElement('span');
  state.className = `moderation-state ${isPrivate ? 'is-private' : `is-${status}`}`;
  state.textContent = isPrivate ? 'Privée' : status === 'published' ? 'Validée' : status === 'hidden' ? 'Retirée du fil' : status === 'refused' ? 'Refusée' : 'En cours d’examen';
  header.append(main, state);
  const foot = document.createElement('div');
  foot.className = 'profile-entry-foot';
  const submitted = document.createElement('span');
  submitted.textContent = `${isPrivate ? 'Enregistrée' : 'Soumise'} le ${formatDate(anecdote.submitted_at)}`;
  foot.append(submitted);
  if (isPrivate) {
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'private-share-button';
    share.textContent = 'Créer un lien privé';
    share.addEventListener('click', () => window.dispatchEvent(new CustomEvent('anecdotes:private-share', { detail: { anecdoteId: anecdote.id } })));
    foot.append(share);
    if (Number(anecdote.activeShareCount) > 0) {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'private-revoke-button';
      revoke.textContent = `Révoquer ${anecdote.activeShareCount} lien${anecdote.activeShareCount > 1 ? 's' : ''}`;
      revoke.addEventListener('click', () => revokePrivateLinks(anecdote, revoke));
      foot.append(revoke);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'private-delete-button';
    remove.title = 'Supprimer définitivement cette note privée';
    const icon = document.createElement('i');
    icon.dataset.lucide = 'trash-2';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'Supprimer';
    remove.append(icon, label);
    remove.addEventListener('click', () => deletePrivateAnecdote(anecdote, remove));
    foot.append(remove);
  } else if (status === 'published') {
    const votes = document.createElement('span');
    votes.textContent = `${Number(anecdote.vote_score) || 0} votes`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'public-delete-button';
    remove.title = 'Supprimer définitivement cette anecdote';
    const icon = document.createElement('i');
    icon.dataset.lucide = 'trash-2';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'Supprimer';
    remove.append(icon, label);
    remove.addEventListener('click', () => deleteOwnedPublicAnecdote(anecdote, remove));
    foot.append(votes, remove);
  } else if (['refused', 'hidden'].includes(status)) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'refused-delete-button';
    remove.title = 'Supprimer définitivement cette anecdote';
    const icon = document.createElement('i');
    icon.dataset.lucide = 'trash-2';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = 'Supprimer';
    remove.append(icon, label);
    remove.addEventListener('click', () => deleteOwnedPublicAnecdote(anecdote, remove));
    if (status === 'refused') {
      const automaticDeletion = document.createElement('span');
      const refusedAt = new Date(anecdote.updated_at || anecdote.submitted_at);
      const deletionDate = new Date(refusedAt.getTime() + (30 * 24 * 60 * 60 * 1000));
      automaticDeletion.textContent = `Suppression automatique à partir du ${formatDate(deletionDate)}`;
      foot.append(automaticDeletion);
    }
    foot.append(remove);
  }
  article.append(header);
  if (!isPrivate && ['refused', 'hidden'].includes(status)) {
    const decision = document.createElement('div');
    decision.className = `moderation-decision is-${status}`;
    const title = document.createElement('strong');
    title.textContent = status === 'hidden' ? 'Motif du retrait' : 'Motif du refus';
    const reason = document.createElement('span');
    reason.textContent = anecdote.moderation_reason || 'Cette anecdote ne respecte pas les règles de publication.';
    decision.append(title, reason);
    article.append(decision);
  } else if (!isPrivate && status === 'pending') {
    const decision = document.createElement('div');
    decision.className = 'moderation-decision is-pending';
    decision.textContent = anecdote.moderation_reason || 'Votre anecdote est en attente de validation par la modération.';
    article.append(decision);
  }
  article.append(foot);
  return article;
}

async function renderProfilePage(session, profile) {
  if (!session) {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`${AUTH_PAGE}?next=${encodeURIComponent(next)}`);
    return;
  }
  if (!profile) {
    setText('[data-profile-status]', 'Votre profil n’a pas pu être chargé. Vérifiez la migration Supabase.');
    return;
  }
  if (!profile.profession) {
    window.location.replace(`${AUTH_PAGE}?mode=profile&next=${encodeURIComponent(PROFILE_PAGE)}`);
    return;
  }

  const level = levelFromXp(profile.xp);
  setText('[data-profile-pseudonym]', profile.pseudonym);
  setText('[data-profile-profession]', `${profile.profession} · Niveau ${level}`);
  document.querySelectorAll('[data-profile-avatar]').forEach((element) => setAvatar(element, profile.pseudonym, profile.avatar_url));
  setText('[data-profile-xp]', Number(profile.xp) || 0);

  const [{ data: anecdotes, error }, { data: activeShareLinks, error: linksError }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabase
      .from('anecdotes')
      .select('id,profession,theme,body,moderation_status,moderation_reason,vote_score,submitted_at,published_at,updated_at,visibility')
      .eq('author_id', session.user.id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('private_share_links')
      .select('anecdote_id')
      .is('revoked_at', null),
    supabase
      .from('account_notifications')
      .select('id,kind,message,created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(4)
  ]);

  const publishedList = document.querySelector('#published-list');
  const moderationList = document.querySelector('#pending-list');
  const privateList = document.querySelector('#private-list');
  if (error) {
    publishedList?.replaceChildren(emptyState('Impossible de charger vos publications.'));
    moderationList?.replaceChildren(emptyState('Impossible de charger le suivi de modération.'));
    privateList?.replaceChildren(emptyState('Impossible de charger votre carnet privé.'));
    return;
  }

  if (linksError) showProfileStatus('Les liens privés ne sont pas disponibles pour le moment.');
  if (notificationsError) showProfileStatus('Les notifications de modération ne sont pas disponibles pour le moment.');
  const activeShareCounts = new Map();
  (activeShareLinks || []).forEach((link) => {
    activeShareCounts.set(link.anecdote_id, (activeShareCounts.get(link.anecdote_id) || 0) + 1);
  });

  const publicAnecdotes = (anecdotes || []).filter((item) => item.visibility === 'public');
  const privateAnecdotes = (anecdotes || [])
    .filter((item) => item.visibility === 'private')
    .map((item) => ({ ...item, activeShareCount: activeShareCounts.get(item.id) || 0 }));
  const published = publicAnecdotes.filter((item) => item.moderation_status === 'published');
  const moderation = publicAnecdotes.filter((item) => item.moderation_status !== 'published');
  setText('[data-profile-published-count]', published.length);
  setText('[data-profile-published-summary]', `${published.length} au total`);
  const pendingCount = moderation.filter((item) => item.moderation_status === 'pending').length;
  const refusedCount = moderation.filter((item) => item.moderation_status === 'refused').length;
  const hiddenCount = moderation.filter((item) => item.moderation_status === 'hidden').length;
  const moderationSummary = [
    pendingCount ? `${pendingCount} en cours` : '',
    refusedCount ? `${refusedCount} refusée${refusedCount > 1 ? 's' : ''}` : '',
    hiddenCount ? `${hiddenCount} retirée${hiddenCount > 1 ? 's' : ''}` : ''
  ].filter(Boolean).join(' · ');
  setText('#pending-summary', moderationSummary || 'Aucune décision en attente');

  if (publishedList) publishedList.replaceChildren(...(published.length ? published.map(profileEntry) : [emptyState('Aucune anecdote publiée pour le moment.') ]));
  setText('#private-summary', privateAnecdotes.length ? `${privateAnecdotes.length} note${privateAnecdotes.length > 1 ? 's' : ''}` : 'Carnet vide');
  if (privateList) privateList.replaceChildren(...(privateAnecdotes.length ? privateAnecdotes.map(profileEntry) : [emptyState('Votre carnet est vide. Ajoutez une note depuis la page d’accueil.') ]));
  if (moderationList) moderationList.replaceChildren(...(moderation.length ? moderation.map(profileEntry) : [emptyState('Aucune anecdote n’attend de décision.') ]));
  const notificationList = document.querySelector('#notification-list');
  if (notificationList) {
    const items = notifications || [];
    notificationList.replaceChildren(...(items.length ? items.map((notification) => {
      const item = document.createElement('div');
      item.className = `notification-item is-${notification.kind}`;
      const message = document.createElement('p');
      message.textContent = notification.message;
      const date = document.createElement('span');
      date.textContent = formatDate(notification.created_at);
      item.append(message, date);
      return item;
    }) : [emptyState('Aucune nouvelle décision de modération.')]));
  }
  window.dispatchEvent(new Event('anecdotes:icons-updated'));

  const badges = [];
  if (published.length >= 1) badges.push('Première publication');
  if (published.length >= 5) badges.push('5 anecdotes');
  if (published.length >= 10) badges.push('10 anecdotes');
  if ((Number(profile.xp) || 0) >= 100) badges.push('100 XP');
  if ((Number(profile.xp) || 0) >= 500) badges.push('500 XP');
  setText('[data-profile-badge-count]', badges.length);
  const badgeList = document.querySelector('[data-profile-badges]');
  if (badgeList) {
    badgeList.replaceChildren(...badges.map((label) => {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = label;
      return badge;
    }));
    if (!badges.length) badgeList.append(emptyState('Votre premier badge arrivera avec votre première publication.'));
  }
}

function setAuthView(name) {
  document.querySelectorAll('[data-auth-view]').forEach((view) => { view.hidden = view.dataset.authView !== name; });
  document.querySelectorAll('[data-auth-entry]').forEach((element) => { element.hidden = !['signin', 'signup'].includes(name); });
  document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.authTab === name));
  });
  const titles = {
    signin: 'Retrouvez vos anecdotes',
    signup: 'Créez votre compte',
    'signup-confirmation': 'Activez votre compte',
    reset: 'Réinitialisez votre mot de passe',
    'update-password': 'Choisissez un nouveau mot de passe',
    profile: 'Finalisez votre profil',
    'signed-in': 'Votre compte est connecté'
  };
  setText('#auth-title', titles[name] || titles.signin);
}

function setStatus(message, isError = false) {
  const status = document.querySelector('#auth-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function setBusy(form, busy) {
  form.querySelectorAll('button, input, select').forEach((control) => { control.disabled = busy; });
  form.setAttribute('aria-busy', String(busy));
}

function renderAuthPageState(session, profile, requestedMode, params) {
  const profileForm = document.querySelector('#profile-form');
  if (requestedMode === 'update-password') {
    setAuthView(session ? 'update-password' : 'signin');
    if (!session) setStatus('Ce lien de réinitialisation est invalide ou a expiré.', true);
    return;
  }
  if (session && (!profile?.profession || requestedMode === 'profile')) {
    if (profileForm) {
      profileForm.elements.pseudonym.value = profile?.pseudonym || '';
      profileForm.elements.profession.value = profile?.profession || '';
      setAvatarPreview(profile?.avatar_url, profile?.pseudonym);
    }
    setAuthView('profile');
    return;
  }
  if (session) {
    setText('[data-signed-in-email]', session.user.email || 'Compte connecté');
    if (params.has('confirmed')) {
      window.location.replace(redirectTarget());
      return;
    }
    setAuthView('signed-in');
    return;
  }
  setAuthView(requestedMode === 'signup' ? 'signup' : 'signin');
}

async function setupAuthPage(session, profile) {
  const root = document.querySelector('#auth-root');
  if (!root) return;
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get('mode');
  document.querySelectorAll('select[name="profession"]').forEach((select) => populateProfessionSelect(select));
  if (root.dataset.bound === 'true') {
    renderAuthPageState(session, profile, requestedMode, params);
    return;
  }
  root.dataset.bound = 'true';

  document.querySelectorAll('[data-auth-tab]').forEach((tab) => tab.addEventListener('click', () => {
    setStatus('');
    setAuthView(tab.dataset.authTab);
  }));

  document.querySelector('#forgot-password')?.addEventListener('click', () => {
    setStatus('');
    setAuthView('reset');
  });
  document.querySelectorAll('[data-back-to-login]').forEach((button) => button.addEventListener('click', () => setAuthView('signin')));

  document.querySelector('#resend-confirmation')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!pendingConfirmationEmail) {
      setAuthView('signup');
      setStatus('Saisissez votre adresse e-mail pour créer ou activer votre compte.', true);
      return;
    }
    button.disabled = true;
    setStatus('Envoi de l’e-mail d’activation…');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingConfirmationEmail,
      options: { emailRedirectTo: `${window.location.origin}${AUTH_PAGE}?confirmed=1&next=${encodeURIComponent(redirectTarget())}` }
    });
    button.disabled = false;
    setStatus(error ? frenchAuthError(error) : 'Un nouvel e-mail d’activation vient d’être envoyé.', Boolean(error));
  });

  document.querySelector('#signin-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(form, true);
    setStatus('Connexion…');
    const { error } = await supabase.auth.signInWithPassword({ email: String(values.get('email')).trim(), password: String(values.get('password')) });
    if (error) {
      setBusy(form, false);
      if (error.code === 'email_not_confirmed') {
        pendingConfirmationEmail = String(values.get('email')).trim();
        setText('[data-confirmation-email]', pendingConfirmationEmail);
        setAuthView('signup-confirmation');
      }
      setStatus(frenchAuthError(error), true);
      return;
    }
    window.location.replace(redirectTarget());
  });

  document.querySelector('#signup-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(form, true);
    setStatus('Création du compte…');
    const password = String(values.get('password'));
    const confirmation = String(values.get('password_confirmation'));
    if (password !== confirmation) {
      setBusy(form, false);
      setStatus('Les deux mots de passe ne correspondent pas.', true);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: String(values.get('email')).trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${AUTH_PAGE}?confirmed=1&next=${encodeURIComponent(redirectTarget())}`,
        data: {
          pseudonym: String(values.get('pseudonym')).trim(),
          profession: String(values.get('profession')).trim()
        }
      }
    });
    setBusy(form, false);
    if (error) {
      setStatus(frenchAuthError(error), true);
      return;
    }
    if (data.session) {
      window.location.replace(redirectTarget());
      return;
    }
    form.reset();
    pendingConfirmationEmail = String(values.get('email')).trim();
    setText('[data-confirmation-email]', pendingConfirmationEmail);
    setAuthView('signup-confirmation');
    setStatus('Compte créé. Ouvrez l’e-mail de confirmation pour activer votre profil.');
  });

  document.querySelector('#reset-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email')).trim();
    setBusy(form, true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${AUTH_PAGE}?mode=update-password`
    });
    setBusy(form, false);
    setStatus(error ? frenchAuthError(error) : 'Un lien de réinitialisation vient de vous être envoyé.', Boolean(error));
  });

  document.querySelector('#password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get('password'));
    if (password !== String(values.get('password_confirmation'))) {
      setStatus('Les deux mots de passe ne correspondent pas.', true);
      return;
    }
    setBusy(form, true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(form, false);
    if (error) {
      setStatus(frenchAuthError(error), true);
      return;
    }
    setStatus('Mot de passe mis à jour.');
    setAuthView('signed-in');
  });

  const profileForm = document.querySelector('#profile-form');
  profileForm?.elements.avatar?.addEventListener('change', () => {
    const [file] = profileForm.elements.avatar.files || [];
    if (!file) {
      setAvatarPreview(currentProfile?.avatar_url, currentProfile?.pseudonym);
      return;
    }
    if (!AVATAR_TYPES.has(file.type) || file.size > MAX_AVATAR_BYTES) {
      profileForm.elements.avatar.value = '';
      setAvatarPreview(currentProfile?.avatar_url, currentProfile?.pseudonym);
      setStatus('Choisissez une image JPEG, PNG ou GIF de 4 Mo maximum.', true);
      return;
    }
    setAvatarPreview(URL.createObjectURL(file), currentProfile?.pseudonym);
  });
  profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(form, true);
    const activeSession = currentSession;
    if (!activeSession) {
      setBusy(form, false);
      setStatus('Votre session a expiré. Reconnectez-vous.', true);
      setAuthView('signin');
      return;
    }
    const avatar = values.get('avatar');
    let avatarUrl = currentProfile?.avatar_url || null;
    if (avatar instanceof File && avatar.size) {
      if (!AVATAR_TYPES.has(avatar.type) || avatar.size > MAX_AVATAR_BYTES) {
        setBusy(form, false);
        setStatus('Choisissez une image JPEG, PNG ou GIF de 4 Mo maximum.', true);
        return;
      }
      const extension = avatar.type === 'image/png' ? 'png' : avatar.type === 'image/gif' ? 'gif' : 'jpg';
      const path = `${activeSession.user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatar, { cacheControl: '31536000', contentType: avatar.type, upsert: true });
      if (uploadError) {
        setBusy(form, false);
        setStatus('La photo n’a pas pu être envoyée. Vérifiez la migration Supabase.', true);
        return;
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ pseudonym: String(values.get('pseudonym')).trim(), profession: String(values.get('profession')).trim(), avatar_url: avatarUrl })
      .eq('id', activeSession.user.id);
    setBusy(form, false);
    if (error) {
      setStatus(frenchAuthError(error), true);
      return;
    }
    window.location.replace(redirectTarget());
  });

  renderAuthPageState(session, profile, requestedMode, params);
}

async function applySession(session) {
  currentSession = session;
  currentProfile = session ? await fetchProfile(session) : null;
  await migrateLegacyPrivateNotes(currentSession, currentProfile);
  await migrateLocalSavedPosts(currentSession);
  updateAccountChrome(session, currentProfile);
  bindGlobalAccountActions();
  if (document.body.dataset.page === 'profile') await renderProfilePage(session, currentProfile);
  if (document.body.dataset.page === 'auth') await setupAuthPage(session, currentProfile);
  document.documentElement.classList.add('auth-ready');
  window.dispatchEvent(new CustomEvent('anecdotes:auth', { detail: { session, profile: currentProfile } }));
}

async function initialize() {
  try {
    supabase = await createBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await applySession(data.session);
    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => applySession(session).catch((error) => setStatus(frenchAuthError(error), true)), 0);
    });
  } catch (error) {
    updateAccountChrome(null, null);
    document.documentElement.classList.add('auth-ready');
    setStatus(frenchAuthError(error), true);
    setText('[data-profile-status]', frenchAuthError(error));
  }
}

const ready = initialize();
window.AnecdotesAuth = {
  ready,
  async getSession() { await ready; return currentSession; },
  async getProfile() { await ready; return currentProfile; },
  async getAccessToken() { await ready; return currentSession?.access_token || ''; },
  async getPrivateCount() {
    await ready;
    if (!currentSession) return 0;
    const { count, error } = await supabase
      .from('anecdotes')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', currentSession.user.id)
      .eq('visibility', 'private');
    return error ? 0 : Number(count) || 0;
  },
  async getVotes(anecdoteIds) {
    await ready;
    if (!currentSession || !Array.isArray(anecdoteIds) || !anecdoteIds.length) return new Map();
    const { data, error } = await supabase
      .from('votes')
      .select('anecdote_id,value')
      .in('anecdote_id', anecdoteIds);
    return error ? new Map() : new Map((data || []).map((vote) => [vote.anecdote_id, vote.value]));
  },
  async getSavedAnecdoteIds() {
    await ready;
    if (!currentSession) return null;
    const { data, error } = await supabase
      .from('saved_anecdotes')
      .select('anecdote_id')
      .eq('user_id', currentSession.user.id);
    return error ? null : new Set((data || []).map((item) => item.anecdote_id));
  },
  async getSavedAnecdotes() {
    await ready;
    if (!currentSession) return { available: false, posts: [] };
    const { data, error } = await supabase
      .from('saved_anecdotes')
      .select('created_at,anecdote:anecdotes(id,author_label,profession,theme,body,published_at,submitted_at)')
      .eq('user_id', currentSession.user.id)
      .order('created_at', { ascending: false });
    if (error) return { available: false, posts: [] };
    return {
      available: true,
      posts: (data || []).filter((item) => item.anecdote).map((item) => ({
        id: item.anecdote.id,
        author: item.anecdote.author_label,
        profession: item.anecdote.profession,
        theme: item.anecdote.theme,
        text: item.anecdote.body,
        savedAt: item.created_at
      }))
    };
  },
  async setSavedAnecdote(anecdoteId, saved) {
    await ready;
    if (!currentSession || !UUID_PATTERN.test(anecdoteId)) return false;
    const request = saved
      ? supabase.from('saved_anecdotes').insert({ user_id: currentSession.user.id, anecdote_id: anecdoteId })
      : supabase.from('saved_anecdotes').delete().eq('user_id', currentSession.user.id).eq('anecdote_id', anecdoteId);
    const { error } = await request;
    return !error;
  },
  async signOut() { await ready; return supabase?.auth.signOut(); }
};

window.addEventListener('anecdotes:export-data', (event) => exportPersonalData(event.detail.button));
window.addEventListener('anecdotes:delete-account', (event) => deleteAccount(event.detail.button));
