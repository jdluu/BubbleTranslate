# BubbleTranslate TODO List

This document outlines potential improvements, new features, and bug fixes planned for the BubbleTranslate extension.

## Core Functionality Enhancements

- [ ] **Selective Image Translation:** Implement a way for users to translate only specific images they choose (e.g., via a click, context menu, or hover button) instead of processing all detected images on the page.
- [ ] **Caching:** Implement caching for OCR results and translations (potentially based on image URL or content hash) to avoid redundant API calls and speed up repeated views of the same page/images. Consider using `chrome.storage.local` or IndexedDB.
- [ ] **Automatic Source Language Detection:** Utilize the Translation API's detection capability (or the Vision API's language hints) to automatically determine the source language instead of assuming a single source or requiring user input (though keep manual override).
- [ ] **Improved Text Block Consolidation:** Enhance logic to better group related OCR text blocks (e.g., multi-line bubbles) before translation for more coherent results.
- [ ] **Vertical Text Support:** Improve OCR detection and overlay rendering to better handle vertical text common in some languages/formats (e.g., Japanese Manga). May require specific hints to the Vision API.
- [ ] **Alternative Service Support:** Refactor API clients (`api_client.ts`) to potentially support alternative OCR or Translation services in the future (e.g., Tesseract.js for offline OCR, DeepL, Azure Translator).

## User Experience (UX) / User Interface (UI)

- [ ] **Overlay Interactivity:**
  - [ ] Add a button/action to easily copy the translated text from an overlay.
  - [ ] Add a toggle to show/hide the original OCR'd text.
  - [ ] Add a button/action to easily hide a specific overlay bubble.
- [ ] **Visual Feedback During Processing:**
  - [ ] Show a loading indicator or subtle animation on images while they are being processed.
  - [ ] Provide visual distinction for images that failed processing.
- [ ] **Granular Badge Notifications:** Use the extension action badge (`chrome.action`) for more detailed status (e.g., number of images processing, specific error codes briefly) instead of just "ERR".
- [ ] **Improved Options Page:**
  - [ ] Add live preview for overlay appearance settings.
  - [ ] Implement a more user-friendly way to handle RGBA color + alpha (perhaps separate sliders or inputs). (Already partially done with the alpha slider, but could be refined).
  - [ ] Add validation feedback directly next to input fields (e.g., for invalid API key format - though format is hard to validate).
- [ ] **Enhanced Popup UI:**
  - [ ] Show more status details in the popup (e.g., "Processing X images...", "X translations complete").
  - [ ] Potentially add quick language selection directly in the popup.
  - [ ] Add a link to the Options page from the popup.
- [ ] **"Translate This Image" Context Menu:** Add a context menu item when right-clicking on an image to trigger translation for only that specific image.
- [ ] **Hide/Show All Overlays:** Implement a toggle (perhaps in the popup or via a keyboard shortcut) to quickly hide or show all translation overlays on the page.

## Performance Optimization

- [ ] **Content Script Performance:** Optimize DOM scanning and image detection logic (`image_finder.ts`) to minimize performance impact on complex pages. Consider using `IntersectionObserver` more effectively if applicable.
- [ ] **Image Fetching/Processing:** Investigate parallelizing API calls or using more efficient image data handling (`image_processor.ts`).
- [ ] **Webpack Optimization:** Further optimize the build process (e.g., ensure tree-shaking is effective, explore code splitting if bundles become very large).

## Error Handling & Robustness

- [x] **Detailed API Error Handling:** Parse specific error messages from Google Cloud APIs and provide more informative feedback to the user (e.g., "Invalid API Key", "Quota Exceeded", "Language Not Supported").
- [x] **Network Error Handling:** Implement more robust handling for network failures during API calls (e.g., retries with backoff).
- [x] **Content Script Injection Timing:** Ensure the content script is reliably injected and ready before the background script attempts to message it. Handle "Receiving end does not exist" errors more gracefully.
- [ ] **Handle API Quotas:** Detect and inform the user if API quotas appear to have been exceeded.

## Configuration / Settings

- [ ] **Font Family Selection:** Allow users to select the font family used in the translation overlays.
- [ ] **Exclusion List:** Allow users to define websites (domains) where the extension should not automatically run or attempt image detection.
- [ ] **Image Detection Sensitivity:** Add options to configure the minimum image size or other heuristics used for image detection.
- [ ] **Storage Sync:** Evaluate using `chrome.storage.sync` instead of `chrome.storage.local` to sync settings across a user's logged-in Chrome instances (consider storage limits).

## Code Quality & Development

- [ ] **Unit/Integration Testing:** Implement a testing framework (like Jest, Vitest) and add unit tests for core logic (utils, API parsing, state management) and integration tests for message passing.
- [ ] **Refactoring:** Continuously refactor code for clarity, maintainability, and separation of concerns.
- [ ] **Documentation:** Add JSDoc comments to functions and modules. Expand on developer setup and architecture in the README or separate documents.

## Completed / Won't Do

- _(Move items here as they are completed or decided against)_
