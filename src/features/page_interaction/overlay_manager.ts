// src/features/page_interaction/overlay_manager.ts
import {
	DEFAULT_STYLES,
	OVERLAY_CLASS,
	ERROR_OVERLAY_CLASS,
	WRAPPER_CLASS,
	UNIQUE_ID_ATTR,
} from "@shared/constants";
import type {
	BoundingBox,
	ExtensionSettings,
	OverlayPosition,
	OverlayStyleSettings,
	Vertex,
	SerializedApiClientError, // Import the structured error type
} from "@shared/types";

// Module-scoped variable to hold current styles
let currentOverlayStyles: OverlayStyleSettings = {
	fontSize: DEFAULT_STYLES.fontSize + "px",
	textColor: DEFAULT_STYLES.textColor,
	backgroundColor: DEFAULT_STYLES.bgColor,
	zIndex: DEFAULT_STYLES.zIndex,
};

/**
 * Loads style settings from local storage, updating the module's styles.
 */
export function loadAndApplyStyleSettings(): void {
	const defaults: Partial<ExtensionSettings> = {
		fontSize: DEFAULT_STYLES.fontSize,
		textColor: DEFAULT_STYLES.textColor,
		bgColor: DEFAULT_STYLES.bgColor,
		zIndex: DEFAULT_STYLES.zIndex,
	};

	// Use async/await for cleaner promise handling
	(async () => {
		try {
			const items = (await chrome.storage.local.get(
				defaults
			)) as Partial<ExtensionSettings>;

			currentOverlayStyles.fontSize =
				(items.fontSize || DEFAULT_STYLES.fontSize) + "px";
			currentOverlayStyles.textColor =
				items.textColor || DEFAULT_STYLES.textColor;
			currentOverlayStyles.backgroundColor =
				items.bgColor || DEFAULT_STYLES.bgColor;
			currentOverlayStyles.zIndex = items.zIndex || DEFAULT_STYLES.zIndex;
			// console.log( // Reduce noise
			//     "BubbleTranslate Styles: Settings loaded/updated:",
			//     currentOverlayStyles
			// );
		} catch (error: any) {
			console.error(
				"BubbleTranslate Styles: Error loading style settings:",
				error.message
			);
		}
	})(); // Immediately invoke the async function
}

/**
 * Finds an image element by its unique BubbleTranslate ID.
 * @param imageId - The unique ID assigned during analysis.
 * @returns The image element or null if not found.
 */
function findImageById(imageId: string): HTMLImageElement | null {
	if (!imageId) return null;
	// Use attribute selector for reliability
	return document.querySelector<HTMLImageElement>(
		`img[${UNIQUE_ID_ATTR}="${imageId}"]`
	);
}

/**
 * Finds the positioned wrapper for a given image ID.
 * @param imageId - The unique ID of the target image.
 * @returns The wrapper element or null if not found/created.
 */
function findWrapperForImage(imageId: string): HTMLElement | null {
	const imgElement = findImageById(imageId);
	if (!imgElement) return null;
	const parent = imgElement.parentNode;
	if (
		parent instanceof HTMLElement &&
		parent.classList.contains(WRAPPER_CLASS)
	) {
		return parent;
	}
	// If no wrapper exists (shouldn't happen if ensurePositionedWrapper was called), return null.
	// Or, could try to find it relative to the image if structure changed unexpectedly.
	return parent instanceof HTMLElement ? parent : null; // Return parent for potential cleanup even if not wrapper
}

/**
 * Removes existing overlays (success or error) associated with an image or a specific block.
 * @param imageId - The unique ID of the target image.
 * @param boundingBox - Optional bounding box to target a specific block's overlays. If null, removes all overlays for the image.
 */
export function clearOverlaysForImage(
	imageId: string,
	boundingBox: BoundingBox | null = null
): void {
	const wrapper = findWrapperForImage(imageId);
	if (!wrapper) return;

	const selector = boundingBox
		? `.${OVERLAY_CLASS}[data-box], .${ERROR_OVERLAY_CLASS}[data-box]` // Placeholder for block-specific selection if needed later
		: `.${OVERLAY_CLASS}, .${ERROR_OVERLAY_CLASS}`; // Select all overlays within the wrapper

	const overlays = wrapper.querySelectorAll(selector);

	overlays.forEach((overlay) => {
		// TODO: If targeting specific blocks, need a way to match the boundingBox
		// For now, if boundingBox is provided, we assume we might want finer control later,
		// but currently clear *all* overlays within the wrapper associated with the imageId
		// when either displayBlockOverlay or displayErrorOverlay is called.
		// This is simpler and avoids stale overlays if block detection changes slightly.
		overlay.remove();
	});
}

