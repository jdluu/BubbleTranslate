// Listen for messages sent from other parts of the extension (like the popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log("BubbleTranslate: Message received in background script.");
	// console.log("Sender:", sender); // Optional: Keep for debugging if needed
	// console.log("Request:", request); // Optional: Keep for debugging if needed

	if (request.action === "startTranslation") {
		console.log("BubbleTranslate: 'startTranslation' action received.");

		// --- Logic to trigger the Content Script ---
		// 1. Find the currently active tab
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			// Check if we found an active tab
			if (tabs.length > 0 && tabs[0].id) {
				const activeTabId = tabs[0].id;
				console.log(`BubbleTranslate: Found active tab ID: ${activeTabId}`);

				// 2. Send a message specifically TO that tab's content script
				chrome.tabs.sendMessage(
					activeTabId,
					{ action: "triggerPageAnalysis" },
					(response) => {
						// This callback runs when the content script sends a response

						if (chrome.runtime.lastError) {
							// This error is EXPECTED for now if the content script isn't listening yet
							// or if the content script wasn't injected on the current page.
							console.warn(
								`BubbleTranslate: Could not send message to content script in tab ${activeTabId}. Maybe it's not loaded there? Error: ${chrome.runtime.lastError.message}`
							);
							// Optionally inform the popup about this failure? More complex.
							return;
						}

						// If the content script *does* respond successfully later:
						console.log(
							`BubbleTranslate: Received response from content script:`,
							response
						);
						// Update popup? Handle status?
					}
				);
				console.log(
					`BubbleTranslate: Sent 'triggerPageAnalysis' message to tab ${activeTabId}`
				);
			} else {
				console.error("BubbleTranslate: Could not find active tab.");
				// Maybe send an error back to the popup?
			}
		});
		// -----------------------------------------

		// Send an immediate response back to the popup to acknowledge receipt.
		// We do this straight away so the popup knows the request was initially handled.
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
