/** The hooks `git commit` runs, in the order it runs them. */
export const COMMIT_HOOK_NAMES = ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit']

/**
 * Husky's runner in its hooks folder (`.husky/_/h`): its wrappers, one per hook name, run the package's
 * script of that name in the folder above (`.husky/pre-commit`) when it exists, else nothing.
 */
export const HUSKY_RUNNER_FILE = 'h'