/**
 * Displays the translated text overlay over the specified block area.
 * Uses the module's `currentOverlayStyles`.
 * @param imageId - The unique ID of the target image.
 * @param translatedText - The translated text content.
 * @param originalText - The original OCR'd text (used for tooltip).
 * @param boundingBox - The bounding box vertices from Vision API.
 */
export function displayBlockOverlay(
	imageId: string,
	translatedText: string,
	originalText: string, // Added parameter
	boundingBox: BoundingBox
): void {
	const imgElement = findImageById(imageId);
	if (!imgElement) {
		console.warn(
			`BubbleTranslate Overlay: Could not find image [${imageId}] for overlay.`
		);
		return;
	}

	const wrapper = ensurePositionedWrapper(imgElement);
	if (!wrapper) return;

	const overlayPosition = calculateOverlayPosition(imgElement, boundingBox);
	if (!overlayPosition) {
		console.warn(
			`BubbleTranslate Overlay: Could not calculate position for block on image [${imageId}].`
		);
		return;
	}

	// Clear previous overlays for this image before adding a new one (simplest approach)
	// clearOverlaysForImage(imageId); // Moved clearing logic to content.ts before calling display*

	const overlayDiv = document.createElement("div");
	overlayDiv.textContent = translatedText;
	overlayDiv.classList.add(OVERLAY_CLASS);
	// Add original text to the title attribute for hover inspection
	overlayDiv.title = `Original: ${originalText}`;

	// Apply styles
	Object.assign(overlayDiv.style, {
		position: "absolute",
		top: `${overlayPosition.top}px`,
		left: `${overlayPosition.left}px`,
		width: `${overlayPosition.width}px`,
		height: `${overlayPosition.height}px`,
		fontSize: currentOverlayStyles.fontSize,
		color: currentOverlayStyles.textColor,
		backgroundColor: currentOverlayStyles.backgroundColor,
		zIndex: currentOverlayStyles.zIndex,
		overflow: "hidden",
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
		textAlign: "center",
		boxSizing: "border-box",
		padding: "2px 4px", // Adjust padding as needed
		pointerEvents: "none", // Prevent overlay from blocking interactions with underlying elements
		lineHeight: "1.2", // Adjust line height for better text display
		borderRadius: "3px", // Slightly rounded corners
		boxShadow: "0 1px 3px rgba(0,0,0,0.2)", // Subtle shadow for definition
	} as Partial<CSSStyleDeclaration>);

	// Add data attribute to potentially identify block later (optional)
	// overlayDiv.dataset.box = JSON.stringify(boundingBox.vertices);

	wrapper.appendChild(overlayDiv);
}

/**
 * Displays a small error indicator near an image or specific block.
 * Uses the module's `currentOverlayStyles` for z-index calculation.
 * Provides detailed error info in the tooltip if available.
 * @param imageId - The unique ID of the target image.
 * @param displayMessage - The user-friendly error summary message.
 * @param boundingBox - Optional bounding box for specific error location.
 * @param errorDetails - Optional structured API error details.
 */
