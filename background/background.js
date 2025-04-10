// Listen for messages sent from other parts of the extension (like the popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received in background script.");
	// console.log("Sender:", sender); // Optional: Keep for debugging if needed
	// console.log("Request:", request); // Optional: Keep for debugging if needed

	// Inside the chrome.runtime.onMessage.addListener...
	if (request.action === "startTranslation") {
		console.log("BubbleTranslate: 'startTranslation' action received.");

		// --- Logic to trigger the Content Script ---
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			// Log the direct result of the query
			console.log("BubbleTranslate: tabs.query result:", tabs);

			// Check if we found an active tab
			if (tabs && tabs.length > 0 && tabs[0].id) {
				// Added check for tabs being defined
				const activeTabId = tabs[0].id;
				console.log(`BubbleTranslate: Found active tab ID: ${activeTabId}`);

				// Send message TO content script... (rest of the code inside 'if' is the same)
				chrome.tabs.sendMessage(
					activeTabId,
					{ action: "triggerPageAnalysis" },
					(response) => {
						// ... (rest of sendMessage logic) ...
						if (chrome.runtime.lastError) {
							console.warn(
								`BubbleTranslate: Could not send message to content script in tab ${activeTabId}. Error: ${chrome.runtime.lastError.message}`
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
				// Log the error more clearly
				console.error(
					"BubbleTranslate: Failed to find active tab. Query result was:",
					tabs
				);
			}
		});
		// -----------------------------------------

		// Send immediate response back to popup... (rest of the code outside query is the same)
		sendResponse({
			status: "received",
			message: "Background script acknowledged startTranslation.",
		});
	} else {
		console.log("BubbleTranslate: Received unknown action:", request.action);
		// sendResponse({ status: "unhandled", action: request.action }); // Optional
	}

	// IMPORTANT: Because chrome.tabs.query (and potentially chrome.tabs.sendMessage's response handling)
	// runs asynchronously, if you wanted sendResponse to the popup to wait until AFTER
	// hearing back from the content script, you would NEED to return true here.
	// However, our current logic sends the response to the popup immediately (line 43),
	// so returning true isn't strictly required for *that* response path.
	// return true; // Only needed if sendResponse might be called async later in this listener.
});
