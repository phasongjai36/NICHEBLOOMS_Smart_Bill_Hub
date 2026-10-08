## 2026-10-08 - Nested Interactive Elements on Customer Cards
**Learning:** React cards containing secondary quick actions should not be wrapped in an outer `<button>`, as HTML prohibits nested interactive elements and breaks screen reader/keyboard interaction.
**Action:** Use an outer `<div role="button" tabIndex={0}>` with `onKeyDown` handlers for the card container and inner `<button>` elements for sub-actions.
