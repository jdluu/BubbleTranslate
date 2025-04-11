// ============================================================================
// BubbleTranslate - Background Script (Service Worker)
// ============================================================================

console.log("BubbleTranslate: Background Service Worker Started.");

// --- Globals ---
// Cache for translation results (Temporarily disabled for block processing implementation)
// const translationCache = new Map();

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Main listener for messages from popup or content scripts.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received.");
	// console.log("Sender:", sender); // Optional: Log sender details if needed
	// console.log("Request:", request); // Optional: Log full request if needed

	switch (request.action) {
		case "startTranslation":
			console.log("BubbleTranslate: 'startTranslation' action received.");
			// Optional: Clear cache here if re-enabled later
			// translationCache.clear();
			getActiveTabAndSendMessage(1); // Trigger content script analysis
			// Send immediate acknowledgement back to popup
			sendResponse({
				status: "received",
				message: "Background acknowledged startTranslation.",
			});
			break; // Added break statement

		case "processImage":
			console.log(
				`BubbleTranslate: Received 'processImage' for URL: ${request.imageUrl.substring(
					0,
					100
				)}...`
			);
			if (sender.tab && sender.tab.id) {
				const tabId = sender.tab.id;
				// Initiate processing for each image URL received from content script
				handleImageProcessingPerBlock(request.imageUrl, tabId);
			} else {
				console.error(
					"BubbleTranslate: Received 'processImage' but sender tab ID is missing."
				);
			}
			// No synchronous response needed for this message type
			break; // Added break statement

		default:
			console.log("BubbleTranslate: Received unknown action:", request.action);
			// Optionally handle unknown actions or send an error response
			break; // Added break statement
	}

	// Return true to indicate potential asynchronous operations (like API calls, timeouts)
	// This keeps the message channel open for potential future sendResponse calls (though not used sync here).
	return true;
});

console.log("BubbleTranslate: Background message listener added.");

// ============================================================================
// Core Image Processing Logic
// ============================================================================

/**
 * Fetches settings, image data, calls OCR/Translate APIs for text blocks,
 * and sends results back to the content script.
 * @param {string} imageUrl - The URL of the image to process.
 * @param {number} tabId - The ID of the tab where the image is located.
 */
async function handleImageProcessingPerBlock(imageUrl, tabId) {
	console.log(
		`BubbleTranslate: Starting BLOCK processing for image - ${imageUrl.substring(
			0,
			60
		)}...`
	);

	// --- Cache Check (Disabled for now) ---
	// Future: Add block-level caching logic here if needed
	// ------------------------------------

	// 1. Get API Key and Target Language from storage
	chrome.storage.local.get(["apiKey", "targetLang"], async (items) => {
		if (chrome.runtime.lastError) {
			console.error(
				"BubbleTranslate: Error getting settings from storage:",
				chrome.runtime.lastError
			);
			sendProcessingError(
				tabId,
				imageUrl,
				"Failed to retrieve settings from storage."
			);
			return;
		}
		const apiKeyFromStorage = items.apiKey;
		const targetLangFromStorage = items.targetLang || "en"; // Default to 'en'

		if (!apiKeyFromStorage) {
			console.error("BubbleTranslate: API Key not found in storage.");
			sendProcessingError(
				tabId,
				imageUrl,
				"API Key not configured in extension options."
			);
			return;
		}
		console.log(
			`   Using API Key (loaded) and Target Language: ${targetLangFromStorage}`
		);

		// 2. Perform processing (Fetch, Base64, OCR, Translate per block)
		try {
			console.log(`   Fetching image data for Base64...`);
			const response = await fetch(imageUrl);
			if (!response.ok)
				throw new Error(
					`Failed to fetch image: ${response.status} ${response.statusText}`
				);
			const imageBlob = await response.blob();
			const base64ImageData = await blobToBase64(imageBlob);
			const cleanBase64 = base64ImageData.split(",")[1];
			console.log(
				`   Image data fetched (Base64 length: ${cleanBase64.length})`
			);

			// Call OCR to get structured block data
			const visionResult = await callVisionApiDetectBlocks(
				cleanBase64,
				apiKeyFromStorage
			);

			if (
				visionResult &&
				visionResult.blocks &&
				visionResult.blocks.length > 0
			) {
				console.log(
					`   Vision API found ${visionResult.blocks.length} text blocks.`
				);

				// Process each block (can run in parallel)
				const translationPromises = visionResult.blocks.map(async (block) => {
					if (block.text && block.boundingBox) {
						try {
							const blockTextClean = block.text.replace(/\s+/g, " ").trim(); // Basic text cleanup
							if (!blockTextClean) return; // Skip empty blocks

							console.log(
								`      Translating block: "${blockTextClean.substring(
									0,
									50
								)}..."`
							);
							const translatedText = await callTranslateApi(
								blockTextClean,
								targetLangFromStorage,
								apiKeyFromStorage
							);

							if (translatedText) {
								// Send result for THIS BLOCK back to content script
								console.log(
									`      Sending block translation back to tab ${tabId}`
								);
								chrome.tabs
									.sendMessage(tabId, {
										action: "displayBlockTranslation", // New action for content script
										originalImageUrl: imageUrl,
										boundingBox: block.boundingBox, // Send coordinates
										translatedText: translatedText,
									})
									.catch((e) =>
										console.warn(
											`      Error sending block translation message: ${e.message}`
										)
									);
							} else {
								console.warn(
									`      Translation failed for block: "${blockTextClean.substring(
										0,
										50
									)}..."`
								);
							}
						} catch (translateError) {
							console.error(
								`      Error during translation for block: "${block.text.substring(
									0,
									50
								)}..."`,
								translateError
							);
							sendProcessingError(
								tabId,
								imageUrl,
								`Translation error for block: ${translateError.message}`,
								block.boundingBox
							);
						}
					}
				});

				await Promise.allSettled(translationPromises);
				console.log(
					`   Finished processing all blocks for ${imageUrl.substring(
						0,
						60
					)}...`
				);
			} else {
				console.log(
					`   No text blocks found by OCR for ${imageUrl.substring(0, 60)}...`
				);
			}
		} catch (error) {
			console.error(
				`BubbleTranslate: Error processing image ${imageUrl}:`,
				error
			);
			sendProcessingError(
				tabId,
				imageUrl,
				error.message || "Unknown processing error."
			);
		}
	}); // End of chrome.storage.local.get callback
}

