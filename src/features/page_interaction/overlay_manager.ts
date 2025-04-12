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

	// chrome.storage.local.get returns a Promise
	chrome.storage.local
		.get(defaults)
		.then((items: Partial<ExtensionSettings>) => {
			// Type the resolved items
			currentOverlayStyles.fontSize =
				(items.fontSize || DEFAULT_STYLES.fontSize) + "px";
			currentOverlayStyles.textColor =
				items.textColor || DEFAULT_STYLES.textColor;
			currentOverlayStyles.backgroundColor =
				items.bgColor || DEFAULT_STYLES.bgColor;
			currentOverlayStyles.zIndex = items.zIndex || DEFAULT_STYLES.zIndex;
			console.log(
				"BubbleTranslate Styles: Settings loaded/updated:",
				currentOverlayStyles
			);
		})
		.catch((error: Error) => {
			// Catch potential errors
			console.error(
				"BubbleTranslate Styles: Error loading style settings:",
				error.message
			);
		});
}

/**
 * Finds an image element by its unique BubbleTranslate ID.
 * @param imageId - The unique ID assigned during analysis.
 * @returns The image element or null if not found.
 */
function findImageById(imageId: string): HTMLImageElement | null {
	if (!imageId) return null;
	// Use attribute selector for reliability
	// Explicitly type the querySelector result
	return document.querySelector<HTMLImageElement>(
		`img[${UNIQUE_ID_ATTR}="${imageId}"]`
	);
}

/**
 * Displays the translated text overlay over the specified block area.
 * Uses the module's `currentOverlayStyles`.
 * @param imageId - The unique ID of the target image.
 * @param translatedText - The translated text content.
 * @param boundingBox - The bounding box vertices from Vision API.
 */
export function displayBlockOverlay(
	imageId: string,
	translatedText: string,
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

	const overlayDiv = document.createElement("div");
	overlayDiv.textContent = translatedText;
	overlayDiv.classList.add(OVERLAY_CLASS);

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
		padding: "2px 4px",
		pointerEvents: "none",
		lineHeight: "1.2",
	} as Partial<CSSStyleDeclaration>); // Type assertion for style properties

	wrapper.appendChild(overlayDiv);
}

/**
 * Displays a small error indicator near an image or specific block.
 * Uses the module's `currentOverlayStyles` for z-index calculation.
 * @param imageId - The unique ID of the target image.
 * @param errorMessage - The error message text.
 * @param boundingBox - Optional bounding box for specific error location.
 */
export function displayErrorOverlay(
	imageId: string,
	errorMessage: string,
	boundingBox: BoundingBox | null
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

	let top = "5px";
	let left = "5px";

	if (boundingBox) {
		const overlayPosition = calculateOverlayPosition(imgElement, boundingBox);
		if (overlayPosition) {
			top = `${overlayPosition.top}px`;
			left = `${overlayPosition.left}px`;
		}
	}

	const errorDiv = document.createElement("div");
	errorDiv.textContent = `⚠️`;
	errorDiv.title = `BubbleTranslate Error: ${errorMessage}`;
	errorDiv.classList.add(ERROR_OVERLAY_CLASS);

	Object.assign(errorDiv.style, {
		position: "absolute",
		top: top,
		left: left,
		backgroundColor: "rgba(255, 0, 0, 0.7)",
		color: "#FFFFFF",
		padding: "1px 3px",
		fontSize: "12px",
		borderRadius: "50%",
		pointerEvents: "none",
		lineHeight: "1",
		// Ensure error icon is above regular overlays
		zIndex: (parseInt(currentOverlayStyles.zIndex || "9998") + 1).toString(),
	} as Partial<CSSStyleDeclaration>);

	wrapper.appendChild(errorDiv);
	console.log(
		`BubbleTranslate Overlay: Error indicator added for image [${imageId}].`
	);
}

/**
 * Calculates the scaled pixel position and dimensions for an overlay.
 * @param imgElement - The target image element.
 * @param boundingBox - Bounding box object.
 * @returns Position/dimensions object or null if calculation fails.
 */
