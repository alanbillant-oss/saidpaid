# Saidpaid

> Send a voice note. Get paid.

Application mobile (Expo / React Native, iOS + Android + web) pour freelances : on dicte ses missions au fil de l'eau, l'IA les comprend, l'app les chiffre avec **ta** grille tarifaire, prépare les factures et génère le PDF.

## Ce que fait la v0

- **Capture** : écran façon messagerie. On tape ou on enregistre un vocal (« Chez Paul, une affiche pour le menu d'été et une petite modif sur la carte des vins »).
- **Transcription** (Deepgram nova-3, multilingue) puis **extraction** par Claude en JSON strict : client, missions, quantités, options, date.
- **Prix déterministes** (`src/lib/pricing.ts`) : le prix vient toujours de ce que tu as dit ou de ta grille, jamais de l'IA. Gère prix fixe, prix par unité avec minimum, tranches de durée, « sur devis », options en montant fixe ou en %, prix spécifiques par client.
- **Clarifications** : client inconnu → « Créer / choisir un client » ; prix manquant ou sur devis → l'app te demande le prix.
- **Factures** : brouillons par client, remise de volume par cycle, édition des lignes, numérotation séquentielle attribuée à l'émission (pas de trou), PDF partageable, suivi envoyé / payé / en retard.
- **Données démo** : Réglages → « Load demo data (317 LAB) » charge une grille inspirée de tes vraies grilles.

Interface en anglais (marché UK d'abord, cf. BRIEF). Les données sont stockées **sur le téléphone** pour l'instant ; le schéma Supabase est prêt pour la synchro.

## Architecture

```
src/app/                 écrans (Expo Router)
  (tabs)/index.tsx       capture (chat + micro)
  (tabs)/invoices.tsx    tableau de bord + factures
  (tabs)/settings.tsx    identité de facturation
  invoice/[id].tsx       détail, édition, PDF
  clients.tsx, rates.tsx clients et grille tarifaire
src/lib/                 logique métier pure, testée
  pricing.ts             moteur de prix
  clients.ts             résolution du client (exact, alias, approximatif)
  invoice.ts             totaux, brouillons, numérotation
  state.ts               état de l'app (reducer)
  api.ts                 appel à l'Edge Function
supabase/
  functions/capture/     Edge Function : audio/texte → transcription → extraction Claude
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

Pour essayer sans aucune clé : `npm run web:demo` (IA simulée par mots-clés, données démo 317 LAB, texte seulement).

Sans backend configuré, l'app s'ouvre quand même (réglages, clients, grille, factures) mais la capture affiche un message d'erreur.

### Comptes et clés à créer

| Service | Pour quoi | Où |
|---|---|---|
| Supabase | Edge Function (et bientôt base de données + auth) | supabase.com → New project |
| Anthropic | Extraction des missions (Claude) | console.anthropic.com → API Keys |
| Deepgram | Transcription des vocaux | console.deepgram.com → API Keys |

Crée les comptes au nom de la société si possible (utile pour une revente).

### Déployer le backend

```bash
npx supabase login
npx supabase link --project-ref <ton-project-ref>
npx supabase db push                                   # crée les tables
cp supabase/functions/.env.example supabase/functions/.env   # puis mets tes clés
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy capture
```

Puis dans `.env` : `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).

## Commandes

```bash
npm test             # tests unitaires (prix, clients, factures, flux de capture)
npm run typecheck    # TypeScript
npm run web          # version web
```

## Prochaines étapes

1. Auth Supabase + synchro des données (le schéma et les règles RLS sont prêts).
2. Envoi des factures par email et lien de paiement Stripe (Stripe Connect + Invoicing).
3. Relances automatiques, cycles de facturation (1er / 15).
4. Telegram puis WhatsApp comme canaux de capture.
