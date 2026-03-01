## 2024-05-24 - Interactive Disabled State Titles
**Learning:** Adding `title` attributes (tooltips) to natively disabled inputs and buttons significantly improves user clarity by explaining *why* an element is inactive (e.g., "Upload a dataset to enable downloads" or "Disable 'Gapless Points' to adjust manually"), reducing user frustration and guesswork. We must also update the title dynamically when the disabled state changes.
**Action:** Always include explanatory `title` tooltips on `disabled` form controls or buttons, and toggle them off when the element becomes enabled via JS.

## 2024-05-24 - Testing Visually Hidden Elements
**Learning:** When using Playwright to test custom UI elements like toggle switches (which often rely on visually hidden checkboxes) in this application, standard `.click()` interactions may fail with "Element is outside of the viewport" errors.
**Action:** Use `page.evaluate()` to programmatically interact with these elements via JavaScript (e.g., setting `.checked` and dispatching a `change` event) or use `.click(force=True)` to bypass visibility checks during testing.