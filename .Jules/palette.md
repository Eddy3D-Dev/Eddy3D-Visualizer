## 2023-10-27 - Add Accessible Close Button to Toast Notifications
**Learning:** Toast notifications that automatically dismiss after a few seconds can be inaccessible to users who rely on screen readers or need more time to read the message, especially for longer error messages. Pausing the timer on hover/focus is a common pattern, but providing a manual close mechanism ensures control is in the user's hands.
**Action:** Always include a dismiss (`×`) button on toast notifications with an appropriate `aria-label` (e.g., "Close notification"), and pause any auto-dismiss timers on `mouseenter` and `focusin` events.
## 2025-04-04 - Clarify Output Constraints in Dropdowns
**Learning:** Using domain-specific but technically misleading labels (like "150px" when referring to a DPI multiplier that results in a 1500px image) creates a confusing user experience. Users either expect a tiny thumbnail or don't realize they can export very high-resolution images.
**Action:** Always ensure UI labels for export/download settings accurately reflect the final output unit and dimensions (e.g., using "1500x1500 px" instead of "150px") and have corresponding accurate `aria-label`s.
