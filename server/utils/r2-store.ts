import { hex, hmac, sha256Hex } from '../../shared/crypto'
import type { ImageStore } from './image-store'

// The R2 adapter of the image store (#143): the S3 API of Cloudflare R2 over plain `fetch`, signed with AWS
// Signature Version 4 through Web Crypto, so it runs wherever Nitro does (ADR 0005, no Vercel-only APIs).

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** `eu` when the bucket lives in the EU jurisdiction (the endpoint host differs), else empty. */
  jurisdiction?: string
}

export interface S3SignInput {
  method: 'GET' | 'PUT' | 'DELETE'
  host: string
  /** The object path as it is, not yet URI-encoded: `/bucket/key`. */
  path: string
  /** Further headers to sign next to host, x-amz-content-sha256 and x-amz-date (lower-case names). */
  headers?: Record<string, string>
  /** Hex SHA-256 of the request body. */
  payloadHash: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  service?: string
  date: Date
}

/** AWS wants every byte outside the unreserved set encoded, which encodeURIComponent leaves `!'()*` of. */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** The headers a signed S3 request carries: `authorization`, `x-amz-date`, `x-amz-content-sha256` and the extra ones. */
export async function signS3Request(input: S3SignInput): Promise<{ authorization: string, headers: Record<string, string> }> {
  const service = input.service ?? 's3'
  const amzDate = input.date.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)

  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(input.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.trim()])),
    'host': input.host,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
  }
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')

  const canonicalRequest = [
    input.method,
    input.path.split('/').map(encodeSegment).join('/'),
    '', // no query string
    ...names.map(name => `${name}:${headers[name]}`),
    '',
    signedHeaders,
    input.payloadHash,
  ].join('\n')

  const scope = `${day}/${input.region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  const dateKey = await hmac(`AWS4${input.secretAccessKey}`, day)
  const regionKey = await hmac(dateKey, input.region)
  const serviceKey = await hmac(regionKey, service)
  const signingKey = await hmac(serviceKey, 'aws4_request')
  const signature = hex(await hmac(signingKey, stringToSign))

  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`
  const { host: _host, ...sent } = headers
  return { authorization, headers: { ...sent, authorization } }
}

/** The image store on R2: `PUT`, `GET` and `DELETE https://<account>[.eu].r2.cloudflarestorage.com/<bucket>/<key>`. Checked by hand on staging (#143). */
export function r2ImageStore(config: R2Config): ImageStore {
  const host = `${config.accountId}${config.jurisdiction === 'eu' ? '.eu' : ''}.r2.cloudflarestorage.com`

  async function call(method: 'GET' | 'PUT' | 'DELETE', key: string, body: Uint8Array | undefined, contentType?: string) {
    const path = `/${config.bucket}/${key}`
    const signed = await signS3Request({
      method,
      host,
      path,
      headers: contentType ? { 'content-type': contentType } : undefined,
      payloadHash: await sha256Hex(body ?? new Uint8Array()),
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: 'auto',
      date: new Date(),
    })
    return fetch(`https://${host}${path.split('/').map(encodeSegment).join('/')}`, {
      method,
      headers: signed.headers,
      body: body as BodyInit | undefined,
    })
  }

  return {
    async put(key, body, contentType) {
      const response = await call('PUT', key, body, contentType)
      if (!response.ok) throw new Error(`R2 put failed: ${response.status}`)
    },
    async get(key) {
      const response = await call('GET', key, undefined)
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`R2 get failed: ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    },
    async delete(key) {
      const response = await call('DELETE', key, undefined)
      if (!response.ok && response.status !== 404) throw new Error(`R2 delete failed: ${response.status}`)
    },
  }
}
