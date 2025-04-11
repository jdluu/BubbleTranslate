// ============================================================================
// BubbleTranslate - Content Script
// ============================================================================

console.log("BubbleTranslate: Content Script Loaded!");

// --- Globals ---
let overlayStyles = {
	fontSize: "14px", // Default style values
	textColor: "#FFFFFF",
	bgColor: "rgba(0, 0, 0, 0.75)",
};

// ============================================================================
// Initial Setup
// ============================================================================

/**
 * Loads style settings from local storage when the script starts.
 */
function loadStyleSettings() {
	chrome.storage.local.get(
		{
			// Defaults matching options page
			fontSize: "14",
			textColor: "#FFFFFF",
			bgColor: "rgba(0, 0, 0, 0.75)",
		},
		(items) => {
			if (chrome.runtime.lastError) {
				console.error(
					"BubbleTranslate: Error loading style settings:",
					chrome.runtime.lastError
				);
				return;
			}
			// Update global styles object
			overlayStyles.fontSize = items.fontSize + "px"; // Ensure 'px' unit
			overlayStyles.textColor = items.textColor;
			overlayStyles.bgColor = items.bgColor;
			console.log("BubbleTranslate: Style settings loaded:", overlayStyles);
		}
	);
}

// Load settings immediately when the script is injected.
loadStyleSettings();

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Listens for messages from the background script.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received in content script:", message);

	switch (message.action) {
		case "triggerPageAnalysis":
			console.log("BubbleTranslate: 'triggerPageAnalysis' action received.");
			// Ensure styles are reasonably fresh before analysis begins
			// Note: This call is async, but subsequent logic doesn't depend on it finishing *here*
			// because display functions use the global overlayStyles object later.
			loadStyleSettings();
			handlePageAnalysis(sendResponse); // Pass sendResponse to the handler
			// Return true because the image processing and response sending might be async within handlePageAnalysis
			return true;

		case "displayBlockTranslation": // *** UPDATED ACTION ***
			console.log(
				`   Received block translation for ${message.originalImageUrl?.substring(
					0,
					60
				)}...`
			);
			// Check if necessary data is present
			if (
				message.originalImageUrl &&
				message.translatedText &&
				message.boundingBox
			) {
				// Pass the global styles object
				displayBlockOverlay(
					message.originalImageUrl,
					message.translatedText,
					message.boundingBox,
					overlayStyles
				);
			} else {
				console.warn(
					"BubbleTranslate: Missing data in displayBlockTranslation message.",
					message
				);
			}
			return false; // No response needed back to background for this

		case "translationError":
			console.warn(
				`   Received error for ${message.originalImageUrl?.substring(
					0,
					60
				)}...: ${message.error}`
			);
			// Pass styles to error overlay
			if (message.originalImageUrl) {
				displayErrorOverlay(
					message.originalImageUrl,
					message.error,
					message.boundingBox,
					overlayStyles
				);
			}
			return false; // No response needed

		default:
			console.log(
				`BubbleTranslate Content Script: Received unknown action: ${message.action}`
			);
			return false;
	}
});

/**
 * Handles the 'triggerPageAnalysis' action: finds images, sends them to background, responds.
 * @param {function} sendResponse - The function to call to send a response back to the background script.
 */
function handlePageAnalysis(sendResponse) {
	let imagesFoundCount = 0;
	let processingError = null;

	try {
		const images = findPotentialMangaImages();
		imagesFoundCount = images.length;
		console.log(`BubbleTranslate: Found ${imagesFoundCount} potential images.`);

		images.forEach((img) => {
			try {
				if (img && img.src) {
					console.log(
						`BubbleTranslate: Sending image URL to background: ${img.src.substring(
							0,
							100
						)}...`
					);
					chrome.runtime.sendMessage({
						action: "processImage",
						imageUrl: img.src,
					});
				} else {
					/* ... warn ... */
				}
			} catch (sendError) {
				/* ... handle error ... */ processingError =
					processingError || sendError;
			}
		});
	} catch (findError) {
		console.error(
			"BubbleTranslate: Error during image finding/processing:",
			findError
		);
		processingError = findError;
	} finally {
		console.log(
			"BubbleTranslate: Finished page analysis. Sending response to background."
		);
		if (processingError) {
			sendResponse({
				status: "error",
				error: processingError.message || "Unknown content script error",
				foundCount: imagesFoundCount,
			});
		} else {
			sendResponse({
				status: "processingImages",
				foundCount: imagesFoundCount,
			});
		}
	}
}

