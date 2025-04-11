// ============================================================================
// BubbleTranslate - Options Script (options.js)
// Author: jdluu
// Version: 1.1.0
// Description: Handles loading and saving of settings for the BubbleTranslate
//              extension via the options page UI.
// ============================================================================

"use strict";

// --- Constants ---
const defaultStyles = Object.freeze({
	// Use Object.freeze for immutable defaults
	fontSize: "14",
	textColor: "#FFFFFF",
	bgColor: "rgba(0, 0, 0, 0.75)",
	// Consider adding zIndex default if it becomes configurable
	// zIndex: "9998",
});

const STATUS_CLEAR_DELAY_MS = 2500; // Delay before clearing status message (in milliseconds)
const MSG_SAVED_SUCCESS = "Options saved successfully!";
const MSG_SAVE_ERROR = "Error saving options.";
const MSG_LOAD_ERROR = "Error loading options.";

// --- DOM Element References ---
// Cache frequently accessed DOM elements for better performance and cleaner code
const elements = {
	apiKeyInput: document.getElementById("apiKey"),
	targetLangSelect: document.getElementById("targetLanguage"),
	fontSizeInput: document.getElementById("fontSize"),
	textColorInput: document.getElementById("textColor"),
	bgColorInput: document.getElementById("bgColor"),
	saveButton: document.getElementById("saveButton"),
	statusElement: document.getElementById("status"),
};

// --- Globals ---
let statusClearTimer = null; // Timer ID for clearing the status message

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Updates the status message element with text and optional error styling.
 * Clears any existing timeout before setting a new one.
 * @param {string} message - The text to display.
 * @param {boolean} [isError=false] - If true, applies an error style.
 */
function updateStatus(message, isError = false) {
	if (!elements.statusElement) return; // Guard clause if status element is missing

	// Clear any previous timer to prevent premature clearing
	if (statusClearTimer) {
		clearTimeout(statusClearTimer);
	}

	elements.statusElement.textContent = message;
	elements.statusElement.classList.toggle("error", isError); // Add/remove 'error' class
	elements.statusElement.classList.toggle("success", !isError && !!message); // Add 'success' class if not error and has message

	// Set a timer to clear the message after a delay, unless the message is empty
	if (message) {
		statusClearTimer = setTimeout(() => {
			elements.statusElement.textContent = "";
			elements.statusElement.classList.remove("error", "success");
			statusClearTimer = null; // Reset timer ID
		}, STATUS_CLEAR_DELAY_MS);
	}
}

/**
 * Saves the current option values from the UI to chrome.storage.local.
 * Provides user feedback via the status element.
 */
function saveOptions() {
	// Retrieve values directly from cached elements
	const apiKey = elements.apiKeyInput.value.trim(); // Trim whitespace
	const targetLang = elements.targetLangSelect.value;
	const fontSize = elements.fontSizeInput.value || defaultStyles.fontSize; // Fallback to default
	const textColor = elements.textColorInput.value || defaultStyles.textColor;
	const bgColor = elements.bgColorInput.value || defaultStyles.bgColor;

	// Basic validation: Check if API Key is entered
	if (!apiKey) {
		updateStatus("API Key cannot be empty.", true);
		elements.apiKeyInput.focus(); // Focus the input field
		return; // Prevent saving if API key is missing
	}

	console.log("Saving options:", {
		apiKey,
		targetLang,
		fontSize,
		textColor,
		bgColor,
	});

	chrome.storage.local.set(
		{
			apiKey: apiKey,
			targetLang: targetLang,
			fontSize: fontSize,
			textColor: textColor,
			bgColor: bgColor,
			// Add other settings like zIndex here if needed
		},
		() => {
			// Callback after save attempt
			if (chrome.runtime.lastError) {
				console.error(
					"Error saving options:",
					chrome.runtime.lastError.message
				);
				updateStatus(MSG_SAVE_ERROR, true);
			} else {
				console.log("Options saved successfully.");
				updateStatus(MSG_SAVED_SUCCESS);
			}
		}
	);
}

/**
 * Restores option values from chrome.storage.local into the UI fields.
 * Uses defaults if values are not found in storage.
 */
function restoreOptions() {
	// Define keys to retrieve with their default values
	const itemsToGet = {
		apiKey: "",
		targetLang: "en", // Default language
		fontSize: defaultStyles.fontSize,
		textColor: defaultStyles.textColor,
		bgColor: defaultStyles.bgColor,
		// Add other settings like zIndex here if needed
	};

	chrome.storage.local.get(itemsToGet, (items) => {
		if (chrome.runtime.lastError) {
			console.error("Error loading options:", chrome.runtime.lastError.message);
			updateStatus(MSG_LOAD_ERROR, true);
			// Consider setting defaults in UI even on load error? Optional.
		} else {
			// Populate UI elements with loaded values
			elements.apiKeyInput.value = items.apiKey;
			elements.targetLangSelect.value = items.targetLang;
			elements.fontSizeInput.value = items.fontSize;
			elements.textColorInput.value = items.textColor;
			elements.bgColorInput.value = items.bgColor;
			console.log("Options restored:", items);
		}
	});
}

// ============================================================================
// Initialization and Event Listeners
// ============================================================================

/**
 * Initializes the options page by restoring saved options and setting up event listeners.
 */
function initializeOptionsPage() {
	// Verify essential elements exist
	if (
		!elements.saveButton ||
		!elements.apiKeyInput ||
		!elements.statusElement
	) {
		console.error(
			"BubbleTranslate Options: Critical UI elements are missing. Aborting initialization."
		);
		if (elements.statusElement)
			elements.statusElement.textContent = "Error: Page structure incorrect.";
		return;
	}

	// Restore saved settings when the DOM is ready
	restoreOptions();

	// Add listener to the save button
	elements.saveButton.addEventListener("click", saveOptions);

	console.log("BubbleTranslate Options: Page initialized.");
}

// Run initialization when the DOM is fully loaded
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeOptionsPage);
} else {
	// DOM is already ready
	initializeOptionsPage();
}
