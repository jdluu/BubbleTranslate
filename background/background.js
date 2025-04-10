console.log("BubbleTranslate: Background Service Worker Started.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received in background script.");

	if (request.action === "startTranslation") {
		console.log("BubbleTranslate: 'startTranslation' action received.");

		// Call function to get tab and send message, allowing retries
		getActiveTabAndSendMessage(1); // Start with attempt 1

		// Send immediate response back to popup
		sendResponse({
			status: "received",
			message: "Background script acknowledged startTranslation.",
		});
	} else if (request.action === "processImage") {
		// --- Listener for messages from content.js ---
		console.log(
			`BubbleTranslate: Received 'processImage' action for URL: ${request.imageUrl}`
		);
		// TODO: Implement OCR and Translation logic here for the received imageUrl
		// This is where you would call Google Vision API etc.

		// No response needed back to content script for this action (for now)
	} else {
		console.log("BubbleTranslate: Received unknown action:", request.action);
	}

	// Return true if sendResponse might be called asynchronously *within this listener*.
	// Since we call it synchronously for 'startTranslation' and not at all yet for 'processImage',
	// it's not strictly needed, but good practice if async responses might be added.
	return true;
});

console.log("BubbleTranslate: Background message listener added.");

// --- Helper function with retry logic ---
function getActiveTabAndSendMessage(attempt) {
	const maxAttempts = 3; // Try up to 3 times
	const retryDelay = 100; // Wait 100ms between retries

	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		console.log(`BubbleTranslate: tabs.query attempt ${attempt} result:`, tabs);

		if (tabs && tabs.length > 0 && tabs[0].id) {
			const activeTabId = tabs[0].id;
			console.log(
				`BubbleTranslate: Found active tab ID: ${activeTabId} on attempt ${attempt}`
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
			// Failed to find tab
			if (attempt < maxAttempts) {
				console.warn(
					`BubbleTranslate: Failed to find active tab on attempt ${attempt}. Retrying in ${retryDelay}ms...`
				);
				setTimeout(() => {
					getActiveTabAndSendMessage(attempt + 1); // Retry
				}, retryDelay);
			} else {
				console.error(
					`BubbleTranslate: Failed to find active tab after ${maxAttempts} attempts. Query result was:`,
					tabs
				);
			}
		}
	});
}

// --- Added listener placeholder for messages FROM content script ---
// Note: This listener was implicitly added above within the main onMessage listener
// to handle "processImage". Ensure only one primary onMessage listener is active.
// The code above already handles multiple actions within the single listener.
