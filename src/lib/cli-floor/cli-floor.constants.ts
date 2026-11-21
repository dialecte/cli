/** The cli floor of `dialecte lot`: the words of its refusal and of its hints; `{name}` a value filled in. */

/** The refusal of a running cli older than the floor. */
export const FLOOR_REFUSAL_LINE =
	'lot: this cli is {package} {running}, started as {started}, older than {floor} that {root} asks for ({source}); nothing done'

/** The refusal of a running cli whose version could not be read, with a floor to meet. */
export const UNREADABLE_VERSION_LINE =
	'lot: this cli’s version could not be read ({version}), started as {started}, and {root} asks for {package} {floor} or newer ({source}); nothing done'

/** How the running cli is named: the path it was started by, and its real path when that differs. */
export const STARTED_AS_LINKED = '{invoked} ({real})'

/** What a running version that is missing reads as in the refusal. */
export const MISSING_VERSION = 'none'

/** Where a floor came from, as the refusal names it. */
export const FLOOR_SOURCE_TEXTS = {
	own: 'its package.json version',
	pin: '{field} {package} {spec}',
	installed: 'installed in node_modules, {field} {package} {spec}',
} as const

/** Added to a floor's source when it was read at the base branch's tip. */
export const AT_BRANCH_SUFFIX = ' at {branch}'

/** The hint of a floor read in the cli repository itself: its own sources. */
export const OWN_CLI_HINT = 'run the repository’s own cli: node {root}/src/cli.ts lot …'

/** The hint of a package's floor: the cli it installs. */
export const PACKAGE_CLI_HINT =
	'run the repository’s own cli: npx --no-install dialecte lot … in {root}'

/** The hint of a running cli installed in the package itself, older than its pin. */
export const STALE_INSTALL_HINT =
	'the cli installed in {root} is older than its pin: run npm install in {root}'

/** The hint of a running cli started from a git checkout of the cli. */
export const CHECKOUT_UPDATE_HINT = 'or update that checkout: git -C {root} pull'

/** The start of an option word: never a lot, a brief or a folder. */
export const OPTION_PREFIX = '-'
