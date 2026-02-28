## 2026-02-28 - Empty State Implementation
**Learning:** The Streamlit file uploader returns `None` or an empty list when no files are uploaded. This provides a natural branching point (`if files:` vs `else:`) to implement an empty state without complex state management.
**Action:** Always check if a file uploader or similar input has data before rendering the main UI, and provide an `st.info` or similar call-to-action when it's empty to guide the user.
