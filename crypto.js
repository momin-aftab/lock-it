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

// Deterministic 32-bit PRNG (Mulberry32)
function createPRNG(initialSeedValue) {
    let internalSeedState = initialSeedValue >>> 0;
    return function generateNextRandomFloat() {
        internalSeedState = (internalSeedState + 0x6D2B79F5) >>> 0;
        let mixedIntermediateValue = Math.imul(internalSeedState ^ (internalSeedState >>> 15), 1 | internalSeedState);
        mixedIntermediateValue = (mixedIntermediateValue + Math.imul(mixedIntermediateValue ^ (mixedIntermediateValue >>> 7), 61 | mixedIntermediateValue)) ^ mixedIntermediateValue;
        return ((mixedIntermediateValue ^ (mixedIntermediateValue >>> 14)) >>> 0) / 4294967296;
    };
}

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
 * Derives block transformation parameters.
 */
function deriveBlockParameters(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock) {
    const digestDataView = new DataView(sha256KeyDigestBytes.buffer);
    const masterGlobalSeed32Bit = digestDataView.getUint32(0, false);

    // Expand key to match totalImageBlockCount
    const expandedUnicodeCodePoints = [];
    const unicodeCharacterArray = Array.from(unicodeKeyString);
    for (let blockIndex = 0; blockIndex < totalImageBlockCount; blockIndex++) {
        expandedUnicodeCodePoints.push(unicodeCharacterArray[blockIndex % unicodeCharacterArray.length].codePointAt(0));
    }

    // Inter-block permutation
    const masterPseudoRandomGenerator = createPRNG(masterGlobalSeed32Bit);
    const interBlockPermutationArray = generatePermutation(totalImageBlockCount, masterPseudoRandomGenerator);
    const invertedInterBlockPermutationArray = invertPermutation(interBlockPermutationArray);

    // Per-block parameters
    const perBlockPixelPermutations = [];
    const perBlockColorMaskRgb = [];
    const perBlockPivotColorSwapRules = [];

    for (let blockIndex = 0; blockIndex < totalImageBlockCount; blockIndex++) {
        const unicodeCharacterCodePoint = expandedUnicodeCodePoints[blockIndex];
        const uniquePerBlockSeed = (masterGlobalSeed32Bit ^ (unicodeCharacterCodePoint * 1000003 + blockIndex * 2654435761)) >>> 0;
        const perBlockPseudoRandomGenerator = createPRNG(uniquePerBlockSeed);

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
 * Encrypts an ImageData buffer.
 */
async function encryptImageData(sourceImageData, unicodeKeyString, squareBlockDimension) {
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
    } = deriveBlockParameters(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock);

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
 * Decrypts an ImageData buffer.
 */
async function decryptImageData(encryptedImageData, unicodeKeyString, squareBlockDimension) {
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
    } = deriveBlockParameters(unicodeKeyString, sha256KeyDigestBytes, totalImageBlockCount, pixelsPerSquareBlock);

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
        decryptImageData
    };
}
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        createPRNG,
        generatePermutation,
        invertPermutation,
        getBlockSize,
        generateUnicodeKey,
        deriveKeyFromPassphrase,
        computeKeyDigest,
        deriveBlockParameters,
        encryptImageData,
        decryptImageData
    };
}
