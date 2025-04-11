// ============================================================================
// BubbleTranslate - Content Script
// Author: jdluu
// Version: 1.1.0
// Description: Finds images, sends them for processing, and displays
//              translations or errors as overlays on the webpage.
// ============================================================================

"use strict"; // Enforce stricter parsing and error handling

console.log("BubbleTranslate: Content Script Loaded!");

// --- Constants ---
const MIN_IMG_WIDTH = 300; // Minimum width for an image to be considered
const MIN_IMG_HEIGHT = 400; // Minimum height for an image to be considered
const WRAPPER_CLASS = "bubbletranslate-wrapper";
const OVERLAY_CLASS = "bubbletranslate-overlay";
const ERROR_OVERLAY_CLASS = "bubbletranslate-error-overlay";
const UNIQUE_ID_ATTR = "data-bubbletranslate-id"; // Attribute to uniquely identify processed images

// --- Globals ---
let overlayStyles = {
	fontSize: "14px",
	textColor: "#FFFFFF",
	backgroundColor: "rgba(0, 0, 0, 0.75)",
	zIndex: "9998", // Default z-index for overlays
};
let uniqueIdCounter = 0; // Simple counter for generating unique IDs

// ============================================================================
// Initial Setup & Style Management
// ============================================================================

/**
 * Loads style settings from local storage, updating the global overlayStyles.
 */
function loadStyleSettings() {
	chrome.storage.local.get(
		{
			// Defaults matching options page AND global object
			fontSize: "14",
			textColor: "#FFFFFF",
			bgColor: "rgba(0, 0, 0, 0.75)",
			zIndex: "9998", // Load zIndex from storage
		},
		(items) => {
			if (chrome.runtime.lastError) {
				console.error(
					"BubbleTranslate: Error loading style settings:",
					chrome.runtime.lastError.message
				);
				return; // Keep existing defaults if loading fails
			}
			// Update global styles object, ensuring units/format
			overlayStyles.fontSize = items.fontSize + "px";
			overlayStyles.textColor = items.textColor;
			overlayStyles.backgroundColor = items.bgColor;
			overlayStyles.zIndex = items.zIndex || "9998"; // Fallback just in case
			console.log("BubbleTranslate: Style settings loaded:", overlayStyles);
		}
	);
}

// Load settings immediately when the script is injected.
loadStyleSettings();

// Listen for changes in storage to update styles dynamically (optional but good practice)
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === "local") {
		// Check if any of our relevant style settings changed
		if (
			changes.fontSize ||
			changes.textColor ||
			changes.bgColor ||
			changes.zIndex
		) {
			console.log(
				"BubbleTranslate: Detected style changes in storage, reloading."
			);
			loadStyleSettings(); // Reload styles
		}
	}
});

// ============================================================================
// Message Handling (from Background Script)
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Ignore messages not from the extension background script
	if (!sender.tab) {
		console.log("BubbleTranslate: Received message:", message);
		switch (message.action) {
			case "triggerPageAnalysis":
				// Reload styles just before analysis, ensuring freshness
				loadStyleSettings();
				handlePageAnalysis(sendResponse);
				return true; // Indicate async response (from handlePageAnalysis)

			case "displayBlockTranslation":
				if (message.imageId && message.translatedText && message.boundingBox) {
					displayBlockOverlay(
						message.imageId,
						message.translatedText,
						message.boundingBox,
						overlayStyles // Pass current styles
					);
				} else {
					console.warn(
						"BubbleTranslate: Missing data for displayBlockTranslation:",
						message
					);
				}
				return false; // No response needed

			case "translationError":
				if (message.imageId && message.error) {
					displayErrorOverlay(
						message.imageId,
						message.error,
						message.boundingBox, // May be null if error happened before detection
						overlayStyles // Pass current styles
					);
				} else {
					console.warn(
						"BubbleTranslate: Missing data for translationError:",
						message
					);
				}
				return false; // No response needed

			default:
				console.log(
					`BubbleTranslate: Received unknown action: ${message.action}`
				);
				return false; // No response needed
		}
	}
	// If message is from a tab (another content script?), ignore it.
	// You might add more robust sender verification if needed.
	return false;
});

// ============================================================================
// Core Logic - Page Analysis & Image Processing Trigger
// ============================================================================

/**
 * Finds eligible images, assigns unique IDs, and sends them to the background script.
 * Responds to the initial trigger message indicating start or error.
 * @param {function} sendResponse - Function to send response back to the background script.
 */