// ============================================================================
// API Call Functions
// ============================================================================

/**
 * Calls Google Vision API to detect text blocks and bounding boxes.
 * @param {string} base64ImageData - Base64 encoded image data (without prefix).
 * @param {string} apiKey - The Google Cloud API Key.
 * @returns {Promise<object|null>} A promise resolving to an object { blocks: [{ text: string, boundingBox: object }] } or null.
 */
async function callVisionApiDetectBlocks(base64ImageData, apiKey) {
	const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
	const body = {
		requests: [
			{
				image: { content: base64ImageData },
				features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
				// Optional: Add language hints if needed
				// "imageContext": { "languageHints": ["ja", "en"] }
			},
		],
	};

	try {
		console.log(`   Calling Vision API (DOCUMENT_TEXT_DETECTION)...`);
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await response.json();
		console.log(`   Vision API Raw Response Status: ${response.status}`);

		// Error Checking
		if (!response.ok) {
			throw new Error(`Vision API HTTP Error: ${response.statusText}`);
		}
		if (data.error) {
			throw new Error(
				`Vision API Error: ${data.error.message || "Unknown top-level error"}`
			);
		}
		if (!data.responses || data.responses.length === 0) {
			throw new Error("Vision API Error: No response data received.");
		}
		if (data.responses[0].error) {
			throw new Error(
				`Vision API Error: ${
					data.responses[0].error.message || "Unknown error in response"
				}`
			);
		}

		// Extract structured block data
		const annotation = data.responses[0].fullTextAnnotation;
		if (annotation && annotation.pages && annotation.pages.length > 0) {
			let extractedBlocks = [];
			annotation.pages.forEach((page) => {
				if (!page.blocks) return; // Skip page if no blocks
				page.blocks.forEach((block) => {
					let blockText = "";
					let boundingBox = block.boundingBox || null;
					if (!block.paragraphs) return; // Skip block if no paragraphs

					block.paragraphs.forEach((para) => {
						if (!para.words) return; // Skip para if no words
						para.words.forEach((word) => {
							if (!word.symbols) return; // Skip word if no symbols
							// Reconstruct word/sentence from symbols
							blockText += word.symbols.map((symbol) => symbol.text).join("");
							// Add space if detected break type is SPACE or SURE_SPACE
							const breakType = word.property?.detectedBreak?.type;
							if (breakType === "SPACE" || breakType === "SURE_SPACE") {
								blockText += " ";
							}
						});
						// Add newline if paragraph break detected (might need refinement based on API response details)
						const paraBreakType = para.property?.detectedBreak?.type;
						if (
							paraBreakType === "LINE_BREAK" ||
							paraBreakType === "EOL_SURE_SPACE"
						) {
							blockText += "\n";
						} else {
							blockText += " "; // Space between paragraphs if no explicit break
						}
					});
					blockText = blockText.trim().replace(/\s+\n/g, "\n"); // Cleanup whitespace

					if (blockText && boundingBox) {
						extractedBlocks.push({ text: blockText, boundingBox: boundingBox });
					}
				});
			});
			console.log(
				`   Vision API Parsed ${extractedBlocks.length} blocks with text and boundingBox.`
			);
			return { blocks: extractedBlocks };
		} else {
			console.log(
				`   Vision API Response did not contain structured text annotations.`
			);
			return { blocks: [] };
		}
	} catch (error) {
		console.error(`   Error during Vision API call:`, error);
		throw error; // Re-throw to be caught by handleImageProcessingPerBlock
	}
}

