/** The hooks `git commit` runs, in the order it runs them. */
export const COMMIT_HOOK_NAMES = ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit']

/**
 * Husky's runner in its hooks folder (`.husky/_/h`): its wrappers, one per hook name, run the package's
 * script of that name in the folder above (`.husky/pre-commit`) when it exists, else nothing.
 */
export const HUSKY_RUNNER_FILE = 'h'

/** The mode git records an executable file with: a plain hooks folder runs only such a file. */
export const EXECUTABLE_FILE_MODE = '100755'

/** The git folder at the top of a work tree: a hooks folder in it is never part of a tree. */
export const GIT_FOLDER_NAME = '.git'
