// ============================================================================
// BubbleTranslate - Popup Script (popup.js)
// Author: jdluu
// Version: 1.1.0
// Description: Handles user interaction in the extension's popup window,
//              primarily triggering the translation process via the background script.
// ============================================================================

"use strict";

// Use a constant for the action name for consistency and maintainability
const ACTION_START_TRANSLATION = "startTranslation";

console.log("BubbleTranslate Popup: Initializing.");

/**
 * Sets up event listeners and handles UI interactions once the DOM is ready.
 */
function initializePopup() {
	const translateButton = document.getElementById("translateButton");
	const statusMessage = document.getElementById("statusMessage");

	// Ensure essential UI elements are present before proceeding
	if (!translateButton) {
		console.error("BubbleTranslate Popup: Translate button element not found.");
		if (statusMessage)
			statusMessage.textContent = "Error: UI component missing.";
		return; // Stop execution if button is missing
	}
	if (!statusMessage) {
		// Log error but proceed if only status is missing (button might still work)
		console.error("BubbleTranslate Popup: Status message element not found.");
	}

	console.log("BubbleTranslate Popup: UI elements found, adding listener.");

	// Add click listener to the main action button
	translateButton.addEventListener("click", () => {
		console.log("BubbleTranslate Popup: Translate button clicked.");

		// Provide immediate feedback and prevent multiple clicks
		translateButton.disabled = true;
		if (statusMessage) {
			statusMessage.textContent = "Requesting analysis...";
			statusMessage.classList.remove("error"); // Clear previous error state if any
		}

		// Send message to the background script to initiate the process
		chrome.runtime.sendMessage(
			{ action: ACTION_START_TRANSLATION },
			(response) => {
				// This callback runs asynchronously after the background script responds (or fails)

				// Always re-enable the button once the operation is complete or fails
				translateButton.disabled = false;

				// Check for errors during message sending/reception
				if (chrome.runtime.lastError) {
					console.error(
						"BubbleTranslate Popup: Error sending message:",
						chrome.runtime.lastError.message
					);
					if (statusMessage) {
						statusMessage.textContent = "Error: Could not connect.";
						statusMessage.classList.add("error"); // Optional: Add CSS class for error styling
					}
					return; // Exit callback on error
				}

				// Handle the response from the background script
				console.log("BubbleTranslate Popup: Received response:", response);
				if (statusMessage) {
					if (response && response.status === "received") {
						// Background acknowledged the request
						statusMessage.textContent = "Analysis started!";
						// Optionally hide status message after a delay
						// setTimeout(() => { statusMessage.textContent = ''; }, 3000);
					} else {
						// Handle unexpected responses or statuses
						statusMessage.textContent = "Request sent."; // Generic confirmation
					}
				}
			}
		); // End of sendMessage callback

		console.log("BubbleTranslate Popup: Message sent to background script.");
	}); // End of event listener

	console.log("BubbleTranslate Popup: Initialization complete.");
}

// Ensure the DOM is fully loaded before trying to access elements
if (
	document.readyState === "loading" ||
	document.readyState === "interactive"
) {
	// Still loading, wait for the event
	document.addEventListener("DOMContentLoaded", initializePopup);
} else {
	// DOM is already ready, execute immediately
	initializePopup();
}
