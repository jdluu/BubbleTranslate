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
	displayErrorOverlay, // Displays ERROR overlay (NEEDS UPDATE for structured error)
	loadAndApplyStyleSettings,
	clearOverlaysForImage, // Utility to clear previous overlays if needed
} from "@features/page_interaction/overlay_manager";

console.log("BubbleTranslate Content: Script Loaded!");

// --- Globals ---
let uniqueIdCounter = 0; // Counter for generating unique IDs for images found in this session
let isAnalysisRunning = false; // Simple flag to prevent concurrent analysis runs

// ============================================================================
// Initial Setup & Event Listeners
// ============================================================================

// Load initial styles and listen for future changes
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

// Listen for messages from the background script or popup
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

		console.log(
			"BubbleTranslate Content: Received message:",
			message.action
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
					sendResponse({
						status: "error",
						error: "Analysis already in progress.",
						foundCount: 0,
					});
					return false; // Handled synchronously
				}
				isAnalysisRunning = true; // Set flag
				// Reload styles just before analysis, ensuring freshness
				loadAndApplyStyleSettings();
				// Use try/finally to ensure flag is reset
				try {
					handlePageAnalysis(sendResponse);
				} catch (e) {
					// This catch is for synchronous errors within handlePageAnalysis setup itself
					console.error(
						"BubbleTranslate Content: Immediate error in handlePageAnalysis:",
						e
					);
					sendResponse({
						status: "error",
						error: e instanceof Error ? e.message : "Unknown sync error",
						foundCount: 0,
					});
					isAnalysisRunning = false; // Reset flag on sync error
				} finally {
					// Reset flag after handlePageAnalysis calls sendResponse (async or sync)
					// Note: If handlePageAnalysis itself becomes fully async, flag reset needs care
					// For now, assuming sendResponse is called relatively quickly.
					// A better approach might involve promises from handlePageAnalysis.
					setTimeout(() => {
						isAnalysisRunning = false;
					}, 500); // Simple timeout fallback
				}
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
						// (This logic might live inside displayErrorOverlay eventually)
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

		images.forEach((img: HTMLImageElement) => {
			try {
				const existingId = img.getAttribute(UNIQUE_ID_ATTR);
				// Ensure image hasn't been processed already *in this specific analysis run*
				// or assign a new ID if it doesn't have one
				let imageId: string;
				if (!existingId) {
					imageId = `bt-${Date.now()}-${uniqueIdCounter++}`;
					img.setAttribute(UNIQUE_ID_ATTR, imageId);
				} else {
					imageId = existingId;
				}

				// Only send if not already sent in this run
				if (!sentImageIds.has(imageId)) {
					// Clear any previous overlays associated with this image before re-processing
					clearOverlaysForImage(imageId);

					const message: ProcessImageMessage = {
						action: "processImage",
						imageUrl: img.src,
						imageId: imageId,
						imageElementId: img.id || undefined, // Send element ID if it exists
					};

					// console.log(`BubbleTranslate Content: Sending image [${imageId}]`); // Reduce noise
					sendMessageToBackground(message)
						.then(() => {
							sentImageIds.add(imageId); // Mark as sent *after* successful send
						})
						.catch((error: Error) => {
							// Handle potential error during send itself (less common, maybe background closed)
							console.error(
								`BubbleTranslate Content: Error sending message for image [${imageId}]:`,
								error
							);
							// Don't count as sent, maybe record as pageAnalysisError?
							pageAnalysisError = pageAnalysisError || error;
						});
					imagesSentCount++; // Increment optimistic count (actual success is async)
				}
			} catch (taggingError: any) {
				console.error(
					`BubbleTranslate Content: Error tagging/preparing image ${img?.src?.substring(
						0,
						80
					)}...:`,
					taggingError
				);
				// Record the first error encountered during iteration
				pageAnalysisError = pageAnalysisError || taggingError;
			}
		});
	} catch (findError: any) {
		console.error(
			"BubbleTranslate Content: Error during image finding:",
			findError
		);
		pageAnalysisError = findError;
	} finally {
		// Use the optimistic count for immediate feedback
		const finalSentCount = imagesSentCount;
		console.log(
			`BubbleTranslate Content: Analysis finished. Attempting to send ${finalSentCount} images.`
		);
		if (pageAnalysisError) {
			sendResponse({
				status: "error",
				error:
					pageAnalysisError.message ||
					"Unknown content script error during analysis",
				foundCount: imagesFoundCount,
				sentCount: finalSentCount,
			});
		} else if (imagesFoundCount === 0) {
			sendResponse({
				status: "noImagesFound",
				foundCount: 0,
				sentCount: 0,
			});
		} else {
			sendResponse({
				status: "processingImages",
				foundCount: imagesFoundCount,
				sentCount: finalSentCount, // Report the count sent
			});
		}
		// Flag reset is handled in the listener's finally block
	}
}
