import { getRequestURL, type H3Event } from 'h3'
import { invitePath, eventPath } from '../../shared/links'

// Absolute Event addresses for answers and calendar files (ADR 0006), on the origin of the request.

export function eventUrl(event: H3Event, slug: string): string {
  return `${getRequestURL(event).origin}${eventPath(slug)}`
}

export function inviteUrl(event: H3Event, slug: string, token: string): string {
  return `${getRequestURL(event).origin}${invitePath(slug, token)}`
}
