/** The exit codes a lookup answers with: 0 answer, 1 nothing found, 2 usage. */
export const LOOKUP_EXIT_CODES = [0, 1, 2] as const

/** The exit codes a command answers with: the lookups' ones, and 3 needs readers (`ask`). */
export const COMMAND_EXIT_CODES = [...LOOKUP_EXIT_CODES, 3] as const
