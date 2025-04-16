```text
BUBBLETRANSLATE/
├── dist/                   # Compiled output (loaded by Chrome) - GENERATED
│   ├── core/               # Compiled core files (e.g., background)
│   │   └── background.bundle.js # Example bundled name
│   ├── features/           # Compiled feature-specific scripts
│   │   ├── page_interaction/
│   │   │   ├── content.bundle.js
│   │   │   └── content.css
│   │   ├── settings/
│   │   │   ├── options.bundle.js
│   │   │   ├── options.css
│   │   │   └── options.html
│   │   └── popup_ui/
│   │       ├── popup.bundle.js
│   │       ├── popup.css
│   │       └── popup.html
│   ├── assets/             # Copied assets
│   │   └── icons/
│   │       ├── icon16.png
│   │       ├── icon48.png
│   │       └── icon128.png
│   └── manifest.json       # Copied manifest pointing to files in dist/
│
├── src/                    # Source code
│   ├── core/               # Core extension infrastructure & orchestration
│   │   ├── background.ts   # Acts as the central service worker, managing extension state, lifecycle events, and message routing between components.
│   │   ├── messaging.ts    # Defines shared message types and provides utility functions for reliable communication between different parts of the extension.
│   │   └── storage.ts      # Provides utility functions for interacting with Chrome's storage API to save and load settings or other data.
│   │
│   ├── features/           # Distinct functional areas of the extension
│   │   ├── translation/    # Logic related to the translation process itself
│   │   │   ├── translation_service.ts # Orchestrates the core translation workflow by fetching images, coordinating OCR and translation API calls, and managing results.
│   │   │   ├── api_client.ts # Manages communication with Google Cloud Vision and Translation APIs, handling request formatting and response parsing.
│   │   │   └── image_processor.ts # Provides functions for fetching image data from URLs and converting it into the Base64 format required by the Vision API.
│   │   │
│   │   ├── page_interaction/ # Logic related to interacting with the web page content
│   │   │   ├── content.ts    # Acts as the content script, injected into web pages to find images, communicate with the background, and manage the display of translation overlays.
│   │   │   ├── image_finder.ts # Contains logic to scan the webpage's DOM and identify HTML image elements that meet the criteria for translation.
│   │   │   ├── overlay_manager.ts # Handles the creation, styling, positioning, and management of the translation and error overlays displayed on top of images.
│   │   │   └── content.css   # Contains CSS rules specifically for styling the overlays and any other UI elements injected into web pages by the content script.
│   │   │
│   │   ├── settings/       # Options page UI and logic
│   │   │   ├── options.html  # Provides the HTML structure for the extension's user-configurable settings page.
│   │   │   ├── options.css   # Contains CSS rules for styling the appearance of the extension's options page.
│   │   │   └── options.ts    # Contains the JavaScript logic for the options page, handling user interactions, loading settings from storage, and saving changes.
│   │   │
│   │   └── popup_ui/       # Browser action popup UI and logic
│   │       ├── popup.html    # Provides the HTML structure for the extension's browser action popup.
│   │       ├── popup.css     # Contains CSS rules for styling the appearance of the extension's browser action popup.
│   │       └── popup.ts      # Contains the JavaScript logic for the browser action popup, handling user interactions like button clicks and initiating the translation process.
│   │
│   ├── shared/             # Utilities, types, constants used across features
│   │   ├── utils.ts        # Contains generic, reusable helper functions utilized across multiple features of the extension.
│   │   ├── types.ts        # Defines shared TypeScript interfaces and type aliases to ensure data consistency and type safety across different modules.
│   │   └── constants.ts    # Holds constant values, such as API endpoints, default settings, storage keys, and CSS class names, used throughout the extension.
│   │
│   ├── assets/             # Static assets
│   │   └── icons/          # Source icons (copied during build)
│   │       ├── icon16.png  # Source image files for the various icons used by the extension (toolbar, extensions page).
│   │       ├── icon48.png  # Source image files for the various icons used by the extension (toolbar, extensions page).
│   │       └── icon128.png # Source image files for the various icons used by the extension (toolbar, extensions page).
│   │
│   └── manifest.json       # The main configuration file defining the extension's properties, permissions, scripts, and UI components for Chrome.
│
├── .gitignore
├── package.json            # Defines project metadata, dependencies, and build scripts.
├── tsconfig.json           # Configures the TypeScript compiler options for the project.
├── webpack.config.js       # Configures Webpack for bundling TypeScript, copying assets, and generating the distributable code.
├── README.md               # Provides an overview of the project, features, setup, and usage instructions.
└── TODO.md                 # Lists planned features, improvements, and potential bug fixes for the extension.
```
