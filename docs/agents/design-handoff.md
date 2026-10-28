# Design hand-off

Design that needs the user's approval, is complicated to shape, or adds new design elements gets shaped and approved in Claude Design. Agents write the prompt for it.

- **Claude Design hand-off**: redesigns of Compibert (the mascot), whole new pages that need elements that don't exist yet, elements that are complicated or need proper shaping.
- **Own build**: anything built from the existing components, tokens and colours. Build it directly.

While grilling or specing, flag each piece of UI as _own build_ or _Claude Design hand-off_. For each hand-off:

1. Write a paste-ready prompt for the user to paste into Claude Design: context, the COMPIES design system, references, states, mobile and desktop, German copy, and the deliverable as a `.dc.html` for `docs/design_handoff_compies/reference/`.
2. Publish it as its own ticket titled `Claude Design: <what>`, labelled `ready-for-human` (e.g. #79, #121).
3. Make it block the build ticket, which waits for the design.
