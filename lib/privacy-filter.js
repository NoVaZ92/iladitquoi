const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/giu;
const PHONE_PATTERN = /(?<!\d)(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/gu;
const TITLED_NAME_PATTERN = /\b(?:M|Mme|Monsieur|Madame|Dr|Docteur)\.?\s+[\p{Lu}][\p{Ll}à-öø-ÿ'’-]+(?:\s+[\p{Lu}][\p{Ll}à-öø-ÿ'’-]+)?/gu;

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
  return {
    text,
    changed: flags.length > 0,
    flags: [...new Set(flags)]
  };
}
