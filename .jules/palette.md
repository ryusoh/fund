# Palette Journal

## 2025-02-17 - Accessible Currency Toggles and Navigation

**Learning:** Icon-only and symbol-only buttons, specifically currency toggles using `¥` for both CNY and JPY, cause visual ambiguity for sighted users and accessibility issues for screen readers. Navigation links containing only FontAwesome icons also lack context for assistive technologies. However, adding `title` attributes for hover labels compromises the app's minimalist design philosophy.

**Action:** Always add `aria-label` attributes for screen readers when using icon-only or ambiguous symbol-based interactive elements, ensuring assistive tech can announce the elements correctly. To preserve UI minimalism, avoid using `title` attributes (hover labels) unless explicitly requested. Ensure decorative icons have `aria-hidden="true"`.

## 2025-02-17 - Missing Focus Indicators for Keyboard Users

**Learning:** The application explicitly stripped focus outlines (`outline: none;`) from interactive elements like currency toggles, calendar navigation buttons, and main navigation links without providing an alternative focus state. This creates a severe accessibility issue for keyboard users navigating via Tab.

**Action:** Always provide a `:focus-visible` state when removing default `outline`. A 2px semi-transparent white outline with a small offset (`rgba(255, 255, 255, 0.5)`) works beautifully across dark UI elements without compromising the mouse/touch user experience.
