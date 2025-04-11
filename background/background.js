// ============================================================================
// BubbleTranslate - Background Script (Service Worker)
// Author: jdluu
// Version: 1.1.0
// Description: Handles image processing requests from content scripts,
//              interacts with Cloud APIs, and sends results back.
// ============================================================================

"use strict";

console.log("BubbleTranslate: Background Service Worker Started.");

// --- Constants ---
const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";
const TRANSLATE_API_URL =
	"https://translation.googleapis.com/language/translate/v2";
const DEFAULT_TARGET_LANG = "en";

// Message action constants for consistency
const ACTION_START_TRANSLATION = "startTranslation";
const ACTION_PROCESS_IMAGE = "processImage";
const ACTION_TRIGGER_ANALYSIS = "triggerPageAnalysis";
const ACTION_DISPLAY_TRANSLATION = "displayBlockTranslation";
const ACTION_TRANSLATION_ERROR = "translationError";

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Main listener for messages from other parts of the extension (popup, content scripts).
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// Log message details (optional, uncomment for debugging)
	// console.groupCollapsed(`BubbleTranslate BG: Received message '${request.action}'`);
	// console.log("Request:", request);
	// console.log("Sender:", sender);
	// console.groupEnd();

	let isAsync = false; // Flag to indicate if sendResponse will be called asynchronously

	switch (request.action) {
		case ACTION_START_TRANSLATION:
			console.log(
				"BubbleTranslate BG: Received 'startTranslation', triggering content script analysis."
			);
			triggerAnalysisOnActiveTab(1); // Start analysis process
			// Acknowledge receipt immediately to the popup
			sendResponse({
				status: "received",
				message: "Background acknowledged startTranslation.",
			});
			break; // Essential break statement

		case ACTION_PROCESS_IMAGE:
			// This action comes from the content script for each image found
			if (sender.tab && sender.tab.id && request.imageUrl && request.imageId) {
				console.log(
					`BubbleTranslate BG: Queuing processing for image [${request.imageId}]`
				);
				// Process the image asynchronously. No immediate sync response needed here.
				handleImageProcessingPerBlock(
					request.imageUrl,
					request.imageId, // Pass the unique ID
					sender.tab.id
				);
				isAsync = true; // Indicate that processing is happening in the background
			} else {
				console.error(
					"BubbleTranslate BG: Invalid 'processImage' request. Missing tab ID, image URL, or image ID.",
					request
				);
				// Optionally send an error response back if appropriate/possible
			}
			break; // Essential break statement

		default:
			console.log(
				`BubbleTranslate BG: Received unknown action: ${request.action}`
			);
			// Optionally send a response indicating the action is unknown
			sendResponse({ status: "error", message: "Unknown action" });
			break; // Essential break statement
	}

	// Return true *only* if we are performing an async operation
	// that might use sendResponse later (although in this refactor,
	// responses for async ops like processImage are sent via tabs.sendMessage).
	// For processImage, we don't use sendResponse, so returning false or isAsync is fine.
	// Returning true generally keeps the message channel open. Let's return isAsync.
	return isAsync;
});

console.log("BubbleTranslate BG: Message listener added.");

// ============================================================================
// Core Image Processing Logic
// ============================================================================

/**
 * Orchestrates the processing for a single image:
 * Fetches settings, image data, calls OCR/Translate APIs for text blocks,
 * and sends results (or errors) back to the content script.
 * @param {string} imageUrl - The URL of the image to process.
 * @param {string} imageId - The unique identifier assigned to this image by the content script.
 * @param {number} tabId - The ID of the tab where the image is located.
 */