// ============================================================================
// DOM Manipulation / Overlay Functions
// ============================================================================

/**
 * Creates and displays a translation overlay positioned over a specific text block.
 * @param {string} imageUrl - The URL of the original image.
 * @param {string} translatedText - The translated text content.
 * @param {object} boundingBox - The boundingBox object from Vision API ({vertices: [{x, y},...]}).
 * @param {object} styles - The style preferences object ({fontSize, textColor, bgColor}).
 */
function displayBlockOverlay(imageUrl, translatedText, boundingBox, styles) {
	const escapedUrl = imageUrl.replace(/"/g, '\\"');
	const imgElement = document.querySelector(`img[src="${escapedUrl}"]`);

	if (!imgElement) {
		console.warn(
			`   Could not find image element for ${imageUrl} to display block overlay.`
		);
		return;
	}
	// We allow multiple block overlays per image, so no duplicate check based on imgElement needed here.
	// We could add a check based on boundingBox if needed, but unlikely necessary.

	console.log(`   Creating block overlay for ${imageUrl.substring(0, 60)}...`);

	// Ensure the image has a positioned wrapper for absolute positioning
	const wrapper = ensurePositionedWrapper(imgElement);
	if (!wrapper) return; // Should not happen if ensurePositionedWrapper works

	// Calculate position and dimensions based on bounding box and image scaling
	const overlayPosition = calculateOverlayPosition(imgElement, boundingBox);
	if (!overlayPosition) {
		console.warn(
			`   Could not calculate valid overlay position for block on ${imageUrl.substring(
				0,
				60
			)}...`
		);
		return;
	}

	// Create the overlay div
	const overlayDiv = document.createElement("div");
	overlayDiv.textContent = translatedText;
	overlayDiv.classList.add("bubbletranslate-overlay"); // Add class for potential toggling later

	// Apply styles
	overlayDiv.style.position = "absolute";
	overlayDiv.style.top = `${overlayPosition.top}px`;
	overlayDiv.style.left = `${overlayPosition.left}px`;
	overlayDiv.style.width = `${overlayPosition.width}px`;
	overlayDiv.style.height = `${overlayPosition.height}px`;

	overlayDiv.style.backgroundColor = styles.bgColor; // Use loaded style
	overlayDiv.style.color = styles.textColor; // Use loaded style
	overlayDiv.style.fontSize = styles.fontSize; // Use loaded style

	// Additional styles for better block display
	overlayDiv.style.padding = "2px"; // Smaller padding
	overlayDiv.style.zIndex = "9999";
	overlayDiv.style.borderRadius = "2px";
	overlayDiv.style.textAlign = "center";
	overlayDiv.style.pointerEvents = "none";
	overlayDiv.style.overflow = "hidden"; // Hide overflow
	overlayDiv.style.display = "flex"; // Use flexbox for vertical centering
	overlayDiv.style.justifyContent = "center"; // Center horizontally
	overlayDiv.style.alignItems = "center"; // Center vertically
	overlayDiv.style.lineHeight = "1.1"; // Adjust line height if needed
	overlayDiv.style.boxSizing = "border-box"; // Include padding in width/height

	// Append the overlay to the wrapper
	wrapper.appendChild(overlayDiv);
	console.log(`   Block overlay added for ${imageUrl.substring(0, 60)}...`);
}

/**
 * Calculates the scaled pixel position and dimensions for an overlay based on Vision API boundingBox vertices.
 * @param {HTMLImageElement} imgElement - The target image element.
 * @param {object} boundingBox - The boundingBox object ({vertices: [{x,y},...]}).
 * @returns {object|null} An object {top, left, width, height} in pixels, or null if calculation fails.
 */
function calculateOverlayPosition(imgElement, boundingBox) {
	if (
		!boundingBox ||
		!boundingBox.vertices ||
		boundingBox.vertices.length < 4
	) {
		return null;
	}

	const vertices = boundingBox.vertices;

	// Get image's displayed dimensions vs natural dimensions to calculate scaling
	const displayWidth = imgElement.offsetWidth;
	const displayHeight = imgElement.offsetHeight;
	const naturalWidth = imgElement.naturalWidth || displayWidth; // Fallback if naturalWidth isn't available
	const naturalHeight = imgElement.naturalHeight || displayHeight; // Fallback

	// Prevent division by zero if image hasn't loaded dimensions properly
	if (naturalWidth === 0 || naturalHeight === 0) {
		console.warn(
			"Image natural dimensions are zero, cannot calculate scaling.",
			imgElement
		);
		return null;
	}

	const scaleX = displayWidth / naturalWidth;
	const scaleY = displayHeight / naturalHeight;

	// Find min/max coordinates from vertices (handle missing x/y, default to 0)
	const xs = vertices.map((v) => v.x || 0);
	const ys = vertices.map((v) => v.y || 0);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const maxX = Math.max(...xs);
	const maxY = Math.max(...ys);

	// Calculate scaled position and dimensions
	const scaledTop = minY * scaleY;
	const scaledLeft = minX * scaleX;
	const scaledWidth = (maxX - minX) * scaleX;
	const scaledHeight = (maxY - minY) * scaleY;

	// Basic validation
	if (scaledWidth <= 0 || scaledHeight <= 0) {
		console.warn("Calculated zero or negative overlay dimensions.", {
			minX,
			minY,
			maxX,
			maxY,
			scaleX,
			scaleY,
		});
		return null;
	}

	console.log(
		`   Calculated Position - Top: ${scaledTop.toFixed(
			1
		)}, Left: ${scaledLeft.toFixed(1)}, W: ${scaledWidth.toFixed(
			1
		)}, H: ${scaledHeight.toFixed(1)}`
	);
	return {
		top: scaledTop,
		left: scaledLeft,
		width: scaledWidth,
		height: scaledHeight,
	};
}

/**
 * Ensures the parent of the image element has relative positioning for overlay placement.
 * Creates and inserts a wrapper div if necessary.
 * @param {HTMLImageElement} imgElement - The image element.
 * @returns {HTMLElement} The wrapper element (either new or existing parent).
 */
function ensurePositionedWrapper(imgElement) {
	const parent = imgElement.parentNode;
	if (!parent) return null; // Should not happen in normal DOM

	const parentPosition = getComputedStyle(parent).position;

	if (
		parentPosition === "relative" ||
		parentPosition === "absolute" ||
		parentPosition === "fixed"
	) {
		// console.log(`   Parent of image ${imgElement.src.substring(0, 60)}... is already positioned.`);
		return parent; // Parent is already suitable
	} else {
		// Parent is static, create a wrapper
		// Check if a wrapper already exists (e.g., from a previous overlay on the same image)
		if (parent.classList.contains("bubbletranslate-wrapper")) {
			return parent; // Already wrapped
		}

		console.log(`   Wrapping image ${imgElement.src.substring(0, 60)}...`);
		const wrapper = document.createElement("div");
		wrapper.classList.add("bubbletranslate-wrapper"); // Add class to identify wrapper
		wrapper.style.position = "relative";
		// Try to mimic image's display style (block or inline-block are common)
		wrapper.style.display =
			getComputedStyle(imgElement).display || "inline-block";
		// Insert wrapper before the image
		parent.insertBefore(wrapper, imgElement);
		// Move the image inside the wrapper
		wrapper.appendChild(imgElement);
		return wrapper;
	}
}

/**
 * Displays a simple error indicator near/over an image block.
 * @param {string} imageUrl - The URL of the original image.
 * @param {string} errorMessage - The error message text.
 * @param {object|null} boundingBox - Optional boundingBox object. If provided, positions near block.
 * @param {object} styles - The style preferences object.
 */
function displayErrorOverlay(imageUrl, errorMessage, boundingBox, styles) {
	const escapedUrl = imageUrl.replace(/"/g, '\\"');
	const imgElement = document.querySelector(`img[src="${escapedUrl}"]`);
	if (!imgElement) return;

	// Decide positioning: Use bounding box if available, otherwise top-left of image
	let positionStyles = { top: "5px", left: "5px" }; // Default top-left of image
	let wrapper = null;

	if (boundingBox) {
		const overlayPosition = calculateOverlayPosition(imgElement, boundingBox);
		if (overlayPosition) {
			positionStyles.top = `${overlayPosition.top}px`;
			positionStyles.left = `${overlayPosition.left}px`;
			// Make error smaller than block? Or just put icon?
			// positionStyles.width = `${overlayPosition.width}px`;
			// positionStyles.height = `${overlayPosition.height}px`;
		}
	}

	// Ensure wrapper exists
	wrapper = ensurePositionedWrapper(imgElement);
	if (!wrapper) return;

	// Check if an error overlay for this specific block/image already exists? Might be complex.
	// For simplicity, we might allow multiple small error icons for now.

	const errorDiv = document.createElement("div");
	errorDiv.textContent = `⚠️`; // Just icon
	errorDiv.title = `Translation Error: ${errorMessage}`; // Full error on hover
	errorDiv.classList.add("bubbletranslate-error-overlay"); // Add specific class

	errorDiv.style.position = "absolute";
	errorDiv.style.top = positionStyles.top;
	errorDiv.style.left = positionStyles.left;
	errorDiv.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
	errorDiv.style.color = styles.textColor;
	errorDiv.style.padding = "1px 3px";
	errorDiv.style.fontSize = "12px"; // Smaller error icon
	errorDiv.style.zIndex = "10000";
	errorDiv.style.borderRadius = "50%"; // Make it round?
	errorDiv.style.pointerEvents = "none";
	errorDiv.style.lineHeight = "1"; // Ensure icon fits

	wrapper.appendChild(errorDiv);
	console.log(`   Error indicator added for ${imageUrl.substring(0, 60)}...`);
}

// ============================================================================
// Image Detection Function (Unchanged from previous version)
// ============================================================================
/**
 * Finds potential manga/comic images on the page based on dimensions.
 * @returns {HTMLImageElement[]} An array of image elements meeting criteria.
 */
function findPotentialMangaImages() {
	console.log("BubbleTranslate: --- Starting Image Search ---");
	const allImages = document.querySelectorAll("img");
	const potentialImages = [];
	const minWidth = 300; // Minimum width threshold
	const minHeight = 400; // Minimum height threshold

	console.log(
		`BubbleTranslate: Found ${allImages.length} total <img> tags. Checking dimensions...`
	);

	allImages.forEach((img, index) => {
		const width =
			img.naturalWidth ||
			img.offsetWidth ||
			parseInt(img.getAttribute("width")) ||
			0;
		const height =
			img.naturalHeight ||
			img.offsetHeight ||
			parseInt(img.getAttribute("height")) ||
			0;
		// Log dimensions for debugging - keep this for now
		console.log(
			`BubbleTranslate: Image[${index}] | Width: ${width}, Height: ${height} | Src: ${img.src.substring(
				0,
				100
			)}...`
		);

		if (width >= minWidth && height >= minHeight) {
			if (
				img.src &&
				(img.src.startsWith("http") || img.src.startsWith("data:"))
			) {
				console.log(
					`%cBubbleTranslate: ---> Image[${index}] MET criteria! Adding.`,
					"color: green; font-weight: bold;"
				);
				potentialImages.push(img);
			} else {
				/* ... log invalid src ... */
			}
		}
	});

	console.log(
		`BubbleTranslate: --- Finished Image Search. Found ${potentialImages.length} potential images meeting criteria. ---`
	);
	return potentialImages;
}
