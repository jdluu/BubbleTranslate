// src/shared/constants.ts

// --- API Endpoints ---
export const VISION_API_URL =
	"https://vision.googleapis.com/v1/images:annotate";
export const TRANSLATE_API_URL =
	"https://translation.googleapis.com/language/translate/v2";

// --- Defaults ---
// Ensure these values are what you want as the application defaults
export const DEFAULT_TARGET_LANG = "en"; // Default language
export const DEFAULT_STYLES = Object.freeze({
	targetLang: DEFAULT_TARGET_LANG,
	fontSize: "14", // Default font size as string (matching input type)
	textColor: "#000000", // Default text color hex (e.g., black)
	bgColor: "rgba(0, 0, 0, 0.85)", // Default BG as RGBA string (e.g., semi-transparent white)
	zIndex: "9998", // Default z-index
});

// --- Content Script Constants ---
export const MIN_IMG_WIDTH = 300;
export const MIN_IMG_HEIGHT = 400;
export const WRAPPER_CLASS = "bubbletranslate-wrapper";
export const OVERLAY_CLASS = "bubbletranslate-overlay";
export const ERROR_OVERLAY_CLASS = "bubbletranslate-error-overlay";
export const UNIQUE_ID_ATTR = "data-bubbletranslate-id";

// --- Options Page ---
export const STATUS_CLEAR_DELAY_MS = 2500; // Duration for status messages
export const MSG_SAVED_SUCCESS = "Options saved successfully!";
export const MSG_SAVE_ERROR = "Error saving options.";
export const MSG_LOAD_ERROR = "Error loading options.";
