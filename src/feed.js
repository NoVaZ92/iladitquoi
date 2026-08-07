import {
  ArrowDown, ArrowRight, ArrowUp, Bookmark, BookOpen, BriefcaseMedical, Check,
  ChevronDown, Clock3, Copy, createIcons, Flame, Flag, Grid2X2, Home, LockKeyhole,
  LogIn, MessageSquareText, NotebookPen, PenLine, RefreshCw, Search, Send, Share2,
  Shuffle, Sparkles, Tag, UserRound, X
} from 'lucide';
import { populateProfessionSelect } from '../lib/professions.js';
import { sanitizePublicText } from '../lib/privacy-filter.js';

const MAX_CHARS = 355;
const DRAFT_KEY = 'iladitquoi.composer-draft';
const SAVED_KEY = 'iladitquoi.saved-posts';
const LEGACY_SAVED_KEY = 'anecdotes-du-soin.saved-posts';
const THEMES = {
  leger: { label: 'Léger', tone: 'blue' },
  drole: { label: 'Drôle', tone: 'orange' },
  touchant: { label: 'Touchant', tone: 'pink' },
  epuisant: { label: 'Épuisant', tone: 'green' },
  surprenant: { label: 'Surprenant', tone: 'violet' },
  apprentissage: { label: 'Apprentissage', tone: 'neutral' }
};
const ICONS = {
  ArrowDown, ArrowRight, ArrowUp, Bookmark, BookOpen, BriefcaseMedical, Check,
  ChevronDown, Clock3, Copy, Flame, Flag, Grid2X2, Home, LockKeyhole, LogIn,
  MessageSquareText, NotebookPen, PenLine, RefreshCw, Search, Send, Share2,
  Shuffle, Sparkles, Tag, UserRound, X
};

let feedItems = [];
let currentSort = new URLSearchParams(location.search).get('sort') === 'new' ? 'new' : 'top';
let currentProfile = null;
let privateNoteCount = 0;
let reportTarget = null;

function renderIcons(root = document) {
  createIcons({ icons: ICONS, root, attrs: { 'stroke-width': 1.8 } });
}

function loadJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

function loadSavedPosts() {
  const current = loadJson(SAVED_KEY, []);
  if (Array.isArray(current) && current.length) return current;
  const legacy = loadJson(LEGACY_SAVED_KEY, []);
  if (Array.isArray(legacy) && legacy.length) {
    saveJson(SAVED_KEY, legacy);
    return legacy;
  }
  return [];
}

function updateNotebookSummary() {
  document.querySelectorAll('[data-private-count]').forEach((element) => {
    element.textContent = String(privateNoteCount);
  });
}

