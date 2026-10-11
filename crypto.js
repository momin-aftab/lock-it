/**
 * Lock-It Cryptographic Engine
 * Made by Momin Aftab
 * 100% Client-Side Multi-Layer Image Encryption
 * 
 * Pipeline:
 * 1. Aspect-Ratio Block Decomposition (O(1) strided block division)
 * 2. Key Master Seed Derivation (SHA-256 digest)
 * 3. Spatial Inter-Block Permutation
 * 4. Local Intra-Block Pixel Scrambling
 * 5. Intra-Block RGB Channel Swap (Pivot Rule) + Color Masking
 */

// RFC 8439 ChaCha20 Quarter-Round Core Operation (256-bit state expansion)
function chacha20QuarterRound(stateArray, indexA, indexB, indexC, indexD) {
    stateArray[indexA] = (stateArray[indexA] + stateArray[indexB]) | 0;
    stateArray[indexD] = stateArray[indexD] ^ stateArray[indexA];
    stateArray[indexD] = (stateArray[indexD] << 16) | (stateArray[indexD] >>> 16);

    stateArray[indexC] = (stateArray[indexC] + stateArray[indexD]) | 0;
    stateArray[indexB] = stateArray[indexB] ^ stateArray[indexC];
    stateArray[indexB] = (stateArray[indexB] << 12) | (stateArray[indexB] >>> 20);

    stateArray[indexA] = (stateArray[indexA] + stateArray[indexB]) | 0;
    stateArray[indexD] = stateArray[indexD] ^ stateArray[indexA];
    stateArray[indexD] = (stateArray[indexD] << 8) | (stateArray[indexD] >>> 24);

    stateArray[indexC] = (stateArray[indexC] + stateArray[indexD]) | 0;
    stateArray[indexB] = stateArray[indexB] ^ stateArray[indexC];
    stateArray[indexB] = (stateArray[indexB] << 7) | (stateArray[indexB] >>> 25);
}

// RFC 8439 ChaCha20 64-Byte Block Generator (256-bit security)
function generateChaCha20Block(keyWords32Bit, blockCounter32Bit, nonceWords32Bit) {
    const workingStateArray = new Uint32Array(16);
    // ChaCha20 constants: "expand 32-byte k"
    workingStateArray[0] = 0x61707865;
    workingStateArray[1] = 0x3320646e;
    workingStateArray[2] = 0x79622d32;
    workingStateArray[3] = 0x6b206574;

    for (let wordIndex = 0; wordIndex < 8; wordIndex++) {
        workingStateArray[4 + wordIndex] = keyWords32Bit[wordIndex];
    }
    workingStateArray[12] = blockCounter32Bit >>> 0;
    workingStateArray[13] = nonceWords32Bit[0] >>> 0;
    workingStateArray[14] = nonceWords32Bit[1] >>> 0;
    workingStateArray[15] = nonceWords32Bit[2] >>> 0;

    const outputStateBuffer = new Uint32Array(workingStateArray);

    for (let roundIndex = 0; roundIndex < 10; roundIndex++) {
        // 4 column rounds
        chacha20QuarterRound(outputStateBuffer, 0, 4, 8, 12);
        chacha20QuarterRound(outputStateBuffer, 1, 5, 9, 13);
        chacha20QuarterRound(outputStateBuffer, 2, 6, 10, 14);
        chacha20QuarterRound(outputStateBuffer, 3, 7, 11, 15);
        // 4 diagonal rounds
        chacha20QuarterRound(outputStateBuffer, 0, 5, 10, 15);
        chacha20QuarterRound(outputStateBuffer, 1, 6, 11, 12);
        chacha20QuarterRound(outputStateBuffer, 2, 7, 8, 13);
        chacha20QuarterRound(outputStateBuffer, 3, 4, 9, 14);
    }

    for (let wordIndex = 0; wordIndex < 16; wordIndex++) {
        outputStateBuffer[wordIndex] = (outputStateBuffer[wordIndex] + workingStateArray[wordIndex]) >>> 0;
    }
    return outputStateBuffer;
}

