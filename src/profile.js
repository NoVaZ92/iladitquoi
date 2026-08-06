import {
  ArrowLeft, Bookmark, BookOpen, Copy, createIcons, FileClock, LockKeyhole, LogOut,
  NotebookPen, PenLine, Send, ShieldCheck, Trash2, UserRound, X
} from 'lucide';

const ICONS = { ArrowLeft, Bookmark, BookOpen, Copy, FileClock, LockKeyhole, LogOut, NotebookPen, PenLine, Send, ShieldCheck, Trash2, UserRound, X };
const SAVED_KEY = 'iladitquoi.saved-posts';
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

function bindPrivateShare() {
  const dialog = document.querySelector('#private-share-dialog');
  const urlInput = document.querySelector('#private-share-url');
  const status = document.querySelector('#private-share-status');
  document.querySelector('#close-private-share').addEventListener('click', () => dialog.close());
  document.querySelector('#copy-private-share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(urlInput.value); } catch {
      urlInput.select();
      document.execCommand('copy');
    }
    status.textContent = 'Lien copié.';
  });
  window.addEventListener('anecdotes:private-share', async (event) => {
    const token = await window.AnecdotesAuth?.getAccessToken?.();
    if (!token) return;
    status.textContent = 'Création du lien privé…';
    try {
      const response = await fetch('/api/private-share', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ anecdoteId: event.detail.anecdoteId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error('share_failed');
      const url = `${location.origin}/p/${data.token}`;
      urlInput.value = url;
      document.querySelector('#private-whatsapp-share').href = `https://wa.me/?text=${encodeURIComponent(`Je t’envoie une note privée : ${url}`)}`;
      status.textContent = '';
      dialog.showModal();
    } catch {
      status.textContent = 'Le lien privé n’a pas pu être créé. Réessayez.';
    }
  });
}

function initialize() {
  createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.8 } });
  window.addEventListener('anecdotes:icons-updated', () => createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.8 } }));
  renderSavedPosts();
  bindPrivateShare();
  document.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.profileTab)));
  const requested = new URLSearchParams(location.search).get('tab');
  activateTab(['published', 'saved', 'private', 'pending'].includes(requested) ? requested : 'published');
}

initialize();
