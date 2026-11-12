// What the platform's random source answers the draw of a spin's length (#520), for the integration tests that spin through HTTP.
// 0 is the shortest spin (6 s, what `SPIN` in test/draw-offsets.ts counts with), `SPIN_MAX_MS - SPIN_MIN_MS` the longest (10 s).
// test/integration/setup.ts answers from it and puts it back to 0 before each test. Not a test file.
export const spinAnswer = { value: 0 }