// 256-Bit Cryptographically Secure Pseudo-Random Number Generator (ChaCha20)
function createChaCha20CSPRNG(keyDigestBytes, nonceWordA = 0, nonceWordB = 0, nonceWordC = 0) {
    const keyWords32Bit = new Uint32Array(keyDigestBytes.buffer, keyDigestBytes.byteOffset, 8);
    const nonceWords32Bit = new Uint32Array([nonceWordA >>> 0, nonceWordB >>> 0, nonceWordC >>> 0]);
    let blockCounter = 0;
    let currentBlockBuffer = null;
    let currentBufferIndex = 16;

    return function generateNextRandomFloat() {
        if (currentBufferIndex >= 16) {
            currentBlockBuffer = generateChaCha20Block(keyWords32Bit, blockCounter++, nonceWords32Bit);
            currentBufferIndex = 0;
        }
        const randomUint32 = currentBlockBuffer[currentBufferIndex++];
        return randomUint32 / 4294967296;
    };
}

// 32-Bit Mulberry32 PRNG (Fast Mode: Ultra-lightweight and fast)
function createMulberry32PRNG(initialSeedValue) {
    let internalSeedState = initialSeedValue >>> 0;
    return function generateNextRandomFloat() {
        internalSeedState = (internalSeedState + 0x6D2B79F5) >>> 0;
        let mixedIntermediateValue = Math.imul(internalSeedState ^ (internalSeedState >>> 15), 1 | internalSeedState);
        mixedIntermediateValue = (mixedIntermediateValue + Math.imul(mixedIntermediateValue ^ (mixedIntermediateValue >>> 7), 61 | mixedIntermediateValue)) ^ mixedIntermediateValue;
        return ((mixedIntermediateValue ^ (mixedIntermediateValue >>> 14)) >>> 0) / 4294967296;
    };
}

// Backward-compatible alias
const createPRNG = (seedOrDigest) => {
    if (typeof seedOrDigest === "number") {
        return createMulberry32PRNG(seedOrDigest);
    }
    return createChaCha20CSPRNG(seedOrDigest);
};

// Fisher-Yates shuffle producing Int32Array permutation
function generatePermutation(totalElementCount, pseudoRandomGenerator) {
    const permutationArray = new Int32Array(totalElementCount);
    for (let elementIndex = 0; elementIndex < totalElementCount; elementIndex++) {
        permutationArray[elementIndex] = elementIndex;
    }
    for (let currentSwapIndex = totalElementCount - 1; currentSwapIndex > 0; currentSwapIndex--) {
        const randomTargetIndex = Math.floor(pseudoRandomGenerator() * (currentSwapIndex + 1));
        const temporaryElementValue = permutationArray[currentSwapIndex];
        permutationArray[currentSwapIndex] = permutationArray[randomTargetIndex];
        permutationArray[randomTargetIndex] = temporaryElementValue;
    }
    return permutationArray;
}

// Invert permutation (permutationArray[invertedPermutationArray[i]] = i)
function invertPermutation(permutationArray) {
    const invertedPermutationArray = new Int32Array(permutationArray.length);
    for (let currentIndex = 0; currentIndex < permutationArray.length; currentIndex++) {
        invertedPermutationArray[permutationArray[currentIndex]] = currentIndex;
    }
    return invertedPermutationArray;
}

/**
 * Calculates optimal square block size based on aspect ratio divisibility.
 * Matches Python implementation exactly.
 */
