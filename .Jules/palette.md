## 2024-03-24 - Missing Semantic Labels in Toggle Patterns
**Learning:** Found a common pattern of toggle switches where visual labels were separated from inputs, making them inaccessible to screen readers.
**Action:** When creating toggle components, always ensure the input has an `aria-label` or is wrapped in a label that contains the text.
