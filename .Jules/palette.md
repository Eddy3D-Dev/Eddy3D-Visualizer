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

## 2025-03-07 - Drag & Drop Visual Feedback
**Learning:** Adding subtle CSS animations (like `pulse-border`) using `::after` pseudo-elements on valid drop zones prevents jarring layout shifts while providing clear, interactive feedback during drag operations. Counting dragenter/dragleave events is necessary to avoid flickering when a user hovers over child elements inside the drop zone container.
**Action:** Always implement a reference counter for drag events in JavaScript when the drop zone has children to prevent erratic visual toggling of hover states, and use absolute positioned pseudo-elements for the drop visual instead of changing borders directly.
## 2026-03-08 - Added Upload Actions to Empty State
**Learning:** When displaying an empty state overlay over a functional drag-and-drop zone, the overlay itself often has `pointer-events: none` to allow drop events to pass through to the canvas underneath.
**Action:** When adding clickable Call-to-Action (CTA) buttons inside such an empty state, explicitly apply `pointer-events: auto` to the buttons or their container so users can interact with them.

## 2026-03-09 - Keyboard Navigation and Skip Links
**Learning:** Adding a "skip to content" link allows keyboard users to bypass long navigation menus, but the target container (like `<main>`) must have `tabindex="-1"` to be programmatically focusable. Without this, the focus sequence breaks and the user must still tab through the entire sidebar. Additionally, applying `outline: none` to the target container when focused prevents an ugly visual focus ring on a structural element, ensuring a smooth experience.
**Action:** Always include a `tabindex="-1"` and `outline: none` on the target element of a "skip to content" link to ensure proper keyboard tab sequence flow without degrading visual aesthetics.

## 2026-03-09 - ARIA Switch Role for Custom Toggles
**Learning:** When styling native checkboxes `<input type="checkbox">` as sliding toggles (e.g., using a `.switch` wrapper and visually hiding the input), screen readers default to announcing them as standard checkboxes. This mismatch between visual presentation (a switch) and semantic meaning (a checkbox) can be confusing.
**Action:** Always add `role="switch"` to visually hidden checkbox inputs that function as toggles. This ensures assistive technologies correctly announce the component and its on/off state, matching the user's visual expectations.

## 2026-03-11 - Explicit Disabled States for Custom Form Controls
**Learning:** When adding custom styling (like `cursor: pointer` or custom backgrounds) to form controls such as `<select>`, the browser's default disabled visual cues are often overridden. This leaves elements looking active and clickable even when they possess the `disabled` attribute, frustrating users.
**Action:** Always provide an explicit `:disabled` CSS rule (e.g., `cursor: not-allowed; opacity: 0.7; background-color: var(--secondary-bg);`) for any form control that receives custom styling to restore clear visual feedback of its inactive state.

## 2026-03-12 - Consistent Interactive Cursors
**Learning:** Some custom UI form elements like `<select>` and `<input type="range">` lacked a default interactive `cursor: pointer` state when enabled, but gained a visible `cursor: not-allowed` when disabled. This created inconsistent visual cues for interactivity across the application where other custom elements (like buttons and toggles) always had pointer cues.
**Action:** Ensure all custom styled interactive form elements explicitly include `cursor: pointer` when enabled so they match standard interactive button behaviors and contrast clearly with their `disabled` states.

## 2024-03-14 - Domain-Specific Toggles Tooltips
**Learning:** Providing explicit tooltips (via `title` attributes) for domain-specific technical toggles (like "Gapless Points" or "Billboarding") significantly improves the discoverability and usability of advanced features for new users without cluttering the clean UI. Placing the tooltip on the parent container (e.g., `.toggle-item`) rather than just the input ensures the hint is visible when hovering anywhere near the control.
**Action:** When implementing new configuration options that use specialized terminology, always include an informative `title` attribute on the wrapper element to explain the effect.

## 2025-02-17 - Dynamic ARIA and Tooltips for Toggles
**Learning:** For collapsible menus and toggles, just updating `aria-expanded` is often insufficient for clarity. Users (both sighted via tooltips and visually impaired via screen readers) benefit significantly when the `aria-label` and `title` attributes dynamically update to reflect the *next* actionable state (e.g., changing from "Open Sidebar" to "Close Sidebar").
**Action:** When implementing or fixing toggle controls for menus/panels, always update `title` and `aria-label` dynamically via JavaScript alongside `aria-expanded` to clearly communicate the action the toggle will perform.

## 2026-03-15 - Global Drag & Drop Zones
**Learning:** Attaching drag-and-drop listeners solely to a specific container (like a canvas) creates a fragile UX. If a user accidentally drops a file just outside the target area (e.g., on a sidebar or margin), the browser will default to opening the file directly, navigating away from the application and destroying their current session state.
**Action:** Always attach drag-and-drop event listeners to the `window` or `document` level to intercept all drops across the entire viewport, while still providing visual feedback (like highlighting) on the specific target area.

