// Saves options to chrome.storage.local
function saveOptions() {
	const apiKey = document.getElementById("apiKey").value;
	const status = document.getElementById("status");

	chrome.storage.local.set(
		{ apiKey: apiKey }, // Save the key under the name 'apiKey'
		() => {
			// Update status to let user know options were saved.
			if (chrome.runtime.lastError) {
				console.error("Error saving API key:", chrome.runtime.lastError);
				status.textContent = "Error saving key.";
				status.style.color = "red";
			} else {
				console.log("API key saved successfully.");
				status.textContent = "Options saved.";
				status.style.color = "green";
			}

			// Clear status message after a few seconds
			setTimeout(() => {
				status.textContent = "";
			}, 2500);
		}
	);
}

// Restores API key input field state using the preferences
// stored in chrome.storage.
function restoreOptions() {
	// Use default value apiKey: ''
	chrome.storage.local.get(
		{ apiKey: "" }, // Default value if 'apiKey' isn't found
		(items) => {
			if (chrome.runtime.lastError) {
				console.error("Error restoring API key:", chrome.runtime.lastError);
				document.getElementById("status").textContent =
					"Error loading saved key.";
				document.getElementById("status").style.color = "red";
			} else {
				document.getElementById("apiKey").value = items.apiKey;
				console.log("API key restored from storage.");
			}
		}
	);
}

// Add event listeners once the DOM is ready
document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("saveButton").addEventListener("click", saveOptions);