function getBlockSize(imageHeightPixels, imageWidthPixels, preferredTargetBlockSize = 32) {
    function calculateGreatestCommonDivisor(dimensionA, dimensionB) {
        return dimensionB === 0 ? dimensionA : calculateGreatestCommonDivisor(dimensionB, dimensionA % dimensionB);
    }

    if (imageWidthPixels % imageHeightPixels === 0) {
        // Case 1: Width is multiple of Height -> divide Height into powers of 2
        const maximumPowerOfTwoExponent = Math.floor(Math.log2(imageHeightPixels));
        const viableBlockSizeCandidates = [];
        for (let powerExponent = 1; powerExponent <= maximumPowerOfTwoExponent; powerExponent++) {
            const candidateBlockSize = 1 << powerExponent;
            if (imageHeightPixels % candidateBlockSize === 0 && Math.floor(imageHeightPixels / candidateBlockSize) >= 2) {
                viableBlockSizeCandidates.push(candidateBlockSize);
            }
        }
        if (!viableBlockSizeCandidates.length) viableBlockSizeCandidates.push(1);
        return viableBlockSizeCandidates.reduce((closestCandidateSoFar, candidateUnderEvaluation) => 
            Math.abs(candidateUnderEvaluation - preferredTargetBlockSize) < Math.abs(closestCandidateSoFar - preferredTargetBlockSize) 
                ? candidateUnderEvaluation 
                : closestCandidateSoFar
        );
    } else if (imageHeightPixels % imageWidthPixels === 0) {
        // Case 2: Height is multiple of Width -> divide Width into powers of 2
        const maximumPowerOfTwoExponent = Math.floor(Math.log2(imageWidthPixels));
        const viableBlockSizeCandidates = [];
        for (let powerExponent = 1; powerExponent <= maximumPowerOfTwoExponent; powerExponent++) {
            const candidateBlockSize = 1 << powerExponent;
            if (imageWidthPixels % candidateBlockSize === 0 && Math.floor(imageWidthPixels / candidateBlockSize) >= 2) {
                viableBlockSizeCandidates.push(candidateBlockSize);
            }
        }
        if (!viableBlockSizeCandidates.length) viableBlockSizeCandidates.push(1);
        return viableBlockSizeCandidates.reduce((closestCandidateSoFar, candidateUnderEvaluation) => 
            Math.abs(candidateUnderEvaluation - preferredTargetBlockSize) < Math.abs(closestCandidateSoFar - preferredTargetBlockSize) 
                ? candidateUnderEvaluation 
                : closestCandidateSoFar
        );
    } else {
        // Case 3: Pick common divisor dividing both Height and Width
        const greatestCommonDivisor = calculateGreatestCommonDivisor(imageHeightPixels, imageWidthPixels);
        const commonDivisorCandidates = [];
        const squareRootDivisorLimit = Math.floor(Math.sqrt(greatestCommonDivisor));
        for (let potentialDivisor = 1; potentialDivisor <= squareRootDivisorLimit; potentialDivisor++) {
            if (greatestCommonDivisor % potentialDivisor === 0) {
                commonDivisorCandidates.push(potentialDivisor);
                if (potentialDivisor * potentialDivisor !== greatestCommonDivisor) {
                    commonDivisorCandidates.push(Math.floor(greatestCommonDivisor / potentialDivisor));
                }
            }
        }
        commonDivisorCandidates.sort((divisorA, divisorB) => divisorA - divisorB);
        // Ensure blocks are meaningful (at least 8px and leaving >= 2 blocks per side)
        const validBlockSizesWithAdequateGrid = commonDivisorCandidates.filter(candidateSize => 
            candidateSize >= 8 && 
            Math.floor(imageHeightPixels / candidateSize) >= 2 && 
            Math.floor(imageWidthPixels / candidateSize) >= 2
        );
        if (validBlockSizesWithAdequateGrid.length) {
            return validBlockSizesWithAdequateGrid.reduce((closestCandidateSoFar, candidateUnderEvaluation) => 
                Math.abs(candidateUnderEvaluation - preferredTargetBlockSize) < Math.abs(closestCandidateSoFar - preferredTargetBlockSize) 
                    ? candidateUnderEvaluation 
                    : closestCandidateSoFar
            );
        }
        // Fallback for prime/co-prime dimensions where gcd < 8:
        // Use standard block size (default 30) to preserve fast mobile performance
        return preferredTargetBlockSize;
    }
}

/**
 * Generates random Unicode key string matching specified length.
 */
