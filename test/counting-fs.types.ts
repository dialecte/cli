/** The paths a counting `node:fs` saw stat or read while it was armed. */
export type CountedStats = { armed: boolean; paths: string[]; reads: string[] }
