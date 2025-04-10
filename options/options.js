// Define defaults for styles
const defaultStyles = {
	fontSize: "14",
	textColor: "#FFFFFF",
	bgColor: "rgba(0, 0, 0, 0.75)",
};

// Saves options to chrome.storage.local
function saveOptions() {
	const apiKey = document.getElementById("apiKey").value;
	const targetLang = document.getElementById("targetLanguage").value;
	// Get style values
	const fontSize = document.getElementById("fontSize").value;
	const textColor = document.getElementById("textColor").value;
	const bgColor = document.getElementById("bgColor").value;

	const status = document.getElementById("status");

	chrome.storage.local.set(
		{
			apiKey: apiKey,
			targetLang: targetLang,
			// Save styles
			fontSize: fontSize || defaultStyles.fontSize, // Use default if empty
			textColor: textColor || defaultStyles.textColor,
			bgColor: bgColor || defaultStyles.bgColor,
		},
		() => {
			if (chrome.runtime.lastError) {
				/* ... error handling ... */
			} else {
				/* ... success message ... */
			}
			setTimeout(() => {
				status.textContent = "";
			}, 2500);
		}
	);
}

// Restores options using the preferences stored in chrome.storage.
function restoreOptions() {
	chrome.storage.local.get(
		{
			apiKey: "",
			targetLang: "en",
			// Get styles with defaults
			fontSize: defaultStyles.fontSize,
			textColor: defaultStyles.textColor,
			bgColor: defaultStyles.bgColor,
		},
		(items) => {
			if (chrome.runtime.lastError) {
				/* ... error handling ... */
			} else {
				// Restore all values
				document.getElementById("apiKey").value = items.apiKey;
				document.getElementById("targetLanguage").value = items.targetLang;
				document.getElementById("fontSize").value = items.fontSize;
				document.getElementById("textColor").value = items.textColor;
				document.getElementById("bgColor").value = items.bgColor;
				console.log("Options restored:", items);
			}
		}
	);
}

// Event listeners remain the same
document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("saveButton").addEventListener("click", saveOptions);
