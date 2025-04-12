// src/features/page_interaction/content.ts
import { sendMessageToBackground } from "@core/messaging";
import { UNIQUE_ID_ATTR } from "@shared/constants";
import type {
	AnalysisResponseMessage,
	ContentScriptMessage,
	ProcessImageMessage,
} from "@shared/types";
import { findPotentialMangaImages } from "@features/page_interaction/image_finder";
import {
	displayBlockOverlay,
	displayErrorOverlay,
	loadAndApplyStyleSettings,
} from "@features/page_interaction/overlay_manager";

console.log("BubbleTranslate Content: Script Loaded!");

// --- Globals ---
let uniqueIdCounter = 0; // Counter for generating unique IDs for images found in this session

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
	}
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(
	(
		message: ContentScriptMessage | any, // Use 'any' for safety until all messages conform
		sender: chrome.runtime.MessageSender,
		sendResponse: (response: AnalysisResponseMessage) => void
	): boolean => {
		// Return type must be boolean or void/Promise<void>

		// Ignore messages from other tabs/contexts or without an action
		if (sender.tab || !message?.action) {
			return false;
		}

		console.log(
			"BubbleTranslate Content: Received message:",
			message.action,
			message
		);

		switch (message.action) {
			case "triggerPageAnalysis":
				// Reload styles just before analysis, ensuring freshness
				loadAndApplyStyleSettings();
				handlePageAnalysis(sendResponse);
				return true; // Indicate async response from handlePageAnalysis

			case "displayBlockTranslation":
				// Type assertion for clarity
				const displayMsg =
					message as import("@shared/types").DisplayTranslationMessage;
				if (
					displayMsg.imageId &&
					displayMsg.translatedText &&
					displayMsg.boundingBox
				) {
					displayBlockOverlay(
						displayMsg.imageId,
						displayMsg.translatedText,
						displayMsg.boundingBox
					);
				} else {
					console.warn(
						"BubbleTranslate Content: Missing data for displayBlockTranslation:",
						message
					);
				}
				return false; // No response needed

			case "translationError":
				// Type assertion for clarity
				const errorMsg =
					message as import("@shared/types").TranslationErrorMessage;
				if (errorMsg.imageId && errorMsg.error) {
					displayErrorOverlay(
						errorMsg.imageId,
						errorMsg.error,
						errorMsg.boundingBox
					);
				} else {
					console.warn(
						"BubbleTranslate Content: Missing data for translationError:",
						message
					);
				}
				return false; // No response needed

			default:
				console.log(
					`BubbleTranslate Content: Received unknown action: ${message.action}`
				);
				return false; // No response needed
		}
	}
);

// ============================================================================
// Core Logic - Page Analysis
// ============================================================================

/**
 * Finds eligible images, assigns unique IDs, sends them to background, and responds.
 * @param sendResponse - Function to send response back to the background script.
 */
function handlePageAnalysis(
	sendResponse: (response: AnalysisResponseMessage) => void
): void {
	let imagesFoundCount = 0;
	let imagesSentCount = 0;
	let pageAnalysisError: Error | null = null;

	try {
		const images = findPotentialMangaImages();
		imagesFoundCount = images.length;
		console.log(
			`BubbleTranslate Content: Found ${imagesFoundCount} potential images.`
		);

		images.forEach((img: HTMLImageElement) => {
			try {
				// Ensure image hasn't been processed already in this session
				if (!img.hasAttribute(UNIQUE_ID_ATTR)) {
					const imageId = `bt-${Date.now()}-${uniqueIdCounter++}`;
					img.setAttribute(UNIQUE_ID_ATTR, imageId); // Tag the image

					const message: ProcessImageMessage = {
						action: "processImage",
						imageUrl: img.src,
						imageId: imageId,
					};

					console.log(`BubbleTranslate Content: Sending image [${imageId}]`);
					// Use helper for clarity, although direct call is fine too
					sendMessageToBackground(message).catch((error: Error) => {
						// Handle potential error during send itself (less common)
						console.error(
							`BubbleTranslate Content: Error sending message for image [${imageId}]:`,
							error
						);
						// Decide if this should count as a pageAnalysisError
					});
					imagesSentCount++;
				}
			} catch (taggingError: any) {
				console.error(
					`BubbleTranslate Content: Error tagging/sending image ${img?.src?.substring(
						0,
						80
					)}...:`,
					taggingError
				);
				pageAnalysisError = pageAnalysisError || taggingError; // Keep first error
			}
		});
	} catch (findError: any) {
		console.error(
			"BubbleTranslate Content: Error during image finding:",
			findError
		);
		pageAnalysisError = findError;
	} finally {
		console.log(
			`BubbleTranslate Content: Analysis finished. Sent ${imagesSentCount} new images.`
		);
		if (pageAnalysisError) {
			sendResponse({
				status: "error",
				error: pageAnalysisError.message || "Unknown content script error",
				foundCount: imagesFoundCount,
				sentCount: imagesSentCount,
			});
		} else {
			sendResponse({
				status: "processingImages",
				foundCount: imagesFoundCount,
				sentCount: imagesSentCount,
			});
		}
	}
}
