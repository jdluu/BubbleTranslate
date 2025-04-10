// Saves options to chrome.storage.local
function saveOptions() {
	const apiKey = document.getElementById("apiKey").value;
	const targetLang = document.getElementById("targetLanguage").value; // Get selected language
	const status = document.getElementById("status");

	chrome.storage.local.set(
		{
			apiKey: apiKey,
			targetLang: targetLang, // Save target language
		},
		() => {
			// Update status to let user know options were saved.
			if (chrome.runtime.lastError) {
				console.error("Error saving options:", chrome.runtime.lastError);
				status.textContent = "Error saving settings.";
				status.style.color = "red";
			} else {
				console.log("Options saved successfully.");
				status.textContent = "Settings saved.";
				status.style.color = "green";
			}
			setTimeout(() => {
				status.textContent = "";
			}, 2500);
		}
	);
}

// Restores options using the preferences stored in chrome.storage.
function restoreOptions() {
	// Get both apiKey and targetLang, provide defaults
	chrome.storage.local.get(
		{
			apiKey: "", // Default API key
			targetLang: "en", // Default target language to English
		},
		(items) => {
			if (chrome.runtime.lastError) {
				console.error("Error restoring options:", chrome.runtime.lastError);
				document.getElementById("status").textContent =
					"Error loading saved settings.";
				document.getElementById("status").style.color = "red";
			} else {
				// Restore values
				document.getElementById("apiKey").value = items.apiKey;
				document.getElementById("targetLanguage").value = items.targetLang;
				console.log("Options restored:", items);
			}
		}
	);
}

// Add event listeners once the DOM is ready
document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("saveButton").addEventListener("click", saveOptions);
