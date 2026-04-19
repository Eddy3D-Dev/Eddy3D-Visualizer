## 2026-04-10 - Prevent Focus Loss on Dynamic State Dismissal
**Learning:** When a dynamic UI component (like an "Empty State" container with upload buttons) is removed or hidden while a child element holds keyboard focus, the browser will drop focus entirely to the `<body>` element. This completely breaks the navigation context for keyboard and screen reader users, forcing them to start tabbing from the top of the page again.
**Action:** Whenever hiding or destroying a component that might contain the active element (e.g., `container.contains(document.activeElement)`), programmatically move focus (`.focus()`) to the most logical next element (like the main content area or the element that triggered the state) before or immediately after hiding it.

## 2026-04-10 - Verify CSS Active States with Playwright
**Learning:** Standard Playwright `locator.click()` actions are too fast to reliably capture `:active` CSS transition states (like a scale down effect for tactile feedback) in screenshots because the click completes before the screenshot is taken.
**Action:** When writing verification scripts that must visually capture `:active` states, manually simulate the interaction by moving the mouse to the element's bounding box (`page.mouse.move`), holding the mouse button down (`page.mouse.down()`), adding a tiny delay to allow CSS transitions to trigger (`page.wait_for_timeout(50)`), taking the screenshot, and only then releasing the mouse (`page.mouse.up()`).

## 2026-04-19 - Prevent Ungraceful Text Truncation with Icons
**Learning:** For narrow fixed-width UI elements like sidebar buttons, long descriptive text (e.g., "Download Screenshots") can easily overflow and truncate ("Downloa...") on smaller screens or when UI scales change, leading to a degraded UX.
**Action:** Replace long text with a concise verb and an accompanying SVG icon (e.g., `<svg> Download`). Use `display: inline-flex` with `gap` and `align-items: center` for perfect alignment, and apply `flex-shrink: 0` to the icon to ensure it never distorts when space gets tight.