function handlePageAnalysis(sendResponse) {
	let imagesFoundCount = 0;
	let imagesSentCount = 0;
	let pageAnalysisError = null;

	try {
		const images = findPotentialMangaImages();
		imagesFoundCount = images.length;
		console.log(`BubbleTranslate: Found ${imagesFoundCount} potential images.`);

		images.forEach((img) => {
			try {
				// Ensure image has a valid source and hasn't been processed already in this session
				if (
					img &&
					img.src &&
					(img.src.startsWith("http") || img.src.startsWith("data:")) &&
					!img.hasAttribute(UNIQUE_ID_ATTR) // Check if already tagged
				) {
					const imageId = `bt-${Date.now()}-${uniqueIdCounter++}`;
					img.setAttribute(UNIQUE_ID_ATTR, imageId); // Tag the image

					console.log(
						`BubbleTranslate: Sending image [${imageId}] to background: ${img.src.substring(
							0,
							80
						)}...`
					);
					chrome.runtime.sendMessage({
						action: "processImage",
						imageUrl: img.src,
						imageId: imageId, // Send the unique ID
					});
					imagesSentCount++;
				} else if (img.hasAttribute(UNIQUE_ID_ATTR)) {
					// console.log(`BubbleTranslate: Skipping already tagged image: ${img.src.substring(0, 80)}...`);
				} else {
					console.warn(
						`BubbleTranslate: Skipping image with invalid src: ${img.src?.substring(
							0,
							80
						)}...`
					);
				}
			} catch (sendError) {
				console.error(
					`BubbleTranslate: Error sending image ${img?.src?.substring(
						0,
						80
					)}... to background:`,
					sendError
				);
				pageAnalysisError = pageAnalysisError || sendError; // Keep first error
			}
		});
	} catch (findError) {
		console.error("BubbleTranslate: Error during image finding:", findError);
		pageAnalysisError = findError;
	} finally {
		console.log(
			`BubbleTranslate: Page analysis finished. Sent ${imagesSentCount} new images for processing.`
		);
		if (pageAnalysisError) {
			sendResponse({
				status: "error",
				error: pageAnalysisError.message || "Unknown content script error",
				foundCount: imagesFoundCount,
				sentCount: imagesSentCount,
			});
		} else {
			sendResponse({
				status: "processingImages",
				foundCount: imagesFoundCount,
				sentCount: imagesSentCount,
			});
		}
	}
}

// ============================================================================
// DOM Manipulation - Overlays and Positioning
// ============================================================================

/**
 * Finds an image element by its unique BubbleTranslate ID.
 * @param {string} imageId - The unique ID assigned during analysis.
 * @returns {HTMLImageElement | null} The image element or null if not found.
 */
function findImageById(imageId) {
	if (!imageId) return null;
	// Use attribute selector for reliability
	return document.querySelector(`img[${UNIQUE_ID_ATTR}="${imageId}"]`);
}

/**
 * Displays the translated text overlay over the specified block area.
 * @param {string} imageId - The unique ID of the target image.
 * @param {string} translatedText - The translated text content.
 * @param {object} boundingBox - The bounding box vertices from Vision API.
 * @param {object} styles - The current style settings (fontSize, textColor, etc.).
 */
function displayBlockOverlay(imageId, translatedText, boundingBox, styles) {
	const imgElement = findImageById(imageId);
	if (!imgElement) {
		console.warn(
			`BubbleTranslate: Could not find image [${imageId}] for overlay.`
		);
		return;
	}

	const wrapper = ensurePositionedWrapper(imgElement);
	if (!wrapper) return; // Should not happen if imgElement exists

	const overlayPosition = calculateOverlayPosition(imgElement, boundingBox);
	if (!overlayPosition) {
		console.warn(
			`BubbleTranslate: Could not calculate overlay position for block on image [${imageId}].`
		);
		return;
	}

	// Create and style the overlay div
	const overlayDiv = document.createElement("div");
	overlayDiv.textContent = translatedText;
	overlayDiv.classList.add(OVERLAY_CLASS);

	// Apply core styles
	overlayDiv.style.position = "absolute";
	overlayDiv.style.top = `${overlayPosition.top}px`;
	overlayDiv.style.left = `${overlayPosition.left}px`;
	overlayDiv.style.width = `${overlayPosition.width}px`;
	overlayDiv.style.height = `${overlayPosition.height}px`;

	// Apply user-defined styles
	overlayDiv.style.fontSize = styles.fontSize;
	overlayDiv.style.color = styles.textColor;
	overlayDiv.style.backgroundColor = styles.backgroundColor;
	overlayDiv.style.zIndex = styles.zIndex;

	// Additional necessary styles
	overlayDiv.style.overflow = "hidden"; // Prevent text spilling out
	overlayDiv.style.display = "flex"; // Use flexbox for alignment
	overlayDiv.style.justifyContent = "center"; // Center text horizontally
	overlayDiv.style.alignItems = "center"; // Center text vertically
	overlayDiv.style.textAlign = "center"; // Ensure text is centered
	overlayDiv.style.boxSizing = "border-box"; // Include padding/border in size
	overlayDiv.style.padding = "2px 4px"; // Add some padding
	overlayDiv.style.pointerEvents = "none"; // Allow clicks to pass through
	overlayDiv.style.lineHeight = "1.2"; // Adjust line height for readability

	// Append the overlay to the wrapper
	wrapper.appendChild(overlayDiv);
	// console.log(`BubbleTranslate: Block overlay added for image [${imageId}].`);
}

