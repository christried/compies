# The Tour is built in-house, not on a tour library

Decided on 2026-11-15 in the grilling for 0.15 „Tour“ (#622). The Tour (UI: Rundgang) darkens the Event page except one thing and puts a bubble with Compibert's face beside it. COMPIES builds this itself instead of using a library such as Driver.js or Shepherd. Compibert is a component of the page, the Tour must end by itself when the page stops being calm (a Session starts, the Clip or the Award ceremony opens), and the app already places its own popovers and has its own layer scale, which a library's overlay and z-index would sit outside of. malkochen made the same decision for the same reasons (its ADR 0006).

## Considered Options

- **Driver.js or Shepherd**: a spotlight and a bubble for free, but styled and layered by the library, with the mascot bolted on from outside, and with no knowledge of the Event page's state.

## Consequences

- The Tour's steps are data and its rules are a pure function of that list and the page's state, so a second Tour (the Host tour, #462) is a second list, not a second mechanism.
- The Tour only points. A step in which the User acts would need its own rules for what counts, since a Vote or a seat is real and every Member sees it; that is deliberately left out.
