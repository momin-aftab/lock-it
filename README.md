# Lock-it 🔒
**100% Client-Side Multi-Layer Photo Encryption & Lossless Cryptography**  
*Made by Momin Aftab*

---

## Overview
**Lock-it** is a secure, lightweight web application for encrypting and decrypting photos directly in your web browser. 

All cryptographic calculations run entirely client-side using JavaScript (`Canvas API` + `Web Crypto API`). **No images or keys are ever sent to an external server or cloud provider.**

### Visual Design
Built with an authentic **early 2000s desktop window chrome** interface (classic beveled borders, title bars, and status displays) combined with modern ergonomics:
- **1-Click Key Copy & Paste** with animated floating toast notifications (`✓ Copied!`).
- **Password Masking** for Unicode keys (`••••••••`) with instant reveal toggle (`👁️`).
- **Lossless WebP & PNG Downloads** ensuring bit-exact photo preservation.
- **Strict Two-Session Isolation**: Encrypt and Decrypt modes operate in completely independent workspaces—no accidental data or key crossover.

---

## Cryptographic Pipeline
The application employs a 5-stage visual encryption algorithm:

1. **Aspect-Ratio Square Block Decomposition**:
   - Calculates the optimal square block dimension ($B \times B$) based on image dimensions ($H \times W$) and divisibility factors.
   - Preserves fast performance across desktop, tablet, and mobile devices.
2. **Master Key Seed Expansion**:
   - Computes a SHA-256 digest of the Unicode key to seed a deterministic 32-bit PRNG (`Mulberry32`).
3. **Inter-Block Permutation**:
   - Spatially scrambles block positions across the canvas using a Fisher-Yates shuffle.
4. **Intra-Block Pixel Shuffling**:
   - Independently scrambles individual pixel coordinates within each block based on per-block derived sub-seeds.
5. **Intra-Block Channel Swapping & Color Masking**:
   - Pivot-based RGB channel permutation:
     $$\text{Pivot } 0: G \leftrightarrow B \quad\mid\quad \text{Pivot } 1: R \leftrightarrow B \quad\mid\quad \text{Pivot } 2: R \leftrightarrow G$$
   - Color XOR masking across all pixels within each block.

---

## File Structure
```text
lock-it/
├── index.html       # Early-2000s window chrome UI & layout
├── style.css        # Desktop theme & modern toast styling
├── crypto.js        # Deterministic client-side cryptographic engine
├── app.js           # Two-session state controller & event orchestration
├── README.md        # Documentation
└── .gitignore       # Repository ignore rules
```

---

## Getting Started

### Run Locally
Because Lock-it is completely client-side, you can run it using any local static file server:

```bash
# Using Python
python -m http.server 8080

# Or using Node
npx serve .
```
Then open `http://localhost:8080` in your browser.

### Deploy to GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings** > **Pages**.
3. Under **Branch**, select `main` and root `/`.
4. Click **Save**. Your site will be live instantly!

---

## Author
**Made by Momin Aftab**  
All rights reserved.
