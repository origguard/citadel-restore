#!/usr/bin/env node
// guard_served.mjs — compare les octets SERVIS en production au registre gelé.
//
// Pourquoi ce garde existe
// -----------------------
// Les autres gardes de ce dépôt comparent l'arbre de travail à l'historique Git.
// C'est correct, et insuffisant : le dépôt n'est pas ce qu'un client télécharge.
// Entre le commit et le visiteur il y a un déploiement, et rien ne le mesurait.
//
// La référence de ce garde est le serveur de production. Un commit ne peut pas
// l'éditer. C'est la propriété qui donne au résultat sa valeur — et c'est aussi
// pourquoi ce garde refuse une base locale sans aveu explicite (voir --self-test) :
// pointer le garde vers un serveur que l'on contrôle réintroduit exactement
// l'auto-référence qu'il est censé éliminer.
//
// Codes de sortie
//   0  toutes les entrées du registre sont servies avec les octets déclarés
//   1  au moins une divergence, une absence, ou une redirection hors domaine
//   2  erreur d'usage, registre illisible, OU serveur injoignable
//
// Le code 2 sur serveur injoignable est délibéré. Un garde qui ne peut pas
// mesurer ne doit jamais sortir vert : un inconnu reste un inconnu.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE_DEFAUT = "https://citadelhub.cloud";
const CANONIQUE_SERVIE = "restore.html";

const empreinte = (buf) => createHash("sha256").update(buf).digest("hex");
const court = (h) => `${h.slice(0, 8)}…${h.slice(-4)}`;

function usage(message) {
  process.stderr.write(
    `${message}\n\n` +
      `Usage : node guard_served.mjs [options]\n` +
      `  --base <url>        racine servie (défaut : ${BASE_DEFAUT})\n` +
      `  --registry <chemin> registre gelé (défaut : FROZEN_RELEASES.json)\n` +
      `  --timeout <ms>      délai par requête (défaut : 20000)\n` +
      `  --json              sortie machine\n` +
      `  --self-test         autorise une base non-https ou locale.\n` +
      `                      Le résultat n'est alors PAS une mesure de production.\n`
  );
  process.exit(2);
}

function arguments_() {
  const a = process.argv.slice(2);
  const o = {
    base: BASE_DEFAUT,
    registry: "FROZEN_RELEASES.json",
    timeout: 20000,
    json: false,
    selfTest: false,
  };
  for (let i = 0; i < a.length; i++) {
    switch (a[i]) {
      case "--base": o.base = a[++i]; break;
      case "--registry": o.registry = a[++i]; break;
      case "--timeout": o.timeout = Number(a[++i]); break;
      case "--json": o.json = true; break;
      case "--self-test": o.selfTest = true; break;
      default: usage(`Option inconnue : ${a[i]}`);
    }
  }
  if (!o.base) usage("--base vide.");
  if (!Number.isFinite(o.timeout) || o.timeout <= 0) usage("--timeout invalide.");
  return o;
}

// Une base locale ou en clair ferait de ce garde un miroir de la machine qui le
// lance. Refusé par défaut, et l'aveu est bruyant.
function validerBase(brut, selfTest) {
  let u;
  try {
    u = new URL(brut);
  } catch {
    usage(`--base n'est pas une URL : ${brut}`);
  }
  const hote = u.hostname.toLowerCase();
  const locale =
    hote === "localhost" ||
    hote === "127.0.0.1" ||
    hote === "::1" ||
    hote === "[::1]" ||
    hote.endsWith(".local") ||
    hote.endsWith(".localhost");
  const enClair = u.protocol !== "https:";

  if ((locale || enClair) && !selfTest) {
    process.stderr.write(
      `REFUS — base locale ou non chiffrée : ${brut}\n` +
        `Ce garde tire sa valeur de ce que sa référence est hors de portée du commit.\n` +
        `Une base locale la remet à portée. Relancez avec --self-test si vous\n` +
        `voulez seulement éprouver le mécanisme, en sachant que le résultat ne\n` +
        `mesurera alors rien de la production.\n`
    );
    process.exit(2);
  }
  return { url: u, degrade: locale || enClair };
}