async function handleImageProcessingPerBlock(imageUrl, imageId, tabId) {
	console.log(`BubbleTranslate BG: Starting processing for image [${imageId}]`);

	try {
		// 1. Get API Key and Target Language from storage
		const settings = await chrome.storage.local.get(["apiKey", "targetLang"]);

		const apiKey = settings.apiKey;
		const targetLang = settings.targetLang || DEFAULT_TARGET_LANG;

		if (!apiKey) {
			throw new Error("API Key not configured in extension options.");
		}
		console.log(`   [${imageId}] Using Target Language: ${targetLang}`);

		// 2. Fetch image data and convert to Base64
		console.log(`   [${imageId}] Fetching image data...`);
		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch image: ${response.status} ${response.statusText}`
			);
		}
		const imageBlob = await response.blob();
		const base64ImageData = await blobToBase64(imageBlob);
		const cleanBase64 = base64ImageData.split(",")[1]; // Remove data URL prefix
		console.log(
			`   [${imageId}] Image data fetched (Base64 length: ${
				cleanBase64?.length || 0
			})`
		);
		if (!cleanBase64) {
			throw new Error("Failed to extract Base64 data from image.");
		}

		// 3. Call OCR to detect text blocks
		const visionResult = await callVisionApiDetectBlocks(cleanBase64, apiKey);

		if (!visionResult?.blocks || visionResult.blocks.length === 0) {
			console.log(`   [${imageId}] No text blocks found by OCR.`);
			// No error needed if no text is found, just finish processing.
			return;
		}

		console.log(
			`   [${imageId}] Vision API found ${visionResult.blocks.length} text blocks.`
		);

		// 4. Process each block: Translate and send result back
		const blockProcessingPromises = visionResult.blocks.map(
			async (block, index) => {
				if (!block.text || !block.boundingBox) {
					console.warn(
						`   [${imageId}] Skipping block ${index}: Missing text or boundingBox.`
					);
					return; // Skip block if essential data is missing
				}

				const blockTextClean = block.text.replace(/\s+/g, " ").trim();
				if (!blockTextClean) {
					console.warn(
						`   [${imageId}] Skipping block ${index}: Empty text after cleanup.`
					);
					return; // Skip empty blocks
				}

				try {
					console.log(
						`      [${imageId}] Translating block ${index}: "${blockTextClean.substring(
							0,
							40
						)}..."`
					);
					const translatedText = await callTranslateApi(
						blockTextClean,
						targetLang,
						apiKey
					);

					if (translatedText) {
						console.log(
							`      [${imageId}] Sending translation for block ${index} to tab ${tabId}`
						);
						// Send result for THIS BLOCK back to content script
						safeSendMessage(tabId, {
							action: ACTION_DISPLAY_TRANSLATION,
							imageId: imageId, // Use the unique ID
							boundingBox: block.boundingBox,
							translatedText: translatedText,
						});
					} else {
						// If translation returns null/empty but no error was thrown
						throw new Error("Translation API returned empty result.");
					}
				} catch (blockError) {
					console.error(
						`      [${imageId}] Error processing block ${index}:`,
						blockError
					);
					// Send a specific error message for this block
					sendProcessingError(
						tabId,
						imageId,
						`Block ${index}: ${
							blockError.message || "Unknown translation error"
						}`,
						block.boundingBox // Send BB for context
					);
				}
			}
		);

		// Wait for all block translations to settle (complete or fail)
		await Promise.allSettled(blockProcessingPromises);
		console.log(`   [${imageId}] Finished processing all blocks.`);
	} catch (error) {
		// Catch errors from setup (settings, fetch, OCR) or unexpected issues
		console.error(
			`BubbleTranslate BG: Critical error processing image [${imageId}]:`,
			error
		);
		// Send a general error message for the whole image
		sendProcessingError(
			tabId,
			imageId,
			error.message || "Unknown processing error."
			// No bounding box here, as it's an image-level error
		);
	}
}

// ============================================================================
// API Call Functions
// ============================================================================

/**
 * Calls Google Vision API (DOCUMENT_TEXT_DETECTION) to detect text blocks.
 * @param {string} base64ImageData - Base64 encoded image data (without prefix).
 * @param {string} apiKey - The Google Cloud API Key.
 * @returns {Promise<{ blocks: { text: string, boundingBox: object }[] }>}
 *          A promise resolving to an object containing an array of blocks.
 *          Returns empty array if no text detected or in case of API error format issues.
 * @throws {Error} If the API call fails or returns a significant error.
 */
