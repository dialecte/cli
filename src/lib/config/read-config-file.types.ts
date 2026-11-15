import type { Document, LineCounter } from 'yaml'

/** What one parse needs to place a node: its file, the document (for its values) and the line counter. */
export type ParsedFile = { file: string; document: Document; lineCounter: LineCounter }
