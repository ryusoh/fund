## 2025-01-20 - Janitor Routine System Maintenance

- **Issue:** Codebase contained unaddressed `TODO`s relating to core system accuracy, notably in `js/utils/date.js` where the Good Friday market holiday logic was skipped for simplicity.
- **Action:** Implemented the Computus algorithm to accurately calculate Easter and derive the observed date for Good Friday across any given year. Replaced the `TODO` block with the newly tested calculation logic.
- **Verification:** Unit tests within `js/utils/date.test.js` continue to pass without regression. Future tests specifically validating market operations spanning the Easter weekend are now possible.
