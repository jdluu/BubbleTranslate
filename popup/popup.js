// --- Restore popup.js back to this code ---
console.log("BubbleTranslate: popup.js script started."); // Log when script initially runs

document.addEventListener("DOMContentLoaded", () => {
	console.log("BubbleTranslate: DOMContentLoaded event fired."); // Log when DOM is ready

	const translateButton = document.getElementById("translateButton");
	const statusMessage = document.getElementById("statusMessage");

	console.log(
		"BubbleTranslate: Attempting to find button. Found:",
		translateButton
	); // Log if button was found

	if (translateButton) {
		console.log("BubbleTranslate: Adding click listener to button."); // Log before adding listener

		translateButton.addEventListener("click", () => {
			// THIS IS THE LOG WE EXPECT TO SEE WHEN CLICKING
			console.log("BubbleTranslate: Translate button CLICKED.");

			if (statusMessage) {
				statusMessage.textContent = "Sending request...";
			}
			translateButton.disabled = true;

			console.log(
				"BubbleTranslate: About to call chrome.runtime.sendMessage..."
			); // Log right before sending

			chrome.runtime.sendMessage({ action: "startTranslation" }, (response) => {
				console.log("BubbleTranslate: sendMessage callback executed."); // Log when callback runs

				if (chrome.runtime.lastError) {
					// Log the actual error object
					console.error(
						`BubbleTranslate: Popup message failed -`,
						chrome.runtime.lastError
					);
					if (statusMessage)
						statusMessage.textContent = "Error sending request.";
					// Consider re-enabling button on error: translateButton.disabled = false;
					return;
				}

				console.log("BubbleTranslate: Message response received:", response);
				if (statusMessage) {
					if (response && response.status === "received") {
						statusMessage.textContent = "Processing initiated...";
					} else {
						// statusMessage.textContent = 'Request sent.';
					}
				}
				// Consider re-enabling button depending on response: translateButton.disabled = false;
			});

			console.log("BubbleTranslate: chrome.runtime.sendMessage call finished."); // Log after *initiating* send
		});

		console.log("BubbleTranslate: Click listener ADDED."); // Log after adding listener
	} else {
		console.error("BubbleTranslate: Translate button not found in popup.");
		if (statusMessage) statusMessage.textContent = "Error: Button not found.";
	}
});

console.log(
	"BubbleTranslate: popup.js script finished executing initial code."
); // Log end of script
// --- End of code to restore ---
