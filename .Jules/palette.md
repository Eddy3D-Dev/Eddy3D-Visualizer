## 2024-05-24 - Interactive Disabled State Titles
**Learning:** Adding `title` attributes (tooltips) to natively disabled inputs and buttons significantly improves user clarity by explaining *why* an element is inactive (e.g., "Upload a dataset to enable downloads" or "Disable 'Gapless Points' to adjust manually"), reducing user frustration and guesswork. We must also update the title dynamically when the disabled state changes.
**Action:** Always include explanatory `title` tooltips on `disabled` form controls or buttons, and toggle them off when the element becomes enabled via JS.

## 2024-05-24 - Testing Visually Hidden Elements
**Learning:** When using Playwright to test custom UI elements like toggle switches (which often rely on visually hidden checkboxes) in this application, standard `.click()` interactions may fail with "Element is outside of the viewport" errors.
**Action:** Use `page.evaluate()` to programmatically interact with these elements via JavaScript (e.g., setting `.checked` and dispatching a `change` event) or use `.click(force=True)` to bypass visibility checks during testing.
## 2026-03-02 - Mobile Menu ARIA States
**Learning:** The mobile menu toggle button (`#menu-toggle`) visually opened and closed the sidebar but lacked the `aria-expanded` attribute, leaving screen reader users unaware of the state change. It is crucial to dynamically update `aria-expanded` to reflect visibility state.
**Action:** Ensure that UI elements controlling off-canvas menus or sidebars have an initial `aria-expanded="false"` and dynamically toggle it to `"true"` when open via JS.

## 2026-03-03 - File vs Folder Upload UX
**Learning:** Providing a single 'Upload Folder' input creates unnecessary friction for users who just want to visualize a single data file. Even when backend/JS logic supports individual files, missing UI elements block user workflows.
**Action:** Always provide side-by-side 'File' and 'Folder' upload options when an application supports processing both individual items and directories.

## 2026-03-04 - Consistent Focus Indicators
**Learning:** Default browser focus rings are often inconsistent across different elements (like `<select>`, `<input type="range">`, and `<button>`) and can suffer from poor contrast against custom backgrounds. Relying on default focus outlines breaks the visual cohesiveness of the app and can harm accessibility for keyboard users who rely on clear focus indicators.
**Action:** Always define consistent `:focus-visible` styles explicitly in the CSS (e.g., using `outline: 2px solid var(--text-primary); outline-offset: 2px;`) for all interactive elements to ensure a unified and accessible keyboard navigation experience.

## 2026-03-04 - Screen Reader Progress Announcements
**Learning:** When a button's text dynamically updates to show progress (like "Capturing 1/4..."), screen readers do not automatically announce this change, leaving visually impaired users unaware of ongoing background tasks or state changes.
**Action:** Add `aria-live="polite"` to elements (like buttons or status regions) whose text updates dynamically to indicate progress, ensuring screen readers announce the changes without interrupting the user.

## 2026-03-05 - Missing Empty States
**Learning:** Presenting a blank canvas or empty main content area when no data is loaded creates ambiguity for users. They might assume the application is broken or still loading.
**Action:** Always provide an explicitly designed empty state UI overlay with a clear icon, a brief explanation, and actionable guidance (e.g., "Upload a CSV file...") for the main content area when it has no data to display.

## 2026-03-05 - Semantic Document Structure
**Learning:** Using generic `<div>` tags for top-level visual headers (like logos) and main content areas (like a WebGL canvas container) breaks document structure for screen readers, making it harder for users to navigate the page effectively.
**Action:** Always use semantic HTML tags. Wrap top-level logos in an `<h1>` (with appropriate `alt` text), and wrap the primary interactive content area in a `<main>` tag with an `aria-label`.
