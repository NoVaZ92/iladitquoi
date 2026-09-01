import {
  ArchiveRestore, ArrowLeft, Award, Check, CircleAlert, ClipboardCheck, createIcons, Eye, Flag,
  LogOut, RefreshCw, Search, ShieldCheck, Sun, UserRound, X
} from 'lucide';

const ICONS = { ArchiveRestore, ArrowLeft, Award, Check, CircleAlert, ClipboardCheck, Eye, Flag, LogOut, RefreshCw, Search, ShieldCheck, Sun, UserRound, X };
let token = '';
let activeTab = 'queue';
let isOwnerAdmin = false;
let pendingItems = [];
let reportItems = [];
let queueLoading = false;

function renderIcons(root = document) {
  createIcons({ icons: ICONS, root, attrs: { 'stroke-width': 1.8 } });
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
}

function setStatus(message = '', error = false) {
  const element = document.querySelector('#admin-status');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', error);
}

function formatDate(value) {
  if (!value) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function icon(name) {
  const element = document.createElement('i');
  element.dataset.lucide = name;
  return element;
}

function emptyState(message) {
  const element = document.createElement('div');
  element.className = 'admin-empty';
  element.append(icon('clipboard-check'));
  const copy = document.createElement('p');
  copy.textContent = message;
  element.append(copy);
  return element;
}

function field(label, placeholder, className) {
  const wrapper = document.createElement('label');
  wrapper.className = 'decision-field';
  const title = document.createElement('span');
  title.textContent = label;
  const textarea = document.createElement('textarea');
  textarea.className = className;
  textarea.maxLength = 500;
  textarea.placeholder = placeholder;
  wrapper.append(title, textarea);
  return wrapper;
}

function createDecisionControls(anecdote, reportIds = []) {
  const controls = document.createElement('div');
  controls.className = 'decision-controls';
  const isPublished = anecdote.moderation_status === 'published';
  const authorMessage = field(isPublished ? 'Message pour l’auteur avant retrait' : 'Message pour l’auteur en cas de refus', 'Ex. Cette anecdote contient un détail permettant d’identifier une personne.', 'author-message');
  const internalNote = field('Note interne facultative', 'Visible uniquement par la modération.', 'internal-note');
  const actions = document.createElement('div');
  actions.className = 'decision-actions';
  const publish = document.createElement('button');
  publish.type = 'button';
  publish.className = 'approve-button';
  publish.append(icon('check'), document.createTextNode('Valider'));
  const secondary = document.createElement('button');
  secondary.type = 'button';
  secondary.className = 'refuse-button';
  secondary.append(icon('x'), document.createTextNode(isPublished ? 'Masquer du fil' : 'Refuser'));
  if (!isPublished) actions.append(publish);
  actions.append(secondary);
  controls.append(authorMessage, internalNote, actions);

  async function decide(status) {
    const message = authorMessage.querySelector('textarea').value.trim();
    const note = internalNote.querySelector('textarea').value.trim();
    if (status !== 'published' && message.length < 3) {
      setStatus('Un message à l’auteur est requis avant de retirer une anecdote.', true);
      authorMessage.querySelector('textarea').focus();
      return;
    }
    const confirmed = window.confirm(status === 'published' ? 'Valider et publier cette anecdote ?' : status === 'hidden' ? 'Retirer cette anecdote publiée du fil ?' : 'Refuser cette anecdote ?');
    if (!confirmed) return;
    publish.disabled = true;
    secondary.disabled = true;
    setStatus('Décision en cours…');
    try {
      const response = await fetch('/api/admin/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ anecdoteId: anecdote.id, status, authorMessage: message, internalNote: note, reportIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'decision_failed');
      setStatus(data.auditRecorded ? 'Décision enregistrée.' : 'Décision enregistrée, mais la trace interne n’a pas pu être ajoutée.', !data.auditRecorded);
      await loadQueue();
    } catch (error) {
      publish.disabled = false;
      secondary.disabled = false;
      setStatus(error.message === 'author_message_required' ? 'Un message à l’auteur est requis.' : 'La décision n’a pas pu être enregistrée.', true);
    }
  }
  publish.addEventListener('click', () => decide('published'));
  secondary.addEventListener('click', () => decide(isPublished ? 'hidden' : 'refused'));
  return controls;
}

function createAnecdoteCard(anecdote, { reportIds = [], report = null } = {}) {
  const article = document.createElement('article');
  article.className = 'moderation-card';
  const header = document.createElement('header');
  header.className = 'card-header';
  const meta = document.createElement('div');
  const badge = document.createElement('span');
  badge.className = `theme-badge theme-${anecdote.theme || 'leger'}`;
  badge.textContent = anecdote.theme || 'leger';
  const details = document.createElement('small');
  details.textContent = `${anecdote.profession || 'Métier du soin'} · ${anecdote.author_label || 'Anonyme'} · ${formatDate(anecdote.submitted_at)}`;
  meta.append(badge, details);
  const state = document.createElement('span');
  state.className = anecdote.moderation_status === 'published' ? 'state state-published' : anecdote.moderation_status === 'hidden' ? 'state state-hidden' : 'state';
  state.textContent = anecdote.moderation_status === 'published' ? 'Publiée' : anecdote.moderation_status === 'hidden' ? 'Masquée' : anecdote.moderation_status === 'refused' ? 'Refusée' : 'En attente';
  header.append(meta, state);
  const body = document.createElement('p');
  body.className = 'anecdote-body';
  body.textContent = anecdote.body || 'Anecdote supprimée.';
  article.append(header, body);
  if (anecdote.moderation_reason) {
    const notice = document.createElement('p');
    notice.className = 'auto-notice';
    notice.append(icon('circle-alert'), document.createTextNode(anecdote.moderation_reason));
    article.append(notice);
  }
  if (report) {
    const reportInfo = document.createElement('div');
    reportInfo.className = 'report-info';
    const reportTitle = document.createElement('strong');
    reportTitle.textContent = `Signalement de ${report.reporter_label}`;
    const reportReason = document.createElement('span');
    reportReason.textContent = report.reason;
    reportInfo.append(reportTitle, reportReason);
    article.append(reportInfo);
  }
  if (!['refused', 'hidden'].includes(anecdote.moderation_status)) article.append(createDecisionControls(anecdote, reportIds));
  return article;
}

function filterItems(items) {
  const search = document.querySelector('#admin-search')?.value.trim().toLocaleLowerCase() || '';
  const profession = document.querySelector('#admin-profession-filter')?.value || 'all';
  return items.filter((item) => {
    const anecdote = item.anecdote || item;
    const searchable = `${anecdote.body || ''} ${anecdote.author_label || ''} ${anecdote.profession || ''} ${anecdote.theme || ''} ${item.reason || ''}`.toLocaleLowerCase();
    return (!search || searchable.includes(search)) && (profession === 'all' || anecdote.profession === profession);
  });
}

function updateProfessionFilter() {
  const select = document.querySelector('#admin-profession-filter');
  if (!select) return;
  const selected = select.value;
  const professions = [...new Set([...pendingItems, ...reportItems].map((item) => (item.anecdote || item).profession).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  select.replaceChildren(new Option('Tous les métiers', 'all'), ...professions.map((profession) => new Option(profession, profession)));
  select.value = professions.includes(selected) ? selected : 'all';
}

function renderPending(items) {
  const list = document.querySelector('#queue-list');
  list.replaceChildren(...(items.length ? items.map((item) => createAnecdoteCard(item)) : [emptyState('La file est vide. Rien à valider pour le moment.')]));
  renderIcons(list);
}

function renderReports(items, reportsAvailable = true) {
  const list = document.querySelector('#reports-list');
  if (!reportsAvailable) {
    list.replaceChildren(emptyState('Les signalements ne sont pas disponibles pour le moment. La file d’anecdotes reste utilisable.'));
    renderIcons(list);
    return;
  }
  if (!items.length) {
    list.replaceChildren(emptyState('Aucun signalement ouvert.'));
    renderIcons(list);
    return;
  }
  list.replaceChildren(...items.map((report) => {
    if (!report.anecdote) {
      const missing = emptyState('Cette anecdote n’est plus disponible.');
      return missing;
    }
    const wrapper = document.createElement('article');
    wrapper.className = 'report-card';
    const card = createAnecdoteCard(report.anecdote, { reportIds: [report.id], report });
    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'resolve-button';
    resolve.append(icon('eye'), document.createTextNode(report.anecdote.moderation_status === 'refused' ? 'Clôturer le signalement' : 'Conserver et clôturer le signalement'));
    resolve.addEventListener('click', async () => {
      resolve.disabled = true;
      setStatus('Clôture du signalement…');
      try {
        const response = await fetch('/api/admin/report', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ reportId: report.id })
        });
        if (!response.ok) throw new Error('report_resolution_failed');
        setStatus('Signalement clôturé.');
        await loadQueue();
      } catch {
        resolve.disabled = false;
        setStatus('Le signalement n’a pas pu être clôturé.', true);
      }
    });
    wrapper.append(card, resolve);
    return wrapper;
  }));
  renderIcons(list);
}

function renderQueue() {
  const pending = filterItems(pendingItems);
  const reports = filterItems(reportItems);
  renderPending(pending);
  renderReports(reports, document.querySelector('#reports-list')?.dataset.available !== 'false');
  setText('#queue-visible-count', pendingItems.length === pending.length ? `${pending.length} publication${pending.length > 1 ? 's' : ''}` : `${pending.length}/${pendingItems.length} publication${pendingItems.length > 1 ? 's' : ''}`);
  setText('#reports-visible-count', reportItems.length === reports.length ? `${reports.length} signalement${reports.length > 1 ? 's' : ''}` : `${reports.length}/${reportItems.length} signalement${reportItems.length > 1 ? 's' : ''}`);
}

function setActiveTab(name) {
  if (name === 'users' && !isOwnerAdmin) return;
  activeTab = name;
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    const active = button.dataset.adminTab === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-admin-panel]').forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== name; });
  document.querySelector('#moderation-tools').hidden = name === 'users';
  const headings = {
    queue: ['File de validation', 'Les décisions publiées deviennent visibles dans le fil immédiatement.'],
    reports: ['Signalements', 'Traitez les alertes ouvertes et documentez chaque retrait.'],
    users: ['Utilisateurs et accès', 'Gérez les contributeurs et les distinctions spéciales.']
  };
  setText('[data-admin-title]', headings[name][0]);
  setText('[data-admin-copy]', headings[name][1]);
}

