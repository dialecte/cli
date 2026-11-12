/** The sizes of the buffers a writing `node:fs` saw written while it was armed, one per `writeSync` call. */
export type WrittenSizes = { armed: boolean; sizes: number[] }
