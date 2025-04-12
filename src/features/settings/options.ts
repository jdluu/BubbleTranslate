// src/features/settings/options.ts
import {
	DEFAULT_STYLES,
	STATUS_CLEAR_DELAY_MS,
	MSG_SAVED_SUCCESS,
	MSG_SAVE_ERROR,
	MSG_LOAD_ERROR,
} from "@shared/constants";
import type { ExtensionSettings } from "@shared/types";

// --- Helper Function: Converts RGBA string to Hex color and Alpha value. ---
function rgbaToHexAlpha(rgba: string): { hex: string; alpha: number } {
	const fallbackHex = "#ffffff"; // Define a fallback hex if parsing fails or default isn't hex
	const fallbackAlpha = 0.85; // Define a fallback alpha

	// Try to parse the input rgba string
	const match = rgba?.match(
		/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
	);

	if (!match) {
		// If parsing fails, try parsing the default BG color from constants
		const defaultMatch = DEFAULT_STYLES.bgColor.match(
			/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
		);
		if (!defaultMatch) {
			// If even the default fails to parse (shouldn't happen), return hardcoded fallbacks
			console.warn(
				"Could not parse provided RGBA or default RGBA color. Using fallback."
			);
			return { hex: fallbackHex, alpha: fallbackAlpha };
		}
		// Use values from parsed default
		const r = parseInt(defaultMatch[1], 10);
		const g = parseInt(defaultMatch[2], 10);
		const b = parseInt(defaultMatch[3], 10);
		const alpha =
			defaultMatch[4] !== undefined ? parseFloat(defaultMatch[4]) : 1;
		const toHex = (c: number) => c.toString(16).padStart(2, "0");
		return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, alpha };
	}

	// Use values from parsed input rgba
	const r = parseInt(match[1], 10);
	const g = parseInt(match[2], 10);
	const b = parseInt(match[3], 10);
	const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
	const toHex = (c: number) => c.toString(16).padStart(2, "0");
	return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, alpha };
}

// --- Derive default values needed specifically for UI elements ---
const defaultBgParts = rgbaToHexAlpha(DEFAULT_STYLES.bgColor);
const DEFAULT_UI_VALUES = {
	...DEFAULT_STYLES, // Include all original defaults
	bgColorHex: defaultBgParts.hex,
	bgAlpha: defaultBgParts.alpha.toString(), // Store alpha as string for input value
};

// --- DOM Element References ---
const elements = {
	apiKeyInput: document.getElementById("apiKey") as HTMLInputElement,
	targetLangSelect: document.getElementById(
		"targetLanguage"
	) as HTMLSelectElement,
	fontSizeInput: document.getElementById("fontSize") as HTMLInputElement,
	textColorInput: document.getElementById("textColor") as HTMLInputElement,
	bgColorInput: document.getElementById("bgColor") as HTMLInputElement,
	bgAlphaInput: document.getElementById("bgAlpha") as HTMLInputElement,
	bgAlphaValueSpan: document.getElementById("bgAlphaValue") as HTMLSpanElement,
	saveButton: document.getElementById("saveButton") as HTMLButtonElement,
	statusElement: document.getElementById("status") as HTMLDivElement,
};

// --- Globals ---
let statusClearTimer: number | null = null;

// ============================================================================
// Helper Functions (RGBA/Hex converters defined above)
// ============================================================================

/** Converts a Hex color and Alpha value to an RGBA string. */
function hexAlphaToRgba(hex: string, alpha: number): string {
	// Ensure hex is valid
	const safeHex = /^#[0-9A-F]{6}$/i.test(hex)
		? hex
		: DEFAULT_UI_VALUES.bgColorHex; // Fallback to default hex
	const bigint = parseInt(safeHex.slice(1), 16);
	const r = (bigint >> 16) & 255;
	const g = (bigint >> 8) & 255;
	const b = bigint & 255;
	const clampedAlpha = Math.max(0, Math.min(1, alpha));
	const formattedAlpha = Number(clampedAlpha.toFixed(2));
	return `rgba(${r}, ${g}, ${b}, ${formattedAlpha})`;
}

