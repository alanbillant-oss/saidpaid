# Saidpaid

> Send a voice note. Get paid.

Application mobile (Expo / React Native, iOS + Android + web) pour freelances : on dicte ses missions au fil de l'eau, l'IA les comprend, l'app les chiffre avec **ta** grille tarifaire, prépare les factures et génère le PDF.

## Ce que fait l'app

- **Dictée** : écran façon messagerie. Tu écris ou tu dictes (« Chez Paul, une affiche pour le menu d'été et une petite modif sur la carte des vins »). Comme la dictée du clavier : la voix devient du texte dans la zone de saisie, tu corriges si besoin, puis tu envoies.
- **Transcription** (Deepgram nova-3, multilingue) puis **extraction** par Claude en JSON strict : client, missions, quantités, options, date.
- **Prix déterministes** (`src/lib/pricing.ts`) : le prix vient toujours de ce que tu as dit ou de ta grille, jamais de l'IA. Prix fixe, prix par unité avec minimum, tranches de durée, « sur devis », options en montant fixe ou en %, **prix spécifiques par client**.
- **Plusieurs entreprises** : chacune a son identité (statut, SIREN, TVA, mentions), sa grille tarifaire, sa numérotation et son **modèle de facture** (Classique, Minimal, Affirmé, couleur, logo, langue). Un sélecteur « Facturer en tant que » choisit l'entreprise des nouvelles missions.
- **Registre des entreprises** : en tapant le nom ou le SIREN d'un client (ou de ta boîte), l'app propose les entreprises trouvées dans le registre officiel (API Recherche d'entreprises, gratuite et sans clé) et remplit adresse, SIREN et n° de TVA.
- **Import facture.net** : Réglages → « Importer depuis facture.net ou un tableur ». Tu ajoutes les exports CSV (clients, articles, factures), l'app reconnaît chaque fichier par ses colonnes, ignore ce qui existe déjà et **reprend la numérotation** là où tu t'es arrêté (ex. F2026-0043 → F2026-0044). Les fichiers Excel sont à réenregistrer en CSV.
- **Import de grille PDF** : Grille tarifaire → « Importer une grille (PDF) ». Claude lit le PDF et propose les prestations, tu vérifies avant d'importer.
- **Clarifications** : client inconnu → « Créer / choisir un client » ; prix manquant ou sur devis → l'app te demande le prix.
- **Factures** : brouillons par client et par entreprise, remise de volume, édition des lignes, numérotation attribuée à l'émission (pas de trou), PDF partageable, mentions françaises (pénalités de retard, indemnité de 40 €), suivi envoyée / payée / en retard.
- **Données démo** : Réglages → « Charger les données de démo » (317 LAB et Studio Alan).

Interface en français (anglais disponible dans Réglages). Les données sont stockées **sur le téléphone** pour l'instant ; le schéma Supabase est prêt pour la synchro.

## Architecture

```
src/app/                 écrans (Expo Router)
  (tabs)/index.tsx       dictée (chat + micro)
  (tabs)/invoices.tsx    tableau de bord + factures
  (tabs)/settings.tsx    entreprises, langue, données
  business/[id].tsx      une entreprise : identité, numérotation, modèle de facture
  invoice/[id].tsx       détail, édition, PDF
  clients.tsx            clients, registre, prix par client
  rates.tsx              grille tarifaire, import PDF
  import.tsx             import facture.net / CSV
src/lib/                 logique métier pure, testée
  pricing.ts             moteur de prix
  clients.ts             résolution du client (exact, alias, approximatif)
  invoice.ts             totaux, brouillons, numérotation
  pdf.ts                 les trois modèles de facture
  importer.ts            lecture des exports CSV
  registry.ts            registre des entreprises, n° de TVA
  i18n.ts                textes en français
  state.ts               état de l'app (reducer)
  api.ts                 appels aux Edge Functions
supabase/
  functions/capture/     Edge Function : audio/texte → transcription → extraction Claude
  functions/import-rates/ Edge Function : grille PDF → prestations (Claude)
  migrations/            schéma Postgres (workspaces, clients, grille, missions, factures, RLS)
```

Les clés API (Anthropic, Deepgram) ne vont **jamais** dans l'app : elles restent côté serveur dans les secrets Supabase.

## Démarrer

Prérequis : Node 20+, l'app **Expo Go** sur ton téléphone.

```bash
npm install
cp .env.example .env          # puis remplis les valeurs (voir ci-dessous)
npm start                     # scanne le QR code avec Expo Go
```

Pour essayer sans aucune clé : `npm run web:demo` (IA simulée par mots-clés, données démo, texte seulement ; l'import facture.net marche avec des fichiers d'exemple).

Sans backend configuré, l'app s'ouvre quand même (réglages, clients, grille, factures) mais la capture affiche un message d'erreur.

### Comptes et clés à créer

| Service | Pour quoi | Où |
|---|---|---|
| Supabase | Edge Function (et bientôt base de données + auth) | supabase.com → New project |
| Anthropic | Extraction des missions (Claude) | console.anthropic.com → API Keys |
| Deepgram | Transcription des vocaux | console.deepgram.com → API Keys |

Crée les comptes au nom de la société si possible (utile pour une revente). Ne colle jamais ces clés dans un chat : elles vont seulement dans les secrets Supabase.

### Déployer le backend

```bash
npx supabase login
npx supabase link --project-ref <ton-project-ref>
npx supabase db push                                   # crée les tables
cp supabase/functions/.env.example supabase/functions/.env   # puis mets tes clés
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy capture
npx supabase functions deploy import-rates
```

Puis dans `.env` : `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).

## Commandes

```bash
npm test             # tests unitaires (prix, clients, factures, import, registre, flux de capture)
npm run typecheck    # TypeScript
npm run web          # version web
```

## Prochaines étapes

1. Auth Supabase + synchro des données (le schéma et les règles RLS sont prêts).
2. Envoi des factures par email et lien de paiement Stripe (Stripe Connect + Invoicing).
3. Relances automatiques, cycles de facturation (1er / 15).
4. Telegram puis WhatsApp comme canaux de capture.
