import { describe, expect, it } from 'vitest'
import { signS3Request } from '../../server/utils/r2-store'

describe('signS3Request (#143)', () => {
  // AWS's published example "Signature calculation: GET object" (S3 docs, Signature Version 4).
  it('signs the GET object example of the AWS docs', async () => {
    const signed = await signS3Request({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      date: new Date('2013-05-24T00:00:00Z'),
    })

    expect(signed.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,'
      + 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,'
      + 'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
    expect(signed.headers['x-amz-date']).toBe('20130524T000000Z')
  })
})