/**
 * Displays a small error indicator near an image or specific block.
 * @param {string} imageId - The unique ID of the target image.
 * @param {string} errorMessage - The error message text.
 * @param {object|null} boundingBox - Optional bounding box for specific error location.
 * @param {object} styles - The current style settings.
 */
function displayErrorOverlay(imageId, errorMessage, boundingBox, styles) {
	const imgElement = findImageById(imageId);
	if (!imgElement) {
		console.warn(
			`BubbleTranslate: Could not find image [${imageId}] for error overlay.`
		);
		return;
	}

	const wrapper = ensurePositionedWrapper(imgElement);
	if (!wrapper) return;

	let positionStyles = { top: "5px", left: "5px" }; // Default: top-left of image

	// If boundingBox is available, position error near the specific block
	if (boundingBox) {
		const overlayPosition = calculateOverlayPosition(imgElement, boundingBox);
		if (overlayPosition) {
			// Position at the top-left corner of the bounding box
			positionStyles.top = `${overlayPosition.top}px`;
			positionStyles.left = `${overlayPosition.left}px`;
		}
	}

	// Create and style the error indicator
	const errorDiv = document.createElement("div");
	errorDiv.textContent = `⚠️`; // Use a simple warning icon
	errorDiv.title = `BubbleTranslate Error: ${errorMessage}`; // Show full error on hover
	errorDiv.classList.add(ERROR_OVERLAY_CLASS);

	errorDiv.style.position = "absolute";
	errorDiv.style.top = positionStyles.top;
	errorDiv.style.left = positionStyles.left;
	errorDiv.style.backgroundColor = "rgba(255, 0, 0, 0.7)"; // Red background
	errorDiv.style.color = "#FFFFFF"; // White icon
	errorDiv.style.padding = "1px 3px";
	errorDiv.style.fontSize = "12px";
	errorDiv.style.borderRadius = "50%";
	errorDiv.style.pointerEvents = "none";
	errorDiv.style.lineHeight = "1";
	// Ensure error icon is above regular overlays
	errorDiv.style.zIndex = (parseInt(styles.zIndex || "9998") + 1).toString();

	wrapper.appendChild(errorDiv);
	console.log(`BubbleTranslate: Error indicator added for image [${imageId}].`);
}

/**
 * Calculates the scaled pixel position and dimensions for an overlay
 * based on bounding box vertices and the image's current display size.
 * @param {HTMLImageElement} imgElement - The target image element.
 * @param {object} boundingBox - Bounding box object with {vertices: [{x, y}, ...]}.
 * @returns {{top: number, left: number, width: number, height: number} | null}
 *          Position/dimensions in pixels, or null if calculation fails.
 */
function calculateOverlayPosition(imgElement, boundingBox) {
	if (
		!boundingBox ||
		!boundingBox.vertices ||
		boundingBox.vertices.length < 4
	) {
		console.warn(
			"BubbleTranslate: Invalid boundingBox data for position calculation."
		);
		return null;
	}

	const vertices = boundingBox.vertices;

	// Use offsetWidth/Height for displayed size, naturalWidth/Height for original size
	const displayWidth = imgElement.offsetWidth;
	const displayHeight = imgElement.offsetHeight;
	const naturalWidth = imgElement.naturalWidth;
	const naturalHeight = imgElement.naturalHeight;

	// Crucial check: If natural dimensions aren't available yet (image loading?),
	// we cannot accurately calculate the scale. Return null to prevent errors.
	// This might happen if translation results arrive extremely quickly.
	if (naturalWidth === 0 || naturalHeight === 0) {
		console.warn(
			`BubbleTranslate: Image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}] natural dimensions ( ${naturalWidth}x${naturalHeight} ) not available yet. Cannot calculate overlay position accurately.`
		);
		return null;
	}

	// Calculate scaling factors
	const scaleX = displayWidth / naturalWidth;
	const scaleY = displayHeight / naturalHeight;

	// Determine bounds from vertices (handle potential missing x/y)
	try {
		const xs = vertices.map((v) => v.x || 0);
		const ys = vertices.map((v) => v.y || 0);
		const minX = Math.min(...xs);
		const minY = Math.min(...ys);
		const maxX = Math.max(...xs);
		const maxY = Math.max(...ys);

		// Calculate scaled position and dimensions
		const scaledTop = minY * scaleY;
		const scaledLeft = minX * scaleX;
		const scaledWidth = Math.max(1, (maxX - minX) * scaleX); // Ensure min width/height of 1px
		const scaledHeight = Math.max(1, (maxY - minY) * scaleY);

		// Validate calculated dimensions
		if (
			isNaN(scaledTop) ||
			isNaN(scaledLeft) ||
			isNaN(scaledWidth) ||
			isNaN(scaledHeight)
		) {
			console.warn(
				`BubbleTranslate: Calculated invalid overlay dimensions (NaN) for image [${imgElement.getAttribute(
					UNIQUE_ID_ATTR
				)}].`
			);
			return null;
		}

		return {
			top: scaledTop,
			left: scaledLeft,
			width: scaledWidth,
			height: scaledHeight,
		};
	} catch (e) {
		console.error(
			`BubbleTranslate: Error during coordinate calculation for image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}]:`,
			e
		);
		return null;
	}
}

