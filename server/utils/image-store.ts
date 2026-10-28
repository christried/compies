import { createError, type H3Event } from 'h3'
import { r2ImageStore } from './r2-store'

/** Where game images live (#143). R2 in production and on staging; tests inject the in-memory store. */
export interface ImageStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<{ body: Uint8Array, contentType: string } | null>
}

declare module 'h3' {
  interface H3EventContext {
    imageStore?: ImageStore
  }
}

/** A Map-backed store, for tests. */
export function memoryImageStore(): ImageStore & { keys(): string[], clear(): void } {
  const objects = new Map<string, { body: Uint8Array, contentType: string }>()
  return {
    async put(key, body, contentType) {
      objects.set(key, { body, contentType })
    },
    async get(key) {
      return objects.get(key) ?? null
    },
    keys: () => [...objects.keys()],
    clear: () => objects.clear(),
  }
}

/** The image store of this request: R2 from the environment unless a test put one into the context. */
export function useImageStore(event: H3Event): ImageStore {
  if (!event.context.imageStore) {
    const env = process.env
    const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket } = env
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw createError({ statusCode: 500, statusMessage: 'Image storage is not configured (R2_* environment variables)' })
    }
    event.context.imageStore = r2ImageStore({ accountId, accessKeyId, secretAccessKey, bucket, jurisdiction: env.R2_JURISDICTION })
  }
  return event.context.imageStore
}
