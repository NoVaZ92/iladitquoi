function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
}

async function loadLegalDetails() {
  try {
    const response = await fetch('/api/configuration', { headers: { Accept: 'application/json' } });
    const configuration = await response.json();
    if (!configuration?.legal) throw new Error('legal_unavailable');
    const legal = configuration.legal;
    setText('[data-legal-publisher]', legal.publisherName || 'Éditeur en cours de configuration');
    setText('[data-legal-director]', legal.publishingDirector || legal.publisherName || 'Éditeur en cours de configuration');
    setText('[data-legal-address]', legal.postalAddress || 'Adresse en cours de configuration');
    setText('[data-legal-updated]', legal.lastUpdated || '7 août 2026');
    document.querySelectorAll('[data-legal-email]').forEach((link) => {
      const email = legal.contactEmail || '';
      link.textContent = email || 'Contact en cours de configuration';
      if (email) link.href = `mailto:${email}`;
      else link.removeAttribute('href');
    });
    if (!legal.configured) document.querySelector('[data-legal-configuration]')?.removeAttribute('hidden');
  } catch {
    document.querySelector('[data-legal-configuration]')?.removeAttribute('hidden');
  }
}

const sectionFromPath = {
  '/cgu': 'cgu',
  '/confidentialite': 'confidentialite',
  '/mentions-legales': 'mentions-legales'
};

const section = sectionFromPath[location.pathname];
if (section && !location.hash) history.replaceState({}, '', `${location.pathname}#${section}`);
loadLegalDetails();
