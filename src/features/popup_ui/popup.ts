// src/features/popup_ui/popup.ts
import { sendMessageToBackground } from "@core/messaging";
import type {
	StartTranslationMessage,
	BackgroundResponse,
} from "@shared/types"; // Use 'import type'

// --- Constants ---
// Define the key used to store the API key in chrome.storage
// IMPORTANT: This MUST match the key used in options.ts (which is 'apiKey' based on the input ID)
const API_KEY_STORAGE_KEY = "apiKey";
const STATUS_CLEAR_DELAY_MS = 3000; // Default duration for status messages
const ERROR_DISPLAY_DURATION_MS = 5000; // Longer duration for errors

console.log("BubbleTranslate Popup: Initializing.");

// --- Globals ---
let statusClearTimer: number | null = null; // Timer for clearing status messages

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Updates the status message element temporarily.
 * Mirrors the logic from options.ts's updateStatus.
 * @param element The HTML element to display the message in.
 * @param message The text message to display.
 * @param type The type of message ('error', 'success', or 'info').
 * @param duration How long to display the message in milliseconds.
 */
function showTemporaryStatus(
	element: HTMLElement | null,
	message: string,
	type: "error" | "success" | "info" = "info",
	duration: number = STATUS_CLEAR_DELAY_MS
): void {
	if (!element) return;

	// Clear any existing timeout
	if (statusClearTimer !== null) {
		clearTimeout(statusClearTimer);
		statusClearTimer = null;
	}

	element.textContent = message;
	element.className = "status"; // Reset classes, keep base 'status' class
	if (type !== "info") {
		element.classList.add(type); // Add 'error' or 'success'
	}

	// Set a timer to clear the message
	if (message) {
		statusClearTimer = window.setTimeout(() => {
			// Only clear if the message hasn't been changed by another call
			if (element.textContent === message) {
				element.textContent = "";
				element.className = "status"; // Clear type classes
			}
			statusClearTimer = null;
		}, duration);
	}
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Sets up event listeners and handles UI interactions once the DOM is ready.
 */
function initializePopup(): void {
	// Type assertions for elements expected to exist
	const translateButton = document.getElementById(
		"translateButton"
	) as HTMLButtonElement | null;
	const statusMessage = document.getElementById(
		"statusMessage"
	) as HTMLParagraphElement | null; // Assuming it's a <p> or <div>

	// --- Initial Checks ---
	if (!translateButton) {
		console.error("BubbleTranslate Popup: Translate button element not found.");
		// Use the helper function for consistency, even for setup errors
		showTemporaryStatus(
			statusMessage,
			"Error: UI component missing.",
			"error",
			ERROR_DISPLAY_DURATION_MS
		);
		return;
	}
	if (!statusMessage) {
		// Log error but continue if button exists, status updates will just fail silently
		console.error("BubbleTranslate Popup: Status message element not found.");
	}

	console.log("BubbleTranslate Popup: UI elements found, adding listener.");

	// --- Event Listener ---
	// Make the event listener async to use await for chrome.storage.local.get
	translateButton.addEventListener("click", async () => {
		console.log("BubbleTranslate Popup: Translate button clicked.");

		// --- API Key Check ---
		try {
			// Get the API key from chrome.storage.local (as used in options.ts)
			const storageResult = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
			const apiKey = storageResult[API_KEY_STORAGE_KEY];

			// Validate the API key
			if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
				console.warn("BubbleTranslate Popup: API Key is missing or empty.");
				showTemporaryStatus(
					statusMessage,
					"API Key missing. Please set it in the extension options.",
					"error",
					ERROR_DISPLAY_DURATION_MS // Show key error longer
				);
				return; // IMPORTANT: Stop processing if the key is invalid
			}

			// --- Key exists, proceed with translation request ---
			console.log(
				"BubbleTranslate Popup: API Key found. Proceeding with translation request..."
			);

			translateButton.disabled = true; // Disable button only when sending
			// Show immediate feedback that we are starting
			if (statusMessage) {
				statusMessage.textContent = "Requesting analysis...";
				statusMessage.className = "status"; // Clear previous error/success classes
				if (statusClearTimer !== null) clearTimeout(statusClearTimer); // Clear pending clears
			}

			const message: StartTranslationMessage = { action: "startTranslation" };

			// Send message and await response
			const backgroundResponse =
				await sendMessageToBackground<BackgroundResponse>(message);

			console.log(
				"BubbleTranslate Popup: Received response:",
				backgroundResponse
			);

			// Handle response using the status helper
			if (backgroundResponse?.status === "received") {
				showTemporaryStatus(statusMessage, "Analysis started!", "success");
			} else {
				// Handle error or unexpected responses from background
				const responseMsg =
					backgroundResponse?.message || "Unknown response from background.";
				showTemporaryStatus(
					statusMessage,
					responseMsg,
					"error",
					ERROR_DISPLAY_DURATION_MS
				);
			}
		} catch (error) {
			// Handle errors during storage access or message sending
			console.error(
				"BubbleTranslate Popup: Error during click handler:",
				error
			);
			const errorMessage =
				error instanceof Error ? error.message : "An unknown error occurred.";
			showTemporaryStatus(
				statusMessage,
				`Error: ${errorMessage}`,
				"error",
				ERROR_DISPLAY_DURATION_MS
			);
		} finally {
			// Always re-enable the button if it was disabled
			if (translateButton.disabled) {
				translateButton.disabled = false;
				console.log("BubbleTranslate Popup: Translate button re-enabled.");
			}
		}

		console.log("BubbleTranslate Popup: Click handler finished.");
	});

	console.log("BubbleTranslate Popup: Initialization complete.");
}

// ============================================================================
// Initialization Trigger
// ============================================================================

// Standard DOMContentLoaded check remains the same
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializePopup);
} else {
	// DOM is already ready
	initializePopup();
}