## 2026-03-17 - Actionable Primary Buttons Needs Contrast and Tactile Feedback
**Learning:** The "Download Screenshots" button used a light blue color (`#25b6eb`) that failed color contrast ratio against white text. Additionally, major primary action buttons (like file upload and downloads) lacked an `:active` CSS state, providing no visual tactile feedback when a user clicks on them.
**Action:** Use a darker accessible color like `#2563eb` for buttons with white text, and always add a subtle `:active { transform: scale(0.98); }` to primary interaction elements.
\n## 2026-03-18 - Accent Colors and Conditional Drop Zone Feedback\n**Learning:** Native `<input type="range">` sliders default to browser colors (usually blue), breaking visual consistency. Also, when adding a large textual drag-and-drop feedback overlay (e.g., via `::before`) to a container that already has centered `.empty-state` text, the two texts will overlap and become unreadable.\n**Action:** Use the `accent-color` CSS property on native range sliders to quickly theme them to match the app. Always add a CSS rule (like `.drag-over .empty-state { opacity: 0; }`) to temporarily hide any existing empty-state content when the drag feedback overlay is active.

## 2026-03-20 - Off-Canvas Menu Keyboard Accessibility
**Learning:** When implementing custom off-canvas mobile menus (like the sidebar controlled by `#menu-toggle`), keyboard users can become trapped if there's no way to dismiss the menu without tabbing backwards. Furthermore, when the menu is dismissed, focus is often lost, forcing users to restart navigation from the top of the document.
**Action:** Always provide an `Escape` key listener to close off-canvas menus, and crucially, return focus (`.focus()`) to the toggle button that originally opened the menu *only* when dismissed via keyboard, preserving context for screen reader and keyboard-only users.

## 2026-03-22 - Dynamic Document Titles for Wayfinding
**Learning:** In single-page applications dealing with multiple dataset or document loads, the browser tab title often remains static. This deprives users with multiple tabs open of critical wayfinding context and prevents screen readers from announcing the new primary context when data changes.
**Action:** Always dynamically update `document.title` to reflect the currently active dataset or primary content context.

## 2026-03-22 - Resetting File Input Values for Iterative Workflows
**Learning:** When users upload a file using `<input type="file">`, process the data, modify the file locally, and try to re-upload the exact same file, the browser does not fire a `change` event because the file path hasn't changed. This breaks iterative test-and-modify workflows.
**Action:** Always clear the `.value` property of a file input element (`input.value = ''`) immediately after its files have been handed off for processing to ensure subsequent selections of the same file trigger the necessary events.

## 2026-03-23 - Valid Semantic Nesting for Buttons and Headings
**Learning:** Placing a heading tag (like `<h3>`) directly inside an interactive control tag (like `<button>`) results in invalid HTML semantics. This structure creates an ambiguous and potentially confusing experience for screen reader users because headings are meant to define structural landmarks for document navigation, while buttons are distinct actionable elements.
**Action:** Always invert the nesting when combining structural meaning with action. Wrap the interactive `<button>` *inside* the heading element (`<h3>`), using neutral elements like `<span>` inside the button for textual labels, preserving both document structure and interactivity without semantic conflict.

## 2026-03-24 - Focus Ring on Mouse Click for Visually Hidden Inputs
**Learning:** When styling custom file uploads using visually hidden inputs wrapped in a `<label>`, applying `:focus-within` to the label causes an ugly focus ring to persist when a user clicks the button with a mouse. This happens because clicking the label programmatically focuses the hidden input.
**Action:** Replace `:focus-within` with the modern `:has(input:focus-visible)` selector. This ensures the focus ring is only shown during actual keyboard navigation, maintaining accessibility while improving mouse interaction aesthetics.

## 2026-03-24 - Clear Feedback for Silent File Parsing Errors
**Learning:** Silent failures (e.g. failing to parse a CSV because it lacks required columns) leave the user staring at an empty state with no indication of what went wrong, leading to extreme frustration. Logging errors only to the console is insufficient for production UX.
**Action:** Always provide non-intrusive, explicit feedback (like an animated error toast notification with `aria-live="polite"`) when asynchronous or background tasks like file parsing fail, explaining exactly what went wrong.

## 2026-03-25 - Explicit Cursor Feedback for Interactive Canvases
**Learning:** WebGL/Three.js canvases often default to a standard arrow pointer. This lack of visual affordance means users might not realize they can click and drag to pan, orbit, or zoom the 3D scene, hindering discoverability of core controls.
**Action:** Always apply explicit cursor hints to interactive canvases (e.g., `cursor: grab` on hover, and `cursor: grabbing` on `:active`) to clearly communicate that the area is draggable and interactive.

## 2025-02-13 - [Enhanced Toast Notifications]
**Learning:** Adding explicit visual icons and distinct ARIA roles (`alert` vs `status`) and `aria-live` regions (`assertive` vs `polite`) significantly improves both standard UX and screen reader clarity for transient notification toasts. Relying solely on a colored left-border makes it hard for colorblind users to immediately distinguish error severity.
**Action:** When implementing new toast notifications, always embed an SVG icon that corresponds to the message type, and explicitly assign the appropriate `role` and `aria-live` attribute based on the toast's severity to comply with WCAG 1.4.1 (Use of Color).
