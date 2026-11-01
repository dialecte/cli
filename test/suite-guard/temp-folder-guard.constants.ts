/**
 * The prefix of the suite's temporary folder, made under the system's temporary folder for one run: short,
 * since it becomes every test's TMPDIR and macOS limits a socket path to 104 bytes (tsx makes its IPC socket
 * there).
 */
export const SUITE_FOLDER_PREFIX = 'dlt-'

/**
 * Entries of the suite's temporary folder that are caches, not leftovers: Node's module compile cache, which
 * npm turns on for every npx it runs (`<TMPDIR>/node-compile-cache`). They go with the folder.
 */
export const SUITE_FOLDER_CACHES: readonly string[] = ['node-compile-cache']
