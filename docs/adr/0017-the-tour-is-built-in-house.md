# The Tour is built in-house, not on a tour library

The Tour (UI: Rundgang) darkens the Event page except one thing and puts a bubble with Compibert's face beside it. COMPIES builds this itself instead of using Driver.js or Shepherd: Compibert is a component of the page, the Tour must end by itself when the page stops being calm (a Session starts, the Clip or the Award ceremony opens), and the app already places its own popovers and has its own layer scale, which a library's overlay and z-index would sit outside of.

## Consequences

- The Tour's steps are data and its rules are a pure function of that list and the page's state, so a second Tour (the Host tour, #462) is a second list, not a second mechanism.
- The Tour only points. A step in which the User acts would need its own rules for what counts, since a Vote or a seat is real and every Member sees it; that is deliberately left out.