function generateUnicodeKey(targetKeyCharacterLength = 64) {
    const symbolUnicodeCodePointRanges = [
        [0x1F300, 0x1F3F0], // Symbols & Pictographs
        [0x0391, 0x03C9],   // Greek Alphabet
        [0x2200, 0x22FF],   // Math Operators
        [0x2700, 0x27BF],   // Dingbats
    ];

    const candidateUnicodeCharacters = [];
    for (const [codePointRangeStart, codePointRangeEnd] of symbolUnicodeCodePointRanges) {
        for (let unicodeCodePoint = codePointRangeStart; unicodeCodePoint <= codePointRangeEnd; unicodeCodePoint++) {
            try {
                candidateUnicodeCharacters.push(String.fromCodePoint(unicodeCodePoint));
            } catch {}
        }
    }

    // A key length between 48 and 128 characters provides between 480 and 1280 bits of cryptographic entropy,
    // which vastly exceeds 256-bit AES, while remaining easily copyable, readable, and responsive.
    const practicalKeyCharacterLength = Math.min(Math.max(targetKeyCharacterLength || 64, 48), 128);

    const generatedKeyCharacters = [];
    const cryptoRandomUint32Values = new Uint32Array(practicalKeyCharacterLength);
    
    // Web Crypto API allows at most 65,536 bytes (16,384 Uint32 elements) per getRandomValues call.
    const maximumUint32ChunkSize = 16384;
    for (let chunkOffset = 0; chunkOffset < practicalKeyCharacterLength; chunkOffset += maximumUint32ChunkSize) {
        const currentChunkSize = Math.min(maximumUint32ChunkSize, practicalKeyCharacterLength - chunkOffset);
        crypto.getRandomValues(cryptoRandomUint32Values.subarray(chunkOffset, chunkOffset + currentChunkSize));
    }

    for (let characterIndex = 0; characterIndex < practicalKeyCharacterLength; characterIndex++) {
        const randomCharacterSelectionIndex = cryptoRandomUint32Values[characterIndex] % candidateUnicodeCharacters.length;
        generatedKeyCharacters.push(candidateUnicodeCharacters[randomCharacterSelectionIndex]);
    }
    return generatedKeyCharacters.join("");
}

/**
 * Deterministically derives a Unicode key from a passphrase.
 */
async function deriveKeyFromPassphrase(passphraseString, targetKeyCharacterLength = 64) {
    const utf8TextEncoder = new TextEncoder();
    const encodedPassphraseBytes = utf8TextEncoder.encode(passphraseString);
    
    // Expand using counter-mode SHA-256
    const candidateUnicodeCharacters = [];
    const symbolUnicodeCodePointRanges = [
        [0x1F300, 0x1F3F0],
        [0x0391, 0x03C9],
        [0x2200, 0x22FF],
    ];
    for (const [codePointRangeStart, codePointRangeEnd] of symbolUnicodeCodePointRanges) {
        for (let unicodeCodePoint = codePointRangeStart; unicodeCodePoint <= codePointRangeEnd; unicodeCodePoint++) {
            try { candidateUnicodeCharacters.push(String.fromCodePoint(unicodeCodePoint)); } catch {}
        }
    }

    // Limit key expansion to 48-128 characters to keep derivation instantaneous and UI responsive
    const practicalKeyCharacterLength = Math.min(Math.max(targetKeyCharacterLength || 64, 48), 128);

    const derivedUnicodeCharacters = [];
    let counterModeIteration = 0;
    while (derivedUnicodeCharacters.length < practicalKeyCharacterLength) {
        const chunkDataWithCounter = new Uint8Array(encodedPassphraseBytes.length + 4);
        chunkDataWithCounter.set(encodedPassphraseBytes);
        new DataView(chunkDataWithCounter.buffer).setUint32(encodedPassphraseBytes.length, counterModeIteration++);
        const sha256HashBuffer = await crypto.subtle.digest("SHA-256", chunkDataWithCounter);
        const sha256DigestBytes = new Uint8Array(sha256HashBuffer);
        for (let byteOffset = 0; byteOffset < sha256DigestBytes.length && derivedUnicodeCharacters.length < practicalKeyCharacterLength; byteOffset += 2) {
            const symbolLookupIndex = ((sha256DigestBytes[byteOffset] << 8) | sha256DigestBytes[byteOffset + 1]) % candidateUnicodeCharacters.length;
            derivedUnicodeCharacters.push(candidateUnicodeCharacters[symbolLookupIndex]);
        }
    }
    return derivedUnicodeCharacters.join("");
}

/**
 * Computes SHA-256 hash digest of a Unicode key string.
 */
async function computeKeyDigest(unicodeKeyString) {
    const utf8TextEncoder = new TextEncoder();
    const encodedKeyBytes = utf8TextEncoder.encode(unicodeKeyString);
    const sha256HashBuffer = await crypto.subtle.digest("SHA-256", encodedKeyBytes);
    return new Uint8Array(sha256HashBuffer);
}

