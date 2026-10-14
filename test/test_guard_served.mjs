#!/usr/bin/env node
// test_guard_served.mjs — éprouve guard_served.mjs contre un serveur de prise.
//
// Chaque cas nomme la faute qu'il empêche. Le cas 5 est le plus important :
// un garde qui ne peut pas mesurer ne doit jamais sortir vert.
//
// Ce que ces tests établissent : le MÉCANISME du garde, sur un serveur local
// contrôlé. Ils n'établissent rien sur citadelhub.cloud.

import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GARDE = join(dirname(fileURLToPath(import.meta.url)), "..", "guard_served.mjs");
const sha = (b) => createHash("sha256").update(b).digest("hex");

const V100 = Buffer.from("<!doctype html><!-- v1.0.0 -->\n");
const V130 = Buffer.from("<!doctype html><!-- v1.3.0 scelle -->\n");
const V140 = Buffer.from("<!doctype html><!-- v1.4.0 canonique -->\n");
const IMPOSTEUR = Buffer.from("<!doctype html><!-- autres octets, meme nom -->\n");

const REGISTRE = {
  policy: "STRICT_IMMUTABILITY",
  canonical_latest: "v1.4.0",
  releases: [
    { version: "v1.0.0", filename: "restore/v1.0.0.html", size: V100.length, sha256: sha(V100) },
    { version: "v1.3.0", filename: "restore/v1.3.0.html", size: V130.length, sha256: sha(V130) },
    { version: "v1.4.0", filename: "restore/v1.4.0.html", size: V140.length, sha256: sha(V140) },
  ],
};

const dir = mkdtempSync(join(tmpdir(), "guard-served-"));
const registre = join(dir, "FROZEN_RELEASES.json");
writeFileSync(registre, JSON.stringify(REGISTRE, null, 2));

function servir(routes) {
  return new Promise((res) => {
    const s = createServer((req, rep) => {
      const r = routes[req.url.split("?")[0]];
      if (!r) return rep.writeHead(404, { "content-type": "text/html" }).end("nope");
      if (r.redirige) return rep.writeHead(302, { location: r.redirige }).end();
      // Un intermédiaire réel (CDN, cache de l'hébergeur) réécrit le HTML pour
      // les requêtes qui ressemblent à une navigation, et pas pour les autres.
      if (routes.__injecte && String(req.headers.accept || "").includes("text/html")) {
        return rep.writeHead(200, { "content-type": "text/html" }).end(
          Buffer.concat([r, Buffer.from(routes.__injecte)])
        );
      }
      rep.writeHead(200, { "content-type": "text/html" }).end(r);
    });
    s.listen(0, "127.0.0.1", () => res({ s, port: s.address().port }));
  });
}

const execFileP = promisify(execFile);

