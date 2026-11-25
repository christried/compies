// The Chat's wire types (GLOSSARY: Chat, #758, spec #719 § A). A leaf: `shared/realtime.ts` imports it, and the Worker's deploy list names every file it reaches.

/** Who deleted a Message: the enum `message_deleter` of server/db/schema.ts. */
export type MessageDeleter = 'host' | 'writer'

/** A Message as the write answers it, `chat.added` carries it and the read lists it. `at` is an ISO string, like the Activity entry's. */
export interface LiveMessage {
  id: string
  writerId: string
  text: string
  at: string
}

/** A deleted Message: its text is gone and the line says who deleted it (the Host's own Message records `writer`). It keeps `at`, so its line keeps its place. */
export interface DeletedMessage {
  id: string
  writerId: string
  text: null
  at: string
  deletedBy: MessageDeleter
}

export type Message = LiveMessage | DeletedMessage

/** A writer who is no Member of the Event, as the read sends them: what `readPerson` (shared/auth.ts) returns for a User, defined here to keep this file a leaf (#916). */
export interface WriterView {
  name: string
  image: string | null
  deleted?: true
}

/** A page of the Chat, newest first; `next` is the `before` of the page after, null at the oldest Message. The shape of the Activity feed's page. `writers` holds the writers of this page who are no Member of the Event, by id (#916). */
export interface MessagePage {
  messages: Message[]
  next: string | null
  writers: Record<string, WriterView>
}
