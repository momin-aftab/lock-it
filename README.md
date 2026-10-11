# Lock-it 🔒
### Comprehensive Technical Implementation Guide & Cryptographic Specification
**Author:** Momin Aftab  
**Environment:** 100% Client-Side Web Architecture (Zero-Knowledge)  
**Live Application:** [https://lock-it-momin6.vercel.app](https://lock-it-momin6.vercel.app)

---

## 1. Executive Summary & Architecture Overview

**Lock-it** is an advanced client-side visual cryptography suite designed to perform high-entropy, bit-exact lossless image encryption and decryption directly within modern web browsers.

The entire processing pipeline executes within the client sandbox using the **HTML5 Canvas API** and the **W3C Web Cryptography API**. At no point are unencrypted or encrypted pixel buffers, user passphrases, or cryptographic keys transmitted over the network.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT-SIDE BROWSER MEMORY                      │
│                                                                        │
│   ┌──────────────┐     ┌─────────────────────┐     ┌───────────────┐   │
│   │ Image Source │ ──► │  Canvas Processing  │ ──► │ Cryptographic │   │
│   │ (PNG/JPG/HEIC│     │  & Pixel Extraction │     │ Transformation│   │
│   └──────────────┘     └─────────────────────┘     └───────┬───────┘   │
│                                                            │           │
│   ┌──────────────┐     ┌─────────────────────┐             ▼           │
│   │  Passphrase  │ ──► │ SHA-256 Digest &    │ ──► ┌───────────────┐   │
│   │  or Unicode  │     │ Keystream Generator │     │ Lossless WebP │   │
│   └──────────────┘     └─────────────────────┘     │ or PNG Output │   │
│                                                    └───────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Pillars
- **Zero-Knowledge Principle:** Cryptographic execution takes place exclusively in local volatile memory.
- **Dual Cryptographic Standards:** Users have full operational control to toggle between military-grade 256-bit stream cipher state space and high-efficiency 32-bit transformation.
- **100% Bit-Exact Lossless Invertibility:** Cryptographic transformations are mathematically involutory or uniquely bijective, guaranteeing zero image degradation across encryption-decryption round trips.
- **Strict Session Isolation:** Encrypt and Decrypt modes run on isolated memory contexts, eliminating cross-session contamination of images, keys, canvas contexts, or UI states.
- **Mobile Hardware Acceleration & Safeguards:** Automatic EXIF rotation, mobile GPU texture bounds guarding (2560px ceiling), and entropy quota chunking.

---

## 2. Cryptographic Engines & PRNG Profiles

Lock-it incorporates two distinct, self-contained pseudo-random keystream generators implemented directly in native JavaScript without external dependencies.

```
                      ┌─────────────────────────────────┐
                      │ Key Input (Passphrase / Unicode)│
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │       SHA-256 Digest Buffer     │
                      │         (32 Bytes / 256 Bits)   │
                      └────────┬───────────────┬────────┘
                               │               │
            ┌──────────────────┘               └──────────────────┐
            ▼                                                     ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│     🛡️ SECURE STANDARD        │             │       ⚡ FAST STANDARD        │
│    RFC 8439 ChaCha20 CSPRNG   │             │       Mulberry32 PRNG         │
│  State Space: 2^256 (~10^77)  │             │   State Space: 2^32 (~10^9)   │
│  Full 256-Bit Key Ingestion   │             │   High-Throughput Transformation │
└───────────────────────────────┘             └───────────────────────────────┘
```

### 2.1 🛡️ Secure Standard: RFC 8439 ChaCha20 CSPRNG (256-Bit)

The **Secure Standard** implements the RFC 8439 ChaCha20 stream cipher matrix as an in-engine Cryptographically Secure Pseudo-Random Number Generator (CSPRNG).

#### State Matrix Initialization
The internal state comprises a $4 \times 4$ matrix of 32-bit unsigned integers (16 words total, 512 bits):

$$\begin{pmatrix}
c_0 & c_1 & c_2 & c_3 \\
k_0 & k_1 & k_2 & k_3 \\
k_4 & k_5 & k_6 & k_7 \\
b & n_0 & n_1 & n_2
\end{pmatrix}$$

Where:
- **Constants ($c_0 - c_3$):** ChaCha20 constant `"expand 32-byte k"`:
  - $c_0 = \text{0x61707865}$ (`"expa"`)
  - $c_1 = \text{0x3320646e}$ (`"nd 3"`)
  - $c_2 = \text{0x79622d32}$ (`"2-by"`)
  - $c_3 = \text{0x6b206574}$ (`"te k"`)
- **Key Words ($k_0 - k_7$):** The complete 256-bit (32-byte) digest derived from the SHA-256 key hash.
- **Block Counter ($b$):** 32-bit monotonic counter incremented for every 64-byte block generated.
- **Nonce ($n_0 - n_2$):** 96-bit domain separation vector customized per transformation layer:
  - Global Permutation Nonce: `[0x474C4F42, totalBlocks, blockSize]` (`"GLOB"`).
  - Per-Block Nonce: `[blockIndex, unicodeCodePoint, blockIndex * 2654435761]`.

#### Quarter-Round Primitive
The quarter-round operation $\text{QR}(a, b, c, d)$ executes modular addition, XOR, and bitwise cyclic rotations:

$$a \leftarrow (a + b) \pmod{2^{32}}; \quad d \leftarrow (d \oplus a) \lll 16$$
$$c \leftarrow (c + d) \pmod{2^{32}}; \quad b \leftarrow (b \oplus c) \lll 12$$
$$a \leftarrow (a + b) \pmod{2^{32}}; \quad d \leftarrow (d \oplus a) \lll 8$$
$$c \leftarrow (c + d) \pmod{2^{32}}; \quad b \leftarrow (b \oplus c) \lll 7$$

Each 64-byte keystream block undergoes 10 double-rounds (4 column rounds + 4 diagonal rounds = 20 rounds total). The initial state is added back to the transformed state modulo $2^{32}$ to produce the final keystream block.

#### Cryptographic Strength
With a key length of 256 bits, the theoretical key space is:

$$2^{256} \approx 1.1579 \times 10^{77} \text{ possibilities}$$

This provides cryptographically secure protection against any computational search or collision attempts.

---

### 2.2 ⚡ Fast Standard: Mulberry32 PRNG (32-Bit)

The **Fast Standard** is engineered for scenarios requiring maximum throughput on low-power devices. It utilizes the **Mulberry32** generator, a 32-bit generator that exhibits high statistical uniformity and passes BigCrush testing while maintaining high execution speed.

#### Core Algorithm
Given an internal 32-bit state variable $S$:

$$S \leftarrow (S + \text{0x6D2B79F5}) \pmod{2^{32}}$$
$$T \leftarrow \text{Math.imul}(S \oplus (S \ggg 15), 1 \mid S)$$
$$T \leftarrow (T + \text{Math.imul}(T \oplus (T \ggg 7), 61 \mid T)) \oplus T$$
$$\text{Output} = \frac{(T \oplus (T \ggg 14)) \pmod{2^{32}}}{4294967296}$$

Mulberry32 derives its master seed directly from the initial 4 bytes of the SHA-256 digest:

$$S_{\text{master}} = \text{DataView}(H_{\text{SHA-256}}).\text{getUint32}(0)$$

Individual block streams are initialized with Knuth multiplicative hashing:

$$S_{\text{block}} = S_{\text{master}} \oplus (\text{codePoint} \times 1000003 + \text{blockIndex} \times 2654435761)$$

---

## 3. Mathematical Encryption Pipeline

The image transformation operates as a synchronized 5-layer pipeline:

```
┌────────────────────────────────────────────────────────┐
│               STAGE 1: ADAPTIVE BLOCK SOLVER           │
│  Divides Image into Optimal B x B Blocks via GCD      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│               STAGE 2: KEY & NONCE EXPANSION           │
│  Computes SHA-256 Digest & Generates Keystreams        │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│         STAGE 3: INTER-BLOCK SPATIAL PERMUTATION       │
│  Global Fisher-Yates Permutation of Block Positions    │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│          STAGE 4: INTRA-BLOCK PIXEL SCRAMBLING         │
│  Independent Fisher-Yates Shuffle of B² Pixels/Block   │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│         STAGE 5: CHROMATIC TRANSFORMATION              │
│  Pivot RGB Transposition & Per-Block Bitwise XOR Mask  │
└────────────────────────────────────────────────────────┘
```

### Stage 1: Adaptive Aspect-Ratio Block Solver
Rather than forcing arbitrary square cropping or padding that alters image aspect ratios, Lock-it dynamically calculates the optimal block size $B$:

1. If the width $W$ is an integer multiple of height $H$, $H$ is factored into powers of 2, selecting the candidate closest to the preferred target dimension (default $32\text{px}$).
2. Otherwise, the Greatest Common Divisor is computed:
   $$\text{GCD}(W, H) = \begin{cases} W & \text{if } H = 0 \\ \text{GCD}(H, W \pmod H) & \text{otherwise} \end{cases}$$
3. All integer factors of $\text{GCD}(W, H)$ are computed. The factor minimizing $|f - 32|$ is designated as $B$.
4. The total block count is:
   $$N_{\text{blocks}} = \left(\frac{W}{B}\right) \times \left(\frac{H}{B}\right)$$

### Stage 2: Key & Keystream Derivation
- **Unicode Key Derivation:** For direct Unicode mode, $N_{\text{blocks}}$ characters are sampled uniformly from high-entropy Unicode space ($\text{0x00A0} - \text{0x02AF}$).
- **Passphrase Derivation:** When using human-readable passphrases, the string is hashed with SHA-256 and mapped into a high-entropy deterministic character sequence.
- The derived string is hashed using `crypto.subtle.digest("SHA-256")`, yielding a 32-byte digest buffer.

### Stage 3: Inter-Block Spatial Permutation
The physical 2D locations of all blocks across the grid are scrambled using an in-place Fisher-Yates permutation algorithm seeded by the global keystream:

$$\pi_{\text{inter}} = \text{FisherYates}(N_{\text{blocks}}, \text{PRNG}_{\text{global}})$$

The inverse permutation array is calculated in $O(N)$ time:

$$\pi^{-1}_{\text{inter}}[\pi_{\text{inter}}[i]] = i, \quad \forall i \in [0, N_{\text{blocks}} - 1]$$

### Stage 4: Intra-Block Pixel Scrambling
Inside each individual block $k$, the local pixel indices $0 \le p < B^2$ are independently permuted using block-specific keystreams:

$$\pi_{\text{intra}, k} = \text{FisherYates}(B^2, \text{PRNG}_{\text{block}, k})$$

This disrupts intra-block spatial edge continuity and high-frequency textures.

### Stage 5: Involutory Chromatic Transformation
Each block undergoes two successive color space transformations:

#### A. Pivot RGB Channel Transposition
A deterministic pivot rule $r_k \in \{0, 1, 2\}$ is derived for block $k$:

$$r_k = (\text{codePoint}_k + H_{\text{SHA-256}}[k \pmod{32}]) \pmod 3$$

The color channels undergo cyclic transposition according to $r_k$:
- **Rule 0:** Green $\leftrightarrow$ Blue swap: $(R, G, B) \rightarrow (R, B, G)$
- **Rule 1:** Red $\leftrightarrow$ Blue swap: $(R, G, B) \rightarrow (B, G, R)$
- **Rule 2:** Red $\leftrightarrow$ Green swap: $(R, G, B) \rightarrow (G, R, B)$

Because single two-channel transpositions are mathematical involutions:

$$\text{Swap}_{i, j}(\text{Swap}_{i, j}(C)) = C$$

Applying the exact same rule during decryption restores the original color channels.

#### B. Bitwise XOR Color Masking
A 3-byte RGB mask is generated per block:

$$M_k = [m_{R, k}, m_{G, k}, m_{B, k}], \quad m_{c, k} = \lfloor \text{PRNG}_{\text{block}, k}() \times 256 \rfloor$$

The transformed pixel values are:

$$C'_{\text{enc}} = C_{\text{transposed}} \oplus M_k$$

During decryption, bitwise self-inversion ensures:

$$C_{\text{transposed}} = C'_{\text{enc}} \oplus M_k$$

The Alpha channel ($\alpha = 255$) remains preserved throughout to maintain display pipeline compatibility across all operating systems.

---

## 4. Mathematical Proof of Bit-Exact Invertibility

Let an arbitrary pixel $P$ at local block coordinate $p$ in original block $k$ have RGB color vector $\mathbf{v} = (R, G, B)$.

1. **Encryption Operator:**
   $$\mathbf{v}' = \text{Swap}_{r_k}(\mathbf{v}) \oplus M_k$$
   $$\text{DestCoord} = \pi_{\text{inter}}(k) \times B^2 + \pi_{\text{intra}, k}(p)$$

2. **Decryption Operator:**
   $$\mathbf{v}'' = \text{Swap}_{r_k}(\mathbf{v}' \oplus M_k)$$
   $$\text{SourceCoord} = \pi^{-1}_{\text{inter}}(\text{DestBlock}) \times B^2 + \pi^{-1}_{\text{intra}, k}(p)$$

Expanding the color recovery:
$$\mathbf{v}'' = \text{Swap}_{r_k}\left( (\text{Swap}_{r_k}(\mathbf{v}) \oplus M_k) \oplus M_k \right)$$

By associativity of bitwise XOR and the property $X \oplus M \oplus M = X$:
$$\mathbf{v}'' = \text{Swap}_{r_k}(\text{Swap}_{r_k}(\mathbf{v}))$$

Because every transposition matrix $T$ satisfying $T^T = T$ and $T^2 = I$ is self-inverting:
$$\mathbf{v}'' = \mathbf{v}$$

Thus, round-trip pixel transformation is bit-exact with zero precision loss.

---

## 5. Mobile Hardware Acceleration & Safety Boundaries

To ensure reliable performance across consumer mobile devices (such as Samsung Galaxy S24, iPhone 15 Pro, and budget hardware), Lock-it includes three automatic safety systems:

### 5.1 Mobile GPU Canvas Memory Ceiling
High-end mobile cameras capture at 50MP to 200MP ($8160 \times 6120$ pixels). Allocating multi-buffer canvas contexts of this size exceeds mobile WebGL/2D canvas hardware limits and triggers browser tab crashes.

Lock-it enforces a **2.5K QHD ceiling (2560px max dimension)**:
```javascript
const MAXIMUM_SAFE_PIXEL_DIMENSION = 2560;
if (sourceWidth > 2560 || sourceHeight > 2560) {
    const scaleFactor = 2560 / Math.max(sourceWidth, sourceHeight);
    // Scales proportionally using high-quality bi-cubic interpolation
}
```

### 5.2 EXIF Auto-Orientation Normalization
Mobile photos taken in portrait orientation contain orientation flags in their EXIF metadata. Lock-it renders images through `createImageBitmap(blob, { imageOrientation: 'from-image' })`, ensuring orientation is normalized prior to pixel extraction.

### 5.3 Web Crypto API Entropy Quota Chunking
Browsers restrict `crypto.getRandomValues()` to a maximum of 65,536 bytes per invocation. Attempting to generate larger buffers throws a `QuotaExceededError`. 

Lock-it collects entropy in safe chunks of 16,384 unsigned 32-bit integers:
```javascript
const MAXIMUM_SAFE_CRYPTO_CHUNK_SIZE = 16384;
for (let offset = 0; offset < totalRequired; offset += MAXIMUM_SAFE_CRYPTO_CHUNK_SIZE) {
    const chunk = subBuffer.subarray(offset, Math.min(offset + MAXIMUM_SAFE_CRYPTO_CHUNK_SIZE, totalRequired));
    crypto.getRandomValues(chunk);
}
```

---

## 6. Software Architecture & State Management

Lock-it implements a **Strict Two-Session State Architecture**:

```
                  ┌────────────────────────────────┐
                  │       APPLICATION ROOT         │
                  └───────┬────────────────┬───────┘
                          │                │
            ┌─────────────┴─────┐    ┌─────┴─────────────┐
            │  ENCRYPT SESSION  │    │  DECRYPT SESSION  │
            ├───────────────────┤    ├───────────────────┤
            │ Image Data Buffer │    │ Image Data Buffer │
            │ Key / Passphrase  │    │ Key / Passphrase  │
            │ Chosen Standard   │    │ Chosen Standard   │
            │ Canvas Viewport   │    │ Canvas Viewport   │
            │ Telemetry Stats   │    │ Telemetry Stats   │
            └───────────────────┘    └───────────────────┘
                     ▲                        ▲
                     │      [TAB SWITCH]      │
                     └────────────────────────┘
                 (Zero Cross-Session Leakage)
```

1. **State Isolation:** Encrypt and Decrypt maintain completely separate JavaScript heap state objects. Switching tabs restores the respective state to the DOM without data leakage.
2. **DOM Synchronization:** Radio controls, masked inputs, canvas views, and telemetry automatically reflect the active session.
3. **Telemetry & Feedback:** Real-time benchmark reporting shows execution speed in milliseconds, block counts, and active standard.

---

## 7. API Reference

All core cryptographic functions are exposed on `window.LockItCrypto`:

### `encryptImageData(sourceImageData, unicodeKeyString, squareBlockDimension, encryptionStandard)`
- **Parameters:**
  - `sourceImageData` (`ImageData`): Uncompressed pixel buffer from 2D Canvas.
  - `unicodeKeyString` (`string`): The cryptographic key or derived passphrase string.
  - `squareBlockDimension` (`number`): Block size $B$ in pixels.
  - `encryptionStandard` (`string`): `'secure'` (ChaCha20 256-bit) or `'fast'` (Mulberry32 32-bit). Default: `'secure'`.
- **Returns:** `Promise<ImageData>` containing encrypted pixels.

### `decryptImageData(encryptedImageData, unicodeKeyString, squareBlockDimension, encryptionStandard)`
- **Parameters:** Same parameters as encryption.
- **Returns:** `Promise<ImageData>` containing bit-exact restored pixels.

### `deriveKeyFromPassphrase(enteredPassphrase, totalGridBlocks)`
- **Parameters:**
  - `enteredPassphrase` (`string`): Human-readable secret phrase.
  - `totalGridBlocks` (`number`): Number of grid blocks required for expansion.
- **Returns:** `Promise<string>` high-entropy Unicode key string.

### `getBlockSize(imageHeightPixels, imageWidthPixels, preferredTargetBlockSize)`
- **Parameters:**
  - `imageHeightPixels` (`number`): Image height in pixels.
  - `imageWidthPixels` (`number`): Image width in pixels.
  - `preferredTargetBlockSize` (`number`): Target block dimension (default: 32).
- **Returns:** `number` optimal block size $B$.

---

## 8. Deployment & Local Setup

### Local Static Server
Because Lock-it is 100% client-side with zero external build dependencies:

```bash
# Python 3
python -m http.server 8080 --directory lock-it

# Node.js
npx serve lock-it
```
Visit `http://localhost:8080` in your browser.

### Cloud Deployment
- **Vercel:** Connect the GitHub repository; Vercel deploys `index.html` as a static edge site with automatic preview environments on non-production branches.
- **GitHub Pages:** Select `main` branch and root `/` under repository **Settings > Pages**.

---

## 9. License & Attribution

**Lock-it** is designed and implemented by **Momin Aftab**.  
All rights reserved.
