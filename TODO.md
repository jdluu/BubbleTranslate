# BubbleTranslate - Feature Checklist & TODO

## Phase 1: MVP (Minimum Viable Product)

- [x] **Project Setup:**
  - [x] Initialize Git repository (`.git`)
  - [x] Create `.gitignore` file
  - [x] Create `README.md` (this file)
  - [x] Create `TODO.md` (this file)
  - [x] Create basic file structure (`manifest.json`, `icons/`, `popup/`, `content/`, `background/`)
  - [x] Create placeholder icons (16, 48, 128 px)
- [x] **Manifest (`manifest.json`):**
  - [x] Define `manifest_version: 3`, `name: BubbleTranslate`, `version`, `description`
  - [x] Request necessary `permissions` (`activeTab`, `scripting`, potentially `storage`)
  - [x] Define `action` (popup: `popup/popup.html`, default icons)
  - [x] Define `content_scripts` (matching URLs, `content/content.js`, `content/content.css`)
  - [x] Define `background` service worker (`background/background.js`)
- [x] **Popup UI (`popup/`):**
  - [x] Create basic `popup.html` structure
  - [x] Add a "Translate Page" button to `popup.html`
  - [x] Basic styling in `popup.css`
  - [x] Implement `popup.js` to send a message to background/content script on button click
- [x] **Content Script (`content/`):**
  - [x] Implement `content.js` listener for messages from popup/background
  - [x] **Image Detection:** Implement basic logic in `content.js` to find `<img>` elements larger than a set size.
  - [x] Send found image URLs to `background.js`.
  - [x] **Overlay Display:** Implement logic in `content.js` to create simple overlay elements near images.
  - [x] Add basic styling for overlays in `content.css`.
  - [x] Implement message listener in `content.js` to receive translations from `background.js` and update overlays.
- [x] **Background Script (`background/`):**
  - [x] Implement `background.js` listener for messages (from popup and content script).
  - [x] **API Integration:** Implement `Workspace` calls to Google Cloud Vision AI (OCR).
  - [x] **API Integration:** Implement `Workspace` calls to Google Cloud Translation API (Translate text from OCR).
  - [x] **API Key Management:** Add placeholder/warning for API Keys (DO NOT COMMIT KEYS).
  - [x] Send translation results back to the correct `content.js` tab.
  - [x] Handle basic error states from API calls.
- [x] **Testing:**
  - [x] Load extension unpacked in Chrome.
  - [x] Test on various pages with images/manga panels.
  - [x] Debug using DevTools for popup, content script, and service worker.

## Phase 2: Core Improvements

- [x] **User Settings:**
  - [x] Implement Target Language Selection UI (e.g., dropdown in popup).
  - [x] Pass selected target language to Translation API call.
  - [x] (Optional) Create basic Options page (`options/` files).
  - [x] Use `chrome.storage.local` or `sync` to save user's target language preference.
- [x] **Performance:**
  - [x] Implement Caching mechanism (in-memory or `chrome.storage.local`) for OCR/Translation results on the current page.
- [x] **UX:**
  - [x] Implement basic Overlay Customization options (e.g., font size in options/popup).
  - [x] Store overlay preferences in `chrome.storage`.
  - [x] Apply custom styles to overlays in `content.js`.

## Phase 3: Robustness & Flexibility

- [ ] Add option to manually specify Source Language.
- [ ] Investigate/improve handling of Vertical Text (check OCR API settings/results).
- [ ] Investigate/improve handling of Stylized Fonts.
- [ ] (Optional) Allow selection of different OCR/Translation engines (requires user API keys & options UI).
- [ ] (Advanced) Research/implement better automatic Panel/Bubble Detection logic.

## Phase 4: Nice-to-Haves

- [ ] Implement optional Hover-to-Translate functionality (with appropriate safeguards/settings).
- [ ] Implement Settings Sync using `chrome.storage.sync`.
- [ ] Add feature to Save/Export/Copy translations.
