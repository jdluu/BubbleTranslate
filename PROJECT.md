BUBBLETRANSLATE/
├── dist/ # Compiled output (loaded by Chrome) - GENERATED
│ ├── core/ # Compiled core files (e.g., background)
│ │ └── background.js
│ ├── features/ # Compiled feature-specific scripts
│ │ ├── page_interaction/
│ │ │ ├── content.css
│ │ │ └── content.js
│ │ ├── settings/
│ │ │ ├── options.css
│ │ │ ├── options.html
│ │ │ └── options.js
│ │ └── popup_ui/
│ │ ├── popup.css
│ │ ├── popup.html
│ │ └── popup.js
│ ├── assets/ # Copied assets
│ │ └── icons/
│ │ ├── icon16.png
│ │ ├── icon48.png
│ │ └── icon128.png
│ └── manifest.json # Copied manifest pointing to files in dist/
│
├── src/ # Source code
│ ├── core/ # Core extension infrastructure & orchestration
│ │ ├── background.ts # Service worker entry point, message routing
│ │ ├── messaging.ts # Message type definitions, potentially send/receive helpers
│ │ └── storage.ts # Helpers for interacting with chrome.storage (optional)
│ │
│ ├── features/ # Distinct functional areas of the extension
│ │ ├── translation/ # Logic related to the translation process itself
│ │ │ ├── translation_service.ts # Orchestrates fetch->OCR->translate (runs in background)
│ │ │ ├── api_client.ts # Handles Vision/Translate API calls
│ │ │ └── image_processor.ts # Base64 conversion, image data handling
│ │ │
│ │ ├── page_interaction/ # Logic related to interacting with the web page content
│ │ │ ├── content.ts # Content script entry point, DOM observation, event handling
│ │ │ ├── image_finder.ts # Logic to find suitable images on the page
│ │ │ ├── overlay_manager.ts# Creating, positioning, styling overlays/errors
│ │ │ └── content.css # Styles specifically for injected overlays
│ │ │
│ │ ├── settings/ # Options page UI and logic
│ │ │ ├── options.html
│ │ │ ├── options.css
│ │ │ └── options.ts # Handles saving/loading settings from the UI
│ │ │
│ │ └── popup_ui/ # Browser action popup UI and logic
│ │ ├── popup.html
│ │ ├── popup.css
│ │ └── popup.ts # Handles button clicks, sends messages
│ │
│ ├── shared/ # Utilities, types, constants used across features
│ │ ├── utils.ts # Generic helper functions (e.g., debounce, maybe blobToBase64)
│ │ ├── types.ts # Shared TypeScript interfaces/types (e.g., settings structure, API responses)
│ │ └── constants.ts # Shared constants (e.g., API URLs, storage keys)
│ │
│ ├── assets/ # Static assets
│ │ └── icons/ # Source icons (copied during build)
│ │ ├── icon16.png
│ │ ├── icon48.png
│ │ └── icon128.png
│ │
│ └── manifest.json # Source manifest (paths point to dist/)
│
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── TODO.md
