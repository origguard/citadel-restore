// Bascule d'empreinte du restaurateur CitadelHub — destinée à la v1.5.0.
//
// Elle décide si la page a le droit d'inviter à comparer son empreinte au
// fascicule. Elle n'y invite que là où la concordance peut être établie.
//
// Ordre des tests, et il compte :
//   1. le protocole — hors ligne, aucune empreinte n'est calculée, donc
//      aucune comparaison ne peut être proposée ;
//   2. le nom versionné dans le chemin ;
//   3. la concordance entre la version du NOM et la version que le fichier
//      déclare de lui-même. Un désaccord signifie que l'archive est servie
//      sous un nom qui n'est pas le sien : c'est l'incident v1.3.0, et la
//      page le dit au lieu de l'avaliser.

export const ETATS = {
  COMPARER: "COMPARER",
  ALERTE_NOM: "ALERTE_NOM",
  VERSION_COURANTE: "VERSION_COURANTE",
  LOCAL_SHA256SUM: "LOCAL_SHA256SUM",
};

// Insensible à la casse : certains serveurs le sont, et le nom de fichier
// n'est pas l'endroit où jouer sa crédibilité.
const NOM_VERSIONNE = /\/restore\/v(\d+\.\d+\.\d+)\.html$/i;

export function etatBascule({ protocol, pathname, versionDeclaree }) {
  // 1. Hors ligne : rien n'est calculé, donc rien n'est comparé ici.
  if (!String(protocol).toLowerCase().startsWith("http")) return ETATS.LOCAL_SHA256SUM;

  const m = NOM_VERSIONNE.exec(String(pathname));
  if (!m) return ETATS.VERSION_COURANTE;

  // 3. Le nom dit une version ; le fichier en déclare une. Si elles diffèrent,
  //    ou si le fichier n'en déclare aucune, la concordance n'est pas établie.
  const duNom = m[1];
  const declaree = String(versionDeclaree || "").trim().replace(/^v/i, "");
  if (!declaree || declaree !== duNom) return ETATS.ALERTE_NOM;

  return ETATS.COMPARER;
}

export const TEXTES = {
  COMPARER: (v) =>
    `Archive scellée v${v}. Empreinte de ce fichier — à comparer à celle imprimée sur votre fascicule.`,
  ALERTE_NOM: (vNom, vDecl) =>
    `Avertissement : ce fichier est servi sous le nom v${vNom} mais se déclare ` +
    `${vDecl ? `v${vDecl}` : "sans version"}. Ne comparez pas cette empreinte à votre fascicule. ` +
    `Signalez-le, et récupérez l'archive depuis l'index des versions.`,
  VERSION_COURANTE: () =>
    `Empreinte de la version courante. Votre fascicule nomme une archive versionnée : ` +
    `ouvrez /restore/<version>.html pour comparer.`,
  LOCAL_SHA256SUM: () =>
    `Mode local déconnecté : aucune empreinte n'est calculée ici. Exécutez ` +
    `sha256sum sur le fichier et comparez au couple URL + empreinte imprimé sur votre fascicule.`,
};
