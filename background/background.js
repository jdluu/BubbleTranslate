console.log("BubbleTranslate: Background Service Worker Started.");

// --- Configuration ---

// Target language for translation (MVP: Hardcoded to English)
const TARGET_LANGUAGE = "en";

// --- Event Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received.");
	// console.log("Sender:", sender); // Keep for debugging if needed
	// console.log("Request:", request); // Keep for debugging if needed

	if (request.action === "startTranslation") {
		console.log("BubbleTranslate: 'startTranslation' action received.");
		getActiveTabAndSendMessage(1);
		sendResponse({
			status: "received",
			message: "Background script acknowledged startTranslation.",
		});
		return true; // Indicate potential async work within getActiveTabAndSendMessage timeout
	} else if (request.action === "processImage") {
		console.log(
			`BubbleTranslate: Received 'processImage' action for URL: ${request.imageUrl}`
		);

		// We have the sender info here, which includes the tab ID
		if (sender.tab && sender.tab.id) {
			const tabId = sender.tab.id;
			// Call the async function to handle OCR and Translation
			handleImageProcessing(request.imageUrl, tabId);
		} else {
			console.error(
				"BubbleTranslate: Received 'processImage' but sender tab ID is missing."
			);
		}

		// No synchronous response needed back to content script for this message
		// We will send results back later using chrome.tabs.sendMessage
	} else {
		console.log("BubbleTranslate: Received unknown action:", request.action);
	}

	// Return true if you might use sendResponse asynchronously *within this listener*.
	// We return true here mainly because getActiveTabAndSendMessage uses setTimeout.
	return true;
});

console.log("BubbleTranslate: Background message listener added.");

