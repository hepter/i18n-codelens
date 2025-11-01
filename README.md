# i18n CodeLens

**Professional internationalization management for VS Code**

i18n CodeLens is a comprehensive translation management extension that streamlines localization workflows for JavaScript, TypeScript, and React projects. It provides intelligent detection of translation keys, visual indicators for missing translations, and powerful editing tools—all integrated directly into your development environment.

### Key Capabilities

The extension can be customized for different project structures through configurable regex patterns and glob settings, making it adaptable to various i18n frameworks and conventions.

## ✨ Key Features

- **🔍 Smart Translation Detection**: Automatically detects translation keys in your code using configurable regex patterns
- **📋 Bulk Translation Editor**: Professional WebView-based interface for editing multiple translation keys simultaneously
- **🎯 Interactive Hover Actions**: Click-to-edit, add, or delete translations directly from hover popups
- **🌐 Multi-Language Support**: Works with JavaScript, TypeScript, React (JSX/TSX) files
- **📊 Visual Indicators**: Color-coded decorations showing translation status (missing, partial, complete)
- **🔄 Real-time Validation**: Instant feedback on missing translations with CodeLens integration
- **🗂️ Resource Tree View**: Organized view of all translation keys with quick navigation
- **⚡ Smart Suggestions**: Auto-completion and closest-match positioning for new translations
- **🧱 Flat/Nested Awareness**: Detects flat translation dictionaries and deeply nested JSON, preserving structure during edits

## Demo

![Demo](/demo.gif)

### Bulk Translation Editor in Action

![Bulk Edit Demo](/bulk.gif)

## 🚀 What's New in v1.2.0

### Model Context Protocol (MCP) Integration
Automate translation workflows with five production-ready MCP tools:
- **AI-powered assistance**: Works with GitHub Copilot Agentic, Claude for VS Code, and other MCP clients
- **Automatic registration**: Zero-configuration setup via VS Code LM API
- **Standalone mode**: Run `npm run mcp` for use with any MCP-compatible client
- **Smart key discovery**: New `i18n_key_references` tool locates up to 25 code references per translation key

### Enhanced JSON Structure Support
- **Intelligent detection**: Automatically identifies flat vs. nested translation file structures
- **Safe mutations**: Preserves original formatting when updating nested JSON files
- **Better diagnostics**: Resource Tree, CodeLens, and hover details now accurately reflect nested lookups

### Quality Improvements
- **Stable ordering**: Sorted resource cache ensures predictable behavior across features
- **Improved gitignore handling**: Properly respects workspace `.gitignore` during scans
- **Flexible configuration**: Override glob patterns and regex via environment variables for custom project structures

> Looking for earlier highlights? Check the Change Log below for v1.1.x feature details.

## 🤖 MCP Automation Tools

The extension includes a Model Context Protocol (MCP) stdio server for AI-powered automation.

### Integration Options

**VS Code LM API (Recommended)**  
The extension automatically registers with VS Code's Language Model API. Compatible clients like GitHub Copilot Agentic, Claude for VS Code, and other MCP-aware tools can invoke the tools without additional configuration.

**Standalone Mode**  
Run `npm run mcp` or `node ./out/mcp/server.js` from the workspace root to start the MCP server independently.

### Environment Variables

Customize server behavior with these environment variables:

- `WORKSPACE_ROOT` — Absolute path to scan (defaults to current workspace)
- `I18N_GLOB` — Pattern for resource files (defaults to `**/locales/**/*.json`)
- `I18N_CODE_REGEX` — Custom regex for detecting translation keys
- `I18N_CODE_GLOB` — Pattern for code files (defaults to `**/*.{ts,tsx,js,jsx}`)

> **Note**: Auto-registration requires VS Code 1.96.0 or newer. For older versions, use standalone mode with `npm run mcp`.

### Available Tools

| Tool | Description |
|------|-------------|
| `i18n_check_keys` | Checks presence of translation keys across all language files |
| `i18n_untranslated_keys_on_page` | Identifies keys used in a file but missing from any locale |
| `i18n_translate_upsert` | Bulk add or update translations across multiple languages |
| `i18n_delete_key` | Removes a translation key from all locale files |
| `i18n_key_references` | Finds all code locations referencing specific translation keys |

These tools integrate with AI workflows to automate translation validation, identify gaps, and streamline localization management.

## 🧱 Flat & Nested JSON Support

The extension intelligently handles both flat and nested translation file structures:

- **Automatic detection**: Identifies whether files use flat key-value maps or nested object hierarchies
- **Internal flattening**: Processes nested structures internally for search and CodeLens functionality
- **Structure preservation**: Maintains original formatting when writing updates to disk
- **Flexibility**: Edit deeply nested locale files without manual flattening, while keeping MCP automation fully functional

## Change Log

##### v1.2.0
- **Added**: Model Context Protocol stdio server with five automation tools and VS Code LM auto-registration
- **Added**: Automatic detection of nested translation files with safe flatten/unflatten helpers
- **Added**: `overviewRulerMarkers` setting for scroll bar indicators
- **Improved**: Resource sorting and `.gitignore` handling for stable results across features
- **Improved**: Manual MCP usage via `npm run mcp` and environment overrides
- **Improved**: Cleaner scroll bar with smart indicators - only problematic translations are highlighted
- **Updated**: Minimum VS Code version to `^1.96.0` to enable LM/MCP integration

