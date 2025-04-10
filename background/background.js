console.log("BubbleTranslate: Background Service Worker Started.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// Log sender info ONCE per message received
	// For popups, sender.tab is usually undefined, but sender.id (extension ID) and url (popup URL) are present.
	console.log("BubbleTranslate: Message received.");
	console.log("Sender:", sender);
	console.log("Request:", request);

	if (request.action === "startTranslation") {
		console.log("BubbleTranslate: 'startTranslation' action received.");
		getActiveTabAndSendMessage(1); // Start with attempt 1
		sendResponse({
			status: "received",
			message: "Background script acknowledged startTranslation.",
		});
	} else if (request.action === "processImage") {
		console.log(
			`BubbleTranslate: Received 'processImage' action for URL: ${request.imageUrl}`
		);
		// TODO: Implement OCR and Translation logic here
	} else {
		console.log("BubbleTranslate: Received unknown action:", request.action);
	}
	return true; // Keep returning true as getActiveTabAndSendMessage uses setTimeout/async callbacks
});

console.log("BubbleTranslate: Background message listener added.");

// --- Helper function with retry logic AND MODIFIED QUERY ---
function getActiveTabAndSendMessage(attempt) {
	const maxAttempts = 3;
	const retryDelay = 100; // milliseconds

	// --- MODIFIED QUERY: Removed currentWindow: true ---
	// Query for any tab that is currently active.
	chrome.tabs.query({ active: true }, (tabs) => {
		console.log(
			`BubbleTranslate: tabs.query({active: true}) attempt ${attempt} result:`,
			tabs
		);

		if (tabs && tabs.length > 0) {
			// If multiple active tabs found (e.g., one active tab in multiple windows),
			// we'll just pick the first one for now.
			// A more robust solution might involve checking tabs[i].lastFocusedWindow but let's start simple.
			const targetTab = tabs[0];

			if (targetTab && targetTab.id) {
				// Check if targetTab and its ID exist
				const activeTabId = targetTab.id;
				console.log(
					`BubbleTranslate: Found active tab ID: ${activeTabId} in window ${targetTab.windowId} on attempt ${attempt}`
				);

				// Send message TO content script...
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
				// This case might happen if tabs[0] is unexpectedly null or lacks an ID
				console.error(
					`BubbleTranslate: Found tabs array, but first element has no ID on attempt ${attempt}. Tabs array:`,
					tabs
				);
			}
		} else {
			// Failed to find any active tab
			if (attempt < maxAttempts) {
				console.warn(
					`BubbleTranslate: Failed to find ANY active tab ({active: true}) on attempt ${attempt}. Retrying in ${retryDelay}ms...`
				);
				setTimeout(() => {
					getActiveTabAndSendMessage(attempt + 1); // Retry
				}, retryDelay);
			} else {
				console.error(
					`BubbleTranslate: Failed to find ANY active tab ({active: true}) after ${maxAttempts} attempts. Query result was empty.`
				);
			}
		}
	});
}