// --- REVISED Image Processing Logic ---
async function handleImageProcessing(imageUrl, tabId) {
	console.log(
		`BubbleTranslate: Starting processing for image - ${imageUrl.substring(
			0,
			60
		)}...`
	);

	// 1. Get API Key from storage first
	chrome.storage.local.get({ apiKey: null }, async (items) => {
		if (chrome.runtime.lastError) {
			console.error(
				"BubbleTranslate: Error getting API key from storage:",
				chrome.runtime.lastError
			);
			sendProcessingError(
				tabId,
				imageUrl,
				"Failed to retrieve API key from storage."
			);
			return;
		}

		const apiKeyFromStorage = items.apiKey;

		if (!apiKeyFromStorage) {
			console.error(
				"BubbleTranslate: API Key not found in storage. Please set it on the options page."
			);
			sendProcessingError(
				tabId,
				imageUrl,
				"API Key not configured. Please set it via extension options."
			);
			return; // Stop processing if no key
		}

		console.log("BubbleTranslate: API Key retrieved from storage.");

		// 2. NOW, perform the processing INSIDE this callback, using the retrieved key
		try {
			console.log(`   Fetching image data for ${imageUrl.substring(0, 60)}...`);
			const response = await fetch(imageUrl);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch image: ${response.status} ${response.statusText}`
				);
			}
			const imageBlob = await response.blob();
			const base64ImageData = await blobToBase64(imageBlob);
			const cleanBase64 = base64ImageData.split(",")[1];
			console.log(
				`   Image data fetched and converted to Base64 (length: ${cleanBase64.length})`
			);

			// Call OCR, passing the retrieved key
			const ocrText = await callVisionApi(cleanBase64, apiKeyFromStorage); // Pass key
			if (!ocrText) {
				console.log(
					`   No text found by OCR for ${imageUrl.substring(0, 60)}...`
				);
				return;
			}
			console.log(`   OCR Result: "${ocrText.substring(0, 100)}..."`);

			// Call Translation, passing the retrieved key
			const translatedText = await callTranslateApi(
				ocrText,
				TARGET_LANGUAGE,
				apiKeyFromStorage
			); // Pass key
			if (!translatedText) {
				console.error(
					`   Translation failed for OCR text of ${imageUrl.substring(
						0,
						60
					)}...`
				);
				return;
			}
			console.log(
				`   Translation Result: "${translatedText.substring(0, 100)}..."`
			);

			// Send result back to the content script
			console.log(
				`   Sending translation back to content script (tab ${tabId})`
			);
			chrome.tabs
				.sendMessage(tabId, {
					action: "displayTranslation",
					originalImageUrl: imageUrl,
					translatedText: translatedText,
				})
				.catch((e) =>
					console.warn(
						`   Error sending displayTranslation message: ${e.message}`
					)
				);
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
	}); // --- End of chrome.storage.local.get callback ---

	// Note: handleImageProcessing itself doesn't need to be async anymore,
	// as the async work happens inside the storage.get callback.
	// Or keep it async if needed for other reasons, it doesn't hurt.
} // --- End of handleImageProcessing ---

// --- REVISED Google Cloud Vision API Call Function ---
async function callVisionApi(base64ImageData, apiKey) {
	// Added apiKey parameter
	// Accepts base64 string now
	// Use the passed apiKey
	const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
	const body = {
		requests: [
			{
				image: { content: base64ImageData },
				features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
			},
		],
	};

	try {
		console.log(`   Calling Vision API with Base64 data...`);
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await response.json();
		console.log(`   Vision API Raw Response Status: ${response.status}`);

		// Enhanced Error Checking
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

		// Extract detected text
		if (
			data.responses[0].fullTextAnnotation &&
			data.responses[0].fullTextAnnotation.text
		) {
			return data.responses[0].fullTextAnnotation.text;
		} else {
			console.log(
				`   Vision API Response did not contain fullTextAnnotation.text.`
			);
			return null;
		}
	} catch (error) {
		console.error(`   Error during Vision API call with Base64 data:`, error);
		throw error; // Re-throw to be caught by handleImageProcessing
	}
}

// --- REVISED Google Cloud Translation API Call Function ---
async function callTranslateApi(text, targetLang, apiKey) {
	// Added apiKey parameter
	// Use the passed apiKey
	const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
	const body = {
		q: text,
		target: targetLang,
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await response.json();

		if (!response.ok || data.error) {
			console.error("Translate API Error:", data.error || response.statusText);
			throw new Error(
				`Translate API Error: ${data.error?.message || response.statusText}`
			);
		}

		// Extract translated text
		if (data.data && data.data.translations && data.data.translations[0]) {
			return data.data.translations[0].translatedText;
		} else {
			console.error("Translate API Error: Unexpected response format", data);
			return null;
		}
	} catch (error) {
		console.error("Error calling Translate API:", error);
		throw error; // Re-throw to be caught by handleImageProcessing
	}
}

// --- Utility function to convert Blob to Base64 ---
function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = reject;
		reader.onload = () => {
			resolve(reader.result); // result is the data URL (e.g., "data:image/jpeg;base64,...")
		};
		reader.readAsDataURL(blob);
	});
}

// --- Utility function to send errors back to content script ---
function sendProcessingError(tabId, imageUrl, errorMessage) {
	chrome.tabs
		.sendMessage(tabId, {
			action: "translationError",
			originalImageUrl: imageUrl,
			error: errorMessage,
		})
		.catch((e) =>
			console.warn(
				`   Error sending processing error message back to content script: ${e.message}`
			)
		);
}

// --- Function to get active tab and send trigger message ---
// (Keep the getActiveTabAndSendMessage function from the previous step here)
function getActiveTabAndSendMessage(attempt) {
	const maxAttempts = 3;
	const retryDelay = 100;

	chrome.tabs.query({ active: true }, (tabs) => {
		// Using simplified query
		console.log(
			`BubbleTranslate: tabs.query({active: true}) attempt ${attempt} result:`,
			tabs
		);
		// ... (rest of this function remains the same as previous version) ...
		if (tabs && tabs.length > 0) {
			const targetTab = tabs[0];
			if (targetTab && targetTab.id) {
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
								`BubbleTranslate: Could not send/receive message to/from content script in tab ${activeTabId}. Error: ${chrome.runtime.lastError.message}`
							);
							return;
						}
						console.log(
							`BubbleTranslate: Received response from content script:`,
							response
						);
					}
				);
				console.log(
					`BubbleTranslate: Sent 'triggerPageAnalysis' message to tab ${activeTabId}`
				);
			} else {
				console.error(
					`BubbleTranslate: Found tabs array, but first element has no ID on attempt ${attempt}. Tabs array:`,
					tabs
				);
			}
		} else {
			if (attempt < maxAttempts) {
				console.warn(
					`BubbleTranslate: Failed to find ANY active tab ({active: true}) on attempt ${attempt}. Retrying in ${retryDelay}ms...`
				);
				setTimeout(() => {
					getActiveTabAndSendMessage(attempt + 1);
				}, retryDelay);
			} else {
				console.error(
					`BubbleTranslate: Failed to find ANY active tab ({active: true}) after ${maxAttempts} attempts. Query result was empty.`
				);
			}
		}
	});
}