export function displayErrorOverlay(
	imageId: string,
	displayMessage: string, // Use the pre-formatted message from content.ts
	boundingBox: BoundingBox | null,
	errorDetails?: SerializedApiClientError // Added optional parameter
): void {
	const imgElement = findImageById(imageId);
	if (!imgElement) {
		console.warn(
			`BubbleTranslate Overlay: Could not find image [${imageId}] for error overlay.`
		);
		return;
	}

	const wrapper = ensurePositionedWrapper(imgElement);
	if (!wrapper) return;

	// Clear previous overlays for this image before adding a new one (simplest approach)
	// clearOverlaysForImage(imageId); // Moved clearing logic to content.ts before calling display*

	let top = "5px"; // Default position (top-left corner of image)
	let left = "5px";
	let width = "auto"; // Auto width for simple indicator
	let height = "auto"; // Auto height

	// If boundingBox is provided, position the error near/over that block
	if (boundingBox) {
		const overlayPosition = calculateOverlayPosition(imgElement, boundingBox);
		if (overlayPosition) {
			// Position at the top-left of the block's bounding box
			top = `${overlayPosition.top}px`;
			left = `${overlayPosition.left}px`;
			// Optionally, make error cover the block - maybe too intrusive?
			// width = `${overlayPosition.width}px`;
			// height = `${overlayPosition.height}px`;
		}
	}

	const errorDiv = document.createElement("div");
	errorDiv.textContent = `⚠️`; // Simple indicator
	errorDiv.classList.add(ERROR_OVERLAY_CLASS);

	// --- Generate detailed tooltip ---
	let tooltip = `BubbleTranslate Error: ${displayMessage}`; // Start with the summary
	if (errorDetails) {
		tooltip += `\nAPI: ${errorDetails.apiName}`;
		if (errorDetails.apiStatus) {
			tooltip += `\nStatus: ${errorDetails.apiStatus}`;
		}
		if (
			errorDetails.httpStatus &&
			errorDetails.httpStatus !== 0 &&
			errorDetails.httpStatus !== errorDetails.apiCode
		) {
			// Show HTTP status if different from API code and not 0 (network/timeout)
			tooltip += ` (HTTP ${errorDetails.httpStatus})`;
		}
		// Append the raw message if it provides more detail than the summary displayMessage
		if (
			displayMessage !== errorDetails.message &&
			errorDetails.message.length > displayMessage.length // Heuristic check
		) {
			tooltip += `\nDetails: ${errorDetails.message}`;
		}
	}
	errorDiv.title = tooltip;
	// ----------------------------------

	// Base styles for error indicator
	const errorStyle: Partial<CSSStyleDeclaration> = {
		position: "absolute",
		top: top,
		left: left,
		width: width,
		height: height,
		backgroundColor: "rgba(217, 48, 37, 0.8)", // Darker Red with slight transparency
		color: "#FFFFFF",
		padding: "1px 4px", // Adjusted padding
		fontSize: "14px", // Slightly larger icon
		borderRadius: "3px", // Match block overlay
		pointerEvents: "none", // Allow clicks through
		lineHeight: "1",
		// Ensure error icon is above regular overlays
		zIndex: (parseInt(currentOverlayStyles.zIndex || "9998") + 1).toString(),
		boxShadow: "0 1px 2px rgba(0,0,0,0.3)", // Shadow for definition
		display: "inline-block", // Ensure padding works correctly
	};

	// Optional: If covering the whole block, add flex centering
	// if (boundingBox && width !== 'auto') {
	//     errorStyle.display = 'flex';
	//     errorStyle.justifyContent = 'center';
	//     errorStyle.alignItems = 'center';
	//     errorStyle.textAlign = 'center';
	//     errorStyle.overflow = 'hidden';
	// }

	Object.assign(errorDiv.style, errorStyle);

	// Add data attribute to potentially identify block later (optional)
	// if (boundingBox) {
	//     errorDiv.dataset.box = JSON.stringify(boundingBox.vertices);
	// }

	wrapper.appendChild(errorDiv);
	// console.log( // Reduce noise
	//     `BubbleTranslate Overlay: Error indicator added for image [${imageId}]. Details: ${tooltip}`
	// );
}

/**
 * Calculates the scaled pixel position and dimensions for an overlay based on bounding box vertices.
 * @param imgElement - The target image element.
 * @param boundingBox - Bounding box object with vertices.
 * @returns Position/dimensions object or null if calculation fails.
 */
function calculateOverlayPosition(
	imgElement: HTMLImageElement,
	boundingBox: BoundingBox
): OverlayPosition | null {
	// Validate bounding box structure
	if (
		!boundingBox?.vertices ||
		!Array.isArray(boundingBox.vertices) ||
		boundingBox.vertices.length < 4 ||
		boundingBox.vertices.some(
			(v) => typeof v?.x !== "number" || typeof v?.y !== "number"
		)
	) {
		console.warn(
			`BubbleTranslate Overlay: Invalid boundingBox data for image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}]:`,
			boundingBox
		);
		return null;
	}

	const vertices = boundingBox.vertices;
	const displayWidth = imgElement.offsetWidth;
	const displayHeight = imgElement.offsetHeight;
	const naturalWidth = imgElement.naturalWidth;
	const naturalHeight = imgElement.naturalHeight;

	// Check if image has loaded and dimensions are available
	if (!displayWidth || !displayHeight || !naturalWidth || !naturalHeight) {
		console.warn(
			`BubbleTranslate Overlay: Image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}] dimensions not available or zero (display: ${displayWidth}x${displayHeight}, natural: ${naturalWidth}x${naturalHeight}). Cannot calculate overlay position.`
		);
		return null;
	}

	const scaleX = displayWidth / naturalWidth;
	const scaleY = displayHeight / naturalHeight;

	try {
		// Find min/max coordinates from vertices
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const vertex of vertices) {
			minX = Math.min(minX, vertex.x);
			minY = Math.min(minY, vertex.y);
			maxX = Math.max(maxX, vertex.x);
			maxY = Math.max(maxY, vertex.y);
		}

		// Calculate scaled position and dimensions
		const scaledTop = Math.max(0, minY * scaleY); // Ensure non-negative
		const scaledLeft = Math.max(0, minX * scaleX); // Ensure non-negative
		// Ensure minimum width/height of 1px for visibility
		const scaledWidth = Math.max(1, (maxX - minX) * scaleX);
		const scaledHeight = Math.max(1, (maxY - minY) * scaleY);

		// Final check for NaN values (shouldn't happen with earlier checks, but belt-and-suspenders)
		if (
			isNaN(scaledTop) ||
			isNaN(scaledLeft) ||
			isNaN(scaledWidth) ||
			isNaN(scaledHeight)
		) {
			console.warn(
				`BubbleTranslate Overlay: Calculated invalid overlay dimensions (NaN) for image [${imgElement.getAttribute(
					UNIQUE_ID_ATTR
				)}].`
			);
			return null;
		}

		// Return the calculated position, clamped within image bounds (optional but good practice)
		return {
			top: Math.min(scaledTop, displayHeight - 1), // Clamp top
			left: Math.min(scaledLeft, displayWidth - 1), // Clamp left
			// Clamp width/height to ensure they don't extend beyond image boundaries from the calculated top/left
			width: Math.min(scaledWidth, displayWidth - scaledLeft),
			height: Math.min(scaledHeight, displayHeight - scaledTop),
		};
	} catch (e: any) {
		console.error(
			`BubbleTranslate Overlay: Error during coordinate calculation for image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}]:`,
			e
		);
		return null;
	}
	// The catch block should handle errors, so this is technically unreachable
	// return null;
}

