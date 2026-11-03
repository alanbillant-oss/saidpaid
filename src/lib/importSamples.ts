/** Example exports shaped like facture.net's, used by the demo to try the import without real files. */
export const SAMPLE_FILES = [
  {
    name: 'clients.csv',
    text: `Raison sociale;Email;Adresse;Code postal;Ville;SIRET
"Boulangerie Marius";contact@marius.fr;"4 place aux Huiles";13001;Marseille;
"Atelier Nord";hello@ateliernord.fr;"22 rue Nationale";59000;Lille;
"Chez Paul";paul@chezpaul.fr;"12 rue du Port";13002;Marseille;
`,
  },
  {
    name: 'articles.csv',
    text: `Désignation;Prix unitaire HT;Unité
Motion design (30 s);"650,00";
Journée de tournage;"1 200,00";jour
Retouche photo;"45,00";pièce
`,
  },
  {
    name: 'factures.csv',
    text: `Numéro;Date;Client;Total HT;Total TTC;Statut
F2026-0041;02/09/2026;Boulangerie Marius;650,00;650,00;Payée
F2026-0042;19/09/2026;Atelier Nord;1 200,00;1 200,00;Payée
F2026-0043;10/10/2026;Atelier Nord;450,00;450,00;En attente
`,
  },
];