/**
 * Ensures the direct parent of the image is relatively positioned for
 * absolute positioning of overlays. Creates a wrapper div if needed.
 * @param {HTMLImageElement} imgElement - The image element needing a positioned parent.
 * @returns {HTMLElement | null} The positioned wrapper element, or null on failure.
 */
function ensurePositionedWrapper(imgElement) {
	const parent = imgElement.parentNode;
	if (!parent || !(parent instanceof HTMLElement)) {
		console.error(
			"BubbleTranslate: Image parent is missing or not an HTMLElement."
		);
		return null;
	}

	// Check if parent is already suitable OR if it's our specific wrapper
	const parentPosition = window.getComputedStyle(parent).position;
	const isPositioned = ["relative", "absolute", "fixed", "sticky"].includes(
		parentPosition
	);

	if (isPositioned) {
		// If the parent is already positioned BUT it's not our dedicated wrapper,
		// it *might* be okay, but creating our own wrapper is safer to avoid
		// conflicts with existing page styles/structure.
		// However, if it IS our wrapper, reuse it.
		if (parent.classList.contains(WRAPPER_CLASS)) {
			return parent;
		}
		// Let's decide to wrap anyway for consistency unless the parent is already the body or html?
		// For now, let's proceed with wrapping if not already wrapped by us.
	}

	// Check if a wrapper already exists (e.g., from a previous overlay on the same image)
	// This check is slightly redundant with the check above but ensures we find OUR wrapper.
	if (parent.classList.contains(WRAPPER_CLASS)) {
		return parent;
	}

	// Parent is static or unsuitable, create and insert a new wrapper
	// console.log(`BubbleTranslate: Wrapping image [${imgElement.getAttribute(UNIQUE_ID_ATTR)}]...`);
	const wrapper = document.createElement("div");
	wrapper.classList.add(WRAPPER_CLASS);
	wrapper.style.position = "relative";
	// Try to mimic the image's display style to minimize layout shifts
	wrapper.style.display =
		window.getComputedStyle(imgElement).display || "inline-block";
	// Transfer margin from image to wrapper to maintain spacing, then reset image margin
	wrapper.style.margin = window.getComputedStyle(imgElement).margin;
	imgElement.style.margin = "0";
	// Transfer float if necessary
	wrapper.style.float = window.getComputedStyle(imgElement).float;
	// imgElement.style.float = 'none'; // Usually images inside relative wrappers don't need float

	// Insert the wrapper right before the image
	parent.insertBefore(wrapper, imgElement);
	// Move the image inside the wrapper
	wrapper.appendChild(imgElement);

	return wrapper;
}

// ============================================================================
// Image Detection
// ============================================================================

/**
 * Finds potential manga/comic images on the page based on minimum dimensions.
 * @returns {HTMLImageElement[]} An array of image elements meeting the criteria.
 */
function findPotentialMangaImages() {
	const allImages = document.querySelectorAll("img");
	const potentialImages = [];

	allImages.forEach((img) => {
		// Use naturalWidth/Height if available (more accurate), fallback to offsetWidth/Height
		const width = img.naturalWidth || img.offsetWidth;
		const height = img.naturalHeight || img.offsetHeight;

		if (width >= MIN_IMG_WIDTH && height >= MIN_IMG_HEIGHT) {
			potentialImages.push(img);
		}
	});

	return potentialImages;
}

// ============================================================================
// Utility Functions (if any needed)
// ============================================================================
// (None currently, but could add helper functions here)