function themeFor(value) {
  return THEMES[value] || THEMES.leger;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'récemment';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} j`;
}

function apiError(data, fallback) {
  const error = new Error(data?.error || fallback);
  error.retryAfter = Number(data?.retryAfter) || 0;
  return error;
}

function actionErrorMessage(error, fallback) {
  if (error?.message !== 'rate_limit_exceeded') return fallback;
  const seconds = Math.max(1, error.retryAfter || 1);
  const delay = seconds < 60 ? 'moins d’une minute' : `${Math.ceil(seconds / 60)} min`;
  return `Trop de tentatives rapprochées. Réessayez dans ${delay}.`;
}

function sharedAnecdoteId() {
  const queryId = new URLSearchParams(location.search).get('anecdote');
  if (queryId) return queryId;
  const pathMatch = location.pathname.match(/^\/a\/([0-9a-f-]{36})\/?$/i);
  return pathMatch?.[1] || '';
}

function sharedPrivateToken() {
  const queryToken = new URLSearchParams(location.search).get('private');
  if (queryToken) return queryToken;
  const pathMatch = location.pathname.match(/^\/p\/([A-Za-z0-9_-]{24,128})\/?$/);
  return pathMatch?.[1] || '';
}

function createButton(label, icon, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  const iconElement = document.createElement('i');
  iconElement.dataset.lucide = icon;
  const text = document.createElement('span');
  text.textContent = label;
  button.append(iconElement, text);
  return button;
}

function createPost(anecdote) {
  const article = document.createElement('article');
  const isPrivateShare = anecdote.private_share === true;
  article.className = `story${isPrivateShare ? ' is-private-share' : ''}`;
  article.dataset.id = anecdote.id;
  article.dataset.profession = String(anecdote.profession || 'Métier du soin');
  article.dataset.theme = String(anecdote.theme || 'leger');
  article.dataset.score = String(Number(anecdote.vote_score) || 0);

  const voteColumn = document.createElement('div');
  voteColumn.className = 'story-votes';
  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'vote-control vote-up';
  up.setAttribute('aria-label', 'Upvoter');
  up.innerHTML = '<i data-lucide="arrow-up"></i>';
  const score = document.createElement('strong');
  score.className = 'vote-score';
  score.textContent = article.dataset.score;
  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'vote-control';
  down.setAttribute('aria-label', 'Downvoter');
  down.innerHTML = '<i data-lucide="arrow-down"></i>';
  if (isPrivateShare) {
    voteColumn.classList.add('private-share-votes');
    score.textContent = 'Privé';
    voteColumn.append(score);
  } else {
    voteColumn.append(up, score, down);
  }

  let localVote = Number(anecdote.user_vote) || 0;
  const renderVote = () => {
    score.textContent = article.dataset.score;
    up.classList.toggle('is-active', localVote === 1);
    down.classList.toggle('is-active', localVote === -1);
  };
  const applyVote = async (direction) => {
    const token = await window.AnecdotesAuth?.getAccessToken?.();
    if (!token) {
      window.location.assign(`/auth.html?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    up.disabled = true;
    down.disabled = true;
    try {
      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ anecdoteId: anecdote.id, value: direction })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw apiError(data, 'vote_failed');
      article.dataset.score = String(Number(data.voteScore) || 0);
      anecdote.vote_score = Number(data.voteScore) || 0;
      localVote = Number(data.userVote) || 0;
      anecdote.user_vote = localVote;
      renderVote();
    } catch (error) {
      article.title = actionErrorMessage(error, 'Votre vote n’a pas pu être enregistré.');
    } finally {
      up.disabled = false;
      down.disabled = false;
    }
  };
  if (!isPrivateShare) renderVote();
  if (!isPrivateShare) {
    up.addEventListener('click', () => applyVote(1));
    down.addEventListener('click', () => applyVote(-1));
  }

  const content = document.createElement('div');
  content.className = 'story-content';
  const header = document.createElement('div');
  header.className = 'story-header';
  const theme = themeFor(anecdote.theme);
  const themeBadge = document.createElement('span');
  themeBadge.className = `theme-badge tone-${theme.tone}`;
  themeBadge.textContent = theme.label;
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'icon-button';
  save.setAttribute('aria-label', 'Enregistrer cette anecdote');
  save.innerHTML = '<i data-lucide="bookmark"></i>';
  let savedPosts = loadSavedPosts();
  let isSaved = Boolean(anecdote.is_saved) || savedPosts.some((item) => item.id === anecdote.id);
  const updateSavedState = () => {
    save.classList.toggle('is-active', isSaved);
    save.setAttribute('aria-pressed', String(isSaved));
    save.setAttribute('aria-label', isSaved ? 'Retirer des sélections' : 'Enregistrer cette anecdote');
  };
  updateSavedState();
  save.addEventListener('click', async () => {
    const nextSaved = !isSaved;
    save.disabled = true;
    const session = await window.AnecdotesAuth?.getSession?.();
    if (session) {
      const saved = await window.AnecdotesAuth?.setSavedAnecdote?.(anecdote.id, nextSaved);
      if (!saved) {
        save.disabled = false;
        save.title = 'La sélection n’a pas pu être synchronisée.';
        return;
      }
    }
    isSaved = nextSaved;
    anecdote.is_saved = isSaved;
    savedPosts = isSaved
      ? [{
          id: anecdote.id,
          text: anecdote.body,
          author: anecdote.author_label,
          profession: anecdote.profession,
          theme: anecdote.theme,
          savedAt: Date.now()
        }, ...savedPosts.filter((item) => item.id !== anecdote.id)]
      : savedPosts.filter((item) => item.id !== anecdote.id);
    saveJson(SAVED_KEY, savedPosts);
    updateSavedState();
    save.disabled = false;
  });
  if (isPrivateShare) {
    const privateBadge = document.createElement('span');
    privateBadge.className = 'private-share-badge';
    privateBadge.textContent = 'Lien privé';
    header.append(themeBadge, privateBadge);
  } else {
    header.append(themeBadge, save);
  }

  const copy = document.createElement('p');
  copy.className = 'story-copy';
  copy.textContent = anecdote.body || '';
  const readMore = document.createElement('button');
  readMore.type = 'button';
  readMore.className = 'read-more';
  readMore.textContent = 'Voir plus';
  if (copy.textContent.length <= 190) readMore.hidden = true;
  readMore.addEventListener('click', () => {
    const expanded = article.classList.toggle('is-expanded');
    readMore.textContent = expanded ? 'Réduire' : 'Voir plus';
  });

  const footer = document.createElement('div');
  footer.className = 'story-footer';
  const identity = document.createElement('div');
  identity.className = 'story-identity';
  const avatar = document.createElement('span');
  avatar.className = 'mini-avatar';
  avatar.textContent = String(anecdote.author_label || 'A').charAt(0).toUpperCase();
  const identityCopy = document.createElement('span');
  const author = document.createElement('strong');
  author.textContent = anecdote.author_label || 'Anonyme';
  const meta = document.createElement('small');
  meta.textContent = `${anecdote.profession || 'Métier du soin'} · ${formatDate(anecdote.published_at || anecdote.submitted_at)}`;
  identityCopy.append(author, meta);
  identity.append(avatar, identityCopy);

  const actions = document.createElement('div');
  actions.className = 'story-actions';
  const share = createButton('Partager', 'share-2', 'text-action');
  const report = createButton('Signaler', 'flag', 'text-action');
  share.addEventListener('click', () => openShareDialog(anecdote));
  report.addEventListener('click', () => openReportDialog(anecdote, report));
  if (!isPrivateShare) actions.append(share, report);
  footer.append(identity, actions);
  content.append(header, copy, readMore, footer);
  article.append(voteColumn, content);
  renderIcons(article);
  return article;
}

