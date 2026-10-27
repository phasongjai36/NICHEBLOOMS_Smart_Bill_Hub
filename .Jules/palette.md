## 2026-10-08 - Nested Interactive Elements on Customer Cards
**Learning:** React cards containing secondary quick actions should not be wrapped in an outer `<button>`, as HTML prohibits nested interactive elements and breaks screen reader/keyboard interaction.
**Action:** Use an outer `<div role="button" tabIndex={0}>` with `onKeyDown` handlers for the card container and inner `<button>` elements for sub-actions.

## 2026-10-09 - Responsive Icon-Only Buttons and Mobile Hidden Text
**Learning:** Hiding text labels on mobile screens using Tailwind `hidden` class (`display: none`) removes the text node from the accessibility tree entirely. Screen reader users on mobile will hear no label for icon buttons.
**Action:** Always provide an explicit `aria-label` attribute on buttons whose inner text is hidden conditionally via CSS media queries.
