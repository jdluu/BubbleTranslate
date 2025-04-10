# BubbleTranslate - Feature Checklist & TODO

## Phase 1: MVP (Minimum Viable Product)

- [ ] **Project Setup:**
  - [x] Initialize Git repository (`.git`)
  - [x] Create `.gitignore` file
  - [x] Create `README.md` (this file)
  - [x] Create `TODO.md` (this file)
  - [ ] Create basic file structure (`manifest.json`, `icons/`, `popup/`, `content/`, `background/`)
  - [ ] Create placeholder icons (16, 48, 128 px)
- [ ] **Manifest (`manifest.json`):**
  - [ ] Define `manifest_version: 3`, `name: BubbleTranslate`, `version`, `description`
  - [ ] Request necessary `permissions` (`activeTab`, `scripting`, potentially `storage`)
  - [ ] Define `action` (popup: `popup/popup.html`, default icons)
  - [ ] Define `content_scripts` (matching URLs, `content/content.js`, `content/content.css`)
  - [ ] Define `background` service worker (`background/background.js`)
- [ ] **Popup UI (`popup/`):**
  - [ ] Create basic `popup.html` structure
  - [ ] Add a "Translate Page" button to `popup.html`
  - [ ] Basic styling in `popup.css`
  - [ ] Implement `popup.js` to send a message to background/content script on button click
- [ ] **Content Script (`content/`):**
  - [ ] Implement `content.js` listener for messages from popup/background
  - [ ] **Image Detection:** Implement basic logic in `content.js` to find `<img>` elements larger than a set size.
  - [ ] Send found image URLs to `background.js`.
  - [ ] **Overlay Display:** Implement logic in `content.js` to create simple overlay elements near images.
  - [ ] Add basic styling for overlays in `content.css`.
  - [ ] Implement message listener in `content.js` to receive translations from `background.js` and update overlays.
- [ ] **Background Script (`background/`):**
  - [ ] Implement `background.js` listener for messages (from popup and content script).
  - [ ] **API Integration:** Implement `Workspace` calls to Google Cloud Vision AI (OCR).
  - [ ] **API Integration:** Implement `Workspace` calls to Google Cloud Translation API (Translate text from OCR).
  - [ ] **API Key Management:** Add placeholder/warning for API Keys (DO NOT COMMIT KEYS).
  - [ ] Send translation results back to the correct `content.js` tab.
  - [ ] Handle basic error states from API calls.
- [ ] **Testing:**
  - [ ] Load extension unpacked in Chrome.
  - [ ] Test on various pages with images/manga panels.
  - [ ] Debug using DevTools for popup, content script, and service worker.

## Phase 2: Core Improvements

- [ ] **User Settings:**
  - [ ] Implement Target Language Selection UI (e.g., dropdown in popup).
  - [ ] Pass selected target language to Translation API call.
  - [ ] (Optional) Create basic Options page (`options/` files).
  - [ ] Use `chrome.storage.local` or `sync` to save user's target language preference.
- [ ] **Interaction:**
  - [ ] Implement Specific Area Selection (e.g., user draws a box on the page).
  - [ ] Capture selected area as image data (e.g., using Canvas).
  - [ ] Send selected image data (instead of URL) to background for processing.
- [ ] **Performance:**
  - [ ] Implement Caching mechanism (in-memory or `chrome.storage.local`) for OCR/Translation results on the current page.
- [ ] **UX:**
  - [ ] Implement basic Overlay Customization options (e.g., font size in options/popup).
  - [ ] Store overlay preferences in `chrome.storage`.
  - [ ] Apply custom styles to overlays in `content.js`.

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
