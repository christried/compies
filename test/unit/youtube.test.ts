import { describe, expect, it } from 'vitest'
import { parseYouTubeId, youTubeThumbnail } from '../../shared/youtube'

const ID = 'dQw4w9WgXcQ'

describe('parseYouTubeId', () => {
  it.each([
    ['a watch link', `https://www.youtube.com/watch?v=${ID}`, ID],
    ['a watch link with more parameters', `https://www.youtube.com/watch?v=${ID}&t=72s&list=PLabc`, ID],
    ['a watch link with v after another parameter', `https://www.youtube.com/watch?list=PLabc&v=${ID}`, ID],
    ['a youtu.be link', `https://youtu.be/${ID}`, ID],
    ['a youtu.be link with a time', `https://youtu.be/${ID}?t=72`, ID],
    ['a shorts link', `https://www.youtube.com/shorts/${ID}`, ID],
    ['an embed link', `https://www.youtube.com/embed/${ID}`, ID],
    ['a live link', `https://www.youtube.com/live/${ID}`, ID],
    ['a nocookie embed link', `https://www.youtube-nocookie.com/embed/${ID}`, ID],
    ['a nocookie link without www', `https://youtube-nocookie.com/embed/${ID}`, ID],
    ['a mobile link', `https://m.youtube.com/watch?v=${ID}`, ID],
    ['a music link', `https://music.youtube.com/watch?v=${ID}`, ID],
    ['a link without a protocol', `youtube.com/watch?v=${ID}`, ID],
    ['a youtu.be link without a protocol', `youtu.be/${ID}`, ID],
    ['a plain http link', `http://youtube.com/watch?v=${ID}`, ID],
    ['a link with spaces around it', `  https://youtu.be/${ID}  `, ID],
    ['an id with dash and underscore', 'https://youtu.be/a-b_c-d_e-f', 'a-b_c-d_e-f'],
  ])('accepts %s', (_name, raw, id) => {
    expect(parseYouTubeId(raw)).toBe(id)
  })

  it.each([
    ['another host', `https://vimeo.com/${ID}`],
    ['a look-alike host', `https://notyoutube.com/watch?v=${ID}`],
    ['a host that only starts like YouTube', `https://youtube.com.evil.example/watch?v=${ID}`],
    ['a channel link', 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw'],
    ['a watch link without v', 'https://www.youtube.com/watch'],
    ['a 10 character id', 'https://www.youtube.com/watch?v=dQw4w9WgXc'],
    ['a 12 character id', 'https://www.youtube.com/watch?v=dQw4w9WgXcQQ'],
    ['a youtu.be link with a long id', 'https://youtu.be/dQw4w9WgXcQQ'],
    ['a shorts link without an id', 'https://www.youtube.com/shorts/'],
    ['the bare id', ID],
    ['an empty text', ''],
    ['only spaces', '   '],
    ['plain text', 'my favourite video'],
    ['a non-http protocol', `ftp://youtube.com/watch?v=${ID}`],
  ])('rejects %s', (_name, raw) => {
    expect(parseYouTubeId(raw)).toBeNull()
  })
})

describe('youTubeThumbnail', () => {
  it('points at the hqdefault image of the video', () => {
    expect(youTubeThumbnail(ID)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })
})