/**
 * Ensures the direct parent of the image is relatively positioned for overlay placement.
 * Creates and inserts a wrapper div if the parent isn't positioned or isn't already our wrapper.
 * Transfers relevant layout styles from the image to the wrapper.
 * @param imgElement - The image element.
 * @returns The positioned wrapper element (either existing or newly created), or null on failure.
 */
function ensurePositionedWrapper(
	imgElement: HTMLImageElement
): HTMLElement | null {
	const parent = imgElement.parentNode;

	// Check if parent is a valid HTMLElement
	if (!parent || !(parent instanceof HTMLElement)) {
		console.error(
			`BubbleTranslate Overlay: Image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}] parent is missing or not an HTMLElement.`
		);
		return null;
	}

	// Case 1: Parent is already our designated wrapper
	if (parent.classList.contains(WRAPPER_CLASS)) {
		// Ensure it's still positioned (it should be, but check defensively)
		if (window.getComputedStyle(parent).position === "static") {
			console.warn(
				`BubbleTranslate Overlay: Existing wrapper for image [${imgElement.getAttribute(
					UNIQUE_ID_ATTR
				)}] lost its relative positioning. Re-applying.`
			);
			parent.style.position = "relative";
		}
		return parent;
	}

	// Case 2: Parent is not our wrapper. Check if it's already positioned.
	const parentPosition = window.getComputedStyle(parent).position;
	const isParentPositioned = parentPosition !== "static";

	// If the parent is already positioned (relative, absolute, fixed, sticky),
	// AND it only contains the image (or mostly just the image), we *could* potentially use it.
	// However, creating our own wrapper is SAFER and more predictable, as we control its styles
	// and avoid interfering with the parent's other children or complex layouts.
	// So, we will always create a wrapper unless the parent IS the wrapper already.

	// Case 3: Create a new wrapper
	try {
		const wrapper = document.createElement("div");
		wrapper.classList.add(WRAPPER_CLASS);
		const imgStyle = window.getComputedStyle(imgElement);

		// --- Style Transfer ---
		// Set wrapper position relative for overlays
		wrapper.style.position = "relative";
		// Try to match the display behavior of the image (block, inline-block, etc.)
		wrapper.style.display = imgStyle.display || "inline-block";
		// Transfer layout-critical styles that affect flow
		wrapper.style.margin = imgStyle.margin;
		wrapper.style.padding = "0"; // Wrapper itself usually has no padding
		wrapper.style.border = "none"; // Wrapper itself has no border
		wrapper.style.float = imgStyle.float || "none";
		// Copy size constraints if image had them explicitly set? More complex, start without.
		// wrapper.style.width = imgStyle.width;
		// wrapper.style.height = imgStyle.height;
		// wrapper.style.maxWidth = imgStyle.maxWidth;
		// wrapper.style.maxHeight = imgStyle.maxHeight;

		// --- DOM Manipulation ---
		// Insert the wrapper before the image in the parent
		parent.insertBefore(wrapper, imgElement);
		// Reset styles on the image that were transferred to the wrapper
		imgElement.style.margin = "0";
		imgElement.style.padding = "0";
		imgElement.style.float = "none";
		// Move the image inside the wrapper
		wrapper.appendChild(imgElement);

		return wrapper;
	} catch (error: any) {
		console.error(
			`BubbleTranslate Overlay: Failed to create or insert wrapper for image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}]:`,
			error
		);
		return null;
	}
}
