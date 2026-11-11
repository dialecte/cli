/** Root reads through a folder without permissions: the case of an unreadable store means nothing there. */
export const RUNS_AS_ROOT = process.getuid?.() === 0