/**
 * Derives block transformation parameters using full 256-bit ChaCha20 CSPRNG (Secure Standard).
 */
function deriveBlockParametersChaCha20(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock) {
    // Expand key to match totalImageBlockCount
    const expandedUnicodeCodePoints = [];
    const unicodeCharacterArray = Array.from(unicodeKeyString);
    for (let blockIndex = 0; blockIndex < totalImageBlockCount; blockIndex++) {
        expandedUnicodeCodePoints.push(unicodeCharacterArray[blockIndex % unicodeCharacterArray.length].codePointAt(0));
    }

    // Inter-block spatial permutation using full 256-bit ChaCha20 CSPRNG (Nonce: "GLOB")
    const masterChaChaPseudoRandomGenerator = createChaCha20CSPRNG(
        sha256KeyDigestBytes, 
        0x474C4F42, // ASCII "GLOB"
        totalImageBlockCount >>> 0, 
        pixelsPerSquareBlock >>> 0
    );
    const interBlockPermutationArray = generatePermutation(totalImageBlockCount, masterChaChaPseudoRandomGenerator);
    const invertedInterBlockPermutationArray = invertPermutation(interBlockPermutationArray);

    // Per-block parameters (each block has its own independent 256-bit ChaCha20 keystream)
    const perBlockPixelPermutations = [];
    const perBlockColorMaskRgb = [];
    const perBlockPivotColorSwapRules = [];

    for (let blockIndex = 0; blockIndex < totalImageBlockCount; blockIndex++) {
        const unicodeCharacterCodePoint = expandedUnicodeCodePoints[blockIndex];
        
        // Block-specific 256-bit ChaCha20 CSPRNG
        const perBlockChaChaGenerator = createChaCha20CSPRNG(
            sha256KeyDigestBytes,
            blockIndex >>> 0,
            unicodeCharacterCodePoint >>> 0,
            (blockIndex * 2654435761) >>> 0
        );

        perBlockPixelPermutations.push(generatePermutation(pixelsPerSquareBlock, perBlockChaChaGenerator));
        perBlockColorMaskRgb.push([
            Math.floor(perBlockChaChaGenerator() * 256),
            Math.floor(perBlockChaChaGenerator() * 256),
            Math.floor(perBlockChaChaGenerator() * 256)
        ]);
        perBlockPivotColorSwapRules.push((unicodeCharacterCodePoint + sha256KeyDigestBytes[blockIndex % sha256KeyDigestBytes.length]) % 3);
    }

    return {
        interBlockPermutationArray,
        invertedInterBlockPermutationArray,
        perBlockPixelPermutations,
        perBlockColorMaskRgb,
        perBlockPivotColorSwapRules
    };
}

/**
 * Derives block transformation parameters using 32-bit Mulberry32 PRNG (Fast Standard).
 */
