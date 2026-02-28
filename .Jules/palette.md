## 2024-03-24 - Missing Semantic Labels in Toggle Patterns
**Learning:** Found a common pattern of toggle switches where visual labels were separated from inputs, making them inaccessible to screen readers.
**Action:** When creating toggle components, always ensure the input has an `aria-label` or is wrapped in a label that contains the text.

## 2025-05-24 - Unassociated Visual Labels
**Learning:** Found multiple instances of `<span>` being used as visual labels for inputs without programmatic association, reducing hit targets and accessibility.
**Action:** Replace `<span>Text</span>` with `<label for="input-id">Text</label>` and add `cursor: pointer` to improve usability.

## 2025-02-28 - Unexplained Disabled States
**Learning:** Found an actionable button (`download-screenshots`) that was disabled by default without any indication to the user of how to enable it, reducing clarity.
**Action:** Always add a `title` attribute to disabled buttons that explains the condition required to enable them, and dynamically update this text when the state changes.