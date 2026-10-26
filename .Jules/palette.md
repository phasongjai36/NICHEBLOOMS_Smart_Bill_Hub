## 2026-10-08 - Nested Interactive Elements on Customer Cards
**Learning:** React cards containing secondary quick actions should not be wrapped in an outer `<button>`, as HTML prohibits nested interactive elements and breaks screen reader/keyboard interaction.
**Action:** Use an outer `<div role="button" tabIndex={0}>` with `onKeyDown` handlers for the card container and inner `<button>` elements for sub-actions.

## 2026-10-09 - Contextual ARIA Labels in Repeating Lists & Tables
**Learning:** Generic action buttons (such as "รับเงิน" or "บิล") in repeating table rows or queue cards lack context when navigated via screen readers.
**Action:** Always append contextual information to `aria-label` (e.g. `aria-label={`รับเงินงวดที่ ${row.period} ของ ${row.customerName}`}`) and combine with `focus-visible:ring-2` for full keyboard accessibility.