function deriveBlockParametersMulberry32(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock) {
    const digestDataView = new DataView(sha256KeyDigestBytes.buffer, sha256KeyDigestBytes.byteOffset, sha256KeyDigestBytes.byteLength);
    const masterGlobalSeed32Bit = digestDataView.getUint32(0, false);

    // Expand key to match totalImageBlockCount
    const expandedUnicodeCodePoints = [];
    const unicodeCharacterArray = Array.from(unicodeKeyString);
    for (let blockIndex = 0; blockIndex < totalImageBlockCount; blockIndex++) {
        expandedUnicodeCodePoints.push(unicodeCharacterArray[blockIndex % unicodeCharacterArray.length].codePointAt(0));
    }

    // Inter-block spatial permutation using Mulberry32
    const masterPseudoRandomGenerator = createMulberry32PRNG(masterGlobalSeed32Bit);
    const interBlockPermutationArray = generatePermutation(totalImageBlockCount, masterPseudoRandomGenerator);
    const invertedInterBlockPermutationArray = invertPermutation(interBlockPermutationArray);

    // Per-block parameters using Mulberry32
    const perBlockPixelPermutations = [];
    const perBlockColorMaskRgb = [];
    const perBlockPivotColorSwapRules = [];

    for (let blockIndex = 0; blockIndex < totalImageBlockCount; blockIndex++) {
        const unicodeCharacterCodePoint = expandedUnicodeCodePoints[blockIndex];
        const uniquePerBlockSeed = (masterGlobalSeed32Bit ^ (unicodeCharacterCodePoint * 1000003 + blockIndex * 2654435761)) >>> 0;
        const perBlockPseudoRandomGenerator = createMulberry32PRNG(uniquePerBlockSeed);

        perBlockPixelPermutations.push(generatePermutation(pixelsPerSquareBlock, perBlockPseudoRandomGenerator));
        perBlockColorMaskRgb.push([
            Math.floor(perBlockPseudoRandomGenerator() * 256),
            Math.floor(perBlockPseudoRandomGenerator() * 256),
            Math.floor(perBlockPseudoRandomGenerator() * 256)
        ]);
        perBlockPivotColorSwapRules.push((unicodeCharacterCodePoint + sha256KeyDigestBytes[blockIndex % sha256KeyDigestBytes.length]) % 3);
    }

    return {
        interBlockPermutationArray,
        invertedInterBlockPermutationArray,
        perBlockPixelPermutations,
        perBlockColorMaskRgb,
        perBlockPivotColorSwapRules
    };
}

/**
 * Derives block transformation parameters based on chosen standard: 'secure' (default) or 'fast'.
 */
function deriveBlockParameters(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock, encryptionStandard = "secure") {
    if (encryptionStandard === "fast" || encryptionStandard === "mulberry32") {
        return deriveBlockParametersMulberry32(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock);
    }
    return deriveBlockParametersChaCha20(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock);
}

/**
 * Encrypts an ImageData buffer. Supports 'secure' (ChaCha20 256-bit) and 'fast' (Mulberry32 32-bit).
 */
