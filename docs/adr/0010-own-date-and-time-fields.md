# Own date and time fields instead of native inputs

The first staging review asked for times that are always 24 h with exactly four typed digits, and for a picker that opens on a click anywhere in the field. Native `<input type="date|time">` cannot promise that: browsers format them by their own locale, not the page's `lang`, so an English Chrome shows AM/PM and mm/dd/yyyy. DateTimeField therefore uses its own fields on every device, built on Reka UI (headless, accessible, German locale, 24 h hour cycle) and styled with our tokens: the date is typed as TT.MM.JJJJ with a calendar popover, the time as four digits with a list in 15-minute steps. This replaces the handoff's "native inputs, native pickers on mobile" (02-components § DateTimeField). The value contract is unchanged: `YYYY-MM-DDTHH:mm` in Europe/Berlin (ADR 0003).

## Considered Options

- **Native inputs with `showPicker()` on click**: opens the picker from anywhere in the field, but leaves AM/PM and the field's width to the browser.
- **Hand-built fields**: no dependency, but we would own the calendar grid's keyboard and screen-reader behaviour ourselves.
