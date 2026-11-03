/** Example exports with the same columns as facture.net's (made-up data), used by the demo. */
export const SAMPLE_FILES = [
  {
    name: 'sociétés.csv',
    text: `Nom;Numéro d'entreprise;Code d'activité;Numéro de TVA;Adresse;Complément d'adresse;Code postal;Ville;Pays;Numéro(s) de téléphone;Email;Mots clés;Site internet;Notes;Langue
BOULANGERIE MARIUS;404 833 048 00012;"";FR83404833048;4 place aux Huiles;"";13001;Marseille;France;"";"";"";"";"";Français
ATELIER NORD;"";"";"";22 rue Nationale;"";59000;Lille;France;"";"";"";"";"";Français
`,
  },
  {
    name: 'clients.csv',
    text: `Prénom;Nom de famille;Société;Fonction;Adresse email;Adresse;Complément d'adresse;Code postal;Ville;Pays;Numéro(s) de téléphone;Mots clés;Date de création;Date de dernière facture;Notes;Langue
Marius;Bonnet;BOULANGERIE MARIUS;Gérant;contact@marius.example;"";"";13001;Marseille;France;"";"";02/09/2026;;"";Français
Inès;Leroy;ATELIER NORD;"";ines@ateliernord.example;"";"";59000;Lille;France;"";"";02/09/2026;;"";Français
Hugo;Petit;;"";hugo@example.com;"";"";75011;Paris;France;"";"";02/09/2026;;"";Français
`,
  },
  {
    name: 'factures-et-avoirs.csv',
    text: `Nature;Numéro;Client;Société;Montant HT;Montant TVA;Débours;Montant TTC;Devise;Date;Encaissé le;Conditions de règlement;Mode de règlement;Intérêts de retard;Statut;Mots clés
Facture;F2600043;Inès Leroy;ATELIER NORD;450,0;0,0;0,0;450,0;€;10/10/2026;;30 jours;Virement bancaire;;Finalisé;""
Facture;F2600042;Inès Leroy;ATELIER NORD;1200,0;0,0;0,0;1200,0;€;19/09/2026;;30 jours;Virement bancaire;;Finalisé;""
Facture;F2600041;Inès Leroy;ATELIER NORD;1200,0;0,0;0,0;1200,0;€;19/09/2026;;30 jours;Virement bancaire;;Rectifié;""
Facture;F2600040;Marius Bonnet;BOULANGERIE MARIUS;650,0;0,0;0,0;650,0;€;02/09/2026;;30 jours;Virement bancaire;;Finalisé;""
Facture;Provisoire;Hugo Petit;;180,0;0,0;0,0;180,0;€;;;30 jours;Virement bancaire;;Provisoire;""
Total Euro;;;;2480,0;0,0;0,0;2480,0;€;;;;;;;
`,
  },
];
