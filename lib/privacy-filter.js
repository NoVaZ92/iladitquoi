const COMMON_SENTENCE_WORDS = new Set([
  'À', 'Après', 'Alors', 'Avant', 'Avec', 'Aujourd’hui', 'Au', 'Aux', 'Bon', 'Bonjour',
  'Ce', 'Cette', 'Ces', 'Comme', 'Dans', 'De', 'Depuis', 'Des', 'Deux', 'Dimanche',
  'Elle', 'En', 'Enfin', 'Ensuite', 'Entre', 'Et', 'Hier', 'Il', 'Ils', 'Impossible',
  'J’ai', 'Je', 'Jeudi', 'La', 'Le', 'Les', 'Lors', 'Lundi', 'Mardi', 'Mais', 'Mercredi',
  'Mon', 'Nous', 'On', 'Pendant', 'Pour', 'Puis', 'Quand', 'Samedi', 'Sans', 'Si', 'Sur',
  'Tous', 'Toute', 'Un', 'Une', 'Vendredi', 'Vers', 'Vous', 'Urgence', 'Consultation',
  'Service', 'Patient', 'Patiente', 'Salle', 'Bloc', 'Scanner', 'Radio', 'Garde'
]);

const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/giu;
const PHONE_PATTERN = /(?<!\d)(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/gu;
const TITLED_NAME_PATTERN = /\b(?:M|Mme|Monsieur|Madame|Dr|Docteur)\.?\s+[\p{Lu}][\p{Ll}à-öø-ÿ'’-]+(?:\s+[\p{Lu}][\p{Ll}à-öø-ÿ'’-]+)?/gu;
const CAPITALIZED_WORD_PATTERN = /\b[\p{Lu}][\p{Ll}à-öø-ÿ'’-]{2,}\b/gu;

function maskPotentialNames(text) {
  let changed = false;
  const masked = text.replace(CAPITALIZED_WORD_PATTERN, (word) => {
    if (COMMON_SENTENCE_WORDS.has(word)) return word;
    changed = true;
    return '[prénom masqué]';
  });
  return { text: masked, changed };
}

export function sanitizePublicText(value) {
  const flags = [];
  let text = String(value || '');
  text = text.replace(EMAIL_PATTERN, () => {
    flags.push('email');
    return '[coordonnée masquée]';
  });
  text = text.replace(PHONE_PATTERN, () => {
    flags.push('téléphone');
    return '[coordonnée masquée]';
  });
  text = text.replace(TITLED_NAME_PATTERN, () => {
    flags.push('nom avec civilité');
    return '[personne masquée]';
  });
  const names = maskPotentialNames(text);
  if (names.changed) flags.push('prénom potentiel');
  return {
    text: names.text,
    changed: flags.length > 0,
    flags: [...new Set(flags)]
  };
}
