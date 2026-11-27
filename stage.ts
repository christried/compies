// Decides at build time whether this build is the staging deployment, and how it is named (#178).
// Plain TypeScript without Nuxt imports: nuxt.config.ts reads it, test/unit/stage.test.ts covers it. The same decision
// says which builds carry the dev sign-in (#247).

export interface StageBranding {
  name: string
  shortName: string
  appleTitle: string
  iconDir: string
}

// Vercel sets VERCEL_GIT_COMMIT_REF to the branch it builds (vercel.json builds `main` and `staging`).
// COMPIES_STAGE=staging, set in .env, lets a local build simulate staging. Vercel sets VERCEL=1, and there only the
// branch counts: the staging build carries the dev sign-in (#247), so no dashboard variable may turn production into it.
export function isStagingBuild(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_GIT_COMMIT_REF === 'staging' || (!env.VERCEL && env.COMPIES_STAGE === 'staging')
}

// Which builds register the dev sign-in (server/dev/sign-in.ts): the dev server and the staging build, so agents can
// check a Player's view on staging (#247). Staging sits behind Vercel Authentication; production never carries it.
export function carriesDevSignIn(dev: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return dev || isStagingBuild(env)
}

export function stageBranding(staging: boolean): StageBranding {
  return staging
    ? { name: 'Compies Staging', shortName: 'Staging', appleTitle: 'Compies Staging', iconDir: '/icons/staging' }
    : { name: 'Compies', shortName: 'Compies', appleTitle: 'Compies', iconDir: '/icons' }
}

// The tinted icons in public/icons/staging were made from public/icons, to re-run after a new production icon:
//   convert public/icons/<file>.png -modulate 100,110,200 public/icons/staging/<file>.png
//     hue +180 (modulate 200 = 180 degrees), saturation 110; favicon-16.png and favicon-32.png
//     take a PNG32: output prefix so they stay 8-bit RGBA.
//   favicon.svg: copy with a filter="url(#staging)" group around the content, a
//     <filter id="staging"><feColorMatrix type="hueRotate" values="180"/></filter> (the same 180 degrees).
//     Done with a node one-liner that inserts those three strings into public/icons/favicon.svg.
// monochrome.svg has no staging copy: it is the same shape for both builds.
