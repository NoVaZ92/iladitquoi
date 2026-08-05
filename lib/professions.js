export const PROFESSIONS = [
  'Agent de service hospitalier',
  'Aide-soignante',
  'Aide-soignant',
  'Ambulancière',
  'Ambulancier',
  'Assistante dentaire',
  'Assistant dentaire',
  'Assistante sociale',
  'Assistant social',
  'Auxiliaire de puériculture',
  'Cadre de santé',
  'Dentiste',
  'Chirurgien-dentiste',
  'Diététicienne',
  'Diététicien',
  'Éducatrice spécialisée',
  'Éducateur spécialisé',
  'Ergothérapeute',
  'Étudiante en santé',
  'Étudiant en santé',
  'Infirmière',
  'Infirmier',
  'Interne en médecine',
  'Kinésithérapeute',
  'Manipulatrice radio',
  'Manipulateur radio',
  'Médecin',
  'Médecin généraliste',
  'Médecin spécialiste',
  'Opticienne',
  'Opticien',
  'Orthophoniste',
  'Orthoptiste',
  'Ostéopathe',
  'Pharmacienne',
  'Pharmacien',
  'Podologue',
  'Psychologue',
  'Psychomotricienne',
  'Psychomotricien',
  'Sage-femme',
  'Secrétaire médicale',
  'Technicienne de laboratoire',
  'Technicien de laboratoire',
  'Vétérinaire',
  'Autre métier du soin'
];

export function populateProfessionSelect(select, { placeholder = 'Choisir un métier' } = {}) {
  if (!select) return;
  const selected = select.value;
  select.replaceChildren();
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.append(first);
  for (const profession of PROFESSIONS) {
    const option = document.createElement('option');
    option.value = profession;
    option.textContent = profession;
    select.append(option);
  }
  if (PROFESSIONS.includes(selected)) select.value = selected;
}
