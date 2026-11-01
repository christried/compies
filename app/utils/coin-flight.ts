import { COIN_DURATION_MS } from '~~/shared/coin'

// The coin's keyframes (#235, 04-motion § Coin „Zeitlupe“, 3.6 s): a coin of 13 stacked edge discs and two faces, flown by four
// animations (camera, position, spin, ground shadow). The offsets are the spec's; an easing sits on the keyframe it starts from, as
// the Web Animations API reads it. The landed pose is the final face: from the side, rotated 1440° more (CoinFlip.vue).

/** The easings the flight takes from the page's tokens (--cp-ease-io, --cp-ease-out); the bounce's curves are 04-motion's own. */
export interface FlightEase { io: string, out: string }

/** The transforms of the four parts of the coin at one moment. */
export interface CoinPose {
  camera: string
  position: string
  spin: string
  shadow: string
  shadowOpacity: number
}

/** The four animations' keyframes, in the order the component plays them. */
export interface CoinFlight {
  camera: Keyframe[]
  position: Keyframe[]
  spin: Keyframe[]
  shadow: Keyframe[]
}

const GROUND = 83
const STAND_Y = 20
/** The turns the coin makes on its way (4 full turns beyond the 540° and 700° stops). */
const FINAL_TURNS = 360 * 4

const camera = (z: number, tilt: number, orbit: number) => `translateZ(${z}px) rotateX(${tilt}deg) rotateY(${orbit}deg)`
const position = (y: number) => `translate3d(0px,${y}px,0)`
const spinOf = (x: number, z: number) => `rotateX(${x}deg) rotateY(0deg) rotateZ(${z}deg)`
/** The rotation about the face's axis: the head face is up when the coin shows Kopf, the tail face when it shows Schwanz. */
const faceRoll = (tails: boolean) => (tails ? 0 : 180)
/** The rotation about the flip axis that puts the drawn face toward the camera. */
const finalTilt = (tails: boolean) => (tails ? -90 : 90) + FINAL_TURNS

/** The coin before the toss and while it waits for its start: the first frame of the flight. */
export const coinStandPose: CoinPose = {
  camera: camera(0, 8, 0),
  position: position(STAND_Y),
  spin: spinOf(0, 0),
  shadow: 'scale(.4,.12)',
  shadowOpacity: 0.22,
}

/** The coin after its landing: the drawn face, seen from the side, on the ground. */
export function coinFinalPose(tails: boolean): CoinPose {
  return {
    camera: camera(150, 90, 360),
    position: position(GROUND),
    spin: spinOf(finalTilt(tails), faceRoll(tails)),
    shadow: 'scale(1)',
    shadowOpacity: 0.35,
  }
}

/** The keyframes of the flight for a toss (04-motion § Coin): camera orbit, the arc up and down, the turns, and the shadow. */
export function flightKeyframes(tails: boolean, ease: FlightEase): CoinFlight {
  const roll = faceRoll(tails)
  const landed = finalTilt(tails)
  return {
    camera: [
      { transform: camera(0, 8, 0), offset: 0 },
      { transform: camera(40, 18, 0), offset: 0.18, easing: ease.io },
      { transform: camera(60, 22, 360), offset: 0.62 },
      { transform: camera(60, 22, 360), offset: 0.72, easing: ease.out },
      { transform: camera(150, 90, 360), offset: 1 },
    ],
    position: [
      { transform: position(STAND_Y), offset: 0, easing: 'cubic-bezier(.2,0,.4,1)' },
      { transform: position(-130), offset: 0.18 },
      { transform: position(-150), offset: 0.62, easing: 'cubic-bezier(.6,0,1,.5)' },
      { transform: position(GROUND), offset: 0.74 },
      { transform: position(GROUND - 16), offset: 0.79 },
      { transform: position(GROUND), offset: 0.84 },
      { transform: position(GROUND), offset: 1 },
    ],
    spin: [
      { transform: spinOf(0, 0), offset: 0 },
      { transform: spinOf(540, roll), offset: 0.18 },
      { transform: spinOf(700, roll), offset: 0.62 },
      { transform: spinOf(landed, roll), offset: 0.74 },
      { transform: spinOf(landed, roll), offset: 1 },
    ],
    shadow: [
      { transform: 'scale(.4,.12)', opacity: 0.22, offset: 0 },
      { transform: 'scale(.3)', opacity: 0.08, offset: 0.18 },
      { transform: 'scale(.3)', opacity: 0.08, offset: 0.62 },
      { transform: 'scale(1)', opacity: 0.35, offset: 0.74 },
      { transform: 'scale(1)', opacity: 0.35, offset: 1 },
    ],
  }
}

/** The options every part's animation runs with: the whole flight, held at its end. */
export const FLIGHT_OPTIONS = { duration: COIN_DURATION_MS, fill: 'forwards' } as const
