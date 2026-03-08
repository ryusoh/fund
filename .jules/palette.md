# Palette Journal

## 2025-02-17 - Accessible Currency Toggles and Navigation

**Learning:** Icon-only and symbol-only buttons, specifically currency toggles using `¥` for both CNY and JPY, cause visual ambiguity for sighted users and accessibility issues for screen readers. Navigation links containing only FontAwesome icons also lack context for assistive technologies. However, adding `title` attributes for hover labels compromises the app's minimalist design philosophy.

**Action:** Always add `aria-label` attributes for screen readers when using icon-only or ambiguous symbol-based interactive elements, ensuring assistive tech can announce the elements correctly. To preserve UI minimalism, avoid using `title` attributes (hover labels) unless explicitly requested. Ensure decorative icons have `aria-hidden="true"`.