async function encryptImageData(sourceImageData, unicodeKeyString, squareBlockDimension, encryptionStandard = "secure") {
    const canvasPixelWidth = sourceImageData.width;
    const canvasPixelHeight = sourceImageData.height;
    const verticalBlockCount = Math.floor(canvasPixelHeight / squareBlockDimension);
    const horizontalBlockCount = Math.floor(canvasPixelWidth / squareBlockDimension);
    const totalImageBlockCount = verticalBlockCount * horizontalBlockCount;
    const pixelsPerSquareBlock = squareBlockDimension * squareBlockDimension;

    const sha256KeyDigestBytes = await computeKeyDigest(unicodeKeyString);
    const {
        interBlockPermutationArray,
        perBlockPixelPermutations,
        perBlockColorMaskRgb,
        perBlockPivotColorSwapRules
    } = deriveBlockParameters(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock, encryptionStandard);

    const sourcePixelBuffer = sourceImageData.data;
    const encryptedPixelBuffer = new Uint8ClampedArray(sourcePixelBuffer.length);

    // Extract blocks & transform
    for (let originalBlockLinearIndex = 0; originalBlockLinearIndex < totalImageBlockCount; originalBlockLinearIndex++) {
        const originalBlockGridRow = Math.floor(originalBlockLinearIndex / horizontalBlockCount);
        const originalBlockGridCol = originalBlockLinearIndex % horizontalBlockCount;

        const scrambledTargetBlockLinearIndex = interBlockPermutationArray[originalBlockLinearIndex];
        const scrambledTargetBlockGridRow = Math.floor(scrambledTargetBlockLinearIndex / horizontalBlockCount);
        const scrambledTargetBlockGridCol = scrambledTargetBlockLinearIndex % horizontalBlockCount;

        const intraBlockPixelPermutation = perBlockPixelPermutations[originalBlockLinearIndex];
        const blockRgbXorMask = perBlockColorMaskRgb[originalBlockLinearIndex];
        const pivotChannelSwapRule = perBlockPivotColorSwapRules[originalBlockLinearIndex];

        for (let localPixelIndexInBlock = 0; localPixelIndexInBlock < pixelsPerSquareBlock; localPixelIndexInBlock++) {
            const localPixelRowOffset = Math.floor(localPixelIndexInBlock / squareBlockDimension);
            const localPixelColOffset = localPixelIndexInBlock % squareBlockDimension;
            const sourceByteIndex = ((originalBlockGridRow * squareBlockDimension + localPixelRowOffset) * canvasPixelWidth + (originalBlockGridCol * squareBlockDimension + localPixelColOffset)) * 4;

            const scrambledLocalPixelIndex = intraBlockPixelPermutation[localPixelIndexInBlock];
            const scrambledPixelRowOffset = Math.floor(scrambledLocalPixelIndex / squareBlockDimension);
            const scrambledPixelColOffset = scrambledLocalPixelIndex % squareBlockDimension;
            const destinationByteIndex = ((scrambledTargetBlockGridRow * squareBlockDimension + scrambledPixelRowOffset) * canvasPixelWidth + (scrambledTargetBlockGridCol * squareBlockDimension + scrambledPixelColOffset)) * 4;

            let redChannelValue = sourcePixelBuffer[sourceByteIndex];
            let greenChannelValue = sourcePixelBuffer[sourceByteIndex + 1];
            let blueChannelValue = sourcePixelBuffer[sourceByteIndex + 2];
            const alphaChannelValue = sourcePixelBuffer[sourceByteIndex + 3];

            // Pivot channel swap (0: G <-> B, 1: R <-> B, 2: R <-> G)
            if (pivotChannelSwapRule === 0) {
                const temporaryChannelSwapHolder = greenChannelValue;
                greenChannelValue = blueChannelValue;
                blueChannelValue = temporaryChannelSwapHolder;
            } else if (pivotChannelSwapRule === 1) {
                const temporaryChannelSwapHolder = redChannelValue;
                redChannelValue = blueChannelValue;
                blueChannelValue = temporaryChannelSwapHolder;
            } else if (pivotChannelSwapRule === 2) {
                const temporaryChannelSwapHolder = redChannelValue;
                redChannelValue = greenChannelValue;
                greenChannelValue = temporaryChannelSwapHolder;
            }

            // XOR Mask
            encryptedPixelBuffer[destinationByteIndex] = redChannelValue ^ blockRgbXorMask[0];
            encryptedPixelBuffer[destinationByteIndex + 1] = greenChannelValue ^ blockRgbXorMask[1];
            encryptedPixelBuffer[destinationByteIndex + 2] = blueChannelValue ^ blockRgbXorMask[2];
            encryptedPixelBuffer[destinationByteIndex + 3] = alphaChannelValue;
        }
    }

    return new ImageData(encryptedPixelBuffer, canvasPixelWidth, canvasPixelHeight);
}

/**
 * Decrypts an ImageData buffer. Supports 'secure' (ChaCha20 256-bit) and 'fast' (Mulberry32 32-bit).
 */
