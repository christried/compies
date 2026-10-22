import { defineEventHandler } from 'h3'
import { getUser } from '../utils/user'

// The signed-in User for the route guard and the header, or null when signed out.
export default defineEventHandler(async event => ({ user: await getUser(event) }))
