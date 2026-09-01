import {
  ArrowLeft, CalendarCheck, createIcons, Feather, Flag, Heart, Library, MessageSquareText,
  PenLine, Share2, ShieldCheck, Star, Sun, ThumbsUp
} from 'lucide';

const ICONS = {
  ArrowLeft, CalendarCheck, Feather, Flag, Heart, Library, MessageSquareText,
  PenLine, Share2, ShieldCheck, Star, Sun, ThumbsUp
};
const THEMES = {
  leger: 'Léger', drole: 'Drôle', touchant: 'Touchant', epuisant: 'Épuisant',
  surprenant: 'Surprenant', apprentissage: 'Apprentissage'
};
let page = 0;
let profileSlug = '';
let stories = [];

function renderIcons(root = document) {
  createIcons({ icons: ICONS, root, attrs: { 'stroke-width': 1.8 } });
}

function slugFromLocation() {
  const query = new URLSearchParams(location.search).get('slug');
  if (query) return query.toLowerCase();
  return location.pathname.match(/^\/membre\/([a-f0-9]{18})\/?$/i)?.[1]?.toLowerCase() || '';
}

function setState(title, copy) {
  const state = document.querySelector('#member-state');
  state.hidden = false;
  state.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = copy;
  state.append(strong, span);
  document.querySelector('#member-content').hidden = true;
}

function setAvatar(element, profile) {
  element.textContent = (profile.pseudonym || '·').charAt(0).toUpperCase();
  element.classList.toggle('has-image', Boolean(profile.avatarUrl));
  element.style.backgroundImage = profile.avatarUrl ? `url(${JSON.stringify(profile.avatarUrl)})` : '';
  if (profile.frameKey) element.dataset.avatarFrame = profile.frameKey;
  else delete element.dataset.avatarFrame;
}

function createBadge(badge) {
  const item = document.createElement('span');
  item.className = 'public-badge';
  item.title = badge.description;
  const badgeIcon = document.createElement('i');
  badgeIcon.dataset.lucide = badge.icon;
  item.append(badgeIcon, document.createTextNode(badge.label));
  return item;
}

function createStory(anecdote) {
  const article = document.createElement('article');
  article.className = 'member-story';
  const meta = document.createElement('div');
  meta.className = 'story-meta';
  const theme = document.createElement('span');
  theme.className = 'story-theme';
  theme.textContent = THEMES[anecdote.theme] || 'Léger';
  const date = document.createElement('span');
  date.textContent = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(anecdote.published_at || anecdote.submitted_at));
  meta.append(theme, date);
  const copy = document.createElement('p');
  copy.className = 'story-copy';
  copy.textContent = anecdote.body || '';
  const actions = document.createElement('div');
  actions.className = 'story-actions';
  const score = document.createElement('span');
  score.className = 'story-score';
  score.innerHTML = `<i data-lucide="thumbs-up"></i><span>${Number(anecdote.vote_score) || 0}</span>`;
  const actionGroup = document.createElement('div');
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'story-button';
  expand.textContent = 'Voir plus';
  expand.hidden = true;
  let canExpand = false;
  const detectClipping = () => {
    if (!article.classList.contains('is-expanded') && copy.scrollHeight > copy.clientHeight + 1) canExpand = true;
    expand.hidden = !canExpand;
  };
  expand.addEventListener('click', () => {
    const expanded = article.classList.toggle('is-expanded');
    expand.textContent = expanded ? 'Réduire' : 'Voir plus';
  });
  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'story-button';
  share.innerHTML = '<i data-lucide="share-2"></i><span>Partager</span>';
  share.addEventListener('click', async () => {
    const url = `${location.origin}/a/${anecdote.id}`;
    if (navigator.share) await navigator.share({ title: 'Une anecdote sur iladitquoi', url }).catch(() => {});
    else await navigator.clipboard.writeText(url).catch(() => {});
  });
  actionGroup.append(expand, share);
  actions.append(score, actionGroup);
  article.append(meta, copy, actions);
  window.requestAnimationFrame(detectClipping);
  if ('ResizeObserver' in window) new ResizeObserver(detectClipping).observe(copy);
  return article;
}

function renderStories(hasMore) {
  const list = document.querySelector('#member-stories');
  if (!stories.length) {
    const empty = document.createElement('div');
    empty.className = 'profile-state';
    empty.innerHTML = '<strong>Aucune anecdote publique</strong><span>Les publications anonymes ne sont pas affichées sur ce profil.</span>';
    list.replaceChildren(empty);
  } else {
    list.replaceChildren(...stories.map(createStory));
  }
  document.querySelector('#member-load-more').hidden = !hasMore;
  renderIcons(list);
}

function renderProfile(profile) {
  document.title = `${profile.pseudonym} · iladitquoi`;
  setAvatar(document.querySelector('#member-avatar'), profile);
  document.querySelector('#member-name').textContent = profile.pseudonym;
  document.querySelector('#member-meta').textContent = `${profile.profession} · ${profile.levelLabel}`;
  document.querySelector('#member-xp').textContent = profile.xpLabel;
  document.querySelector('#member-publications').textContent = profile.stats.publications;
  document.querySelector('#member-score').textContent = profile.stats.score;
  document.querySelector('#member-role').hidden = profile.displayRole !== 'Admin';
  document.querySelector('#member-badge-count').textContent = `${profile.badges.length} badge${profile.badges.length > 1 ? 's' : ''}`;
  const badgeList = document.querySelector('#member-badges');
  badgeList.replaceChildren(...profile.badges.map(createBadge));
  document.querySelector('#member-state').hidden = true;
  document.querySelector('#member-content').hidden = false;
  renderIcons(document.querySelector('#member-content'));
}

async function loadProfile({ append = false } = {}) {
  if (!profileSlug) {
    setState('Profil introuvable', 'Le lien utilisé n’est pas valide.');
    return;
  }
  const nextPage = append ? page + 1 : 0;
  const button = document.querySelector('#member-load-more');
  button.disabled = true;
  try {
    const response = await fetch(`/api/public-profile?slug=${encodeURIComponent(profileSlug)}&page=${nextPage}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'profile_unavailable');
    page = nextPage;
    stories = append ? [...stories, ...data.anecdotes] : data.anecdotes;
    renderProfile(data.profile);
    renderStories(data.hasMore);
  } catch (error) {
    if (!append) setState(error.message === 'profile_not_found' ? 'Profil introuvable' : 'Profil indisponible', 'Retournez au fil puis réessayez dans quelques instants.');
  } finally {
    button.disabled = false;
  }
}

profileSlug = slugFromLocation();
document.querySelector('#member-load-more').addEventListener('click', () => loadProfile({ append: true }));
renderIcons();
loadProfile();
