// src/features/page_interaction/content.ts
import { sendMessageToBackground } from "@core/messaging";
import { UNIQUE_ID_ATTR } from "@shared/constants";
import type {
	AnalysisResponseMessage,
	ContentScriptMessage, // Union of messages received BY content script
	ProcessImageMessage, // Message sent TO background
	DisplayTranslationMessage, // Message received FOR SUCCESS
	ImageProcessingErrorMessage, // Message received FOR ERROR
	SerializedApiClientError, // The structure of API errors within ImageProcessingErrorMessage
} from "@shared/types";
import { isSerializedApiClientError } from "@shared/types"; // Type guard for errors
import { findPotentialMangaImages } from "@features/page_interaction/image_finder";
import {
	displayBlockOverlay, // Displays SUCCESS overlay
	displayErrorOverlay, // Displays ERROR overlay
	loadAndApplyStyleSettings,
	clearOverlaysForImage, // Utility to clear previous overlays if needed
} from "@features/page_interaction/overlay_manager";

// --- Early console log to indicate script start ---
console.log("BubbleTranslate Content: Script executing.");

// --- Globals ---
let uniqueIdCounter = 0; // Counter for generating unique IDs for images found in this session
let isAnalysisRunning = false; // Simple flag to prevent concurrent analysis runs

// ============================================================================
// Initial Setup & Event Listeners
// ============================================================================

// Load initial styles and listen for future changes
// This runs asynchronously but doesn't block listener setup
loadAndApplyStyleSettings();
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (
		areaName === "local" &&
		(changes.fontSize || changes.textColor || changes.bgColor || changes.zIndex)
	) {
		console.log("BubbleTranslate Content: Detected style changes, reloading.");
		loadAndApplyStyleSettings();
		// Optional: Re-apply styles to existing overlays if needed
	}
});

