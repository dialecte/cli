/** The `raw-git-repository` rule: a test making a git repository without the scratch helpers. */

/** The git subcommands that make a repository: an argument list starting with one is a raw one. */
export const REPOSITORY_MAKING_SUBCOMMANDS: readonly string[] = ['clone', 'init']

/** The flag of a bare repository: nothing is committed in one, so it needs no identity. */
export const BARE_FLAG = '--bare'

/** The program a spawning call runs, named by its first argument (`spawnSync('git', [...])`). */
export const GIT_PROGRAM = 'git'

/** The calls that run git with the list they are given: a test helper `git`, the cli's own git readers. */
export const GIT_CALLEES: readonly string[] = ['git', 'readGit', 'tryReadGit', 'readGitBytes']

/**
 * git's options that take the next element as their value, before the subcommand (`-C <path>`, `-c <name=value>`,
 * `--git-dir <path>`, `--work-tree <path>`); their `--git-dir=<path>` form is one element, a flag like any other.
 */
export const OPTIONS_WITH_VALUE: readonly string[] = ['-C', '-c', '--git-dir', '--work-tree']

/** The calls that run their first argument through a shell: `execSync('git init ...')`. */
export const SHELL_CALLEES: readonly string[] = ['exec', 'execSync']

/** The calls that run their first argument through a shell when given `{ shell: ... }`: `spawnSync('git init', { shell: true })`. */
export const SHELL_OPTION_CALLEES: readonly string[] = [
	'spawn',
	'spawnSync',
	'execFile',
	'execFileSync',
]

/** The option naming a shell in a spawning call's options object. */
export const SHELL_OPTION = 'shell'

/**
 * The `raw-git-repository` finding's message. Outside the cli it names no helper: the package's own test helper, if
 * it has one, is not the cli's.
 */
export const RAW_GIT_REPOSITORY_MESSAGE =
	'a raw `git clone` or `git init` in a test: the repository has no identity (green on macOS, red on Linux CI) - make it through one test helper that gives it an identity'

/** The `raw-git-repository` finding's message in the cli itself: its own scratch repository helpers named. */
export const RAW_GIT_REPOSITORY_CLI_MESSAGE =
	'a raw `git clone` or `git init` in a test: the repository has no identity (green on macOS, red on Linux CI) - make it with `cloneRepository` / `initializeRepository` of `test/scratch-repository.ts`'
