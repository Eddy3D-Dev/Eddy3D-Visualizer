## 2026-04-10 - Prevent Focus Loss on Dynamic State Dismissal
**Learning:** When a dynamic UI component (like an "Empty State" container with upload buttons) is removed or hidden while a child element holds keyboard focus, the browser will drop focus entirely to the `<body>` element. This completely breaks the navigation context for keyboard and screen reader users, forcing them to start tabbing from the top of the page again.
**Action:** Whenever hiding or destroying a component that might contain the active element (e.g., `container.contains(document.activeElement)`), programmatically move focus (`.focus()`) to the most logical next element (like the main content area or the element that triggered the state) before or immediately after hiding it.

## 2026-04-10 - Verify CSS Active States with Playwright
**Learning:** Standard Playwright `locator.click()` actions are too fast to reliably capture `:active` CSS transition states (like a scale down effect for tactile feedback) in screenshots because the click completes before the screenshot is taken.
**Action:** When writing verification scripts that must visually capture `:active` states, manually simulate the interaction by moving the mouse to the element's bounding box (`page.mouse.move`), holding the mouse button down (`page.mouse.down()`), adding a tiny delay to allow CSS transitions to trigger (`page.wait_for_timeout(50)`), taking the screenshot, and only then releasing the mouse (`page.mouse.up()`).

## 2026-04-19 - Prevent Ungraceful Text Truncation with Icons
**Learning:** For narrow fixed-width UI elements like sidebar buttons, long descriptive text (e.g., "Download Screenshots") can easily overflow and truncate ("Downloa...") on smaller screens or when UI scales change, leading to a degraded UX.
**Action:** Replace long text with a concise verb and an accompanying SVG icon (e.g., `<svg> Download`). Use `display: inline-flex` with `gap` and `align-items: center` for perfect alignment, and apply `flex-shrink: 0` to the icon to ensure it never distorts when space gets tight.

## 2026-04-19 - Fix Off-Canvas Menu Keyboard Trapping
**Learning:** Sliding off-canvas menus using only `transform: translateX(-100%)` visually hides them, but leaves their interactive children (buttons, links, inputs) in the browser's accessibility tree and keyboard focus order. This traps screen reader and keyboard users in an invisible section of the UI.
**Action:** Always pair `transform` with `visibility: hidden` for the closed state and `visibility: visible` for the open state. To preserve the slide animation, sequence the CSS `transition` property for `visibility` with a delay when closing (e.g., `visibility 0s 0.3s`) and no delay when opening (`visibility 0s 0s`).
## 2026-04-23 - Enhance Keyboard Shortcut Hints with Semantic kbd Tags
**Learning:** Using semantic HTML `<kbd>` tags instead of generic presentation tags like `<strong>` for keyboard/mouse interaction hints provides better semantic meaning for assistive technologies. Additionally, styling these tags to look like physical keycaps improves visual scannability and gives the application a more polished, professional feel.
**Action:** When displaying keyboard shortcuts or interaction hints, always use the `<kbd>` tag and apply a consistent, tactile CSS style (borders, border-radius, background, and subtle shadow) across the design system.

## 2026-04-26 - Enable Keyboard Controls for Three.js Canvas
**Learning:** Three.js `OrbitControls` supports keyboard interactions (like arrow keys for panning), but they are ignored by default because `<canvas>` elements are not natively focusable in the DOM. This breaks accessibility for keyboard users trying to interact with the 3D scene.
**Action:** Always manually add `tabindex="0"` to the WebGL canvas element (`renderer.domElement`) and set appropriate ARIA attributes (like `role="img"` and `aria-label="Interactive 3D Scene"`) so screen readers can announce it when it receives focus.

## 2026-04-26 - Prevent Accidental Text Selection on Interactive Controls
**Learning:** During rapid clicking or tapping on highly interactive form controls like toggle switches, sliders, dropdowns, and their associated labels, the browser's default behavior often triggers text highlighting or double-tap-to-zoom on mobile devices. This degrades the user experience, making the web application feel unresponsive and unlike a native app.
**Action:** Always apply `user-select: none;` and `touch-action: manipulation;` to frequently toggled elements (`.switch`, `.range-input`, `<select>`, and `<label>` tags) to ensure a smooth, app-like interaction flow without visual interruptions.

## 2026-05-15 - Provide Feedback on Invalid File Uploads
**Learning:** Silently ignoring unsupported file types (like dragging a `.txt` file into an app expecting `.csv`) breaks user trust and leads them to assume the application is broken. Users need immediate, clear feedback when their action fails.
**Action:** When handling file uploads or drag-and-drop interactions, always validate the file types and trigger an immediate visual error notification (like a toast) explaining why the files were rejected, rather than just silently discarding them.

## 2026-05-08 - Prevent Screen Reader Spam on Range Sliders with Output Elements
**Learning:** Using semantic `<output>` elements alongside `<input type="range">` is great for visual users, but because `<output>` has an implicit `role="status"` (an `aria-live="polite"` region), it can flood the screen reader's speech queue with every incremental change during dragging. Since native range inputs already announce their value changes to assistive technologies seamlessly, the output element causes annoying double-speaking and live region spam.
**Action:** Always apply `aria-hidden="true"` to `<output>` elements that are used purely as visual companions to `<input type="range">` elements to keep the screen reader experience clean and responsive.

## 2026-06-15 - Ensure Toast Auto-Dismiss Timers Resume Properly
**Learning:** It's good accessibility practice to pause auto-dismiss timers on toast notifications when a user hovers over or focuses on them, giving them more time to read. However, if you only pause the timer (`mouseenter` / `focusin`) but fail to resume it when the user leaves (`mouseleave` / `focusout`), the notification will stay on screen forever, cluttering the UI and confusing the user.
**Action:** When implementing auto-dismissing notifications with a pause feature, always ensure the lifecycle is complete by providing matching event listeners to resume the timeout once interaction ceases.