function setUserAvatar(element, user) {
  element.textContent = (user.pseudonym || '·').charAt(0).toUpperCase();
  if (!user.avatar_url) return;
  element.classList.add('has-image');
  element.style.backgroundImage = `url(${JSON.stringify(user.avatar_url)})`;
}

async function updateUser(user, action, enabled, buttons) {
  const confirmation = action === 'role'
    ? enabled ? `Donner l’accès à la modération à ${user.pseudonym} ?` : `Retirer l’accès à la modération de ${user.pseudonym} ?`
    : enabled ? `Attribuer le badge Pionnier à ${user.pseudonym} ?` : `Retirer le badge Pionnier de ${user.pseudonym} ?`;
  if (!window.confirm(confirmation)) return;
  buttons.forEach((button) => { button.disabled = true; });
  setStatus(action === 'role' ? 'Mise à jour du rôle…' : 'Mise à jour du badge…');
  try {
    const response = await fetch(action === 'role' ? '/api/admin/users' : '/api/admin/badges', {
      method: action === 'role' ? 'PATCH' : enabled ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(action === 'role'
        ? { publicSlug: user.public_slug, contributor: enabled }
        : { publicSlug: user.public_slug, badgeKey: 'pioneer' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'admin_operation_failed');
    setStatus(action === 'role'
      ? enabled ? `${user.pseudonym} est maintenant contributeur.` : `${user.pseudonym} n’a plus accès à la modération.`
      : enabled ? `Badge Pionnier attribué à ${user.pseudonym}.` : `Badge Pionnier retiré à ${user.pseudonym}.`);
    await searchUsers();
  } catch {
    buttons.forEach((button) => { button.disabled = false; });
    setStatus('La modification n’a pas pu être enregistrée.', true);
  }
}

function createUserCard(user) {
  const article = document.createElement('article');
  article.className = 'user-card';
  const identity = document.createElement('div');
  identity.className = 'user-identity';
  const avatar = document.createElement('span');
  avatar.className = 'user-avatar';
  setUserAvatar(avatar, user);
  const copy = document.createElement('div');
  copy.className = 'user-copy';
  const name = document.createElement('strong');
  name.textContent = user.pseudonym;
  const details = document.createElement('span');
  details.textContent = `${user.profession || 'Métier non renseigné'} · ${user.email || 'Email indisponible'}`;
  const role = document.createElement('span');
  role.className = `user-role${user.role === 'admin' ? ' is-admin' : user.role === 'moderator' ? ' is-contributor' : ''}`;
  role.textContent = user.role === 'admin' ? 'Admin' : user.role === 'moderator' ? 'Contributeur' : 'Membre';
  copy.append(name, details, role);
  identity.append(avatar, copy);
  const actions = document.createElement('div');
  actions.className = 'user-actions';
  if (user.role !== 'admin') {
    const contributor = document.createElement('button');
    contributor.type = 'button';
    contributor.className = `user-action${user.role === 'moderator' ? ' is-danger' : ''}`;
    contributor.textContent = user.role === 'moderator' ? 'Retirer la modération' : 'Ajouter comme contributeur';
    const pioneer = document.createElement('button');
    pioneer.type = 'button';
    pioneer.className = `user-action${user.has_pioneer_badge ? ' is-danger' : ''}`;
    pioneer.textContent = user.has_pioneer_badge ? 'Retirer Pionnier' : 'Attribuer Pionnier';
    const buttons = [contributor, pioneer];
    contributor.addEventListener('click', () => updateUser(user, 'role', user.role !== 'moderator', buttons));
    pioneer.addEventListener('click', () => updateUser(user, 'badge', !user.has_pioneer_badge, buttons));
    actions.append(contributor, pioneer);
  } else {
    const protectedLabel = document.createElement('span');
    protectedLabel.className = 'user-role is-admin';
    protectedLabel.textContent = 'Compte protégé';
    actions.append(protectedLabel);
  }
  article.append(identity, actions);
  return article;
}

async function searchUsers() {
  const input = document.querySelector('#admin-user-search');
  const results = document.querySelector('#admin-user-results');
  const query = input.value.trim();
  if (query.length < 2) {
    results.replaceChildren(emptyState('Saisissez au moins deux caractères pour rechercher un compte.'));
    return;
  }
  results.replaceChildren(emptyState('Recherche des utilisateurs…'));
  try {
    const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`, {
      headers: { authorization: `Bearer ${token}` }, cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'users_unavailable');
    const users = Array.isArray(data.users) ? data.users : [];
    results.replaceChildren(...(users.length ? users.map(createUserCard) : [emptyState('Aucun utilisateur ne correspond à cette recherche.')]));
  } catch {
    results.replaceChildren(emptyState('La recherche est temporairement indisponible.'));
    setStatus('Impossible de rechercher les utilisateurs.', true);
  }
}

async function loadQueue() {
  if (queueLoading) return;
  queueLoading = true;
  const refresh = document.querySelector('#refresh-queue');
  refresh.disabled = true;
  try {
    const response = await fetch('/api/admin/queue', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'queue_unavailable');
    setText('[data-admin-name]', data.moderator.pseudonym);
    pendingItems = data.pending;
    reportItems = data.reports;
    document.querySelector('#reports-list').dataset.available = String(data.reportsAvailable !== false);
    updateProfessionFilter();
    setText('#pending-count', pendingItems.length);
    setText('#reports-count', reportItems.length);
    renderQueue();
    if (data.reportsAvailable === false) setStatus('Les anecdotes à valider sont chargées. Les signalements sont temporairement indisponibles.', true);
  } catch (error) {
    const message = error.message === 'forbidden' ? 'Votre compte ne possède pas les droits de modération.' : 'La file de modération est indisponible.';
    setStatus(message, true);
  } finally {
    queueLoading = false;
    refresh.disabled = false;
  }
}

async function waitForAuth() {
  for (let attempts = 0; attempts < 400; attempts += 1) {
    if (window.AnecdotesAuth) return window.AnecdotesAuth;
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  throw new Error('auth_unavailable');
}

async function initialize() {
  const auth = await waitForAuth();
  const session = await auth.getSession();
  if (!session) {
    window.location.replace(`/auth.html?next=${encodeURIComponent('/admin')}`);
    return;
  }
  const profile = await auth.getProfile();
  if (!profile || !['moderator', 'admin'].includes(profile.role)) {
    document.querySelector('#admin-app').hidden = true;
    document.querySelector('#admin-denied').hidden = false;
    return;
  }
  isOwnerAdmin = profile.role === 'admin';
  document.querySelectorAll('[data-admin-only]').forEach((element) => { element.hidden = !isOwnerAdmin; });
  token = await auth.getAccessToken();
  document.querySelector('#admin-app').setAttribute('aria-busy', 'false');
  document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.adminTab)));
  document.querySelector('#refresh-queue').addEventListener('click', () => activeTab === 'users' ? searchUsers() : loadQueue());
  document.querySelector('#admin-search').addEventListener('input', renderQueue);
  document.querySelector('#admin-profession-filter').addEventListener('change', renderQueue);
  document.querySelector('#admin-user-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    searchUsers();
  });
  window.setInterval(() => {
    if (!document.hidden) loadQueue();
  }, 90000);
  setActiveTab(activeTab);
  await loadQueue();
}

renderIcons();
initialize().catch(() => {
  const app = document.querySelector('#admin-app');
  app.setAttribute('aria-busy', 'false');
  setStatus('Impossible de vérifier la session administrateur. Rechargez la page ou reconnectez-vous.', true);
});
