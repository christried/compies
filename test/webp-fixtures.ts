// WebP files with a real RIFF header, for the profile picture's header reader (#678). The WebP container: `RIFF`, a size, `WEBP`, then
// chunks of a FourCC, a little-endian u32 size and a payload padded to an even length. Only the header is real; the pixels are filler.

const ascii = (text: string) => Array.from(text, char => char.charCodeAt(0))
const u16 = (value: number) => [value & 0xff, (value >> 8) & 0xff]
const u24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]
const u32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]

export interface WebpOptions {
  form: 'lossy' | 'lossless' | 'extended'
  width: number
  height: number
  /** `extended` only: sets the animation flag of the VP8X chunk. */
  animated?: boolean
  /** `extended` only: a chunk of this name after the VP8X chunk, whatever the flag says. */
  anim?: 'ANIM' | 'ANMF'
}

function chunk(name: string, payload: number[]): number[] {
  return [...ascii(name), ...u32(payload.length), ...payload, ...(payload.length % 2 ? [0] : [])]
}

export function webpOf({ form, width, height, animated = false, anim }: WebpOptions): Uint8Array {
  let chunks: number[]
  if (form === 'lossy') {
    // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
    chunks = chunk('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...u16(width), ...u16(height), 0, 0, 0, 0])
  }
  else if (form === 'lossless') {
    // Signature 0x2f, then 14 bits of width - 1 and 14 bits of height - 1.
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
    chunks = chunk('VP8L', [0x2f, ...u32(bits), 0, 0, 0, 0])
  }
  else {
    // Flags byte (animation is 0x02), three reserved bytes, then the canvas's width - 1 and height - 1 as 24 bits.
    chunks = chunk('VP8X', [animated ? 0x02 : 0x00, 0, 0, 0, ...u24(width - 1), ...u24(height - 1)])
    if (anim === 'ANIM') chunks.push(...chunk('ANIM', [0, 0, 0, 0, 0, 0]))
    if (anim === 'ANMF') chunks.push(...chunk('ANMF', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    chunks.push(...chunk('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...u16(width), ...u16(height), 0, 0]))
  }
  return Uint8Array.from([...ascii('RIFF'), ...u32(chunks.length + 4), ...ascii('WEBP'), ...chunks])
}
