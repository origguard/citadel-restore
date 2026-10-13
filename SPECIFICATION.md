# Citadel Vault & Shamir Recovery Specification (v1.3)

## 1. Overview & Threat Model

The Citadel recovery protocol is designed for **post-custodial survival**: ensuring that heirs, partners, or liquidators can recover mission-critical archives without depending on the original vendor, SaaS availability, remote API infrastructure, or an active subscription.

The recovery environment assumes:
* **Zero network access** (offline workstation, live USB boot, or disconnected browser).
* **Zero vendor survival** (the editor's servers, domain, and company may no longer exist).
* **Zero software installation** (standard web browser with native WebCrypto API).

---

## 2. Vault Capsule Format (`.citadel-vault`)

A `.citadel-vault` file is an authenticated JSON container storing ciphertext, cryptographic metadata, and threshold parameters.

### Schema Definition

```json
{
  "formatVersion": 1,
  "documentName": "confidential-recovery-manifest.txt",
  "fileSize": 715,
  "threshold": 2,
  "totalShares": 3,
  "sha256Original": "c3c44dc6cf51ad22f53b1930edbdb397984eb16adbaad56cbe87754f12b1b8bf",
  "ivHex": "e35718679fac522d6f4054b3",
  "saltHex": "ab6c43e717337cdced0df9f0ed0dc7b7",
  "ciphertextBase64": "<base64_encoded_aes_256_gcm_ciphertext_with_16_byte_tag>",
  "merkleRoot": "7d12773bb54c776c3dda74be2f868c168bf3dee77240c626dbfebeced30112b9",
  "createdAt": "2026-10-13T00:10:21.871Z"
}
```

### Fields Specification

| Field | Type | Description |
|---|---|---|
| `formatVersion` | Integer | Protocol specification version (currently `1`). |
| `documentName` | String | Original filename of the sealed asset. |
| `fileSize` | Integer | Byte count of the unencrypted payload. |
| `threshold` | Integer ($k$) | Minimum quorum of distinct shares required for reconstruction. |
| `totalShares` | Integer ($n$) | Total number of issued shares ($n \ge k$). |
| `sha256Original` | String (Hex, 64 chars) | Pre-encryption SHA-256 hash of the unencrypted file. |
| `ivHex` | String (Hex, 24 chars) | 96-bit Initialization Vector for AES-256-GCM. |
| `saltHex` | String (Hex, 32 chars) | 128-bit cryptographic salt. |
| `ciphertextBase64` | String (Base64) | Ciphertext concatenated with the 128-bit GCM authentication tag. |
| `merkleRoot` | String (Hex, 64 chars) | Root hash binding the document digest and IV. |

---

## 3. Share Token Format (`OGCITADEL-`)

Each custodian holds a text token formatted as follows:

```
OGCITADEL-<index>-<threshold>-<total>-<hex_data>-<checksum>
```

### Example
```
OGCITADEL-1-2-3-c5622541e92131d6493a43dc73c1e731063ce74dc2298a7061c5088a8a13e20e-2961d81f
```

### Component Breakdown

1. **Prefix**: `OGCITADEL-`
2. **Share Index ($x$)**: Positive integer ($1 \le x \le n$).
3. **Threshold ($k$)**: Minimum quorum needed to reconstruct ($2 \le k \le n$).
4. **Total Shares ($n$)**: Total count of shares produced.
5. **Key Fraction Data (`<hex_data>`)**: Hex-encoded evaluation of the polynomial at $x$ (32 bytes / 64 hex characters for AES-256).
6. **Checksum (`<checksum>`)**: First 8 hexadecimal characters (32 bits) of $\text{SHA-256}(\text{raw\_bytes}(\text{hex\_data}))$.

### Real-Time Keystroke Checksum & Error Detection

The 8-character checksum enables instantaneous client-side validation:
* **Position locator**: If a user mistypes or omits a character, the recovery engine detects whether a non-hex character is present and flags the exact 1-based character position.
* **Integrity check**: If characters are transposed or corrupted, the calculated checksum fails to match the trailing 8 characters, allowing the user to correct transcription errors prior to cryptographic reconstruction.

---

## 4. Cryptographic Core

### Shamir Secret Sharing in $\text{GF}(2^8)$
* **Galois Field**: Finite field of order 256 defined by the irreducible polynomial:
  $$P(x) = x^8 + x^4 + x^3 + x + 1 \quad (\text{binary: } 0\text{b}100010001 = 0\text{x}11d)$$
* **Interpolation**: Lagrange polynomial interpolation evaluated at $x = 0$:
  $$S = f(0) = \sum_{i=1}^{k} y_i \prod_{j \neq i} \frac{x_j}{x_j \oplus x_i}$$
  All multiplications and divisions are performed in $\text{GF}(2^8)$ using precomputed exponentiation and logarithm tables.

### Authenticated Encryption (AES-256-GCM)
* **Key Length**: 256 bits (32 bytes), directly recovered from the secret sharing scheme.
* **Mode**: Galois/Counter Mode (GCM) with 96-bit random IV.
* **Associated Data (AAD)**: Binding string:
  $$\text{AAD} = \text{"ORIGGUARD-CITADEL-"} \,\|\, \text{sha256Original}$$
* **Verification**: Decryption will fail cryptographically if any byte of the ciphertext, IV, AAD, or master key is tampered with.
* **Integrity Gate**: Once decrypted, the plaintext is hashed with SHA-256 and compared bit-for-bit to `sha256Original`.

---

## 5. Frozen Immutability Policy

Because custody booklets with printed SHA-256 hashes are placed in safes and notary archives, published releases of the offline engine cannot be mutated retroactively.

* **Registry**: All official recovery engine releases are cataloged in `FROZEN_RELEASES.json`.
* **Immutability Enforcement**: Automated build guards verify that every historical release file in `restore/vX.Y.Z.html` matches its declared size and SHA-256 hash byte-for-byte.
* **Evolution via Side-by-Side Releases**: Any future patch, improvement, or translation is published as a distinct semantic version (e.g. `v1.3.0.html`) while keeping all prior releases permanently intact.
