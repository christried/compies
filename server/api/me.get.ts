import { defineEventHandler } from 'h3'
import { getUser } from '../utils/user'
import type { MeView } from '../../shared/auth'

// The signed-in User for the route guard and the header, or null when signed out.
export default defineEventHandler(async (event): Promise<MeView> => ({ user: await getUser(event) }))
