/** The variable naming the scratch root: set by the test suite and CI, it wins over every other root. */
export const SCRATCH_VARIABLE = 'DIALECTE_SCRATCH'

/** The scratch root's folder in the workspace's worktrees folder, beside the pool and the trash. */
export const WORKSPACE_SCRATCH_FOLDER = '_scratch'

/** The scratch root's folder in the system's temporary folder, when the cli runs outside every workspace. */
export const SYSTEM_SCRATCH_FOLDER = 'dialecte-scratch'

/** The file of each scratch folder naming the process that made it: prune tells live from leaked by it. */
export const SCRATCH_MARKER_FILE = 'scratch.json'

/**
 * The short root of a POSIX system: a rehearsal hook's temporary folder is made there, so a tool's socket path under
 * it stays within the system's limit (104 bytes on macOS).
 */
export const POSIX_SHORT_ROOT = '/tmp'
