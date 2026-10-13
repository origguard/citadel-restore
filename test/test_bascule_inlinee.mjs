#!/usr/bin/env node
// test_bascule_inlinee.mjs — la bascule RÉELLEMENT inlinée dans restore.html
// est-elle la bascule éprouvée ?
//
// Pourquoi ce test existe
// -----------------------
// tools/bascule-empreinte.mjs est un module ES. restore.html est un fichier
// autonome sans import. La logique y est donc TRANSCRITE, et une transcription
// est l'endroit où les défauts entrent. Le vert de test_bascule_empreinte.mjs
// porte sur le module, pas sur les octets qui seront gelés.
//
// Ce test extrait le bloc inliné de restore.html, l'exécute sur les mêmes cas
// que le module, et refuse tout désaccord. Le module éprouvé devient ainsi la
// référence du fichier livré.
//
// Codes : 0 concordance · 1 désaccord ou sentinelles absentes

import { readFileSync } from "node:fs";
import { etatBascule as attendu } from "../tools/bascule-empreinte.mjs";

const CIBLE = process.argv[2] || "restore.html";
const DEBUT = "/* --- BASCULE-EMPREINTE:DEBUT --- */";
const FIN = "/* --- BASCULE-EMPREINTE:FIN --- */";

const CAS = [
  { protocol: "https:", pathname: "/restore/v1.4.0.html", versionDeclaree: "1.4.0" },
  { protocol: "https:", pathname: "/restore/v1.4.0.html", versionDeclaree: "1.5.0" },
  { protocol: "https:", pathname: "/restore/v1.4.0.html", versionDeclaree: "" },
  { protocol: "https:", pathname: "/restore.html", versionDeclaree: "1.5.0" },
  { protocol: "file:", pathname: "/home/u/restore/v1.4.0.html", versionDeclaree: "1.4.0" },
  { protocol: "file:", pathname: "/home/u/restore.html", versionDeclaree: "1.4.0" },
  { protocol: "HTTPS:", pathname: "/RESTORE/V1.4.0.HTML", versionDeclaree: "1.4.0" },
  { protocol: "https:", pathname: "/outils/restore/v1.4.0.html", versionDeclaree: "1.4.0" },
  { protocol: "https:", pathname: "/restore/v10.2.33.html", versionDeclaree: "10.2.33" },
  { protocol: "https:", pathname: "/restore/v1.4.0.html", versionDeclaree: "v1.4.0" },
  { protocol: "https:", pathname: "/restore/v1.4.0.html.bak", versionDeclaree: "1.4.0" },
];

const echec = (m) => { process.stderr.write(`\n  ÉCHEC — ${m}\n\n`); process.exitCode = 1; };

let html;
try { html = readFileSync(CIBLE, "utf8"); }
catch (e) { echec(`${CIBLE} illisible : ${e.message}`); process.exit(1); }

const i = html.indexOf(DEBUT), j = html.indexOf(FIN);
if (i < 0 || j < 0 || j <= i) {
  // L'absence de sentinelles ne doit JAMAIS se lire comme un succès.
  echec(`sentinelles introuvables dans ${CIBLE}. Encadrez le bloc inliné par\n          ${DEBUT}\n          ${FIN}`);
  process.exit(1);
}
const bloc = html.slice(i + DEBUT.length, j);

let inlinee;
try {
  inlinee = new Function(`"use strict";${bloc};return typeof etatBascule==="function"?etatBascule:null;`)();
} catch (e) { echec(`le bloc inliné ne s'évalue pas : ${e.message}`); process.exit(1); }
if (!inlinee) { echec("le bloc inliné ne définit pas etatBascule"); process.exit(1); }

let ko = 0;
process.stdout.write(`\n  bascule inlinée dans ${CIBLE} vs module éprouvé\n\n`);
for (const c of CAS) {
  let r;
  try { r = inlinee(c); } catch (e) { r = `LEVE: ${e.message}`; }
  const a = attendu(c);
  const ok = r === a;
  if (!ok) ko++;
  process.stdout.write(
    `  ${ok ? " ok  " : "ÉCART"}  ${c.protocol} ${c.pathname} (déclare ${c.versionDeclaree || "—"})\n` +
    (ok ? "" : `          inliné: ${r}   module: ${a}\n`)
  );
}
process.stdout.write(`\n  ${CAS.length - ko}/${CAS.length} concordances\n`);
if (ko) echec(`${ko} désaccord(s) : la transcription dans ${CIBLE} n'est pas la logique éprouvée`);
else process.stdout.write(`\n  Frontière : établit que les deux implémentations s'accordent sur ces ${CAS.length} cas.\n  N'établit pas que le bloc est effectivement appelé par la page.\n\n`);
