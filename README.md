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
| Meta (WhatsApp Business) | Canal WhatsApp (optionnel) | developers.facebook.com, voir « WhatsApp » plus bas |

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

## WhatsApp

Tu envoies un vocal (ou un texte) au numéro WhatsApp de Saidpaid, la facture se prépare toute seule.

**Comment ça marche**

1. Dans l'app : Settings → WhatsApp → **Connect WhatsApp**. L'app affiche un code (`SP-K7M3QX`) et ouvre WhatsApp avec le message déjà écrit. Tu l'envoies, le numéro est relié à ton téléphone.
2. Ensuite chaque vocal ou message passe par le même pipeline que l'app : Deepgram (transcription) → Claude (extraction). Saidpaid te répond sur WhatsApp avec un résumé : client, missions, prix si tu les as dits, doutes éventuels.
3. Quand tu ouvres l'app, les missions arrivent dans la capture (marquées « via WhatsApp ») et sont chiffrées avec **ta** grille (`src/lib/pricing.ts`), comme d'habitude. Clients inconnus et prix manquants te sont demandés au même endroit.

Tant que les données restent sur le téléphone, le serveur ne garde que le nécessaire : le lien numéro ↔ téléphone, les noms des clients et des prestations (pas les prix) pour que l'IA comprenne, et les messages en attente d'être récupérés par l'app.

Pièces : `supabase/functions/whatsapp` (webhook Meta, signature HMAC vérifiée), `supabase/functions/whatsapp-link` (liaison et synchro appelées par l'app), `supabase/migrations/20261103000000_whatsapp.sql`, `src/lib/whatsapp.ts`, `src/lib/whatsappSync.tsx`.

**Créer le compte WhatsApp Business (à faire une fois, ~30 min)**

1. **business.facebook.com** : crée un portefeuille Meta Business au nom de la société.
2. **developers.facebook.com** → My Apps → Create app → type **Business** → ajoute le produit **WhatsApp**.
3. WhatsApp → **API Setup** : ajoute un vrai numéro (un numéro qui n'est pas déjà sur l'app WhatsApp, une puce dédiée ou un fixe qui reçoit les SMS/appels). Note le **Phone number ID**.
4. **Token permanent** : Business Settings → Users → **System users** → Add (admin) → Generate token pour ton app avec les permissions `whatsapp_business_messaging` et `whatsapp_business_management`.
5. **App secret** : App settings → Basic → App secret.
6. Mets les secrets côté serveur (jamais dans l'app ni dans le chat) : remplis la partie WhatsApp de `supabase/functions/.env` puis
   ```bash
   npx supabase db push
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy whatsapp --no-verify-jwt
   npx supabase functions deploy whatsapp-link
   ```
7. WhatsApp → **Configuration** → Webhook : Callback URL `https://<ton-project-ref>.supabase.co/functions/v1/whatsapp`, Verify token = ta valeur `WHATSAPP_VERIFY_TOKEN`. Puis **Manage** → abonne-toi au champ `messages`.
8. Passe l'app Meta en mode **Live** (il faudra une URL de politique de confidentialité). En mode test, seuls 5 numéros ajoutés à la main peuvent écrire.

Coût : les réponses de Saidpaid dans les 24 h qui suivent ton message sont gratuites côté Meta. Tu ne paies que Deepgram et Claude par message.

## Prochaines étapes

1. Auth Supabase + synchro des données (le schéma et les règles RLS sont prêts).
2. Envoi des factures par email et lien de paiement Stripe (Stripe Connect + Invoicing).
3. Relances automatiques, cycles de facturation (1er / 15).
4. Telegram comme canal de capture. WhatsApp : afficher les prix calculés dans la réponse une fois la grille synchronisée côté serveur.