// execFile ASYNCHRONE, impérativement : le serveur de prise tourne dans CE
// processus, et un execFileSync gèlerait la boucle d'événements qui doit lui
// répondre. Le garde enfant attendrait alors jusqu'au délai, et chaque cas
// nécessitant une réponse sortirait faussement en INJOIGNABLE.
async function lancer(base, extra = []) {
  const argv = [GARDE, "--base", base, "--registry", registre, "--timeout", "4000", ...extra];
  try {
    const { stdout } = await execFileP(process.execPath, argv, { encoding: "utf8" });
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.code ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const RESULTATS = [];
async function cas(nom, empeche, fn) {
  let ok = false;
  let detail = "";
  try {
    const r = await fn();
    ok = r === true;
    if (!ok) detail = String(r);
  } catch (e) {
    detail = e?.message ?? String(e);
  }
  RESULTATS.push({ nom, empeche, ok, detail });
}

const attendre = (r, code, mot) => {
  if (r.code !== code) return `code ${r.code}, attendu ${code}\n${r.out}`;
  if (mot && !r.out.includes(mot)) return `sortie sans « ${mot} »\n${r.out}`;
  return true;
};

const complet = {
  "/restore/v1.0.0.html": V100,
  "/restore/v1.3.0.html": V130,
  "/restore/v1.4.0.html": V140,
  "/restore.html": V140,
};

// ---------------------------------------------------------------- 1
{
  const { s, port } = await servir(complet);
  await cas(
    "1. site conforme au registre",
    "un garde qui refuse un déploiement correct",
    async () => attendre(await lancer(`http://127.0.0.1:${port}`, ["--self-test"]), 0, "CONFORME")
  );
  s.close();
}

// ---------------------------------------------------------------- 2
{
  const { s, port } = await servir({ ...complet, "/restore/v1.3.0.html": IMPOSTEUR });
  await cas(
    "2. autres octets servis sous un nom gelé",
    "LE DÉFAUT EN LIGNE AUJOURD'HUI : v1.3.0 servi avec des octets qui ne sont pas les siens",
    async () => attendre(await lancer(`http://127.0.0.1:${port}`, ["--self-test"]), 1, "DIVERGENT")
  );
  s.close();
}

// ---------------------------------------------------------------- 3
{
  const sans = { ...complet };
  delete sans["/restore/v1.4.0.html"];
  const { s, port } = await servir(sans);
  await cas(
    "3. version du registre non servie",
    "une archive annoncée dans le registre et absente du site (v1.4.0 en ligne aujourd'hui)",
    async () => attendre(await lancer(`http://127.0.0.1:${port}`, ["--self-test"]), 1, "ABSENT")
  );
  s.close();
}

// ---------------------------------------------------------------- 4
{
  const { s, port } = await servir({ ...complet, "/restore.html": V130 });
  await cas(
    "4. racine servie ≠ version canonique",
    "restore.html servant une version périmée alors que le registre en déclare une autre",
    async () => attendre(await lancer(`http://127.0.0.1:${port}`, ["--self-test"]), 1, "restore.html")
  );
  s.close();
}

// ---------------------------------------------------------------- 5
{
  const { s, port } = await servir(complet);
  await new Promise((r) => s.close(r));
  await cas(
    "5. serveur injoignable → code 2, jamais 0",
    "LA FAUTE LA PLUS COÛTEUSE : un garde incapable de mesurer qui sort vert",
    async () => attendre(await lancer(`http://127.0.0.1:${port}`, ["--self-test"]), 2, "INJOIGNABLE")
  );
}

// ---------------------------------------------------------------- 6
{
  const { s, port } = await servir(complet);
  await cas(
    "6. base locale refusée sans aveu",
    "pointer le garde vers un serveur qu'on contrôle, ce qui rétablit l'auto-référence",
    async () => attendre(await lancer(`http://127.0.0.1:${port}`), 2, "REFUS")
  );
  s.close();
}

// ---------------------------------------------------------------- 7
{
  const { s: s2, port: p2 } = await servir(complet);
  const { s: s1, port: p1 } = await servir({
    ...complet,
    "/restore/v1.3.0.html": { redirige: `http://localhost:${p2}/restore/v1.3.0.html` },
  });
  await cas(
    "7. redirection hors domaine",
    "une archive dont l'URL publique renvoie discrètement vers un autre hôte",
    async () => attendre(await lancer(`http://127.0.0.1:${p1}`, ["--self-test"]), 1, "HORS DOMAINE")
  );
  s1.close();
  s2.close();
}

// ---------------------------------------------------------------- 9
{
  const BEACON =
    '<script type="module" src="https://static.exemple-cdn.invalid/beacon.min.js" data-beacon=\'{"token":"abc"}\'></script>';
  const { s, port } = await servir({ ...complet, __injecte: BEACON });
  await cas(
    "9. le serveur n'injecte un script QUE pour les requêtes HTML",
    "LE FAUX VERT : une origine conforme pendant qu'un navigateur reçoit autre chose",
    async () => {
      const r = await lancer(`http://127.0.0.1:${port}`, ["--self-test"]);
      if (r.code !== 1) return `code ${r.code}, attendu 1\n${r.out}`;
      if (!r.out.includes("LIVRAISON ALTEREE")) return `sortie sans « LIVRAISON ALTEREE »\n${r.out}`;
      if (!r.out.includes("CONFORME")) return `l'origine devait rester CONFORME\n${r.out}`;
      if (!r.out.includes("static.exemple-cdn.invalid"))
        return `l'hôte inséré n'est pas nommé\n${r.out}`;
      return true;
    }
  );
  s.close();
}

// ---------------------------------------------------------------- 8
{
  const mauvais = join(dir, "casse.json");
  writeFileSync(mauvais, JSON.stringify({ releases: [{ version: "v1", filename: "a.html" }] }));
  let r;
  try {
    const { stdout } = await execFileP(
      process.execPath,
      [GARDE, "--base", "https://example.invalid", "--registry", mauvais],
      { encoding: "utf8" }
    );
    r = { code: 0, out: stdout };
  } catch (e) {
    r = { code: e.code ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
  await cas(
    "8. entrée de registre sans size/sha256",
    "un registre incomplet lu comme une concordance",
    () => attendre(r, 2, "incomplète")
  );
}

// ---------------------------------------------------------------- rapport
const large = Math.max(...RESULTATS.map((r) => r.nom.length));
process.stdout.write("\nguard_served.mjs — cas d'épreuve\n\n");
for (const r of RESULTATS) {
  process.stdout.write(`${r.ok ? "  ok  " : " ÉCHEC"} ${r.nom.padEnd(large)}  empêche : ${r.empeche}\n`);
  if (!r.ok) process.stdout.write(`       ${r.detail.split("\n").join("\n       ")}\n`);
}
const reussis = RESULTATS.filter((r) => r.ok).length;
process.stdout.write(`\n${reussis}/${RESULTATS.length} cas passés\n`);
process.stdout.write(
  `\nFrontière : ces cas éprouvent le mécanisme du garde sur un serveur local\n` +
    `contrôlé. Ils n'établissent rien sur l'état de citadelhub.cloud.\n\n`
);
process.exit(reussis === RESULTATS.length ? 0 : 1);