##### v1.1.1
- **Enhanced**: Logger system with structured log levels (debug, info, warn, error) and configurable `logLevel` setting
- **Added**: New `codeFileRegex` setting for customizable code file pattern matching (default: `/\.(jsx?|tsx?)$/`)
- **Added**: `.gitignore` integration for file filtering during workspace scanning
- **Improved**: Resource scanning performance with optimized regex handling and execution patterns
- **Improved**: Code file detection with proper filtering of ignored files and relative path handling
- **Enhanced**: Input dialogs with VS Code InputBox API, step progress indicators, and validation feedback
- **Enhanced**: Hover provider with improved layout, inline edit actions, and action links
- **Enhanced**: Error handling with proper categorization and user-friendly error messages
- **Fixed**: Type error in `ResourceTreeViewProvider.ts` related to range character access
- **Fixed**: Function closure issue in `ActionResetAndReloadExtension.ts` error handling
- **Fixed**: Code action provider regex matching to use appropriate code detection pattern
- **Fixed**: Resource line regex execution with proper global flag handling
- **Updated**: Dependencies - `fastest-levenshtein` to v1.0.16 and added `ignore` v7.0.5
- **Updated**: TypeScript configuration to ES2020 target with enhanced module resolution

##### v1.1.0
- **Major Feature**: Added comprehensive bulk translation editing system with WebView interface
- **Enhanced**: Hover provider with interactive edit/add/delete action links  
- **Improved**: JSON-safe file operations preventing trailing comma corruption
- **Added**: Source file tracking for bulk edit operations
- **Enhanced**: Error handling and logging throughout the extension
- **Extended**: Language support for React files (JSX/TSX)
- **Fixed**: WebView modal restrictions with custom confirmation dialogs
- **Improved**: Resource tree view performance and reliability

##### v1.0.6
- Internal RegExp & Glob Pattern updated to support better matching

##### v1.0.5
- Multiple resource key detection fixed at single line for Hover and Code Action Providers

##### v1.0.4
- Logs forwarded to custom i18n CodeLens output channel
- Minor fixes

##### v1.0.3
Performance tweaks & refactored with new features
- Resource Tree view added to Explorer with new configs
- Similar providers centralized
- All settings and reloading data moved to SettingUtils
- Resource delete action added for Code or Resource file
- Action & Configuration settings renamed properly
- Resource hover text fixed after save

##### v1.0.2
- Fix: Missing glob validation added to show properly

##### v1.0.1
- Definition Provider added so that language resource references can be found with 'go to definition' command or Ctrl+click
- Unused resources now show as half-transparent and give hover information on `.json` language resource files

##### v1.0.0
- Initial release

## Configuration

### Core Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `codeLens` | Enable CodeLens indicators for missing translations | `true` |
| `underlineCodeDecorator` | Show underline decorations for missing translations | `true` |
| `overviewRulerMarkers` | Show scroll bar markers for problematic translations (warnings/errors only) | `true` |
| `resourceAutoSave` | Auto-save resource files after edits | `true` |
| `autoFocusAfterModified` | Focus editor on modified resource files | `false` |

### Tree View Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `resourceTreeViewVisible` | Display Resource Tree View in Explorer | `true` |
| `revealResourceInTreeView` | Auto-reveal selected resources in Tree View | `false` |

### Pattern Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `resourceFilesGlobPattern` | Glob pattern for locating translation files | `**/locales/**/*.json` |
| `resourceCodeDetectionRegex` | Regex for detecting translation keys in code | See below |
| `codeFileRegex` | Pattern for identifying code files | `/\.(jsx?|tsx?)$/` |

**Default detection regex:**  
`(?<=\/\*\*\s*?@i18n\s*?\*\/\s*?["']|\W[tT]\(\s*["'])(?<key>[A-Za-z0-9 .-]+?)(?=["])`

This matches:
- `t('key')` or `T('key')` — Function call patterns
- `/** @i18n */ 'key'` — Comment annotation pattern

### Logging

| Setting | Description | Default |
|---------|-------------|---------|
| `logLevel` | Control extension log verbosity (`debug`, `info`, `warn`, `error`, `off`) | `warn` |

## 📖 Usage Guide

### Translation Key Detection

The extension automatically detects translation keys using these patterns:

```javascript
// Function call patterns
t('welcome.message')           // lowercase
T('user.greeting')             // uppercase

// JSX/TSX usage
<Text>{t('button.submit')}</Text>

// Annotation pattern
/** @i18n */ 'settings.title'
```

### Quick Actions

**Add Missing Translations**
1. Hover over any translation key with missing translations
2. Click **"Add Translations"** in the hover popup
3. Enter translations for each required language
4. Files are saved automatically (if `resourceAutoSave` is enabled)

**Edit Existing Translations**
1. Hover over a translation key
2. Click **"Edit Translations"**
3. Modify values for any language
4. Changes are applied instantly

**Delete Translations**
1. Hover over a translation key
2. Click **"Delete Translations"**
3. Confirm removal
4. Key is removed from all locale files

### Bulk Editing

For efficient multi-key editing:

1. Open a file containing multiple translation keys
2. Hover over any key and click **"📋 Bulk Edit (X keys)"**
3. The visual editor opens with all keys from the current file
4. Edit, add, or delete multiple translations simultaneously
5. Click **Save** to apply all changes at once

### Navigation & Discovery

**Go to Definition**  
`Ctrl+Click` (or `Cmd+Click`) on any translation key to jump to its definition in locale files.

**Resource Tree View**  
View all translations used in the active file organized by key, with visual indicators for:
- ✅ Complete translations (all languages present)
- ⚠️ Partial translations (some languages missing)
- ❌ Missing translations (key not found)

## 🤝 Contributing

Issues and feature requests are welcome! Please check the [GitHub repository](https://github.com/hepter/i18n-codelens) for more information.

## 📄 License

This project is licensed under the MIT License.
