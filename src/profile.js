import {
  ArrowLeft, Bookmark, BookOpen, Copy, createIcons, Download, FileClock, LockKeyhole, LogOut,
  NotebookPen, PenLine, Send, ShieldCheck, Sun, Trash2, UserRound, X
} from 'lucide';

const ICONS = { ArrowLeft, Bookmark, BookOpen, Copy, Download, FileClock, LockKeyhole, LogOut, NotebookPen, PenLine, Send, ShieldCheck, Sun, Trash2, UserRound, X };
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

async function renderSavedPosts() {
  const remote = await window.AnecdotesAuth?.getSavedAnecdotes?.();
  const posts = remote?.available ? remote.posts : loadCollection(SAVED_KEY, LEGACY_SAVED_KEY);
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
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'saved-remove-button';
    remove.innerHTML = '<i data-lucide="trash-2" aria-hidden="true"></i><span>Retirer</span>';
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      if (remote?.available) {
        const removed = await window.AnecdotesAuth?.setSavedAnecdote?.(post.id, false);
        if (!removed) {
          remove.disabled = false;
          remove.title = 'La sélection n’a pas pu être retirée.';
          return;
        }
      } else {
        const remaining = posts.filter((item) => item.id !== post.id);
        try { localStorage.setItem(SAVED_KEY, JSON.stringify(remaining)); } catch { /* storage remains a best-effort fallback */ }
      }
      await renderSavedPosts();
    });
    article.append(meta, copy, remove);
    return article;
  }));
  window.dispatchEvent(new Event('anecdotes:icons-updated'));
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
  const copyButton = document.querySelector('#copy-private-share');
  const whatsapp = document.querySelector('#private-whatsapp-share');
  document.querySelector('#close-private-share').addEventListener('click', () => dialog.close());
  copyButton.addEventListener('click', async () => {
    if (!urlInput.value) return;
    try { await navigator.clipboard.writeText(urlInput.value); } catch {
      urlInput.select();
      document.execCommand('copy');
    }
    status.textContent = 'Lien copié.';
  });
  window.addEventListener('anecdotes:private-share', async (event) => {
    const token = await window.AnecdotesAuth?.getAccessToken?.();
    if (!token) return;
    urlInput.value = '';
    copyButton.disabled = true;
    whatsapp.hidden = true;
    status.textContent = 'Création du lien privé…';
    if (!dialog.open) dialog.showModal();
    try {
      const response = await fetch('/api/private-share', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ anecdoteId: event.detail.anecdoteId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        const error = new Error(data.error || 'share_failed');
        error.retryAfter = Number(data.retryAfter) || 0;
        throw error;
      }
      const url = `${location.origin}/p/${data.token}`;
      urlInput.value = url;
      whatsapp.href = `https://wa.me/?text=${encodeURIComponent(`Je t’envoie une note privée : ${url}`)}`;
      whatsapp.hidden = false;
      copyButton.disabled = false;
      status.textContent = '';
    } catch (error) {
      const minutes = Math.max(1, Math.ceil((error.retryAfter || 1) / 60));
      status.textContent = error.message === 'rate_limit_exceeded'
        ? `Trop de liens créés récemment. Réessayez dans ${minutes} min.`
        : 'Le lien privé n’a pas pu être créé. Réessayez.';
    }
  });
}

function initialize() {
  createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.8 } });
  window.addEventListener('anecdotes:icons-updated', () => createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.8 } }));
  renderSavedPosts();
  window.addEventListener('anecdotes:auth', () => { renderSavedPosts(); });
  bindPrivateShare();
  document.querySelector('[data-export-personal-data]')?.addEventListener('click', (event) => {
    window.dispatchEvent(new CustomEvent('anecdotes:export-data', { detail: { button: event.currentTarget } }));
  });
  document.querySelector('[data-delete-account]')?.addEventListener('click', (event) => {
    window.dispatchEvent(new CustomEvent('anecdotes:delete-account', { detail: { button: event.currentTarget } }));
  });
  document.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.profileTab)));
  const requested = new URLSearchParams(location.search).get('tab');
  activateTab(['published', 'saved', 'private', 'pending'].includes(requested) ? requested : 'published');
}

initialize();
