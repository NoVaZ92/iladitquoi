import {
  ArrowLeft, Bookmark, BookOpen, createIcons, FileClock, LockKeyhole, LogOut,
  NotebookPen, PenLine, ShieldCheck, UserRound
} from 'lucide';

const ICONS = { ArrowLeft, Bookmark, BookOpen, FileClock, LockKeyhole, LogOut, NotebookPen, PenLine, ShieldCheck, UserRound };
const PRIVATE_KEY = 'iladitquoi.private-notes';
const SAVED_KEY = 'iladitquoi.saved-posts';
const LEGACY_PRIVATE_KEY = 'anecdotes-du-soin.private-notes';
const LEGACY_SAVED_KEY = 'anecdotes-du-soin.saved-posts';

function loadCollection(key, legacyKey) {
  try {
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(current) && current.length) return current;
    const legacy = JSON.parse(localStorage.getItem(legacyKey) || '[]');
    if (Array.isArray(legacy) && legacy.length) {
      localStorage.setItem(key, JSON.stringify(legacy));
      return legacy;
    }
  } catch { /* unavailable storage behaves as an empty collection */ }
  return [];
}

function emptyState(message) {
  const element = document.createElement('div');
  element.className = 'private-empty';
  element.textContent = message;
  return element;
}

function renderPrivateNotes() {
  const notes = loadCollection(PRIVATE_KEY, LEGACY_PRIVATE_KEY);
  const list = document.querySelector('#private-list');
  const summary = document.querySelector('#private-summary');
  summary.textContent = notes.length ? `${notes.length} note${notes.length > 1 ? 's' : ''} privée${notes.length > 1 ? 's' : ''}` : 'Aucune note privée';
  if (!notes.length) {
    list.replaceChildren(emptyState('Votre carnet est vide. Ajoutez une note depuis la page d’accueil.'));
    return;
  }
  list.replaceChildren(...notes.map((note) => {
    const article = document.createElement('article');
    article.className = 'notebook-entry';
    const meta = document.createElement('span');
    meta.textContent = `${note.profession || 'Métier du soin'} · visible uniquement sur cet appareil`;
    const copy = document.createElement('p');
    copy.textContent = note.text || '';
    article.append(meta, copy);
    return article;
  }));
}

function renderSavedPosts() {
  const posts = loadCollection(SAVED_KEY, LEGACY_SAVED_KEY);
  const list = document.querySelector('#saved-list');
  const summary = document.querySelector('#saved-summary');
  summary.textContent = posts.length ? `${posts.length} sélection${posts.length > 1 ? 's' : ''}` : 'Aucune sélection';
  if (!posts.length) {
    list.replaceChildren(emptyState('Les anecdotes enregistrées depuis le fil apparaîtront ici.'));
    return;
  }
  list.replaceChildren(...posts.map((post) => {
    const article = document.createElement('article');
    article.className = 'notebook-entry';
    const meta = document.createElement('span');
    meta.textContent = `${post.author || 'Anonyme'} · ${post.profession || 'Métier du soin'}`;
    const copy = document.createElement('p');
    copy.textContent = post.text || '';
    article.append(meta, copy);
    return article;
  }));
}

function activateTab(name) {
  document.querySelectorAll('[data-profile-tab]').forEach((button) => {
    const active = button.dataset.profileTab === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-profile-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.profilePanel !== name;
  });
  const url = new URL(location.href);
  url.searchParams.set('tab', name);
  history.replaceState({}, '', url);
}

function initialize() {
  createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.8 } });
  renderPrivateNotes();
  renderSavedPosts();
  document.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.profileTab)));
  const requested = new URLSearchParams(location.search).get('tab');
  activateTab(['published', 'saved', 'private', 'pending'].includes(requested) ? requested : 'published');
}

initialize();
