/**
 * Lock-It Web Application Controller
 * Made by Momin Aftab
 * Strict Two-Session Architecture: Encrypt and Decrypt are completely isolated.
 * Images, keys, specs, and canvases do NOT carry over between modes.
 */

document.addEventListener("DOMContentLoaded", () => {
    // UI Elements
    const tabEncrypt = document.getElementById("tabEncrypt");
    const tabDecrypt = document.getElementById("tabDecrypt");

    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");

    const imageSpecs = document.getElementById("imageSpecs");
    const specDimensions = document.getElementById("specDimensions");
    const specBlockSize = document.getElementById("specBlockSize");
    const specTotalBlocks = document.getElementById("specTotalBlocks");

    const radioUnicode = document.getElementById("radioUnicode");
    const radioPass = document.getElementById("radioPass");
    const keyInput = document.getElementById("keyInput");
    const btnToggleMask = document.getElementById("btnToggleMask");
    const keyCharCount = document.getElementById("keyCharCount");
    const btnGenerateKey = document.getElementById("btnGenerateKey");
    const btnCopyKey = document.getElementById("btnCopyKey");
    const copyIcon = document.getElementById("copyIcon");
    const copyText = document.getElementById("copyText");

    const btnAction = document.getElementById("btnAction");
    const btnActionIcon = document.getElementById("btnActionIcon");
    const btnActionText = document.getElementById("btnActionText");

    const btnViewTransformed = document.getElementById("btnViewTransformed");
    const btnViewOriginal = document.getElementById("btnViewOriginal");
    const chkGrid = document.getElementById("chkGrid");

    const emptyNotice = document.getElementById("emptyNotice");
    const mainCanvas = document.getElementById("mainCanvas");
    const overlayCanvas = document.getElementById("overlayCanvas");
    const mainCanvasRenderingContext = mainCanvas.getContext("2d");
    const overlayCanvasRenderingContext = overlayCanvas.getContext("2d");

    const btnDownloadWebP = document.getElementById("btnDownloadWebP");
    const btnDownloadPNG = document.getElementById("btnDownloadPNG");

    const statusMain = document.getElementById("statusMain");
    const statusGrid = document.getElementById("statusGrid");
    const statusSpeed = document.getElementById("statusSpeed");
    const modernToast = document.getElementById("modernToast");
    const toastMessage = document.getElementById("toastMessage");

    // Factory for completely isolated session state
    function createSessionState(targetSessionMode) {
        return {
            sessionMode: targetSessionMode, // 'encrypt' or 'decrypt'
            keyInputMode: "unicode",        // 'unicode' or 'passphrase'
            keyStringValue: "",
            derivedKeyString: null,
            isKeyMaskedWithPasswordBullets: true,
            imageFileName: null,
            originalImageElement: null,
            originalImageData: null,
            transformedImageData: null,
            squareBlockDimension: 30,
            fittedImageWidth: 0,
            fittedImageHeight: 0,
            rawImageWidth: 0,
            rawImageHeight: 0,
            totalGridBlocks: 0,
            activeDisplayView: "transformed",
            isGridOverlayVisible: false,
            statusMessage: `Session: ${targetSessionMode.toUpperCase()} (Ready)`,
            gridSpecificationMessage: "Grid: —",
            executionSpeedMessage: "Speed: —"
        };
    }

    // Two independent sessions
    const isolatedApplicationSessions = {
        encrypt: createSessionState("encrypt"),
        decrypt: createSessionState("decrypt")
    };

    let currentlyActiveSessionMode = "encrypt";

    function getActiveSession() {
        return isolatedApplicationSessions[currentlyActiveSessionMode];
    }

    // Modern Toast Notification
    function showNotificationToast(displayMessageText, iconBadgeCharacter = "✓") {
        toastMessage.textContent = displayMessageText;
        modernToast.querySelector(".toast-icon").textContent = iconBadgeCharacter;
        modernToast.classList.add("show");
        clearTimeout(modernToast._activeNotificationTimer);
        modernToast._activeNotificationTimer = setTimeout(() => {
            modernToast.classList.remove("show");
        }, 3000);
    }

    // Save active DOM inputs to the currently active session
    function syncDOMToCurrentSession() {
        const activeSession = getActiveSession();
        activeSession.keyStringValue = keyInput.value;
        activeSession.isKeyMaskedWithPasswordBullets = (keyInput.type === "password");
        activeSession.isGridOverlayVisible = chkGrid.checked;
    }

    // Restore a session's state into the DOM
    function renderSessionToDOM() {
        const activeSession = getActiveSession();

        // 1. Tab buttons
        tabEncrypt.classList.toggle("active", currentlyActiveSessionMode === "encrypt");
        tabDecrypt.classList.toggle("active", currentlyActiveSessionMode === "decrypt");

        // 2. Action CTA button label & icon
        if (currentlyActiveSessionMode === "encrypt") {
            btnActionIcon.textContent = "🔒";
            btnActionText.textContent = "Run Photo Encryption";
            btnGenerateKey.innerHTML = "🎲 New Key";
            btnGenerateKey.title = "Generate a fresh key on the spot";
            keyInput.placeholder = "Tap 'New Key' or enter key...";
        } else {
            btnActionIcon.textContent = "🔓";
            btnActionText.textContent = "Run Photo Decryption";
            btnGenerateKey.innerHTML = "📋 Paste Key";
            btnGenerateKey.title = "Paste key directly from clipboard";
            keyInput.placeholder = "Paste the key to restore photo...";
        }

        // 3. Radio buttons & Key Mode
        radioUnicode.checked = (activeSession.keyInputMode === "unicode");
        radioPass.checked = (activeSession.keyInputMode === "passphrase");
        btnGenerateKey.disabled = (activeSession.keyInputMode === "passphrase" && currentlyActiveSessionMode === "encrypt");

        // 4. Key Input value & masking
        keyInput.value = activeSession.keyStringValue || "";
        keyInput.type = activeSession.isKeyMaskedWithPasswordBullets ? "password" : "text";
        btnToggleMask.textContent = activeSession.isKeyMaskedWithPasswordBullets ? "👁️" : "🙈";
        btnToggleMask.title = activeSession.isKeyMaskedWithPasswordBullets ? "Show Key" : "Hide Key";
        updateKeyCounterDisplay();

        // 5. Specs Table
        if (activeSession.originalImageData) {
            imageSpecs.style.display = "table";
            const isDimensionFitted = (activeSession.fittedImageWidth !== activeSession.rawImageWidth || activeSession.fittedImageHeight !== activeSession.rawImageHeight);
            specDimensions.textContent = `${activeSession.fittedImageWidth} × ${activeSession.fittedImageHeight} px` + 
                (isDimensionFitted ? ` (fitted from ${activeSession.rawImageWidth}×${activeSession.rawImageHeight})` : "");
            specBlockSize.textContent = `${activeSession.squareBlockDimension} × ${activeSession.squareBlockDimension} px`;
            const verticalBlockCount = activeSession.fittedImageHeight / activeSession.squareBlockDimension;
            const horizontalBlockCount = activeSession.fittedImageWidth / activeSession.squareBlockDimension;
            specTotalBlocks.textContent = `${activeSession.totalGridBlocks} blocks (${verticalBlockCount}×${horizontalBlockCount})`;
        } else {
            imageSpecs.style.display = "none";
            specDimensions.textContent = "—";
            specBlockSize.textContent = "—";
            specTotalBlocks.textContent = "—";
        }

        // 6. Canvas Viewport
        if (activeSession.originalImageData) {
            emptyNotice.style.display = "none";
            mainCanvas.style.display = "block";
            mainCanvas.width = activeSession.fittedImageWidth;
            mainCanvas.height = activeSession.fittedImageHeight;
            overlayCanvas.width = activeSession.fittedImageWidth;
            overlayCanvas.height = activeSession.fittedImageHeight;

            const targetRenderImageData = (activeSession.activeDisplayView === "transformed" && activeSession.transformedImageData) 
                ? activeSession.transformedImageData 
                : activeSession.originalImageData;
            mainCanvasRenderingContext.putImageData(targetRenderImageData, 0, 0);

            btnViewTransformed.style.background = (activeSession.activeDisplayView === "transformed") ? "#ffffff" : "";
            btnViewOriginal.style.background = (activeSession.activeDisplayView === "original") ? "#ffffff" : "";
        } else {
            emptyNotice.style.display = "block";
            mainCanvas.style.display = "none";
            overlayCanvas.style.display = "none";
            mainCanvasRenderingContext.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
            overlayCanvasRenderingContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        // 7. Grid Overlay Checkbox
        chkGrid.checked = activeSession.isGridOverlayVisible;
        renderGridOverlay();

        // 8. Download Buttons
        const hasTransformedResult = !!activeSession.transformedImageData;
        btnDownloadWebP.disabled = !hasTransformedResult;
        btnDownloadPNG.disabled = !hasTransformedResult;

        // 9. Status Bar
        statusMain.textContent = activeSession.statusMessage;
        statusGrid.textContent = activeSession.gridSpecificationMessage;
        statusSpeed.textContent = activeSession.executionSpeedMessage;

        updateActionExecutionState();
    }

    // Switch between Encrypt and Decrypt tabs
    function switchActiveSessionMode(newSessionMode) {
        if (currentlyActiveSessionMode === newSessionMode) return;
        syncDOMToCurrentSession();
        currentlyActiveSessionMode = newSessionMode;
        renderSessionToDOM();
        showNotificationToast(`Switched to ${newSessionMode.toUpperCase()} session (clean workspace)`, newSessionMode === "encrypt" ? "🔒" : "🔓");
    }

    tabEncrypt.addEventListener("click", () => switchActiveSessionMode("encrypt"));
    tabDecrypt.addEventListener("click", () => switchActiveSessionMode("decrypt"));

    // Key Type Radio (Unicode vs Passphrase)
    radioUnicode.addEventListener("change", () => {
        const activeSession = getActiveSession();
        activeSession.keyInputMode = "unicode";
        btnGenerateKey.disabled = false;
        renderSessionToDOM();
    });

    radioPass.addEventListener("change", () => {
        const activeSession = getActiveSession();
        activeSession.keyInputMode = "passphrase";
        if (currentlyActiveSessionMode === "encrypt") btnGenerateKey.disabled = true;
        renderSessionToDOM();
    });

    // Toggle Password Masking (Show / Hide Key)
    btnToggleMask.addEventListener("click", () => {
        const activeSession = getActiveSession();
        activeSession.isKeyMaskedWithPasswordBullets = !activeSession.isKeyMaskedWithPasswordBullets;
        keyInput.type = activeSession.isKeyMaskedWithPasswordBullets ? "password" : "text";
        btnToggleMask.textContent = activeSession.isKeyMaskedWithPasswordBullets ? "👁️" : "🙈";
        btnToggleMask.title = activeSession.isKeyMaskedWithPasswordBullets ? "Show Key" : "Hide Key";
    });

    // Generate / Paste Key button
    btnGenerateKey.addEventListener("click", async () => {
        const activeSession = getActiveSession();
        if (currentlyActiveSessionMode === "encrypt") {
            // Generate on the spot
            if (activeSession.totalGridBlocks <= 0) {
                showNotificationToast("Load a photo first to match key size!", "🖼️");
                return;
            }
            const newlyGeneratedUnicodeKey = LockItCrypto.generateUnicodeKey(activeSession.totalGridBlocks);
            activeSession.keyStringValue = newlyGeneratedUnicodeKey;
            activeSession.isKeyMaskedWithPasswordBullets = true;
            keyInput.value = newlyGeneratedUnicodeKey;
            keyInput.type = "password";
            btnToggleMask.textContent = "👁️";
            updateKeyCounterDisplay();
            updateActionExecutionState();
            showNotificationToast("New key generated on the spot (masked like password)!", "🎲");
        } else {
            // Decrypt mode: Quick paste from clipboard
            try {
                const clipboardPastedText = await navigator.clipboard.readText();
                if (clipboardPastedText) {
                    activeSession.keyStringValue = clipboardPastedText;
                    keyInput.value = clipboardPastedText;
                    updateKeyCounterDisplay();
                    updateActionExecutionState();
                    showNotificationToast("Pasted key from clipboard!", "📋");
                }
            } catch {
                keyInput.focus();
                showNotificationToast("Clipboard access denied. Please paste manually into the key field.", "⚠️");
            }
        }
    });

    // Update key counter
    function updateKeyCounterDisplay() {
        const activeSession = getActiveSession();
        const currentUnicodeCharacterCount = Array.from(keyInput.value).length;
        keyCharCount.textContent = `${currentUnicodeCharacterCount} chars` + (activeSession.totalGridBlocks ? ` / ${activeSession.totalGridBlocks}` : "");
        updateActionExecutionState();
    }

    keyInput.addEventListener("input", async () => {
        const activeSession = getActiveSession();
        activeSession.keyStringValue = keyInput.value;
        if (activeSession.keyInputMode === "passphrase" && activeSession.totalGridBlocks > 0) {
            const enteredPassphraseString = keyInput.value.trim();
            if (enteredPassphraseString) {
                activeSession.derivedKeyString = await LockItCrypto.deriveKeyFromPassphrase(enteredPassphraseString, activeSession.totalGridBlocks);
            }
        }
        updateKeyCounterDisplay();
    });

    // Modern Copy Key Experience
    btnCopyKey.addEventListener("click", async () => {
        const activeSession = getActiveSession();
        const keyTextToCopyToClipboard = (activeSession.keyInputMode === "passphrase" && activeSession.derivedKeyString) 
            ? activeSession.derivedKeyString 
            : (activeSession.keyStringValue || keyInput.value);
            
        if (!keyTextToCopyToClipboard) {
            showNotificationToast("No key to copy!", "⚠️");
            return;
        }

        try {
            await navigator.clipboard.writeText(keyTextToCopyToClipboard);
        } catch {
            const previousInputType = keyInput.type;
            keyInput.type = "text";
            keyInput.select();
            document.execCommand("copy");
            keyInput.type = previousInputType;
        }

        btnCopyKey.classList.add("copied");
        copyIcon.textContent = "✓";
        copyText.textContent = "Copied!";
        showNotificationToast(`Copied ${Array.from(keyTextToCopyToClipboard).length}-character key to clipboard!`, "📋");

        setTimeout(() => {
            btnCopyKey.classList.remove("copied");
            copyIcon.textContent = "📋";
            copyText.textContent = "Copy Key";
        }, 2200);
    });

    // Update Action Button State
    function updateActionExecutionState() {
        const activeSession = getActiveSession();
        const hasLoadedImage = !!activeSession.originalImageData;
        const hasValidKey = keyInput.value.trim().length > 0 || (activeSession.keyInputMode === "passphrase" && !!activeSession.derivedKeyString);
        btnAction.disabled = !(hasLoadedImage && hasValidKey);
    }

    // Helper to load an external script dynamically on demand (zero project file footprint)
    function loadExternalScriptOnDemand(scriptSourceUrl) {
        return new Promise((resolvePromise, rejectPromise) => {
            const existingScriptTag = document.querySelector(`script[src="${scriptSourceUrl}"]`);
            if (existingScriptTag) {
                resolvePromise();
                return;
            }
            const newlyCreatedScriptTag = document.createElement("script");
            newlyCreatedScriptTag.src = scriptSourceUrl;
            newlyCreatedScriptTag.onload = () => resolvePromise();
            newlyCreatedScriptTag.onerror = (scriptLoadingError) => rejectPromise(scriptLoadingError);
            document.head.appendChild(newlyCreatedScriptTag);
        });
    }

    // Process uploaded file into CURRENT session only with HEIC/HEIF support
    async function handleUploadedImageFile(selectedImageFile) {
        if (!selectedImageFile) return;

        const uploadedFileNameLower = (selectedImageFile.name || "").toLowerCase();
        const isHeicOrHeifFormat = uploadedFileNameLower.endsWith(".heic") || 
                                   uploadedFileNameLower.endsWith(".heif") || 
                                   selectedImageFile.type === "image/heic" || 
                                   selectedImageFile.type === "image/heif";

        const isValidImageFile = (selectedImageFile.type && selectedImageFile.type.startsWith("image/")) || isHeicOrHeifFormat;
        if (!isValidImageFile) return;

        // 1. Attempt native browser decoding (Safari, iOS, macOS, or systems with HEIF codecs)
        if (typeof createImageBitmap === "function") {
            try {
                const nativeDecodedImageBitmap = await createImageBitmap(selectedImageFile);
                setupImageForCurrentSession(nativeDecodedImageBitmap, selectedImageFile.name);
                return;
            } catch (nativeBitmapDecodingError) {
                // If native decoding failed, proceed to format-specific fallback
            }
        }

        // 2. If it is a HEIC file and native decoding failed, load on-demand decoder
        if (isHeicOrHeifFormat) {
            showNotificationToast("Decoding HEIC photo client-side...", "⏳");
            try {
                if (typeof window.heic2any !== "function") {
                    await loadExternalScriptOnDemand("https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js");
                }
                const convertedPngBlob = await window.heic2any({
                    blob: selectedImageFile,
                    toType: "image/png"
                });
                const singlePngBlob = Array.isArray(convertedPngBlob) ? convertedPngBlob[0] : convertedPngBlob;
                const convertedImageBitmap = await createImageBitmap(singlePngBlob);
                setupImageForCurrentSession(convertedImageBitmap, selectedImageFile.name);
                return;
            } catch (heicProcessingError) {
                console.error("HEIC decoding error:", heicProcessingError);
                showNotificationToast("Could not decode HEIC file on this browser.", "⚠️");
                return;
            }
        }

        // 3. Standard web image fallback via FileReader
        const fileReader = new FileReader();
        fileReader.onload = (fileReaderEvent) => {
            const loadedHtmlImage = new Image();
            loadedHtmlImage.onload = () => setupImageForCurrentSession(loadedHtmlImage, selectedImageFile.name);
            loadedHtmlImage.src = fileReaderEvent.target.result;
        };
        fileReader.readAsDataURL(selectedImageFile);
    }

    // Setup loaded image into CURRENT session
    function setupImageForCurrentSession(drawableImageSource, sourceFileName = "Photo") {
        const activeSession = getActiveSession();
        activeSession.imageFileName = sourceFileName;
        activeSession.originalImageElement = drawableImageSource;
        activeSession.rawImageWidth = drawableImageSource.naturalWidth || drawableImageSource.width;
        activeSession.rawImageHeight = drawableImageSource.naturalHeight || drawableImageSource.height;

        // Calculate optimal square block size
        const calculatedOptimalBlockSize = LockItCrypto.getBlockSize(activeSession.rawImageHeight, activeSession.rawImageWidth);
        activeSession.squareBlockDimension = calculatedOptimalBlockSize;

        // Clean fit to multiple of block size
        activeSession.fittedImageWidth = Math.floor(activeSession.rawImageWidth / calculatedOptimalBlockSize) * calculatedOptimalBlockSize;
        activeSession.fittedImageHeight = Math.floor(activeSession.rawImageHeight / calculatedOptimalBlockSize) * calculatedOptimalBlockSize;
        activeSession.totalGridBlocks = (activeSession.fittedImageHeight / calculatedOptimalBlockSize) * (activeSession.fittedImageWidth / calculatedOptimalBlockSize);

        // Offscreen canvas to capture clean ImageData
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = activeSession.fittedImageWidth;
        offscreenCanvas.height = activeSession.fittedImageHeight;
        const offscreenCanvasContext = offscreenCanvas.getContext("2d");
        offscreenCanvasContext.drawImage(
            drawableImageSource, 
            0, 0, activeSession.fittedImageWidth, activeSession.fittedImageHeight, 
            0, 0, activeSession.fittedImageWidth, activeSession.fittedImageHeight
        );

        activeSession.originalImageData = offscreenCanvasContext.getImageData(0, 0, activeSession.fittedImageWidth, activeSession.fittedImageHeight);
        activeSession.transformedImageData = null;
        activeSession.activeDisplayView = "transformed";

        activeSession.statusMessage = `Loaded: ${sourceFileName} in ${currentlyActiveSessionMode.toUpperCase()}`;
        const verticalBlockCount = activeSession.fittedImageHeight / calculatedOptimalBlockSize;
        const horizontalBlockCount = activeSession.fittedImageWidth / calculatedOptimalBlockSize;
        activeSession.gridSpecificationMessage = `Grid: ${verticalBlockCount}x${horizontalBlockCount} (${activeSession.totalGridBlocks} blks)`;
        activeSession.executionSpeedMessage = "Speed: —";

        // If in Encrypt mode and no key exists, auto-generate fresh key
        if (currentlyActiveSessionMode === "encrypt" && !activeSession.keyStringValue) {
            activeSession.keyStringValue = LockItCrypto.generateUnicodeKey(activeSession.totalGridBlocks);
            activeSession.isKeyMaskedWithPasswordBullets = true;
        }

        renderSessionToDOM();
        showNotificationToast(`Loaded ${sourceFileName} (${activeSession.fittedImageWidth}×${activeSession.fittedImageHeight} px, ${activeSession.totalGridBlocks} blocks)`, "🖼️");
    }


    // Drag and Drop
    dropzone.addEventListener("dragover", (dragEvent) => {
        dragEvent.preventDefault();
        dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (dropEvent) => {
        dropEvent.preventDefault();
        dropzone.classList.remove("dragover");
        if (dropEvent.dataTransfer.files && dropEvent.dataTransfer.files[0]) {
            handleUploadedImageFile(dropEvent.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener("change", (fileChangeEvent) => {
        if (fileChangeEvent.target.files && fileChangeEvent.target.files[0]) {
            handleUploadedImageFile(fileChangeEvent.target.files[0]);
        }
        fileInput.value = "";
    });

    // Grid Overlay
    function renderGridOverlay() {
        const activeSession = getActiveSession();
        if (!chkGrid.checked || !activeSession.originalImageData) {
            overlayCanvas.style.display = "none";
            return;
        }

        overlayCanvas.style.display = "block";
        const canvasPixelWidth = activeSession.fittedImageWidth;
        const canvasPixelHeight = activeSession.fittedImageHeight;
        const squareBlockPixelDimension = activeSession.squareBlockDimension;

        overlayCanvasRenderingContext.clearRect(0, 0, canvasPixelWidth, canvasPixelHeight);
        overlayCanvasRenderingContext.strokeStyle = "rgba(0, 255, 255, 0.4)";
        overlayCanvasRenderingContext.lineWidth = 1;

        overlayCanvasRenderingContext.beginPath();
        for (let verticalLineX = squareBlockPixelDimension; verticalLineX < canvasPixelWidth; verticalLineX += squareBlockPixelDimension) {
            overlayCanvasRenderingContext.moveTo(verticalLineX, 0);
            overlayCanvasRenderingContext.lineTo(verticalLineX, canvasPixelHeight);
        }
        for (let horizontalLineY = squareBlockPixelDimension; horizontalLineY < canvasPixelHeight; horizontalLineY += squareBlockPixelDimension) {
            overlayCanvasRenderingContext.moveTo(0, horizontalLineY);
            overlayCanvasRenderingContext.lineTo(canvasPixelWidth, horizontalLineY);
        }
        overlayCanvasRenderingContext.stroke();
    }

    chkGrid.addEventListener("change", () => {
        const activeSession = getActiveSession();
        activeSession.isGridOverlayVisible = chkGrid.checked;
        renderGridOverlay();
    });

    // View Switching (Result vs Original)
    btnViewTransformed.addEventListener("click", () => {
        const activeSession = getActiveSession();
        if (!activeSession.transformedImageData) return;
        activeSession.activeDisplayView = "transformed";
        btnViewTransformed.style.background = "#ffffff";
        btnViewOriginal.style.background = "";
        mainCanvasRenderingContext.putImageData(activeSession.transformedImageData, 0, 0);
    });

    btnViewOriginal.addEventListener("click", () => {
        const activeSession = getActiveSession();
        if (!activeSession.originalImageData) return;
        activeSession.activeDisplayView = "original";
        btnViewOriginal.style.background = "#ffffff";
        btnViewTransformed.style.background = "";
        mainCanvasRenderingContext.putImageData(activeSession.originalImageData, 0, 0);
    });

    // Execute Crypto for CURRENT session
    async function executeCryptographicOperation() {
        const activeSession = getActiveSession();
        if (!activeSession.originalImageData) return;

        let activeCryptographicKeyString;
        if (activeSession.keyInputMode === "passphrase") {
            const enteredPassphraseString = keyInput.value.trim();
            activeCryptographicKeyString = await LockItCrypto.deriveKeyFromPassphrase(enteredPassphraseString, activeSession.totalGridBlocks);
        } else {
            activeCryptographicKeyString = keyInput.value.trim();
        }

        if (!activeCryptographicKeyString) {
            showNotificationToast("Please enter an encryption key", "⚠️");
            return;
        }

        btnAction.disabled = true;
        btnActionText.textContent = "Processing...";
        statusMain.textContent = `Computing ${currentlyActiveSessionMode.toUpperCase()} client-side...`;

        // Small asynchronous pause to allow DOM repaint
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));

        const cryptographicStartTimeMilliseconds = performance.now();
        let transformedImageDataResult;

        if (currentlyActiveSessionMode === "encrypt") {
            transformedImageDataResult = await LockItCrypto.encryptImageData(
                activeSession.originalImageData, 
                activeCryptographicKeyString, 
                activeSession.squareBlockDimension
            );
        } else {
            transformedImageDataResult = await LockItCrypto.decryptImageData(
                activeSession.originalImageData, 
                activeCryptographicKeyString, 
                activeSession.squareBlockDimension
            );
        }

        const cryptographicElapsedMilliseconds = (performance.now() - cryptographicStartTimeMilliseconds).toFixed(1);

        activeSession.transformedImageData = transformedImageDataResult;
        activeSession.activeDisplayView = "transformed";
        mainCanvasRenderingContext.putImageData(transformedImageDataResult, 0, 0);

        btnViewTransformed.style.background = "#ffffff";
        btnViewOriginal.style.background = "";

        btnAction.disabled = false;
        btnActionText.textContent = (currentlyActiveSessionMode === "encrypt") ? "Run Photo Encryption" : "Run Photo Decryption";

        const completedActionVerb = (currentlyActiveSessionMode === "encrypt") ? "Encrypted" : "Decrypted";
        activeSession.statusMessage = `${completedActionVerb} ${activeSession.totalGridBlocks} blocks (100% Lossless)`;
        activeSession.executionSpeedMessage = `Speed: ${cryptographicElapsedMilliseconds}ms`;

        statusMain.textContent = activeSession.statusMessage;
        statusSpeed.textContent = activeSession.executionSpeedMessage;

        btnDownloadWebP.disabled = false;
        btnDownloadPNG.disabled = false;

        showNotificationToast(`${completedActionVerb} in ${cryptographicElapsedMilliseconds}ms!`, "⚡");
    }

    btnAction.addEventListener("click", () => executeCryptographicOperation());

    // Modern Downloads for CURRENT session
    btnDownloadWebP.addEventListener("click", () => {
        const activeSession = getActiveSession();
        if (!mainCanvas || !activeSession.transformedImageData) return;
        btnDownloadWebP.textContent = "⏳ Preparing WebP...";
        mainCanvas.toBlob((exportedImageBlob) => {
            const blobObjectUrl = URL.createObjectURL(exportedImageBlob);
            const temporaryDownloadAnchor = document.createElement("a");
            temporaryDownloadAnchor.href = blobObjectUrl;
            temporaryDownloadAnchor.download = `LockIt_${currentlyActiveSessionMode}_${Date.now()}.webp`;
            temporaryDownloadAnchor.click();
            URL.revokeObjectURL(blobObjectUrl);
            btnDownloadWebP.innerHTML = "<span>💾</span> Download Lossless WebP";
            showNotificationToast(`Downloaded ${currentlyActiveSessionMode} WebP photo!`, "💾");
        }, "image/webp", 1.0);
    });

    btnDownloadPNG.addEventListener("click", () => {
        const activeSession = getActiveSession();
        if (!mainCanvas || !activeSession.transformedImageData) return;
        btnDownloadPNG.textContent = "⏳ Preparing PNG...";
        mainCanvas.toBlob((exportedImageBlob) => {
            const blobObjectUrl = URL.createObjectURL(exportedImageBlob);
            const temporaryDownloadAnchor = document.createElement("a");
            temporaryDownloadAnchor.href = blobObjectUrl;
            temporaryDownloadAnchor.download = `LockIt_${currentlyActiveSessionMode}_${Date.now()}.png`;
            temporaryDownloadAnchor.click();
            URL.revokeObjectURL(blobObjectUrl);
            btnDownloadPNG.innerHTML = "<span>🖼️</span> Download PNG";
            showNotificationToast(`Downloaded ${currentlyActiveSessionMode} PNG photo!`, "🖼️");
        }, "image/png");
    });

    // Initialize first view
    renderSessionToDOM();
});