/** Updates the status message element. */
function updateStatus(message: string, isError: boolean = false): void {
	if (!elements.statusElement) return;

	if (statusClearTimer !== null) {
		clearTimeout(statusClearTimer);
		statusClearTimer = null;
	}

	elements.statusElement.textContent = message;
	elements.statusElement.classList.remove("success", "error");
	if (message) {
		elements.statusElement.classList.add(isError ? "error" : "success");
	}

	if (message) {
		statusClearTimer = window.setTimeout(() => {
			if (elements.statusElement?.textContent === message) {
				// Check if message is still the same
				elements.statusElement.textContent = "";
				elements.statusElement.classList.remove("success", "error");
			}
			statusClearTimer = null;
		}, STATUS_CLEAR_DELAY_MS);
	}
}

// ============================================================================
// Core Functions
// ============================================================================

/** Saves options from the UI to storage. */
function saveOptions(): void {
	// --- Read values from UI ---
	const apiKey = elements.apiKeyInput.value.trim();
	const targetLang = elements.targetLangSelect.value;
	// Use UI derived defaults as fallbacks if somehow inputs are empty
	const fontSize = elements.fontSizeInput.value || DEFAULT_UI_VALUES.fontSize;
	const textColor =
		elements.textColorInput.value || DEFAULT_UI_VALUES.textColor;
	const bgColorHex =
		elements.bgColorInput.value || DEFAULT_UI_VALUES.bgColorHex;
	const bgAlpha = parseFloat(
		elements.bgAlphaInput.value || DEFAULT_UI_VALUES.bgAlpha
	);

	// --- Validation ---
	if (!apiKey) {
		updateStatus("API Key cannot be empty.", true);
		elements.apiKeyInput.focus();
		return;
	}
	if (isNaN(bgAlpha) || bgAlpha < 0 || bgAlpha > 1) {
		updateStatus("Background Alpha must be between 0 and 1.", true);
		elements.bgAlphaInput.focus();
		return;
	}
	const fontSizeNum = parseInt(fontSize, 10);
	if (isNaN(fontSizeNum) || fontSizeNum < 8 || fontSizeNum > 30) {
		updateStatus("Font Size must be between 8 and 30.", true);
		elements.fontSizeInput.focus();
		return;
	}

	// --- Prepare settings for storage ---
	const bgColorRgba = hexAlphaToRgba(bgColorHex, bgAlpha);

	// Construct the object matching the ExtensionSettings type
	const settingsToSave: ExtensionSettings = {
		apiKey,
		targetLang,
		fontSize: fontSize, // Store as string
		textColor: textColor, // Store hex
		bgColor: bgColorRgba, // Store combined RGBA string
		zIndex: DEFAULT_STYLES.zIndex, // Include zIndex if you manage it
	};
	// Clean optional fields if empty (like apiKey, though we validate it)
	if (!settingsToSave.apiKey) delete settingsToSave.apiKey;

	console.log("Saving options:", settingsToSave);

	// --- Save to storage ---
	chrome.storage.local
		.set(settingsToSave) // Save the full object
		.then(() => {
			console.log("Options saved successfully.");
			updateStatus(MSG_SAVED_SUCCESS);
		})
		.catch((error: Error) => {
			console.error("Error saving options:", error.message);
			updateStatus(MSG_SAVE_ERROR, true);
		});
}

