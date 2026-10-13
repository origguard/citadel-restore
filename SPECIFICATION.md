# Citadel Vault & Shamir Recovery Specification (v1.1)

## 1. Overview & Threat Model

The Citadel recovery protocol is designed for **post-custodial survival**: ensuring that heirs, partners, or liquidators can recover mission-critical archives without depending on the original vendor, SaaS availability, remote API infrastructure, or an active subscription.

The recovery environment assumes:
* **Zero network access** (air-gapped workstation, live USB boot, or disconnected browser).
* **Zero vendor survival** (the editor's servers, domain, and company may no longer exist).
* **Zero software installation** (standard web browser with native WebCrypto API).

---

## 2. Vault Capsule Format (`.citadel-vault`)

A `.citadel-vault` file is an authenticated JSON container storing ciphertext, cryptographic metadata, and threshold parameters.

### Schema Definition

```json
{
  "formatVersion": 1,
  "documentName": "contract-sovereign.pdf",
  "fileSize": 1048576,
  "threshold": 2,
  "totalShares": 3,
  "sha256Original": "cbf2ba2d5398972935273eacae657bbc5d24c41237f99853d4398b823553d580",
  "ivHex": "3a88c7f56b107e8b3ffce426",
  "saltHex": "f019b8823553d5807bcde4a642631bcd",
  "ciphertextBase64": "<base64_encoded_aes_256_gcm_ciphertext_with_16_byte_tag>",
  "merkleRoot": "209d881e5a3d8d1e115bf64a0f1237b7faaf9b109266ef549d94d00557aab25e",
  "createdAt": "2026-10-12T18:00:00.000Z"
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
OGCITADEL-1-2-3-3165742463b107e8b3ffce42612207b8a79937258659d4f24e41348639db9c41-b13a3979
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