function calculateOverlayPosition(
	imgElement: HTMLImageElement,
	boundingBox: BoundingBox
): OverlayPosition | null {
	if (!boundingBox?.vertices || boundingBox.vertices.length < 4) {
		console.warn(
			"BubbleTranslate Overlay: Invalid boundingBox data for position calculation."
		);
		return null;
	}

	const vertices = boundingBox.vertices;
	const displayWidth = imgElement.offsetWidth;
	const displayHeight = imgElement.offsetHeight;
	const naturalWidth = imgElement.naturalWidth;
	const naturalHeight = imgElement.naturalHeight;

	if (naturalWidth === 0 || naturalHeight === 0) {
		console.warn(
			`BubbleTranslate Overlay: Image [${imgElement.getAttribute(
				UNIQUE_ID_ATTR
			)}] natural dimensions not available yet. Cannot calculate overlay position.`
		);
		return null;
	}

	const scaleX = displayWidth / naturalWidth;
	const scaleY = displayHeight / naturalHeight;

	try {
		const xs = vertices.map((v: Vertex) => v.x ?? 0); // Use nullish coalescing for safety
		const ys = vertices.map((v: Vertex) => v.y ?? 0); // Use nullish coalescing for safety
		const minX = Math.min(...xs);
		const minY = Math.min(...ys);
		const maxX = Math.max(...xs);
		const maxY = Math.max(...ys);

		const scaledTop = minY * scaleY;
		const scaledLeft = minX * scaleX;
		const scaledWidth = Math.max(1, (maxX - minX) * scaleX);
		const scaledHeight = Math.max(1, (maxY - minY) * scaleY);

		if (
			isNaN(scaledTop) ||
			isNaN(scaledLeft) ||
			isNaN(scaledWidth) ||
			isNaN(scaledHeight)
		) {
			console.warn(
				`BubbleTranslate Overlay: Calculated invalid overlay dimensions (NaN).`
			);
			return null;
		}

		return {
			top: scaledTop,
			left: scaledLeft,
			width: scaledWidth,
			height: scaledHeight,
		};
	} catch (e: any) {
		console.error(
			`BubbleTranslate Overlay: Error during coordinate calculation:`,
			e
		);
		return null;
	}
	return null;
}

/**
 * Ensures the direct parent of the image is relatively positioned. Creates a wrapper if needed.
 * @param imgElement - The image element.
 * @returns The positioned wrapper element, or null on failure.
 */
function ensurePositionedWrapper(
	imgElement: HTMLImageElement
): HTMLElement | null {
	const parent = imgElement.parentNode;
	// Parent must exist and be an HTMLElement
	if (!parent || !(parent instanceof HTMLElement)) {
		console.error(
			"BubbleTranslate Overlay: Image parent is missing or not an HTMLElement."
		);
		return null;
	}

	// Reuse existing wrapper if found
	if (parent.classList.contains(WRAPPER_CLASS)) {
		return parent;
	}

	const parentPosition = window.getComputedStyle(parent).position;
	const isPositioned = ["relative", "absolute", "fixed", "sticky"].includes(
		parentPosition
	);

	// If parent is already positioned but not our wrapper, we still wrap for consistency/safety
	if (!isPositioned || !parent.classList.contains(WRAPPER_CLASS)) {
		const wrapper = document.createElement("div");
		wrapper.classList.add(WRAPPER_CLASS);
		const imgStyle = window.getComputedStyle(imgElement);

		Object.assign(wrapper.style, {
			position: "relative",
			display: imgStyle.display || "inline-block",
			// Transfer layout-affecting properties
			margin: imgStyle.margin,
			float: imgStyle.float || "none", // Ensure float is explicitly handled
			// Copy width/height if they were explicitly set on the image? Optional.
			// width: imgStyle.width,
			// height: imgStyle.height,
		} as Partial<CSSStyleDeclaration>);

		// Reset img styles that were transferred
		imgElement.style.margin = "0";
		imgElement.style.float = "none"; // Reset float on image itself

		parent.insertBefore(wrapper, imgElement);
		wrapper.appendChild(imgElement);
		return wrapper;
	}

	// Parent is already positioned and is our wrapper (covered by first check, but safe)
	return parent;
}
