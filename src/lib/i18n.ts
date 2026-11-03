import { formatMoney } from './money';
import { useStore } from './store';
import type { Language } from './types';

/**
 * Tiny i18n: the English text is the key, `fr` maps it to French. A missing entry falls back to
 * English, so a forgotten string shows up untranslated instead of breaking. `{name}` placeholders.
 */
const fr: Record<string, string> = {
  // Tabs and titles
  Capture: 'Dictée',
  Invoices: 'Factures',
  Settings: 'Réglages',
  Invoice: 'Facture',
  Clients: 'Clients',
  'Rate card': 'Grille tarifaire',
  Company: 'Entreprise',
  Import: 'Importer',
  'Draft invoice': 'Brouillon',
  Back: 'Retour',

  // Capture
  'Say or type what you did, like': 'Dis ou écris ce que tu as fait, par exemple',
  '“Chez Paul, a poster for the summer menu and a small revision on the wine list.”':
    '« Chez Paul, une affiche pour le menu d’été et une petite modif sur la carte des vins. »',
  'Type a mission…': 'Écris une mission…',
  'Recording… {s}s · tap to stop': 'Enregistrement… {s}s · touche pour arrêter',
  'Transcribing…': 'Transcription…',
  'Reading your note…': 'Je lis ta note…',
  Send: 'Envoyer',
  'Check the text, then send.': 'Vérifie le texte, puis envoie.',
  '✅ Added': '✅ Ajouté',
  'Not yet invoiced for {client}: {amount}': 'Pas encore facturé pour {client} : {amount}',
  'I don’t know “{name}” ({n} missions). Who is it?': 'Je ne connais pas « {name} » ({n} missions). C’est qui ?',
  'New client “{name}” ({n} missions).': 'Nouveau client « {name} » ({n} missions).',
  'Create “{name}”': 'Créer « {name} »',
  "I didn't hear any billable mission in that one.": 'Je n’ai pas trouvé de mission à facturer dans ce message.',
  'Microphone access is needed to record voice notes.': 'L’accès au micro est nécessaire pour dicter.',
  'The AI backend is not configured yet. See the README to add your Supabase URL and keys.':
    'Le backend IA n’est pas encore configuré. Le README explique comment ajouter l’URL Supabase et les clés.',
  'Demo mode: the AI is simulated with simple keyword matching. Type your missions, voice needs the real backend.':
    'Mode démo : l’IA est simulée par des mots-clés. Écris tes missions, la voix demande le vrai backend.',
  'Voice notes need the real AI backend. In this demo, type your missions instead.':
    'La dictée vocale demande le vrai backend IA. Dans cette démo, écris tes missions.',
  'Invoicing as': 'Facturer en tant que',

  // Mission card
  'Unknown client': 'Client inconnu',
  'Needs a price': 'Prix à donner',
  Invoiced: 'Facturé',
  'Your price': 'Ton prix',
  Undo: 'Annuler',
  'Price ({currency})': 'Prix ({currency})',
  Set: 'Valider',
  'How many?': 'Combien ?',
  'How long is it?': 'Quelle durée ?',
  'This one is on quote. What price?': 'C’est sur devis. Quel prix ?',
  'No price in your rate card for this. How much?': 'Pas de prix dans ta grille pour ça. Combien ?',

  // Invoices
  'To invoice': 'À facturer',
  'Awaiting payment': 'En attente',
  Paid: 'Payé',
  '{n} overdue': '{n} en retard',
  'Ready to invoice': 'Prêt à facturer',
  'No confirmed mission waiting.': 'Aucune mission confirmée en attente.',
  '{n} missions still need a price (see Capture).': '{n} mission(s) attendent encore un prix (voir Dictée).',
  'Prepare draft invoices': 'Préparer les brouillons',
  Drafts: 'Brouillons',
  Sent: 'Envoyées',
  Overdue: 'En retard',
  Draft: 'Brouillon',
  '{n} lines': '{n} ligne(s)',

  // Invoice detail
  'Invoice not found.': 'Facture introuvable.',
  'Issued {issue} · due {due}': 'Émise le {issue} · échéance {due}',
  Lines: 'Lignes',
  Remove: 'Retirer',
  'Discount (%)': 'Remise (%)',
  Subtotal: 'Sous-total',
  'Discount ({p}%)': 'Remise ({p} %)',
  'VAT ({p}%)': 'TVA ({p} %)',
  Total: 'Total',
  'Share PDF': 'Partager le PDF',
  'Approve and issue': 'Valider et émettre',
  'Mark as paid': 'Marquer comme payée',
  'Delete draft': 'Supprimer le brouillon',
  'Issue this invoice?': 'Émettre cette facture ?',
  'It gets its final number and can no longer be edited.': 'Elle reçoit son numéro définitif et ne peut plus être modifiée.',
  Cancel: 'Annuler',
  Issue: 'Émettre',
  'Nothing is sent to your client automatically. Issue the invoice, then share the PDF.':
    'Rien n’est envoyé automatiquement à ton client. Émets la facture, puis partage le PDF.',
  draft: 'brouillon',
  sent: 'envoyée',
  paid: 'payée',

  // Settings
  Companies: 'Tes entreprises',
  'Add a company': 'Ajouter une entreprise',
  'Clients and prices': 'Clients et prix',
  'Clients ({n})': 'Clients ({n})',
  'Rate card ({n})': 'Grille tarifaire ({n})',
  'Import from facture.net or a spreadsheet': 'Importer depuis facture.net ou un tableur',
  App: 'Application',
  Language: 'Langue',
  'AI backend: {state}': 'Backend IA : {state}',
  connected: 'connecté',
  'not configured': 'non configuré',
  demo: 'démo',
  'Your data is stored on this device for now.': 'Tes données sont stockées sur cet appareil pour l’instant.',
  'Load demo data': 'Charger les données de démo',
  'Replace your data with the demo workspace?': 'Remplacer tes données par l’espace de démo ?',
  'Erase all data': 'Effacer toutes les données',
  'Erase all data on this device?': 'Effacer toutes les données de cet appareil ?',
  Yes: 'Oui',
  active: 'active',
  'Unnamed company': 'Entreprise sans nom',

  // Business editor
  Identity: 'Identité',
  Name: 'Nom',
  'Legal form (e.g. Micro-entreprise, SAS)': 'Statut (ex. Micro-entreprise, SAS)',
  SIREN: 'SIREN',
  Address: 'Adresse',
  Email: 'Email',
  Currency: 'Devise',
  'VAT rate (%)': 'Taux de TVA (%)',
  'VAT number': 'N° de TVA',
  'Legal note on invoices': 'Mentions légales sur les factures',
  'Payment details (bank, IBAN…)': 'Coordonnées de paiement (banque, IBAN…)',
  'Payment terms (days)': 'Délai de paiement (jours)',
  'Invoice prefix': 'Préfixe de numérotation',
  'Invoice template': 'Modèle de facture',
  Classic: 'Classique',
  Minimal: 'Minimal',
  Bold: 'Affirmé',
  'Accent color': 'Couleur',
  Logo: 'Logo',
  'Add a logo': 'Ajouter un logo',
  'Change logo': 'Changer le logo',
  'Remove logo': 'Retirer le logo',
  'Invoice language': 'Langue des factures',
  'Preview an invoice': 'Aperçu d’une facture',
  'Use for new missions': 'Utiliser pour les nouvelles missions',
  'Delete company': 'Supprimer l’entreprise',
  'This company has missions or invoices, so it is kept.': 'Cette entreprise a des missions ou des factures : elle est conservée.',
  'Find my company in the registry': 'Trouver mon entreprise dans le registre',

  // Clients
  'Add client': 'Ajouter un client',
  'No clients yet. Add one, or just mention a new client in a voice note.':
    'Pas encore de client. Ajoute-en un, ou cite simplement un nouveau client dans une dictée.',
  'Search the French company registry': 'Chercher dans le registre des entreprises',
  'Company name or SIREN': 'Nom de l’entreprise ou SIREN',
  'Searching…': 'Recherche…',
  'No company found.': 'Aucune entreprise trouvée.',
  'The registry could not be reached. Fill in the details by hand.': 'Le registre est injoignable. Remplis les infos à la main.',
  closed: 'fermée',
  'Nicknames you use when talking (comma separated)': 'Surnoms que tu utilises en parlant (séparés par des virgules)',
  'Billing email': 'Email de facturation',
  'Payment terms (days, empty = default)': 'Délai de paiement (jours, vide = par défaut)',
  Save: 'Enregistrer',
  'Delete client': 'Supprimer le client',
  'Prices for this client ({company})': 'Prix pour ce client ({company})',
  'Leave empty to use the standard price.': 'Laisse vide pour garder le prix standard.',
  'standard {price}': 'standard {price}',

  // Rates
  'Prices only ever come from here or from what you say. When a service is missing, the app asks you.':
    'Les prix viennent uniquement d’ici ou de ce que tu dis. Si une prestation manque, l’app te demande.',
  'Add service': 'Ajouter une prestation',
  'Import a rate card (PDF)': 'Importer une grille (PDF)',
  'Reading your rate card…': 'Lecture de ta grille…',
  '{n} services found. Check them, then import.': '{n} prestations trouvées. Vérifie-les, puis importe.',
  'Import {n} services': 'Importer {n} prestations',
  'PDF import needs the real AI backend.': 'L’import de PDF demande le vrai backend IA.',
  'Add-ons': 'Options',
  Service: 'Prestation',
  'Other words you use for it (comma separated)': 'Autres mots que tu utilises (séparés par des virgules)',
  Pricing: 'Tarif',
  'Fixed price': 'Prix fixe',
  'Per unit': 'À l’unité',
  'On quote': 'Sur devis',
  'Minimum (optional)': 'Minimum (optionnel)',
  Delete: 'Supprimer',
  'Priced by length: {d}': 'Prix par durée : {d}',
  hour: 'heure',
  day: 'jour',
  minute: 'minute',
  piece: 'pièce',
  quote: 'devis',
  over: 'au-delà',

  // Import
  'Export your clients, items and invoices from facture.net (CSV or Excel), then add the files here.':
    'Exporte tes clients, articles et factures depuis facture.net (CSV ou Excel), puis ajoute les fichiers ici.',
  'Choose files': 'Choisir des fichiers',
  'Import into': 'Importer dans',
  '{file}: {n} {kind}': '{file} : {n} {kind}',
  clients: 'clients',
  items: 'articles',
  invoices: 'factures',
  'not recognised': 'non reconnu',
  'Import everything': 'Tout importer',
  'Imported: {c} clients, {r} services, {i} invoices.': 'Importé : {c} clients, {r} prestations, {i} factures.',
  'Already in Saidpaid, skipped: {n}': 'Déjà dans Saidpaid, ignorés : {n}',
  'Numbering continues after {n}.': 'La numérotation reprend après {n}.',
  'Imported invoice': 'Facture importée',
  'Try with example files': 'Essayer avec des fichiers d’exemple',
  'Excel file: open it and save it as CSV, then add it again.': 'Fichier Excel : ouvre-le, enregistre-le en CSV, puis ajoute-le à nouveau.',
  'Ready: {c} clients, {r} services, {i} invoices.': 'Prêt : {c} clients, {r} prestations, {i} factures.',
  'Something went wrong.': 'Un problème est survenu.',
  'Numbering: {pattern}': 'Numérotation : {pattern}',
  '{n} special prices': '{n} prix spécial(aux)',
  'Too many requests, try again in a moment.': 'Trop de demandes, réessaie dans un instant.',
  'The AI service failed, try again.': 'Le service IA a échoué, réessaie.',
};

const dicts: Record<Language, Record<string, string>> = { fr, en: {} };

export function translate(lang: Language, key: string, vars?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const { state } = useStore();
  return (key: string, vars?: Record<string, string | number>) => translate(state.uiLanguage, key, vars);
}

export const localeFor = (lang: Language) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

/** Money formatted in the interface language (1 234,50 € in French). */
export function useMoney() {
  const { state } = useStore();
  return (minor: number, currency: string) => formatMoney(minor, currency, localeFor(state.uiLanguage));
}