function lireRegistre(chemin) {
  let brut;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch (e) {
    process.stderr.write(`Registre illisible (${chemin}) : ${e.message}\n`);
    process.exit(2);
  }
  let reg;
  try {
    reg = JSON.parse(brut);
  } catch (e) {
    process.stderr.write(`Registre non analysable (${chemin}) : ${e.message}\n`);
    process.exit(2);
  }
  if (!Array.isArray(reg.releases) || reg.releases.length === 0) {
    process.stderr.write(`Registre sans tableau "releases" exploitable.\n`);
    process.exit(2);
  }
  for (const r of reg.releases) {
    if (!r.version || !r.filename || typeof r.size !== "number" || !r.sha256) {
      process.stderr.write(
        `Entrée de registre incomplète : ${JSON.stringify(r)}\n` +
          `version, filename, size et sha256 sont requis.\n`
      );
      process.exit(2);
    }
  }
  return reg;
}

async function recuperer(base, chemin, timeout) {
  const cible = new URL(chemin.replace(/^\/+/, ""), `${base.href.replace(/\/*$/, "")}/`);
  let res;
  try {
    res = await fetch(cible, {
      redirect: "follow",
      cache: "no-store",
      headers: { "cache-control": "no-cache", "user-agent": "guard_served.mjs" },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    return { cible: cible.href, injoignable: e.message || String(e) };
  }
  const octets = Buffer.from(await res.arrayBuffer());
  const finale = new URL(res.url || cible.href);
  return {
    cible: cible.href,
    finale: finale.href,
    horsDomaine: finale.hostname.toLowerCase() !== base.hostname.toLowerCase(),
    statut: res.status,
    size: octets.length,
    sha256: empreinte(octets),
  };
}

function juger(attendu, servi) {
  if (servi.injoignable) return { verdict: "INJOIGNABLE", motif: servi.injoignable };
  if (servi.statut === 404) return { verdict: "ABSENT", motif: "HTTP 404" };
  if (servi.statut >= 400) return { verdict: "INJOIGNABLE", motif: `HTTP ${servi.statut}` };
  if (servi.horsDomaine)
    return { verdict: "HORS DOMAINE", motif: `redirigé vers ${servi.finale}` };
  if (servi.sha256 !== attendu.sha256)
    return {
      verdict: "DIVERGENT",
      motif: `empreinte servie ${court(servi.sha256)} ≠ registre ${court(attendu.sha256)}`,
    };
  if (servi.size !== attendu.size)
    return {
      verdict: "DIVERGENT",
      motif: `taille servie ${servi.size} o ≠ registre ${attendu.size} o`,
    };
  return { verdict: "CONFORME", motif: "" };
}

const main = async () => {
  const opt = arguments_();
  const { url: base, degrade } = validerBase(opt.base, opt.selfTest);
  const reg = lireRegistre(opt.registry);

  const lignes = [];
  let injoignables = 0;
  let fautes = 0;

  for (const r of reg.releases) {
    const servi = await recuperer(base, r.filename, opt.timeout);
    const j = juger(r, servi);
    if (j.verdict === "INJOIGNABLE") injoignables++;
    else if (j.verdict !== "CONFORME") fautes++;
    lignes.push({ sujet: r.version, chemin: r.filename, attendu: r, servi, ...j });
  }

  // La racine servie doit porter les octets de la version canonique déclarée.
  const canon = reg.releases.find((r) => r.version === reg.canonical_latest);
  if (!canon) {
    process.stderr.write(
      `canonical_latest = ${JSON.stringify(reg.canonical_latest)} n'a pas d'entrée dans releases.\n`
    );
    process.exit(2);
  }
  const servieRacine = await recuperer(base, CANONIQUE_SERVIE, opt.timeout);
  const jRacine = juger(canon, servieRacine);
  if (jRacine.verdict === "INJOIGNABLE") injoignables++;
  else if (jRacine.verdict !== "CONFORME") fautes++;
  lignes.push({
    sujet: `${CANONIQUE_SERVIE} → ${canon.version}`,
    chemin: CANONIQUE_SERVIE,
    attendu: canon,
    servi: servieRacine,
    ...jRacine,
  });

  const code = injoignables > 0 ? 2 : fautes > 0 ? 1 : 0;

  if (opt.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          base: base.href,
          registry: opt.registry,
          mesure_de_production: !degrade,
          horodatage_requete: new Date().toISOString(),
          examine: lignes.length,
          conformes: lignes.filter((l) => l.verdict === "CONFORME").length,
          fautes,
          injoignables,
          code,
          lignes: lignes.map((l) => ({
            sujet: l.sujet,
            url: l.servi.cible,
            verdict: l.verdict,
            motif: l.motif,
            attendu: { size: l.attendu.size, sha256: l.attendu.sha256 },
            servi: l.servi.injoignable
              ? null
              : { size: l.servi.size, sha256: l.servi.sha256, statut: l.servi.statut },
          })),
        },
        null,
        2
      )}\n`
    );
    process.exitCode = code;
    return;
  }

  const out = (s) => process.stdout.write(`${s}\n`);
  out("");
  out(`Garde des octets servis — référence : le serveur de production`);
  out(`Base       : ${base.href}`);
  out(`Registre   : ${opt.registry} (politique ${reg.policy ?? "non déclarée"})`);
  out(`Requête du : ${new Date().toISOString()}`);
  if (degrade)
    out(`\n!! BASE LOCALE OU EN CLAIR (--self-test) : ceci n'est pas une mesure de production.`);
  out("");

  for (const l of lignes) {
    const marque =
      l.verdict === "CONFORME" ? "ok  " : l.verdict === "INJOIGNABLE" ? "?   " : "FAUTE";
    out(`[${marque}] ${l.verdict.padEnd(13)} ${l.sujet}`);
    out(`         ${l.servi.cible}`);
    if (l.verdict === "CONFORME") {
      out(`         ${l.servi.size} o · ${court(l.servi.sha256)}`);
    } else {
      out(`         ${l.motif}`);
      if (!l.servi.injoignable && l.servi.statut < 400)
        out(`         servi ${l.servi.size} o · attendu ${l.attendu.size} o`);
    }
    out("");
  }

  out(`Examiné : ${lignes.length} · conformes : ${lignes.filter((l) => l.verdict === "CONFORME").length} · fautes : ${fautes} · injoignables : ${injoignables}`);
  out("");
  out(`Ce que ce résultat établit`);
  out(`  Les octets servis aux ${lignes.length} URL ci-dessus, à l'instant de la requête,`);
  out(`  vus depuis cette machine, et pour les seules entrées nommées dans`);
  out(`  ${opt.registry}.`);
  out("");
  out(`Ce qu'il n'établit pas`);
  out(`  — que le serveur servira les mêmes octets dans une heure ;`);
  out(`  — qu'un autre visiteur reçoit les mêmes octets (CDN, cache, géo-routage) ;`);
  out(`  — que le registre lui-même est juste : il dit la concordance, pas la vérité`);
  out(`    des valeurs gelées — pour celle-là, le garde d'immuabilité lit l'historique ;`);
  out(`  — qu'aucune AUTRE URL du site ne sert une copie fausse : ce garde ne découvre`);
  out(`    rien, il ne vérifie que les chemins déclarés dans le registre ;`);
  out(`  — que les fichiers servis sont corrects, seulement qu'ils sont ceux déclarés.`);
  out("");
  out(`Code de sortie : ${code}`);
  if (code === 2 && injoignables > 0)
    out(`  2 par injoignabilité : rien n'a été mesuré. Ce n'est pas un succès.`);
  out("");

  process.exitCode = code;
  return;
};

main().catch((e) => {
  process.stderr.write(`Échec inattendu du garde : ${e?.stack || e}\n`);
  process.exit(2);
});
