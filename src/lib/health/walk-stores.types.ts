/** A store the walk could list, with its lot folder names. */
export type ListedStore = { store: string; lotNames: string[] }

/** A store the walk found but cannot list (a line of the store list naming a file, a folder that cannot be read), and why. */
export type SkippedStore = { store: string; reason: string }

/** One store of the walk: listed, or skipped with its reason. */
export type WalkedStore = ListedStore | SkippedStore
