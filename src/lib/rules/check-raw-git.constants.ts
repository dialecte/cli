/** The `raw-git-repository` rule: a test making a git repository without the scratch helpers. */

/** The git subcommands that make a repository: an argument list starting with one is a raw one. */
export const REPOSITORY_MAKING_SUBCOMMANDS: readonly string[] = ['clone', 'init']

/** The flag of a bare repository: nothing is committed in one, so it needs no identity. */
export const BARE_FLAG = '--bare'

/** The program a spawning call runs, named by its first argument (`spawnSync('git', [...])`). */
export const GIT_PROGRAM = 'git'

/** The `raw-git-repository` finding's message. */
export const RAW_GIT_REPOSITORY_MESSAGE =
	'a raw `git clone` or `git init` in a test: the repository has no identity (green on macOS, red on Linux CI) - make it with `cloneRepository` / `initializeRepository` of `test/scratch-repository.ts`'
