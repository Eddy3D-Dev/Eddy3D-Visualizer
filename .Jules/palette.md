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

## 2026-06-20 - Focus Interactive Canvas Directly
**Learning:** When moving focus programmatically (like from a 'Skip to 3D Canvas' link or after closing an Empty State overlay), focusing a wrapper `<div>` containing a `<canvas>` forces keyboard users to press Tab an extra time before they can actually interact with the canvas (e.g. pan/rotate with arrow keys). Wrapper elements typically should not receive focus unless they are scrollable regions.
**Action:** Always assign a unique ID directly to the focusable `<canvas>` element (e.g., `renderer.domElement`) and target it directly with skip links (`href="#webgl-canvas"`) or programmatic focus (`renderer.domElement.focus()`). Remove `tabindex` and `focus:outline-none` from the wrapper container.

## 2026-06-25 - Make Disabled Buttons Discoverable for Keyboard Users
**Learning:** Native `disabled` attributes completely remove elements from the focus order, making them invisible to keyboard-only and screen reader users. If a button has a helpful `title` explaining *why* it is disabled (e.g., "Upload a dataset to enable downloads"), these users will never be able to discover that information.
**Action:** When a disabled button contains important contextual help via a tooltip (`title`), use `aria-disabled="true"` instead of the native `disabled` attribute. Ensure the CSS mimics the disabled visual state, and add a JavaScript guard clause (`if (btn.getAttribute('aria-disabled') === 'true') return;`) to prevent the action from firing.

## 2024-07-26 - Unified Hover States for Row Controls
**Learning:** When a toggle switch (or similar small control) is placed inside a full-width row alongside a text label, users naturally perceive the entire row as the clickable target. If only the switch itself reacts to hover, it breaks this mental model and makes the target feel smaller than it actually is.
**Action:** Use CSS to trigger the control's visual hover state when the user hovers anywhere over the parent row (e.g., `.toggle-item:hover .switch .slider`). This visual feedback reinforces that clicking anywhere on the label or row will toggle the control.

## 2026-07-28 - Animate Accordions Safely with CSS Grid
**Learning:** Animating the height of an accordion or collapsible section using `grid-template-rows: 0fr` to `1fr` is a modern, performant alternative to animating `max-height`. However, if you don't sequence the `visibility` property alongside it, the collapsed content remains focusable in the accessibility tree and keyboard tab order, creating a hidden focus trap.
**Action:** When using CSS Grid for collapsible animations, pair the grid transition with a sequenced visibility transition. When closing, delay the visibility hide (e.g., `visibility 0s 0.3s`) so the animation can finish. When opening, transition visibility immediately (e.g., `visibility 0s 0s`). Make sure the inner container has `min-height: 0` and `overflow: hidden`.

## 2026-08-01 - Avoid InnerHTML for Text Updates on Elements with SVGs
**Learning:** Using `element.innerHTML = originalHTML` to restore the state of a button (or other UI component) that contains embedded SVGs causes the browser to completely re-parse the SVG structure. This not only incurs unnecessary performance overhead but also frequently causes a micro layout shift (jank) or flicker, especially if the SVG relies on external CSS. It can also cause the element to lose any attached event listeners or active focus states.
**Action:** When temporarily changing the text of an element (like a button switching to "Loading..."), target the specific text node or inner text wrapping `<span>`. Save `span.textContent`, and restore it directly via `span.textContent = originalText` rather than replacing the entire `innerHTML` of the parent button.

## 2026-06-17 - Add Canvas View Reset Keyboard Shortcut
**Learning:** Users can easily get "lost" when panning and zooming in 3D scenes if they move the camera far away from the data. While UI buttons exist for some actions, providing a quick keyboard shortcut to recenter the camera greatly improves UX for power users and those navigating primarily with keyboards.
**Action:** When adding global keyboard shortcuts (like pressing 'R' to reset view), explicitly check if the user is typing in a text field (e.g., `document.activeElement?.tagName === 'INPUT'`) to prevent triggering the shortcut accidentally while they are naming a file or entering text.