// --- Setup message listener immediately at the top level ---
chrome.runtime.onMessage.addListener(
	(
		message: ContentScriptMessage | any, // Use 'any' for initial check
		sender: chrome.runtime.MessageSender,
		sendResponse: (response: AnalysisResponseMessage | any) => void // Adjust response type if needed
	): boolean => {
		// Return true if sendResponse will be called asynchronously

		// Ignore messages from other tabs/contexts or unexpected senders
		// Allow messages from background (no sender.tab) or potentially popup (no sender.tab)
		if (sender.tab || !message?.action || sender.id !== chrome.runtime.id) {
			// console.log("BubbleTranslate Content: Ignoring message from sender:", sender);
			return false; // Indicate synchronous handling or ignore
		}

		// Log received messages *after* sender check
		console.log(
			`BubbleTranslate Content: Received message: ${message.action}`
			// message // Log full message only if debugging
		);

		// Explicit cast for type safety within the switch
		const knownMessage = message as ContentScriptMessage;

		switch (knownMessage.action) {
			case "triggerPageAnalysis":
				if (isAnalysisRunning) {
					console.warn(
						"BubbleTranslate Content: Analysis already running, ignoring trigger."
					);
					// Ensure a response is sent even if ignoring
					sendResponse({
						status: "error",
						error: "Analysis already in progress.",
						foundCount: 0,
						sentCount: 0,
					});
					return false; // Handled synchronously
				}
				isAnalysisRunning = true; // Set flag
				// Reload styles just before analysis, ensuring freshness
				loadAndApplyStyleSettings();
				// Use try/finally to ensure flag is reset safely
				try {
					// handlePageAnalysis now handles calling sendResponse
					handlePageAnalysis(sendResponse);
				} catch (e) {
					// This catch is for immediate, synchronous errors in handlePageAnalysis setup itself
					console.error(
						"BubbleTranslate Content: Immediate error during handlePageAnalysis trigger:",
						e
					);
					sendResponse({
						status: "error",
						error:
							e instanceof Error
								? e.message
								: "Unknown content script setup error",
						foundCount: 0,
						sentCount: 0,
					});
					isAnalysisRunning = false; // Reset flag on sync error
					return false; // Error occurred synchronously
				}
				// If no synchronous error, handlePageAnalysis will call sendResponse later
				return true; // Indicate sendResponse will be called asynchronously by handlePageAnalysis

			case "displayBlockTranslation":
				// Type assertion already done via knownMessage
				const displayMsg = knownMessage as DisplayTranslationMessage;
				if (
					displayMsg.imageId &&
					displayMsg.translatedText !== undefined && // Allow empty string
					displayMsg.originalText !== undefined &&
					displayMsg.boundingBox
				) {
					// Clear any previous error overlay for this block/image before showing success
					clearOverlaysForImage(displayMsg.imageId, displayMsg.boundingBox);
					displayBlockOverlay(
						displayMsg.imageId,
						displayMsg.translatedText,
						displayMsg.originalText, // Pass original text
						displayMsg.boundingBox
					);
				} else {
					console.warn(
						"BubbleTranslate Content: Missing data for displayBlockTranslation:",
						message
					);
				}
				return false; // Synchronous handling

			case "imageProcessingError":
				// Type assertion already done via knownMessage
				const errorMsg = knownMessage as ImageProcessingErrorMessage;
				if (errorMsg.imageId && errorMsg.error) {
					// *** Prepare error info for displayErrorOverlay ***
					let displayMessage: string;
					let errorDetails: SerializedApiClientError | undefined;

					if (isSerializedApiClientError(errorMsg.error)) {
						// If it's a structured API error, extract user-friendly message
						errorDetails = errorMsg.error;
						if (errorDetails.isAuthError) {
							displayMessage = `Auth Error: Check API Key. (${errorDetails.apiName})`;
						} else if (errorDetails.isQuotaError) {
							displayMessage = `Quota Error: Usage limit likely exceeded. (${errorDetails.apiName})`;
						} else if (errorDetails.isTimeoutError) {
							displayMessage = `Timeout: Request took too long. (${errorDetails.apiName})`;
						} else if (errorDetails.isNetworkError) {
							displayMessage = `Network Error: Check connection. (${errorDetails.apiName})`;
						} else {
							// Generic API error message
							displayMessage = `API Error (${
								errorDetails.apiStatus || `HTTP ${errorDetails.httpStatus}`
							}): ${errorDetails.message.substring(0, 100)}`;
						}
						console.warn(
							`BubbleTranslate Content: API Error for image [${errorMsg.imageId}]: ${errorDetails.message}`,
							errorDetails
						);
					} else {
						// If it's just a { message: string }
						displayMessage = errorMsg.error.message;
						console.warn(
							`BubbleTranslate Content: Generic Error for image [${errorMsg.imageId}]: ${displayMessage}`
						);
					}

					// Clear any previous success overlay for this block/image before showing error
					clearOverlaysForImage(errorMsg.imageId, errorMsg.boundingBox);
					// Call displayErrorOverlay with the extracted message and the original structured error
					displayErrorOverlay(
						errorMsg.imageId,
						displayMessage, // User-friendly summary
						errorMsg.boundingBox,
						errorDetails // Pass the full structured error if available
					);
				} else {
					console.warn(
						"BubbleTranslate Content: Missing data for imageProcessingError:",
						message
					);
				}
				return false; // Synchronous handling

			default:
				console.log(
					`BubbleTranslate Content: Received unknown action: ${knownMessage.action}`
				);
				return false; // No response needed, synchronous handling
		}
	}
);

// --- Log after listener is added ---
console.log("BubbleTranslate Content: Message listener added.");

// ============================================================================
// Core Logic - Page Analysis
// ============================================================================

/**
 * Finds eligible images, assigns unique IDs, sends them to background, and responds.
 * This function calls sendResponse, so the listener must return `true`.
 * @param sendResponse - Function to send response back to the background script.
 */
