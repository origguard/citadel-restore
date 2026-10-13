import { etatBascule, ETATS, TEXTES } from "../tools/bascule-empreinte.mjs";

const cas = [
  ["servi a l'URL versionnee, version concordante",  {protocol:"https:",pathname:"/restore/v1.4.0.html",versionDeclaree:"1.4.0"}, "COMPARER",
   "le cas normal : la comparaison est proposee"],
  ["servi a l'URL versionnee, version DISCORDANTE",  {protocol:"https:",pathname:"/restore/v1.4.0.html",versionDeclaree:"1.5.0"}, "ALERTE_NOM",
   "L'INCIDENT v1.3.0 : une archive servie sous un nom qui n'est pas le sien"],
  ["servi a l'URL versionnee, sans version declaree",{protocol:"https:",pathname:"/restore/v1.4.0.html",versionDeclaree:""},      "ALERTE_NOM",
   "une concordance affirmee sans rien pour l'etablir"],
  ["servi a la racine",                              {protocol:"https:",pathname:"/restore.html",versionDeclaree:"1.5.0"},        "VERSION_COURANTE",
   "inviter a comparer la racine a un fascicule anterieur"],
  ["file:// dans un dossier restore/ versionne",     {protocol:"file:",pathname:"/home/u/restore/v1.4.0.html",versionDeclaree:"1.4.0"}, "LOCAL_SHA256SUM",
   "LE CAS DE L'UTILISATEUR DILIGENT : comparer une empreinte jamais calculee"],
  ["file:// a plat",                                 {protocol:"file:",pathname:"/home/u/restore.html",versionDeclaree:"1.4.0"},   "LOCAL_SHA256SUM",
   "idem, chemin a plat"],
  ["casse haute",                                    {protocol:"HTTPS:",pathname:"/RESTORE/V1.4.0.HTML",versionDeclaree:"1.4.0"},  "COMPARER",
   "un serveur insensible a la casse qui ferait echouer la detection"],
  ["site dans un sous-repertoire",                   {protocol:"https:",pathname:"/outils/restore/v1.4.0.html",versionDeclaree:"1.4.0"}, "COMPARER",
   "un deploiement hors racine de domaine"],
  ["version a plusieurs chiffres",                   {protocol:"https:",pathname:"/restore/v10.2.33.html",versionDeclaree:"10.2.33"}, "COMPARER",
   "une borne a un seul chiffre par segment"],
  ["prefixe v dans la version declaree",             {protocol:"https:",pathname:"/restore/v1.4.0.html",versionDeclaree:"v1.4.0"}, "COMPARER",
   "une fausse alerte sur un simple prefixe"],
  ["nom versionne trompeur",                         {protocol:"https:",pathname:"/restore/v1.4.0.html.bak",versionDeclaree:"1.4.0"}, "VERSION_COURANTE",
   "traiter un fichier annexe comme une archive scellee"],
];

let ko = 0;
console.log("\nBascule corrigee — chaque cas nomme la faute qu'il empeche :\n");
for (const [nom, e, attendu, empeche] of cas) {
  const r = etatBascule(e);
  const ok = r === attendu;
  if (!ok) ko++;
  console.log(`  ${ok?" ok  ":"ECHEC"}  ${nom.padEnd(44)} ${r.padEnd(17)} empeche : ${empeche}`);
}
console.log(`\n  ${cas.length-ko}/${cas.length} cas passes`);
console.log("\nTextes rendus :\n");
console.log("  COMPARER         ", TEXTES.COMPARER("1.4.0"));
console.log("  ALERTE_NOM       ", TEXTES.ALERTE_NOM("1.4.0","1.5.0"));
console.log("  VERSION_COURANTE ", TEXTES.VERSION_COURANTE());
console.log("  LOCAL_SHA256SUM  ", TEXTES.LOCAL_SHA256SUM());
console.log();
process.exitCode = ko ? 1 : 0;
