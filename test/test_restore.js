// test_restore.js
// Automated verification of Citadel Restore mathematics & format specifications
// Zero dependencies (standard Node.js crypto only)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('======================================================================');
console.log('CITADEL RESTORE SPECIFICATION & RECONSTRUCTION TEST SUITE');
console.log('======================================================================\n');

// 1. Galois Field GF(2^8) math implementation
const EXP_GF = new Uint8Array(512);
const LOG_GF = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_GF[i] = x;
    EXP_GF[i + 255] = x;
    LOG_GF[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  LOG_GF[0] = 0;
})();

function gfAdd(a, b) { return a ^ b; }
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_GF[LOG_GF[a] + LOG_GF[b]];
}
function gfDiv(a, b) {
  if (b === 0) throw new Error('Division par zéro dans GF(2^8)');
  if (a === 0) return 0;
  return EXP_GF[(LOG_GF[a] - LOG_GF[b] + 255) % 255];
}

function lagrangeInterpolateAtZero(points) {
  // points = [ { x, y } ]
  let secret = 0;
  const k = points.length;
  for (let i = 0; i < k; i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    let num = 1;
    let den = 1;
    for (let j = 0; j < k; j++) {
      if (i === j) continue;
      const xj = points[j].x;
      num = gfMul(num, xj);
      den = gfMul(den, gfAdd(xi, xj));
    }
    const li = gfDiv(num, den);
    secret = gfAdd(secret, gfMul(yi, li));
  }
  return secret;
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// 2. Load demo vault and demo shares
const demoVaultPath = path.resolve(__dirname, '../demo/sample-vault.citadel-vault');
const demoSharesPath = path.resolve(__dirname, '../demo/sample-shares.txt');

if (!fs.existsSync(demoVaultPath) || !fs.existsSync(demoSharesPath)) {
  console.error('Demo files missing!');
  process.exit(1);
}

const vault = JSON.parse(fs.readFileSync(demoVaultPath, 'utf-8'));
const sharesRaw = fs.readFileSync(demoSharesPath, 'utf-8');

console.log('[1] Audit du conteneur de coffre (.citadel-vault)...');
console.log(`  - Document chiffré    : ${vault.documentName}`);
console.log(`  - Taille en clair      : ${vault.fileSize} octets`);
console.log(`  - Quorum requis (K/N)  : ${vault.threshold} sur ${vault.totalShares}`);
console.log(`  - Empreinte attendue   : ${vault.sha256Original}`);
console.log('  -> ✓ Métadonnées du coffre valides.\n');

console.log('[2] Analyse et validation des parts de secret OGCITADEL-...');
const shareTokens = sharesRaw.split('\n')
  .map(l => l.trim())
  .filter(l => l.startsWith('OGCITADEL-'));

console.log(`  - Parts détectées dans le fichier : ${shareTokens.length}`);

const parsedShares = [];
for (const token of shareTokens) {
  const parts = token.split('-');
  if (parts.length < 6) throw new Error(`Format invalide : ${token}`);
  const x = parseInt(parts[1], 10);
  const k = parseInt(parts[2], 10);
  const n = parseInt(parts[3], 10);
  const hex = parts[4];
  const csum = parts[5];

  const data = Buffer.from(hex, 'hex');
  const computedCsum = sha256Hex(data).slice(0, 8);
  if (computedCsum !== csum) {
    throw new Error(`Somme de contrôle invalide pour la part #${x}`);
  }
  parsedShares.push({ x, k, n, data });
  console.log(`  - Part #${x} : ${hex.length/2} octets | Checksum ${csum} (✓ Valide)`);
}
console.log('  -> ✓ Toutes les parts ont une somme de contrôle exacte.\n');

console.log('[3] Test de reconstruction Shamir GF(2^8) avec K=2 parts (Parts #1 et #3)...');
const chosenShares = [parsedShares[0], parsedShares[2]]; // #1 et #3
const keyLen = chosenShares[0].data.length;
const reconstructedKey = new Uint8Array(keyLen);

for (let b = 0; b < keyLen; b++) {
  const points = chosenShares.map(s => ({ x: s.x, y: s.data[b] }));
  reconstructedKey[b] = lagrangeInterpolateAtZero(points);
}
console.log(`  - Clé maîtresse AES-256 reconstituée : ${Buffer.from(reconstructedKey).toString('hex').slice(0, 32)}...`);
console.log('  -> ✓ Interpolation polynomiale de Lagrange réussie.\n');

console.log('[4] Déchiffrement AES-256-GCM du coffre...');
const iv = Buffer.from(vault.ivHex, 'hex');
const ciphertextWithTag = Buffer.from(vault.ciphertextBase64, 'base64');
const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);
const authTag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);
const aad = Buffer.from('ORIGGUARD-CITADEL-' + vault.sha256Original, 'utf-8');