function handlePageAnalysis(
	sendResponse: (response: AnalysisResponseMessage) => void
): void {
	let imagesFoundCount = 0;
	let imagesSentCount = 0;
	let pageAnalysisError: Error | null = null;
	const sentImageIds = new Set<string>(); // Keep track of images sent in this run

	try {
		const images = findPotentialMangaImages();
		imagesFoundCount = images.length;
		console.log(
			`BubbleTranslate Content: Found ${imagesFoundCount} potential images.`
		);

		if (imagesFoundCount === 0) {
			// If no images found, respond immediately and reset flag
			console.log("BubbleTranslate Content: No images found. Responding.");
			sendResponse({
				status: "noImagesFound",
				foundCount: 0,
				sentCount: 0,
			});
			isAnalysisRunning = false; // Reset flag here for this specific path
			return; // Exit early
		}

		// Process found images
		images.forEach((img: HTMLImageElement) => {
			// Assign ID and clear overlays within the loop for each image processed
			try {
				const existingId = img.getAttribute(UNIQUE_ID_ATTR);
				let imageId: string;
				if (!existingId) {
					imageId = `bt-${Date.now()}-${uniqueIdCounter++}`;
					img.setAttribute(UNIQUE_ID_ATTR, imageId);
				} else {
					imageId = existingId;
				}

				// Only process if not already sent in this run
				if (!sentImageIds.has(imageId)) {
					// Clear any previous overlays for this image before sending for processing
					clearOverlaysForImage(imageId);

					const message: ProcessImageMessage = {
						action: "processImage",
						imageUrl: img.src,
						imageId: imageId,
						imageElementId: img.id || undefined, // Send element ID if it exists
					};

					// Use an IIFE to handle async sendMessage without blocking the loop
					(async () => {
						try {
							await sendMessageToBackground(message);
							sentImageIds.add(imageId); // Mark as sent only on success
						} catch (error: any) {
							// Handle potential error during send itself
							console.error(
								`BubbleTranslate Content: Error sending message for image [${imageId}]:`,
								error
							);
							// Record the first sending error encountered
							if (!pageAnalysisError) pageAnalysisError = error;
						}
					})(); // Immediately invoke async function

					imagesSentCount++; // Increment optimistic count
				}
			} catch (taggingError: any) {
				console.error(
					`BubbleTranslate Content: Error tagging/preparing image ${img?.src?.substring(
						0,
						80
					)}...:`,
					taggingError
				);
				// Record the first tagging error encountered
				if (!pageAnalysisError) pageAnalysisError = taggingError;
			}
		}); // End of images.forEach

		// --- Response Logic ---
		// Since sending messages is async, we need to wait slightly or use a counter
		// to determine when to respond. A simple timeout is often sufficient for user actions.
		// A more robust solution might involve Promises, but let's stick to a timeout for now.

		const checkCompletionInterval = 100; // ms
		const maxWaitTime = 5000; // ms (5 seconds max wait)
		let timeWaited = 0;

		const intervalId = setInterval(() => {
			timeWaited += checkCompletionInterval;
			// Check if all optimistic sends have resolved (either success or logged error)
			// or if a major error occurred, or max wait time exceeded.
			// Using sentImageIds.size vs imagesSentCount accounts for send errors.
			if (
				pageAnalysisError ||
				sentImageIds.size === imagesSentCount ||
				timeWaited >= maxWaitTime
			) {
				clearInterval(intervalId); // Stop checking

				const finalSentCount = sentImageIds.size; // Actual successful/attempted sends
				console.log(
					`BubbleTranslate Content: Analysis response check complete. Sent: ${finalSentCount}/${imagesSentCount}. Error: ${pageAnalysisError?.message}`
				);

				if (pageAnalysisError) {
					sendResponse({
						status: "error",
						error:
							pageAnalysisError.message ||
							"Unknown content script error during analysis/send",
						foundCount: imagesFoundCount,
						sentCount: finalSentCount,
					});
				} else {
					// If no errors, respond with processing status
					sendResponse({
						status: "processingImages",
						foundCount: imagesFoundCount,
						sentCount: finalSentCount, // Report the count sent successfully
					});
				}
				isAnalysisRunning = false; // Reset flag after response is sent
			}
		}, checkCompletionInterval);
	} catch (findError: any) {
		// Catch errors during the initial findPotentialMangaImages call
		console.error(
			"BubbleTranslate Content: Error during image finding phase:",
			findError
		);
		sendResponse({
			status: "error",
			error: findError.message || "Error finding images on page",
			foundCount: 0,
			sentCount: 0,
		});
		isAnalysisRunning = false; // Reset flag
	}
	// Note: The `finally` block was removed as response/flag reset is handled within try/catch paths now
}