/**
 * Calls Google Translate API.
 * @param {string} text - Text to translate.
 * @param {string} targetLang - Target language code (e.g., 'en').
 * @param {string} apiKey - The Google Cloud API Key.
 * @returns {Promise<string|null>} A promise resolving to the translated text or null.
 */
async function callTranslateApi(text, targetLang, apiKey) {
	const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
	const body = { q: text, target: targetLang };

	try {
		const response = await fetch(url, {
			/* ... fetch options ... */
		});
		const data = await response.json();
		if (!response.ok || data.error) {
			throw new Error(/* ... */);
		}
		if (data.data?.translations?.[0]) {
			return data.data.translations[0].translatedText;
		} else {
			/* ... handle unexpected format ... */ return null;
		}
	} catch (error) {
		/* ... handle error ... */ throw error;
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts a Blob object to a Base64 encoded data URL string.
 * @param {Blob} blob - The Blob to convert.
 * @returns {Promise<string>} A promise resolving with the data URL.
 */
function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = reject;
		reader.onload = () => {
			resolve(reader.result);
		};
		reader.readAsDataURL(blob);
	});
}

/**
 * Sends an error message back to the content script.
 * @param {number} tabId - The target tab ID.
 * @param {string} imageUrl - The original image URL associated with the error.
 * @param {string} errorMessage - The error message text.
 * @param {object} [boundingBox=null] - Optional bounding box if the error relates to a specific block.
 */
function sendProcessingError(
	tabId,
	imageUrl,
	errorMessage,
	boundingBox = null
) {
	chrome.tabs
		.sendMessage(tabId, {
			action: "translationError",
			originalImageUrl: imageUrl,
			error: errorMessage,
			boundingBox: boundingBox,
		})
		.catch((e) =>
			console.warn(`   Error sending processing error message: ${e.message}`)
		);
}

/**
 * Queries for the active tab and sends the initial analysis trigger message
 * to the content script, with retry logic.
 * @param {number} attempt - The current attempt number.
 */
function getActiveTabAndSendMessage(attempt) {
	const maxAttempts = 3;
	const retryDelay = 100; // milliseconds

	chrome.tabs.query({ active: true }, (tabs) => {
		console.log(
			`BubbleTranslate: tabs.query({active: true}) attempt ${attempt} result:`,
			tabs
		);
		if (tabs && tabs.length > 0 && tabs[0] && tabs[0].id) {
			const targetTab = tabs[0];
			const activeTabId = targetTab.id;
			console.log(
				`BubbleTranslate: Found active tab ID: ${activeTabId} in window ${targetTab.windowId} on attempt ${attempt}`
			);

			chrome.tabs.sendMessage(
				activeTabId,
				{ action: "triggerPageAnalysis" },
				(response) => {
					if (chrome.runtime.lastError) {
						console.warn(
							`BubbleTranslate: Could not get response from content script for 'triggerPageAnalysis' in tab ${activeTabId}. Error: ${chrome.runtime.lastError.message}`
						);
						return;
					}
					console.log(
						`BubbleTranslate: Received response from content script for 'triggerPageAnalysis':`,
						response
					);
				}
			);
			console.log(
				`BubbleTranslate: Sent 'triggerPageAnalysis' message to tab ${activeTabId}`
			);
		} else {
			// Failed to find tab
			if (attempt < maxAttempts) {
				console.warn(
					`BubbleTranslate: Failed to find ANY active tab on attempt ${attempt}. Retrying in ${retryDelay}ms...`
				);
				setTimeout(() => {
					getActiveTabAndSendMessage(attempt + 1);
				}, retryDelay);
			} else {
				console.error(
					`BubbleTranslate: Failed to find ANY active tab after ${maxAttempts} attempts.`
				);
			}
		}
	});
}
