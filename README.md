# BubbleTranslate - Live Manga/Comic Translator Extension

## Description

BubbleTranslate is a Chrome browser extension designed to provide on-the-fly translation of text found within manga, comics, webtoons, and other images directly in your browser. It leverages Optical Character Recognition (OCR) and machine translation technologies to help bridge language barriers for visual content.

This is currently a solo development project.

_(Note: Current time is Wednesday, April 9, 2025 at 11:12:42 PM PDT. Built using Manifest V3.)_

## Features

### Core Goal:

To allow users to quickly understand foreign text within images on webpages.

### MVP (Minimum Viable Product) Features:

- Basic popup interface triggered from the browser toolbar.
- Button in popup to initiate translation of the current page.
- Detects potential images on the page (based on size).
- Sends identified image URLs to a background process.
- Uses Google Cloud Vision AI for OCR to extract text from images.
- Uses Google Cloud Translation API to translate extracted text (initially hardcoded to English).
- Displays translations as simple overlays near the original images.

### Planned Features (Post-MVP):

- **User Control & Customization:**
  - User selection of target translation language.
  - User ability to select a specific page area/region for translation.
  - Caching of translations on the current page view.
  - Customization options for translation overlays (font, size, color, background).
  - Options page for managing settings (e.g., target language, potentially API keys).
- **Accuracy & Robustness:**
  - Option to manually specify source language.
  - Improved handling for vertical text and stylized fonts.
  - (Potential) Option to choose between different OCR/Translation engines (requiring user API keys).
  - (Potential) More advanced automatic panel/bubble detection logic.
- **Convenience:**
  - Optional hover-to-translate functionality.
  - Syncing user preferences across devices (via `chrome.storage.sync`).
  - Ability to save or export translations.

### Features NOT Planned:

- Offline translation capabilities.
- User contribution/correction system.

## Installation & Usage (Development)

1.  Clone or download this repository.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode".
4.  Click "Load unpacked" and select the `BubbleTranslate` project directory.
5.  The BubbleTranslate icon will appear in your toolbar.

**Basic Usage (MVP):** Click the icon, click "Translate Page", observe overlays on images.

## Development Setup

- **Prerequisites:** Google Chrome
- **Loading:** Follow Installation steps above.
- **Debugging:** Use Chrome DevTools (`F12` or right-click -> Inspect) for Content Scripts (on webpage), Popup (right-click popup -> Inspect), and Background Service Worker (link on `chrome://extensions` page).

## Technologies Used (Initial Stack)

- Chrome Extension Manifest V3
- HTML5, CSS3, Vanilla JavaScript (ES6+)
- Google Cloud Vision AI (OCR)
- Google Cloud Translation API (Translation)
- Git

## Configuration - IMPORTANT API Keys

This extension requires API keys for Google Cloud Vision AI and Google Cloud Translation API.

**⚠️ WARNING: Do NOT commit your API keys directly into the source code or repository! ⚠️**

- **Development:** Obtain API keys from the [Google Cloud Console](https://console.cloud.google.com/). For local testing, you will need to securely manage these. Using environment variables loaded via a build tool (if added later) or temporarily inserting them for testing (and **removing before commit**) are options. A placeholder configuration within `background.js` is recommended initially.
- **Distribution:** If released publicly, users would likely need to provide their own API keys via an options page, or you would need to build a secure backend proxy (more complex).

## License

_(Choose one or state intention)_

- MIT License (Recommended for potential sharing/release)
- Proprietary / All Rights Reserved
