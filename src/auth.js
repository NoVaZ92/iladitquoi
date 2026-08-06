import { createClient } from '@supabase/supabase-js';
import { populateProfessionSelect } from '../lib/professions.js';

const AUTH_PAGE = '/auth.html';
const PROFILE_PAGE = '/profile.html';
const LEGACY_PRIVATE_KEYS = ['iladitquoi.private-notes', 'anecdotes-du-soin.private-notes'];
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
let supabase;
let currentSession = null;
let currentProfile = null;

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

function legacyPrivateNotes() {
  for (const key of LEGACY_PRIVATE_KEYS) {
    try {
      const notes = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(notes) && notes.length) return { key, notes };
    } catch { /* unreadable storage behaves as an empty legacy notebook */ }
  }
  return { key: LEGACY_PRIVATE_KEYS[0], notes: [] };
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
  state.textContent = isPrivate ? 'Privée' : status === 'published' ? 'Validée' : status === 'refused' ? 'Refusée' : 'En cours d’examen';
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
  } else if (status === 'published') {
    const votes = document.createElement('span');
    votes.textContent = `${Number(anecdote.vote_score) || 0} votes`;
    foot.append(votes);
  }
  article.append(header);
  if (!isPrivate && status === 'refused') {
    const decision = document.createElement('div');
    decision.className = 'moderation-decision is-refused';
    const title = document.createElement('strong');
    title.textContent = 'Motif du refus';
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

  const { data: anecdotes, error } = await supabase
    .from('anecdotes')
    .select('id,profession,theme,body,moderation_status,moderation_reason,vote_score,submitted_at,published_at,visibility')
    .eq('author_id', session.user.id)
    .order('submitted_at', { ascending: false });

  const publishedList = document.querySelector('#published-list');
  const moderationList = document.querySelector('#pending-list');
  const privateList = document.querySelector('#private-list');
  if (error) {
    publishedList?.replaceChildren(emptyState('Impossible de charger vos publications.'));
    moderationList?.replaceChildren(emptyState('Impossible de charger le suivi de modération.'));
    privateList?.replaceChildren(emptyState('Impossible de charger votre carnet privé.'));
    return;
  }

  const publicAnecdotes = (anecdotes || []).filter((item) => item.visibility === 'public');
  const privateAnecdotes = (anecdotes || []).filter((item) => item.visibility === 'private');
  const published = publicAnecdotes.filter((item) => item.moderation_status === 'published');
  const moderation = publicAnecdotes.filter((item) => item.moderation_status !== 'published');
  setText('[data-profile-published-count]', published.length);
  setText('[data-profile-published-summary]', `${published.length} au total`);
  const pendingCount = moderation.filter((item) => item.moderation_status === 'pending').length;
  const refusedCount = moderation.filter((item) => item.moderation_status === 'refused').length;
  const moderationSummary = [
    pendingCount ? `${pendingCount} en cours` : '',
    refusedCount ? `${refusedCount} refusée${refusedCount > 1 ? 's' : ''}` : ''
  ].filter(Boolean).join(' · ');
  setText('#pending-summary', moderationSummary || 'Aucune décision en attente');

  if (publishedList) publishedList.replaceChildren(...(published.length ? published.map(profileEntry) : [emptyState('Aucune anecdote publiée pour le moment.') ]));
  setText('#private-summary', privateAnecdotes.length ? `${privateAnecdotes.length} note${privateAnecdotes.length > 1 ? 's' : ''}` : 'Carnet vide');
  if (privateList) privateList.replaceChildren(...(privateAnecdotes.length ? privateAnecdotes.map(profileEntry) : [emptyState('Votre carnet est vide. Ajoutez une note depuis la page d’accueil.') ]));
  if (moderationList) moderationList.replaceChildren(...(moderation.length ? moderation.map(profileEntry) : [emptyState('Aucune anecdote n’attend de décision.') ]));

  const badges = [];
  if (published.length >= 1) badges.push('Première publication');
  if ((Number(profile.xp) || 0) >= 100) badges.push('100 XP');
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

  document.querySelector('#signin-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(form, true);
    setStatus('Connexion…');
    const { error } = await supabase.auth.signInWithPassword({ email: String(values.get('email')).trim(), password: String(values.get('password')) });
    if (error) {
      setBusy(form, false);
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
  async signOut() { await ready; return supabase?.auth.signOut(); }
};
