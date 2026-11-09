/** What `interruptedWrite` describes: the file's text before the write (undefined: no file) and the text written. */
export type InterruptedWriteParams = { before: string | undefined; expected: string }

/** What `seed` writes: `before` at `path`, nothing when `before` is undefined. */
export type SeedParams = { path: string; before: string | undefined }