async function callVisionApiDetectBlocks(base64ImageData, apiKey) {
	const url = `${VISION_API_URL}?key=${apiKey}`;
	const body = {
		requests: [
			{
				image: { content: base64ImageData },
				features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
				// Consider adding language hints if source language is often known, e.g., ["ja", "en"]
				// imageContext: { languageHints: ["ja"] }
			},
		],
	};

	console.log(`   Calling Vision API...`);
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		// Optional: Add a timeout signal
		// signal: AbortSignal.timeout(15000) // 15 seconds timeout
	});

	const data = await response.json();
	// console.log(`   Vision API Raw Response Status: ${response.status}`, data); // Verbose logging

	if (!response.ok) {
		const errorDetail = data?.error?.message || response.statusText;
		throw new Error(`Vision API HTTP Error ${response.status}: ${errorDetail}`);
	}
	if (!data.responses || data.responses.length === 0) {
		console.warn("   Vision API returned empty responses array.");
		return { blocks: [] }; // Not technically an error, but no data
	}
	const visionResponse = data.responses[0];
	if (visionResponse.error) {
		throw new Error(`Vision API Error: ${visionResponse.error.message}`);
	}

	// Extract structured block data from fullTextAnnotation
	const annotation = visionResponse.fullTextAnnotation;
	let extractedBlocks = [];

	if (annotation?.pages?.[0]?.blocks) {
		annotation.pages[0].blocks.forEach((block) => {
			let blockText = "";
			const boundingBox = block.boundingBox || null; // Get block's bounding box

			block.paragraphs?.forEach((para) => {
				para.words?.forEach((word) => {
					const wordText = word.symbols?.map((s) => s.text).join("") || "";
					blockText += wordText;
					// Add space based on detected break type after the word
					const breakType = word.property?.detectedBreak?.type;
					if (
						breakType === "SPACE" ||
						breakType === "SURE_SPACE" ||
						breakType === "EOL_SURE_SPACE" // Treat end-of-line space as space
					) {
						blockText += " ";
					} else if (breakType === "LINE_BREAK") {
						// Optionally add newline, but often space is better for translation context
						// blockText += "\n";
						blockText += " "; // Prefer space over newline for continuity
					}
				});
				// Add space between paragraphs if needed (handled by word breaks usually)
				// blockText += " "; // Maybe unnecessary if word breaks are sufficient
			});

			blockText = blockText.trim(); // Trim whitespace from the constructed block text
			if (blockText && boundingBox) {
				extractedBlocks.push({ text: blockText, boundingBox: boundingBox });
			}
		});
		console.log(
			`   Vision API Parsed ${extractedBlocks.length} blocks with text and boundingBox.`
		);
	} else {
		console.log(
			`   Vision API: No 'fullTextAnnotation' found or no blocks within.`
		);
		// This could happen if the image contains no text.
	}

	return { blocks: extractedBlocks };
}

/**
 * Calls Google Translate API to translate text.
 * @param {string} text - Text to translate.
 * @param {string} targetLang - Target language code (e.g., 'en').
 * @param {string} apiKey - The Google Cloud API Key.
 * @returns {Promise<string|null>} A promise resolving to the translated text or null if translation fails.
 * @throws {Error} If the API call fails or returns a significant error.
 */
async function callTranslateApi(text, targetLang, apiKey) {
	// Prevent API calls for empty strings
	if (!text || !text.trim()) {
		return null;
	}

	const url = `${TRANSLATE_API_URL}?key=${apiKey}`;
	const body = {
		q: text,
		target: targetLang,
		format: "text", // Explicitly request plain text format
	};

	// console.log(`      Calling Translate API for target '${targetLang}'...`); // Optional log
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		// Optional: Add a timeout signal
		// signal: AbortSignal.timeout(10000) // 10 seconds timeout
	});

	const data = await response.json();
	// console.log(`      Translate API Raw Response Status: ${response.status}`, data); // Verbose logging

	if (!response.ok) {
		const errorDetail = data?.error?.message || response.statusText;
		throw new Error(
			`Translate API HTTP Error ${response.status}: ${errorDetail}`
		);
	}
	if (data.error) {
		throw new Error(`Translate API Error: ${data.error.message}`);
	}

	const translation = data?.data?.translations?.[0]?.translatedText;
	if (translation) {
		// Basic HTML entity decoding (Translate API might return entities like ')
		// Use DOMParser for robust decoding if needed, but requires offscreen document in SW.
		// For simple cases:
		return translation
			.replace(/"/g, '"')
			.replace(/'/g, "'")
			.replace(/&/g, "&")
			.replace(/</g, "<")
			.replace(/>/g, ">");
	} else {
		console.warn(
			"      Translate API response structure unexpected or missing translation:",
			data
		);
		return null; // Indicate translation was not found in the response
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts a Blob object to a Base64 encoded data URL string.
 * @param {Blob} blob - The Blob to convert.
 * @returns {Promise<string>} A promise resolving with the data URL.
 * @throws {Error} If the FileReader encounters an error.
 */
function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = (event) => {
			// Provide more context on reader error
			reject(
				new Error(
					`FileReader error: ${event.target.error?.message || "Unknown error"}`
				)
			);
		};
		reader.onload = () => {
			// result is the Data URL string
			resolve(reader.result);
		};
		reader.readAsDataURL(blob);
	});
}

