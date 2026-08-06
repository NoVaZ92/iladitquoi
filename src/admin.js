import {
  ArchiveRestore, ArrowLeft, Check, CircleAlert, ClipboardCheck, createIcons, Eye, Flag,
  LogOut, RefreshCw, ShieldCheck, X
} from 'lucide';

const ICONS = { ArchiveRestore, ArrowLeft, Check, CircleAlert, ClipboardCheck, Eye, Flag, LogOut, RefreshCw, ShieldCheck, X };
let token = '';
let activeTab = 'queue';

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
  const authorMessage = field('Message pour l’auteur en cas de refus', 'Ex. Cette anecdote contient un détail permettant d’identifier une personne.', 'author-message');
  const internalNote = field('Note interne facultative', 'Visible uniquement par la modération.', 'internal-note');
  const actions = document.createElement('div');
  actions.className = 'decision-actions';
  const publish = document.createElement('button');
  publish.type = 'button';
  publish.className = 'approve-button';
  publish.append(icon('check'), document.createTextNode('Valider'));
  const refuse = document.createElement('button');
  refuse.type = 'button';
  refuse.className = 'refuse-button';
  refuse.append(icon('x'), document.createTextNode(anecdote.moderation_status === 'published' ? 'Masquer et refuser' : 'Refuser'));
  if (anecdote.moderation_status !== 'published') actions.append(publish);
  actions.append(refuse);
  controls.append(authorMessage, internalNote, actions);

  async function decide(status) {
    const message = authorMessage.querySelector('textarea').value.trim();
    const note = internalNote.querySelector('textarea').value.trim();
    if (status === 'refused' && message.length < 3) {
      setStatus('Un message à l’auteur est requis pour refuser une anecdote.', true);
      authorMessage.querySelector('textarea').focus();
      return;
    }
    const confirmed = window.confirm(status === 'published' ? 'Valider et publier cette anecdote ?' : 'Refuser cette anecdote ?');
    if (!confirmed) return;
    publish.disabled = true;
    refuse.disabled = true;
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
      refuse.disabled = false;
      setStatus(error.message === 'author_message_required' ? 'Un message à l’auteur est requis.' : 'La décision n’a pas pu être enregistrée.', true);
    }
  }
  publish.addEventListener('click', () => decide('published'));
  refuse.addEventListener('click', () => decide('refused'));
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
  state.className = anecdote.moderation_status === 'published' ? 'state state-published' : 'state';
  state.textContent = anecdote.moderation_status === 'published' ? 'Publiée' : anecdote.moderation_status === 'refused' ? 'Retirée' : 'En attente';
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
  if (anecdote.moderation_status !== 'refused') article.append(createDecisionControls(anecdote, reportIds));
  return article;
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

function setActiveTab(name) {
  activeTab = name;
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    const active = button.dataset.adminTab === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-admin-panel]').forEach((panel) => { panel.hidden = panel.dataset.adminPanel !== name; });
}

async function loadQueue() {
  const refresh = document.querySelector('#refresh-queue');
  refresh.disabled = true;
  try {
    const response = await fetch('/api/admin/queue', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'queue_unavailable');
    setText('[data-admin-name]', data.moderator.pseudonym);
    setText('#pending-count', data.pending.length);
    setText('#reports-count', data.reports.length);
    renderPending(data.pending);
    renderReports(data.reports, data.reportsAvailable !== false);
    if (data.reportsAvailable === false) setStatus('Les anecdotes à valider sont chargées. Les signalements sont temporairement indisponibles.', true);
  } catch (error) {
    const message = error.message === 'forbidden' ? 'Votre compte ne possède pas les droits de modération.' : 'La file de modération est indisponible.';
    setStatus(message, true);
  } finally {
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
  token = await auth.getAccessToken();
  document.querySelector('#admin-app').setAttribute('aria-busy', 'false');
  document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.adminTab)));
  document.querySelector('#refresh-queue').addEventListener('click', loadQueue);
  setActiveTab(activeTab);
  await loadQueue();
}

renderIcons();
initialize().catch(() => {
  const app = document.querySelector('#admin-app');
  app.setAttribute('aria-busy', 'false');
  setStatus('Impossible de vérifier la session administrateur. Rechargez la page ou reconnectez-vous.', true);
});
