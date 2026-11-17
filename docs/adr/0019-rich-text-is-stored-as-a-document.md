# Rich text is stored as a document, never as HTML or Markdown

Decided on 2026-11-16 in the grilling for 0.16 „Bibliothek“ (Idea issue #454). Game notes and Event notes get simple formatting (bold, italic, one heading level, bullet and numbered lists, links) and a WYSIWYG editor, Tiptap. COMPIES stores such a text as the editor's structured document (a tree of the few node and mark types it allows) and renders it by walking that tree into its own elements. It never stores HTML and never renders with `v-html`: until now the app shows every text a User wrote through escaping interpolation only, and a stored document that cannot hold a tag keeps that property without a sanitiser.

## Considered Options

- **HTML**: what most editors emit, but it needs a sanitiser on every write and a `v-html` on every read, and one gap in either is a stored script.
- **Markdown**: portable and readable in an export, but a WYSIWYG editor round-trips it with losses (nested lists, line breaks), and it would still need a renderer that must be kept from emitting raw HTML.

## Consequences

- The stored format is tied to the editor's document model. The server validates it against its own short list of allowed nodes and marks, so the tie is to that list, not to the library's version.
- A link's address is validated as `http` or `https` on write; no other scheme is stored.
- The length limit counts the visible characters, not the stored size.
- Tools that read the notes outside the app (the Tag review's export) get the document and must turn it into text themselves.