/** Restores options from storage into the UI. */
function restoreOptions(): void {
	// Define the keys to retrieve from storage, using ExtensionSettings keys
	// Provide the default values from constants directly to the get call
	const keysToGet: Partial<ExtensionSettings> = {
		apiKey: "", // Default to empty string if not set
		targetLang: DEFAULT_STYLES.targetLang,
		fontSize: DEFAULT_STYLES.fontSize,
		textColor: DEFAULT_STYLES.textColor, // Default is hex
		bgColor: DEFAULT_STYLES.bgColor, // Default is RGBA
		zIndex: DEFAULT_STYLES.zIndex, // If managing zIndex
	};

	chrome.storage.local
		.get(keysToGet) // Pass defaults to get()
		.then((items: Partial<ExtensionSettings>) => {
			// items will have defaults applied if keys were missing
			console.log("Options retrieved from storage:", items);

			// Populate UI elements using the retrieved values (which include defaults)
			elements.apiKeyInput.value = items.apiKey ?? "";
			elements.targetLangSelect.value = items.targetLang!;
			elements.fontSizeInput.value = items.fontSize!;
			elements.textColorInput.value = items.textColor!;

			// Handle background color (split RGBA from storage/defaults)
			// items.bgColor will be defined because we passed a default
			const { hex: bgHexValue, alpha: bgAlphaValue } = rgbaToHexAlpha(
				items.bgColor!
			);

			elements.bgColorInput.value = bgHexValue;
			elements.bgAlphaInput.value = bgAlphaValue.toString();

			// Update the displayed alpha value initially
			if (elements.bgAlphaValueSpan) {
				elements.bgAlphaValueSpan.textContent = bgAlphaValue.toFixed(2);
			}

			console.log("Options restored to UI.");
		})
		.catch((error: Error) => {
			console.error("Error loading options:", error.message);
			updateStatus(MSG_LOAD_ERROR, true);
			// If loading fails, explicitly set UI to hardcoded defaults as a fallback
			elements.apiKeyInput.value = "";
			elements.targetLangSelect.value = DEFAULT_UI_VALUES.targetLang;
			elements.fontSizeInput.value = DEFAULT_UI_VALUES.fontSize;
			elements.textColorInput.value = DEFAULT_UI_VALUES.textColor; // Default hex
			elements.bgColorInput.value = DEFAULT_UI_VALUES.bgColorHex; // Default hex for input
			elements.bgAlphaInput.value = DEFAULT_UI_VALUES.bgAlpha; // Default alpha string
			if (elements.bgAlphaValueSpan) {
				elements.bgAlphaValueSpan.textContent = parseFloat(
					DEFAULT_UI_VALUES.bgAlpha
				).toFixed(2);
			}
		});
}

// ============================================================================
// Initialization
// ============================================================================

function initializeOptionsPage(): void {
	// Check for essential elements more thoroughly
	const requiredElements = [
		elements.apiKeyInput,
		elements.targetLangSelect,
		elements.fontSizeInput,
		elements.textColorInput,
		elements.bgColorInput,
		elements.bgAlphaInput,
		elements.bgAlphaValueSpan,
		elements.saveButton,
		elements.statusElement,
	];
	if (requiredElements.some((el) => !el)) {
		console.error(
			"BubbleTranslate Options: Critical UI elements missing. Cannot initialize."
		);
		const statusDiv = document.getElementById(
			"status"
		) as HTMLDivElement | null;
		if (statusDiv) {
			statusDiv.textContent =
				"Error: Page structure incorrect. Cannot initialize options.";
			statusDiv.className = "status-message error";
		}
		// Disable save button if page is broken
		if (elements.saveButton) elements.saveButton.disabled = true;
		return;
	}

	console.log("BubbleTranslate Options: Initializing page...");

	// Restore saved settings first
	restoreOptions();

	// Add event listener for the Save button
	elements.saveButton.addEventListener("click", saveOptions);

	// Add event listener for the Alpha slider
	elements.bgAlphaInput.addEventListener("input", (event) => {
		const target = event.target as HTMLInputElement;
		if (elements.bgAlphaValueSpan) {
			elements.bgAlphaValueSpan.textContent = parseFloat(target.value).toFixed(
				2
			);
		}
	});

	console.log("BubbleTranslate Options: Page initialized successfully.");
}

// Standard DOMContentLoaded check
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeOptionsPage);
} else {
	initializeOptionsPage();
}