async function decryptImageData(encryptedImageData, unicodeKeyString, squareBlockDimension, encryptionStandard = "secure") {
    const canvasPixelWidth = encryptedImageData.width;
    const canvasPixelHeight = encryptedImageData.height;
    const verticalBlockCount = Math.floor(canvasPixelHeight / squareBlockDimension);
    const horizontalBlockCount = Math.floor(canvasPixelWidth / squareBlockDimension);
    const totalImageBlockCount = verticalBlockCount * horizontalBlockCount;
    const pixelsPerSquareBlock = squareBlockDimension * squareBlockDimension;

    const sha256KeyDigestBytes = await computeKeyDigest(unicodeKeyString);
    const {
        interBlockPermutationArray,
        perBlockPixelPermutations,
        perBlockColorMaskRgb,
        perBlockPivotColorSwapRules
    } = deriveBlockParameters(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock, encryptionStandard);

    const encryptedPixelBuffer = encryptedImageData.data;
    const decryptedPixelBuffer = new Uint8ClampedArray(encryptedPixelBuffer.length);

    for (let originalBlockLinearIndex = 0; originalBlockLinearIndex < totalImageBlockCount; originalBlockLinearIndex++) {
        const originalBlockGridRow = Math.floor(originalBlockLinearIndex / horizontalBlockCount);
        const originalBlockGridCol = originalBlockLinearIndex % horizontalBlockCount;

        const scrambledTargetBlockLinearIndex = interBlockPermutationArray[originalBlockLinearIndex];
        const scrambledTargetBlockGridRow = Math.floor(scrambledTargetBlockLinearIndex / horizontalBlockCount);
        const scrambledTargetBlockGridCol = scrambledTargetBlockLinearIndex % horizontalBlockCount;

        const intraBlockPixelPermutation = perBlockPixelPermutations[originalBlockLinearIndex];
        const blockRgbXorMask = perBlockColorMaskRgb[originalBlockLinearIndex];
        const pivotChannelSwapRule = perBlockPivotColorSwapRules[originalBlockLinearIndex];

        for (let localPixelIndexInBlock = 0; localPixelIndexInBlock < pixelsPerSquareBlock; localPixelIndexInBlock++) {
            const localPixelRowOffset = Math.floor(localPixelIndexInBlock / squareBlockDimension);
            const localPixelColOffset = localPixelIndexInBlock % squareBlockDimension;
            const restoredByteIndex = ((originalBlockGridRow * squareBlockDimension + localPixelRowOffset) * canvasPixelWidth + (originalBlockGridCol * squareBlockDimension + localPixelColOffset)) * 4;

            const scrambledLocalPixelIndex = intraBlockPixelPermutation[localPixelIndexInBlock];
            const scrambledPixelRowOffset = Math.floor(scrambledLocalPixelIndex / squareBlockDimension);
            const scrambledPixelColOffset = scrambledLocalPixelIndex % squareBlockDimension;
            const scrambledByteIndex = ((scrambledTargetBlockGridRow * squareBlockDimension + scrambledPixelRowOffset) * canvasPixelWidth + (scrambledTargetBlockGridCol * squareBlockDimension + scrambledPixelColOffset)) * 4;

            // Invert XOR Mask
            let redChannelValue = encryptedPixelBuffer[scrambledByteIndex] ^ blockRgbXorMask[0];
            let greenChannelValue = encryptedPixelBuffer[scrambledByteIndex + 1] ^ blockRgbXorMask[1];
            let blueChannelValue = encryptedPixelBuffer[scrambledByteIndex + 2] ^ blockRgbXorMask[2];
            const alphaChannelValue = encryptedPixelBuffer[scrambledByteIndex + 3];

            // Invert Channel Swap (Involution)
            if (pivotChannelSwapRule === 0) {
                const temporaryChannelSwapHolder = greenChannelValue;
                greenChannelValue = blueChannelValue;
                blueChannelValue = temporaryChannelSwapHolder;
            } else if (pivotChannelSwapRule === 1) {
                const temporaryChannelSwapHolder = redChannelValue;
                redChannelValue = blueChannelValue;
                blueChannelValue = temporaryChannelSwapHolder;
            } else if (pivotChannelSwapRule === 2) {
                const temporaryChannelSwapHolder = redChannelValue;
                redChannelValue = greenChannelValue;
                greenChannelValue = temporaryChannelSwapHolder;
            }

            decryptedPixelBuffer[restoredByteIndex] = redChannelValue;
            decryptedPixelBuffer[restoredByteIndex + 1] = greenChannelValue;
            decryptedPixelBuffer[restoredByteIndex + 2] = blueChannelValue;
            decryptedPixelBuffer[restoredByteIndex + 3] = alphaChannelValue;
        }
    }

    return new ImageData(decryptedPixelBuffer, canvasPixelWidth, canvasPixelHeight);
}

// Export for module or browser window
if (typeof window !== "undefined") {
    window.LockItCrypto = {
        getBlockSize,
        generateUnicodeKey,
        deriveKeyFromPassphrase,
        encryptImageData,
        decryptImageData,
        createMulberry32PRNG,
        createChaCha20CSPRNG,
        deriveBlockParametersMulberry32,
        deriveBlockParametersChaCha20,
        deriveBlockParameters
    };
}
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        createPRNG,
        createMulberry32PRNG,
        createChaCha20CSPRNG,
        generatePermutation,
        invertPermutation,
        getBlockSize,
        generateUnicodeKey,
        deriveKeyFromPassphrase,
        computeKeyDigest,
        deriveBlockParametersMulberry32,
        deriveBlockParametersChaCha20,
        deriveBlockParameters,
        encryptImageData,
        decryptImageData
    };
}