/**
 * Safely sends a message to a specific tab, catching potential errors
 * (e.g., if the tab was closed or the content script isn't ready).
 * @param {number} tabId - The target tab ID.
 * @param {object} message - The message object to send.
 */
function safeSendMessage(tabId, message) {
	chrome.tabs.sendMessage(tabId, message).catch((error) => {
		// Common errors: "Could not establish connection..." or "No receiving end..."
		console.warn(
			`BubbleTranslate BG: Failed to send message to tab ${tabId} (Action: ${message.action}). Error: ${error.message}`
		);
		// Decide if further action is needed, e.g., retry or log persistence
	});
}

/**
 * Sends an error message back to the content script associated with a specific image.
 * @param {number} tabId - The target tab ID.
 * @param {string} imageId - The unique ID of the image associated with the error.
 * @param {string} errorMessage - The error message text.
 * @param {object} [boundingBox=null] - Optional bounding box for block-specific errors.
 */
function sendProcessingError(tabId, imageId, errorMessage, boundingBox = null) {
	safeSendMessage(tabId, {
		action: ACTION_TRANSLATION_ERROR,
		imageId: imageId, // Use the unique ID
		error: errorMessage,
		boundingBox: boundingBox,
	});
}

/**
 * Queries for the active tab in the current window and sends the analysis trigger message.
 * Includes retry logic in case the tab query fails initially.
 * @param {number} attempt - The current attempt number.
 */
function triggerAnalysisOnActiveTab(attempt) {
	const maxAttempts = 3;
	const retryDelay = 150; // milliseconds

	// Query for the active tab in the *currently focused* window
	// This is generally more reliable when triggered from a popup action.
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (chrome.runtime.lastError) {
			console.error(
				"BubbleTranslate BG: Error querying tabs:",
				chrome.runtime.lastError.message
			);
			// Handle error appropriately, maybe stop trying
			return;
		}

		if (tabs && tabs.length > 0 && tabs[0]?.id) {
			const targetTab = tabs[0];
			const activeTabId = targetTab.id;
			console.log(
				`BubbleTranslate BG: Found active tab ${activeTabId} in window ${targetTab.windowId}. Sending trigger.`
			);

			// Send the trigger message and handle potential immediate errors/response
			chrome.tabs.sendMessage(
				activeTabId,
				{ action: ACTION_TRIGGER_ANALYSIS },
				(response) => {
					// This callback executes when the content script calls sendResponse
					if (chrome.runtime.lastError) {
						// Error sending or content script didn't respond / disconnected
						console.warn(
							`BubbleTranslate BG: No response or error sending '${ACTION_TRIGGER_ANALYSIS}' to tab ${activeTabId}. Error: ${chrome.runtime.lastError.message}`
						);
					} else {
						// Got a response from the content script's handler
						console.log(
							`BubbleTranslate BG: Content script response for '${ACTION_TRIGGER_ANALYSIS}':`,
							response
						);
					}
				}
			);
		} else {
			// Failed to find a suitable tab in the current window
			if (attempt < maxAttempts) {
				console.warn(
					`BubbleTranslate BG: Could not find active tab in currentWindow (Attempt ${attempt}/${maxAttempts}). Retrying...`
				);
				setTimeout(() => {
					triggerAnalysisOnActiveTab(attempt + 1);
				}, retryDelay * attempt); // Increase delay slightly on retries
			} else {
				console.error(
					`BubbleTranslate BG: Failed to find active tab in currentWindow after ${maxAttempts} attempts. Cannot trigger analysis.`
				);
				// Optionally notify the user via popup or badge?
			}
		}
	});
}
