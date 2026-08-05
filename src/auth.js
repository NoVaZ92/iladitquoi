import { createClient } from '@supabase/supabase-js';

const AUTH_PAGE = '/auth.html';
const PROFILE_PAGE = '/profile.html';
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

function frenchAuthError(error) {
  const code = error?.code || '';
  if (code === 'invalid_credentials') return 'Adresse e-mail ou mot de passe incorrect.';
  if (code === 'email_not_confirmed') return 'Confirmez votre adresse e-mail avant de vous connecter.';
  if (code === 'user_already_exists' || code === 'email_exists') return 'Un compte existe déjà avec cette adresse e-mail.';
  if (code === 'weak_password') return 'Choisissez un mot de passe plus robuste.';
  if (code === 'over_email_send_rate_limit' || error?.status === 429) return 'Trop de messages ont été demandés. Réessayez dans quelques minutes.';
  if (code === 'validation_failed') return 'Vérifiez les informations saisies.';
  if (code === 'provider_disabled') return 'La connexion Google n’est pas encore activée.';
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
    .select('id,pseudonym,profession,role,xp,created_at')
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
  setText('[data-auth-avatar]', signedIn ? pseudonym.charAt(0).toUpperCase() : '→');
  document.querySelectorAll('[data-auth-guest]').forEach((element) => { element.hidden = signedIn; });
  document.querySelectorAll('[data-auth-member]').forEach((element) => { element.hidden = !signedIn; });

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

function profileEntry(anecdote) {
  const article = document.createElement('article');
  article.className = 'profile-entry';
  const main = document.createElement('div');
  main.className = 'profile-entry-main';
  const meta = document.createElement('div');
  meta.className = 'profile-entry-meta';
  meta.textContent = `${anecdote.profession} · ${anecdote.theme} · ${formatDate(anecdote.submitted_at)}`;
  const copy = document.createElement('p');
  copy.textContent = anecdote.body;
  main.append(meta, copy);
  const foot = document.createElement('div');
  foot.className = 'profile-entry-foot';
  const votes = document.createElement('span');
  votes.textContent = `${Number(anecdote.vote_score) || 0} votes`;
  const state = document.createElement('span');
  state.textContent = anecdote.moderation_status === 'published' ? 'Validée' : anecdote.moderation_status === 'refused' ? 'Refusée' : 'En attente';
  foot.append(votes, state);
  if (anecdote.moderation_status === 'refused' && anecdote.moderation_reason) {
    const reason = document.createElement('span');
    reason.textContent = anecdote.moderation_reason;
    foot.append(reason);
  }
  article.append(main, foot);
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
  setText('[data-profile-avatar]', profile.pseudonym.charAt(0).toUpperCase());
  setText('[data-profile-xp]', Number(profile.xp) || 0);

  const { data: anecdotes, error } = await supabase
    .from('anecdotes')
    .select('id,profession,theme,body,moderation_status,moderation_reason,vote_score,submitted_at,published_at,visibility')
    .eq('author_id', session.user.id)
    .order('submitted_at', { ascending: false });

  const publishedList = document.querySelector('#published-list');
  const moderationList = document.querySelector('#pending-list');
  if (error) {
    publishedList?.replaceChildren(emptyState('Impossible de charger vos publications.'));
    moderationList?.replaceChildren(emptyState('Impossible de charger le suivi de modération.'));
    return;
  }

  const publicAnecdotes = (anecdotes || []).filter((item) => item.visibility === 'public');
  const published = publicAnecdotes.filter((item) => item.moderation_status === 'published');
  const moderation = publicAnecdotes.filter((item) => item.moderation_status !== 'published');
  setText('[data-profile-published-count]', published.length);
  setText('[data-profile-published-summary]', `${published.length} au total`);
  setText('#pending-summary', moderation.length ? `${moderation.length} décision${moderation.length > 1 ? 's' : ''}` : 'Aucune soumission en attente');

  if (publishedList) publishedList.replaceChildren(...(published.length ? published.map(profileEntry) : [emptyState('Aucune anecdote publiée pour le moment.') ]));
  if (moderationList) moderationList.replaceChildren(...(moderation.length ? moderation.map(profileEntry) : [emptyState('Vos prochaines soumissions apparaîtront ici.') ]));

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
    }
    setAuthView('profile');
    return;
  }
  if (session) {
    setText('[data-signed-in-email]', session.user.email || 'Compte connecté');
    if (params.has('oauth') || params.has('confirmed')) {
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

  document.querySelector('#google-login')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    setStatus('Redirection vers Google…');
    const next = encodeURIComponent(redirectTarget());
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${AUTH_PAGE}?oauth=1&next=${next}` }
    });
    if (error) {
      button.disabled = false;
      setStatus(frenchAuthError(error), true);
    }
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
    const { error } = await supabase
      .from('profiles')
      .update({ pseudonym: String(values.get('pseudonym')).trim(), profession: String(values.get('profession')).trim() })
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
  async getAccessToken() { await ready; return currentSession?.access_token || ''; },
  async signOut() { await ready; return supabase?.auth.signOut(); }
};
