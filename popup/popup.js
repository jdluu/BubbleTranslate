document.addEventListener("DOMContentLoaded", () => {
	const translateButton = document.getElementById("translateButton");
	const statusMessage = document.getElementById("statusMessage"); // Optional

	if (translateButton) {
		translateButton.addEventListener("click", () => {
			console.log("BubbleTranslate: Translate button clicked.");

			// Optional: Provide immediate feedback in the popup
			if (statusMessage) {
				statusMessage.textContent = "Sending request...";
			}
			translateButton.disabled = true; // Prevent double-clicks

			// Send a message to the background script to kick off the process
			chrome.runtime.sendMessage({ action: "startTranslation" }, (response) => {
				// This callback function runs when the background script
				// (or another listener) sends a response using sendResponse()

				// Check if the runtime is still available (e.g., popup might have closed)
				if (chrome.runtime.lastError) {
					console.warn(
						`BubbleTranslate: Popup message failed - ${chrome.runtime.lastError.message}`
					);
					if (statusMessage)
						statusMessage.textContent = "Error sending request.";
					// Re-enable button on error if needed, consider popup state
					// translateButton.disabled = false;
					return;
				}

				console.log(
					"BubbleTranslate: Message sent to background script.",
					response
				);

				// Optional: Update status based on response from background
				if (statusMessage) {
					if (response && response.status === "received") {
						statusMessage.textContent = "Processing initiated...";
					} else {
						// Might need different handling if background does complex work
						// statusMessage.textContent = 'Request sent.';
					}
				}
				// Keep button disabled until process is potentially complete or fails
				// or re-enable here if background response indicates immediate completion/failure
				// translateButton.disabled = false;
			});
		});
	} else {
		console.error("BubbleTranslate: Translate button not found in popup.");
		if (statusMessage) statusMessage.textContent = "Error: Button not found.";
	}
});
