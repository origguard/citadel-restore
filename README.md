# citadel-restore

**A 25 KB standalone HTML file designed to outlive its creator.**  
*100% offline Shamir's Secret Sharing in $\text{GF}(2^8)$ and AES-256-GCM zero-trust vault recovery.*

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Offline Operation](https://img.shields.io/badge/Network_Transmission-0_bytes-emerald.svg)](#offline-operation)
[![File Size](https://img.shields.io/badge/Size-26_KB_(standalone)-blue.svg)](#architecture)

---

## The Problem: Most Vaults Die with Their Vendor

When people secure mission-critical secrets (cryptocurrency recovery seed phrases, infrastructure root credentials, shareholder pacts, inheritance testaments), they often entrust them to cloud password managers or SaaS vaults.

This creates three structural points of failure:
1. **The Subscription Gate**: In 15 or 30 years, an heir or liquidator cannot unlock a vault if monthly billing lapses or administrative accounts are frozen.
2. **The Vendor Survival Dependency**: If the company shuts down, changes terms, or deletes inactive accounts, access is permanently lost.
3. **The Software Dependency**: A tool that requires npm dependencies, Docker containers, remote APIs, or compilation may fail to run on a disconnected offline machine decades from now.

---

## The Design: A Self-Contained Recovery Capsule

`restore.html` is a single, zero-dependency HTML file (26 KB standalone file, 26095 bytes) with no external network calls, no build step, and no JavaScript framework.

It can be saved onto a physical USB drive, burned onto an optical disc, or printed alongside an archival custody booklet. Double-clicking it in any standard web browser opens a fully operational cryptographic recovery console.

```
┌───────────────────────────────────────────────────────────────┐
│                       restore.html                            │
│  ┌──────────────────────┐         ┌────────────────────────┐  │
│  │ Encrypted Capsule    │         │ Custodian Shares (k/n) │  │
│  │ (.citadel-vault)     │         │ (Paper / Text Tokens)  │  │
│  └──────────┬───────────┘         └───────────┬────────────┘  │
│             │                                 │               │
│             ▼                                 ▼               │
│     [AES-256-GCM Buffer]              [GF(2^8) Lagrange]      │
│             │                                 │               │
│             └───────────────┬─────────────────┘               │
│                             │                                 │
│                             ▼                                 │
│             [Local In-Memory Plaintext Decryption]            │
│                             │                                 │
│                             ▼                                 │
│             [Direct Browser Download to Disk]                 │
└───────────────────────────────────────────────────────────────┘
```

---

## Core Technical Features

### 1. Mathematics over Galois Field $\text{GF}(2^8)$
Master keys are split using Shamir's Secret Sharing scheme over the finite field $\text{GF}(2^8)$ with the Rijndael irreducible polynomial $P(x) = x^8 + x^4 + x^3 + x + 1$ (`0x11d`).
* Any $k$ shares out of $n$ can reconstruct the master secret via Lagrange polynomial interpolation evaluated at $x = 0$.
* Any $k - 1$ shares leak mathematically zero information about the underlying secret (Shannon perfect secrecy).

### 2. Authenticated Encryption (AES-256-GCM)
The payload is encrypted in pure RAM via the browser's native `window.crypto.subtle` engine using AES-256-GCM:
* 96-bit unique IV.
* 128-bit authentication tag.
* Additional Authenticated Data (AAD) bound to the unencrypted asset's SHA-256 hash.
* If any byte of the ciphertext or metadata is corrupted, decryption aborts immediately.

### 3. Real-Time Keystroke Checksum & Position Locator
When keys are transcribed from paper, typos happen. Each share token includes an 8-character checksum derived from the first 32 bits of $\text{SHA-256}(\text{share\_bytes})$:
```
OGCITADEL-1-2-3-c5622541e92131d6493a43dc73c1e731063ce74dc2298a7061c5088a8a13e20e-2961d81f
                                                                                    └── Checksum
```
* **Instant error detection**: The UI validates each token as you type.
* **Exact character locator**: If a character is omitted, invalid, or corrupted, the tool highlights the exact 1-based character position.

### 4. Standalone Offline Decryption
* `restore.html` does not load external fonts, CDNs, or external stylesheets.
* When opened offline via the file scheme (`file://`), execution operates entirely in local browser memory without outbound requests.
* You can run it with Wi-Fi disabled, in an isolated VM, or on a disconnected workstation.

### 5. Archival Hash Pinning & Versioned Historical Sealing
The canonical standalone recovery engine `restore.html` v1.4.0 is permanently frozen and registered in `FROZEN_RELEASES.json`.
* **Release Version**: `1.4.0`
* **File Size**: `26095 bytes` (25.5 KB)
* **SHA-256**: `273e3782bc9fbca692c19a2c9a4b57c3ebee87f4b0616ce0163218147082b7b4`

#### Historical Sealing Policy
Because this SHA-256 hash is printed on physical custody booklets deposited in vaults or with notaries, **published restore releases are sealed in Git history**:
* **Zero modification**: Once registered in `FROZEN_RELEASES.json`, a published release is never modified (no typo fixes, no translations, no retroactive edits).
* **Side-by-side progression**: Any future enhancements or fixes are published under an incremented semantic version alongside previous releases.
* **Historical reference**: Physical booklets in circulation retain their verification baseline against their designated versioned archive file (`https://citadelhub.cloud/restore/v1.4.0.html`, `https://citadelhub.cloud/restore/v1.3.0.html`, `https://citadelhub.cloud/restore/v1.2.0.html`).

Verify all frozen archives locally on any operating system:
```bash
sha256sum -c checksums.sha256
# restore/v1.0.0.html: OK
# restore/v1.2.0.html: OK
# restore/v1.3.0.html: OK
# restore/v1.4.0.html: OK
# restore.html: OK
```

---

## 30-Second Quick Start

You can verify and run the recovery process right now without installing anything:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/origguard/citadel-restore.git
   cd citadel-restore
   ```

2. Open [`restore.html`](restore.html) in your browser:
   * Double-click `restore.html` or run `open restore.html` / `start restore.html`.

3. Test with the included demo:
   * Drag & drop [`demo/sample-vault.citadel-vault`](demo/sample-vault.citadel-vault) into the file dropzone.
   * Open [`demo/sample-shares.txt`](demo/sample-shares.txt).
   * Copy and paste any **2** of the 3 shares into the input area.
   * Click **Déchiffrer & Télécharger**.
   * The original decrypted document (`confidential-recovery-manifest.txt`) will download to your disk with exact bit-for-bit SHA-256 verification.

---

## Automated Verification Suite

A zero-dependency test runner is included in [`test/test_restore.js`](test/test_restore.js):

```bash
node test/test_restore.js
```

### Output:
```
======================================================================
CITADEL RESTORE SPECIFICATION & RECONSTRUCTION TEST SUITE
======================================================================

[1] Audit du conteneur de coffre (.citadel-vault)...
  - Document chiffré    : confidential-recovery-manifest.txt
  - Taille en clair      : 715 octets
  - Quorum requis (K/N)  : 2 sur 3
  - Empreinte attendue   : c3c44dc6cf51ad22f53b1930edbdb397984eb16adbaad56cbe87754f12b1b8bf
  -> ✓ Métadonnées du coffre valides.

[2] Analyse et validation des parts de secret OGCITADEL-...
  - Parts détectées dans le fichier : 3
  - Part #1 : 32 octets | Checksum 2961d81f (✓ Valide)
  - Part #2 : 32 octets | Checksum 00addd5b (✓ Valide)
  - Part #3 : 32 octets | Checksum 3a0413b4 (✓ Valide)
  -> ✓ Toutes les parts ont une somme de contrôle exacte.

[3] Test de reconstruction Shamir GF(2^8) avec K=2 parts (Parts #1 et #3)...
  - Clé maîtresse AES-256 reconstituée : 6d1112e58a22683448605a30088809d1...
  -> ✓ Interpolation polynomiale de Lagrange réussie.

[4] Déchiffrement AES-256-GCM du coffre...
  - Empreinte SHA-256 calculée : c3c44dc6cf51ad22f53b1930edbdb397984eb16adbaad56cbe87754f12b1b8bf
  - Empreinte SHA-256 attendue : c3c44dc6cf51ad22f53b1930edbdb397984eb16adbaad56cbe87754f12b1b8bf
  -> ✓ Correspondance stricte SHA-256 octet pour octet.

======================================================================
SUCCÈS : TOUS LES TESTS MATHEMATIQUES ET FORENSIQUES ONT PASSÉ (100% OK)
======================================================================
```

---

## Specifications & Data Formats

See [`SPECIFICATION.md`](SPECIFICATION.md) for full formal documentation of:
* The `.citadel-vault` JSON schema.
* The `OGCITADEL-` token syntax.
* Detailed Galois Field arithmetic definitions.

---

## License

This software is released under the [MIT License](LICENSE).  
You are free to audit, embed, archive, fork, and distribute this recovery file indefinitely.