function renderFeed() {
  const feed = document.querySelector('#feed');
  const search = document.querySelector('#search-filter')?.value.trim().toLocaleLowerCase() || '';
  const profession = document.querySelector('#profession-filter')?.value || 'all';
  const theme = document.querySelector('[data-theme-filter].is-active')?.dataset.themeFilter || 'all';
  const visible = feedItems.filter((item) => {
    const matchSearch = !search || `${item.body} ${item.author_label} ${item.profession}`.toLocaleLowerCase().includes(search);
    const matchProfession = profession === 'all' || item.profession === profession;
    const matchTheme = theme === 'all' || item.theme === theme;
    return matchSearch && matchProfession && matchTheme;
  });

  feed.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'feed-state';
    empty.innerHTML = feedItems.length
      ? '<strong>Aucun résultat</strong><span>Modifiez les filtres pour retrouver une anecdote.</span>'
      : '<strong>Le fil attend sa première anecdote</strong><span>Les publications validées dans Supabase apparaîtront ici.</span>';
    feed.append(empty);
    return;
  }
  feed.append(...visible.map(createPost));
}

function setFeedState(title, copy, retry = false) {
  const feed = document.querySelector('#feed');
  feed.replaceChildren();
  const state = document.createElement('div');
  state.className = 'feed-state';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = copy;
  state.append(strong, span);
  if (retry) {
    const button = createButton('Réessayer', 'refresh-cw', 'secondary-button compact-button');
    button.addEventListener('click', () => loadFeed(currentSort));
    state.append(button);
    renderIcons(state);
  }
  feed.append(state);
}