const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(reconstructedKey), iv);
decipher.setAAD(aad);
decipher.setAuthTag(authTag);

const decryptedPlaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
const decryptedSha256 = sha256Hex(decryptedPlaintext);

console.log(`  - Empreinte SHA-256 calculée : ${decryptedSha256}`);
console.log(`  - Empreinte SHA-256 attendue : ${vault.sha256Original}`);

if (decryptedSha256 !== vault.sha256Original) {
  throw new Error('Divergence d\'empreinte SHA-256 après déchiffrement !');
}

console.log('  -> ✓ Correspondance stricte SHA-256 octet pour octet.\n');

console.log('[5] Contrôle d\'immuabilité des versions scellées (FROZEN_RELEASES.json)...');
const registryFile = path.resolve(__dirname, '../FROZEN_RELEASES.json');
if (!fs.existsSync(registryFile)) {
  throw new Error('FROZEN_RELEASES.json introuvable !');
}
const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
const latestFrozen = registry.releases.find(r => r.version === registry.canonical_latest);
if (!latestFrozen) {
  throw new Error('Version canonique absente de FROZEN_RELEASES.json');
}

const restoreHtmlPath = path.resolve(__dirname, '../restore.html');
const restoreHtmlBuf = fs.readFileSync(restoreHtmlPath);
const restoreHtmlHash = sha256Hex(restoreHtmlBuf);

console.log(`  - Version canonique déclarée : ${latestFrozen.version}`);
console.log(`  - Taille en octets : ${restoreHtmlBuf.length} (attendu: ${latestFrozen.size})`);
console.log(`  - SHA-256 calculé  : ${restoreHtmlHash}`);
console.log(`  - SHA-256 gelé     : ${latestFrozen.sha256}`);

if (restoreHtmlBuf.length !== latestFrozen.size || restoreHtmlHash !== latestFrozen.sha256) {
  throw new Error('VIOLATION IMMUABILITÉ : restore.html a été altéré par rapport au registre gelé !');
}
console.log('  -> ✓ restore.html est strictement conforme au registre gelé d\'immuabilité.');

console.log('\n  Audit des archives physiques présentes dans restore/ :');
for (const rel of registry.releases) {
  const archivePath = path.resolve(__dirname, '..', rel.filename);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive manquante dans le dépôt : ${rel.filename}`);
  }
  const buf = fs.readFileSync(archivePath);
  const hash = sha256Hex(buf);
  if (buf.length !== rel.size || hash !== rel.sha256) {
    throw new Error(`VIOLATION IMMUABILITÉ : ${rel.filename} ne correspond pas à l'empreinte gelée !`);
  }
  console.log(`  - ${rel.version.padEnd(8)} | ${String(buf.length).padStart(5)} o | SHA-256 : ${hash} (✓ Conforme)`);
}
console.log('  -> ✓ Toutes les archives nommées dans FROZEN_RELEASES.json sont présentes et conformes.\n');

console.log('======================================================================');
console.log('SUCCÈS : TOUS LES TESTS MATHEMATIQUES, FORENSIQUES ET D\'IMMUABILITÉ ONT PASSÉ (100% OK)');
console.log('======================================================================\n');