async function loadFeed(sort = currentSort) {
  currentSort = sort;
  document.querySelectorAll('.segment[data-sort]').forEach((button) => {
    const active = button.dataset.sort === sort;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  setFeedState('Chargement du fil…', 'Lecture des anecdotes validées dans Supabase.');
  try {
    const response = await fetch(`/api/feed?sort=${sort}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('feed_unavailable');
    const data = await response.json();
    feedItems = Array.isArray(data.anecdotes) ? data.anecdotes : [];
    await includeSharedAnecdote();
    await hydrateUserVotes();
    await hydrateSavedPosts();
    renderFeed();
    focusSharedAnecdote();
  } catch {
    feedItems = [];
    setFeedState('Le fil ne répond pas', 'Vérifiez la connexion Supabase puis réessayez.', true);
  }
}

async function hydrateUserVotes() {
  const ids = feedItems.filter((item) => !item.private_share).map((item) => item.id);
  const votes = await window.AnecdotesAuth?.getVotes?.(ids);
  if (!votes) return;
  feedItems.forEach((item) => { item.user_vote = votes.get(item.id) || 0; });
}

async function hydrateSavedPosts() {
  const savedIds = await window.AnecdotesAuth?.getSavedAnecdoteIds?.();
  if (!savedIds) return;
  feedItems.forEach((item) => { item.is_saved = savedIds.has(item.id); });
}

async function includeSharedAnecdote() {
  const privateToken = sharedPrivateToken();
  if (privateToken) {
    try {
      const response = await fetch(`/api/private-share?token=${encodeURIComponent(privateToken)}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.anecdote) feedItems.unshift(data.anecdote);
    } catch { /* the public feed remains available */ }
    return;
  }
  const id = sharedAnecdoteId();
  if (!id || feedItems.some((item) => item.id === id)) return;
  try {
    const response = await fetch(`/api/anecdote?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (data.anecdote) feedItems.unshift(data.anecdote);
  } catch { /* the main feed remains available */ }
}

function focusSharedAnecdote() {
  const id = sharedPrivateToken() ? feedItems.find((item) => item.private_share)?.id : sharedAnecdoteId();
  if (!id) return;
  const post = [...document.querySelectorAll('.story')].find((item) => item.dataset.id === id);
  if (!post) return;
  post.classList.add('is-shared');
  window.setTimeout(() => post.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

function openShareDialog(anecdote) {
  const url = `${location.origin}/a/${anecdote.id}`;
  const dialog = document.querySelector('#share-dialog');
  document.querySelector('#share-url').value = url;
  document.querySelector('#whatsapp-share').href = `https://wa.me/?text=${encodeURIComponent(`Je viens de tomber sur une pépite de garde : ${url}`)}`;
  document.querySelector('#share-status').textContent = '';
  dialog.showModal();
}

function bindShareDialog() {
  const dialog = document.querySelector('#share-dialog');
  document.querySelector('#close-share').addEventListener('click', () => dialog.close());
  document.querySelector('#copy-share').addEventListener('click', async () => {
    const value = document.querySelector('#share-url').value;
    try { await navigator.clipboard.writeText(value); } catch {
      const input = document.querySelector('#share-url');
      input.select();
      document.execCommand('copy');
    }
    document.querySelector('#share-status').textContent = 'Lien copié.';
  });
}

function openReportDialog(anecdote, control) {
  reportTarget = { anecdote, control };
  const dialog = document.querySelector('#report-dialog');
  const details = document.querySelector('#report-details');
  document.querySelector('#report-reason').value = 'identification';
  details.value = '';
  details.required = false;
  document.querySelector('#report-status').textContent = '';
  dialog.showModal();
}

function bindReportDialog() {
  const dialog = document.querySelector('#report-dialog');
  const close = () => {
    reportTarget = null;
    dialog.close();
  };
  const reason = document.querySelector('#report-reason');
  const details = document.querySelector('#report-details');
  const submit = document.querySelector('#submit-report');
  const status = document.querySelector('#report-status');
  document.querySelector('#close-report').addEventListener('click', close);
  document.querySelector('#cancel-report').addEventListener('click', close);
  reason.addEventListener('change', () => {
    const isOther = reason.value === 'other';
    details.required = isOther;
    details.placeholder = isOther ? 'Décrivez brièvement le problème.' : 'Précision facultative pour la modération.';
  });
  dialog.addEventListener('cancel', () => { reportTarget = null; });
  submit.addEventListener('click', async () => {
    if (!reportTarget) return close();
    const detail = details.value.trim();
    if (reason.value === 'other' && detail.length < 3) {
      status.textContent = 'Ajoutez une courte précision pour ce motif.';
      details.focus();
      return;
    }
    submit.disabled = true;
    status.textContent = 'Envoi du signalement…';
    try {
      const token = await window.AnecdotesAuth?.getAccessToken?.();
      const headers = { 'content-type': 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetch('/api/report', {
        method: 'POST',
        headers,
        body: JSON.stringify({ anecdoteId: reportTarget.anecdote.id, reasonCode: reason.value, details: detail })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw apiError(data, 'report_failed');
      reportTarget.control.disabled = true;
      reportTarget.control.querySelector('span').textContent = 'Signalé';
      close();
    } catch (error) {
      status.textContent = actionErrorMessage(error, 'Le signalement n’a pas pu être envoyé.');
    } finally {
      submit.disabled = false;
    }
  });
}

function bindFilters() {
  document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => loadFeed(button.dataset.sort)));
  document.querySelectorAll('[data-theme-filter]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-theme-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    renderFeed();
  }));
  document.querySelector('#profession-filter').addEventListener('change', renderFeed);
  document.querySelector('#search-filter').addEventListener('input', renderFeed);
  document.querySelector('[data-random-post]').addEventListener('click', () => {
    const posts = [...document.querySelectorAll('.story')];
    posts[Math.floor(Math.random() * posts.length)]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function updateComposerIdentity(profile) {
  currentProfile = profile;
  const guestField = document.querySelector('[data-guest-profession]');
  const memberField = document.querySelector('[data-member-profession]');
  const profession = profile?.profession || '';
  guestField.hidden = Boolean(profession);
  memberField.hidden = !profession;
  document.querySelector('[data-composer-profession]').textContent = profession;
  if (profession) document.querySelector('#profession-choice').value = profession;
  const greeting = document.querySelector('[data-greeting]');
  greeting.textContent = profile?.pseudonym ? `Bonjour ${profile.pseudonym}` : 'Bonjour, collègue de passage';
}

async function syncAuthProfile() {
  const profile = await window.AnecdotesAuth?.getProfile?.();
  updateComposerIdentity(profile || null);
  privateNoteCount = await window.AnecdotesAuth?.getPrivateCount?.() || 0;
  updateNotebookSummary();
}

function bindComposer() {
  const editor = document.querySelector('#anecdote-editor');
  const counter = document.querySelector('#char-counter');
  const privacy = document.querySelector('#privacy-status');
  const draftStatus = document.querySelector('#draft-status');
  const profession = document.querySelector('#profession-choice');
  const visibility = document.querySelector('#visibility-choice');
  const anonymous = document.querySelector('#anonymous-toggle');
  const submit = document.querySelector('#submit-anecdote');
  const status = document.querySelector('#form-status');
  const restored = loadJson(DRAFT_KEY);
  if (restored?.text) {
    editor.value = String(restored.text).slice(0, MAX_CHARS);
    if (restored.profession) profession.value = restored.profession;
    if (restored.theme) document.querySelector('#theme-choice').value = restored.theme;
    if (restored.visibility) visibility.value = restored.visibility;
    anonymous.checked = Boolean(restored.anonymous);
    draftStatus.textContent = 'Brouillon restauré.';
  }
  if (new URLSearchParams(location.search).get('mode') === 'private') visibility.value = 'private';

  const refresh = () => {
    const text = editor.value;
    counter.textContent = `${text.length}/${MAX_CHARS}`;
    counter.classList.toggle('is-limit', text.length >= MAX_CHARS);
    const scan = sanitizePublicText(text.trim());
    privacy.textContent = scan.changed
      ? `Confidentialité : ${scan.flags.join(', ')} détecté(s). Le texte sera masqué avant stockage.`
      : text.trim() ? 'Confidentialité : aucun identifiant évident détecté.' : '';
    privacy.classList.toggle('is-warning', scan.changed);
    if (text.trim()) {
      saveJson(DRAFT_KEY, {
        text,
        profession: profession.value,
        theme: document.querySelector('#theme-choice').value,
        visibility: visibility.value,
        anonymous: anonymous.checked
      });
      draftStatus.textContent = 'Brouillon enregistré sur cet appareil.';
    } else {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage may be unavailable */ }
      draftStatus.textContent = '';
    }
  };

  editor.addEventListener('input', refresh);
  [profession, visibility, anonymous, document.querySelector('#theme-choice')].forEach((control) => control.addEventListener('change', refresh));

  submit.addEventListener('click', async () => {
    const text = editor.value.trim();
    if (!text) {
      status.textContent = 'Écrivez une anecdote avant de l’envoyer.';
      editor.focus();
      return;
    }
    const session = await window.AnecdotesAuth?.getSession?.();
    if (visibility.value === 'private') {
      if (!session) {
        status.textContent = 'Connectez-vous pour utiliser le carnet privé.';
        return;
      }
      submit.disabled = true;
      status.textContent = 'Enregistrement dans votre carnet privé…';
      try {
        const token = await window.AnecdotesAuth?.getAccessToken?.();
        const response = await fetch('/api/private', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, theme: document.querySelector('#theme-choice').value })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw apiError(data, 'private_submission_failed');
        privateNoteCount += 1;
        updateNotebookSummary();
        editor.value = '';
        refresh();
        status.textContent = data.privacy?.changed
          ? `Note enregistrée. Le filtre a masqué : ${data.privacy.flags.join(', ')}.`
          : 'Note enregistrée dans votre carnet privé.';
      } catch (error) {
        status.textContent = actionErrorMessage(error, 'L’enregistrement a échoué. Le brouillon est conservé.');
      } finally {
        submit.disabled = false;
      }
      return;
    }
    if (!anonymous.checked && !session) {
      status.textContent = 'Connectez-vous pour publier sous votre pseudonyme.';
      return;
    }

    submit.disabled = true;
    status.textContent = 'Envoi à la modération…';
    try {
      const token = await window.AnecdotesAuth?.getAccessToken?.();
      const headers = { 'content-type': 'application/json' };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          profession: currentProfile?.profession || profession.value,
          theme: document.querySelector('#theme-choice').value,
          anonymous: anonymous.checked
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw apiError(data, 'submission_failed');
      editor.value = '';
      refresh();
      status.textContent = data.privacy?.changed
        ? `Envoyée. Le filtre a masqué : ${data.privacy.flags.join(', ')}. Validation humaine en attente.`
        : 'Anecdote envoyée. Elle apparaîtra après validation humaine.';
    } catch (error) {
      status.textContent = error.message === 'authentication_required'
        ? 'Votre session a expiré. Reconnectez-vous.'
        : actionErrorMessage(error, 'L’envoi a échoué. Le brouillon est conservé.');
    } finally {
      submit.disabled = false;
    }
  });
  refresh();
}

function setupProfessionFields() {
  populateProfessionSelect(document.querySelector('#profession-choice'));
  populateProfessionSelect(document.querySelector('#profession-filter'), { placeholder: 'Tous les métiers' });
  document.querySelector('#profession-filter').querySelector('option').value = 'all';
}

function initialize() {
  setupProfessionFields();
  renderIcons();
  bindComposer();
  bindFilters();
  bindShareDialog();
  bindReportDialog();
  updateNotebookSummary();
  window.addEventListener('anecdotes:auth', () => {
    syncAuthProfile().catch(() => updateComposerIdentity(null));
    Promise.all([hydrateUserVotes(), hydrateSavedPosts()]).then(renderFeed).catch(() => {});
  });
  syncAuthProfile().catch(() => updateComposerIdentity(null));
  loadFeed(currentSort);
}

initialize();
