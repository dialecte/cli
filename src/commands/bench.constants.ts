/** The growth a lot may bring to a scenario's instantiation count without explaining it: 5%. */
export const THRESHOLD = 0.05

/** A row over the threshold that no type-cost note this change added explains (`--check` only). */
export const EXIT_OVER = 1

/** A refusal: a base that cannot be read, a head that cannot be measured, a tree that cannot be made. */
export const EXIT_REFUSED = 2

/** The option naming a base to compare with: `--base <ref>`. */
export const BASE_OPTION = 'base'

/** Every line the bench prints but its table: `{…}` filled. */
export const BENCH_LINES = {
	header: 'bench — {compiler} {version}, one checker',
	ownCompiler:
		"bench: using @dialecte/cli's own tsc: counts may differ from the project's pinned TypeScript",
	noCompiler: 'bench: no TypeScript compiler found (project nor @dialecte/cli)',
	unreadableCompiler: 'bench: cannot read the compiler version from {tsc}: {output}',
	noCommit: 'bench: no commit: the install is not checked',
	prefix: 'bench: {line}',
	flagBase: 'bench: base {short} (--base {ref})',
	handedBase: 'bench: base {short} (handed)',
	notACommit: 'bench: the base {base} is no commit',
	lotWithoutBase: 'bench: the lot has no base',
	noBaseInCi: 'bench: no base in CI: pass the base',
	nothingCompared: 'bench: no base: nothing compared',
	noTargets:
		'bench: no versions discovered (src/<version>/definition/*.generated.ts): pass --constants-dir, or add a "dialecte" config',
	discoveryAtHead: 'bench: {failure}: coverage: api is left out at the head',
	discoveryAtBase:
		'bench: the base could not discover its methods, {failure}: coverage: api is new',
	over: '❌ [{version}] {scenario}: {head} > {base} ({change}): explain it in this lot\'s changelog fragment ("- Type cost: <why>"), or reduce the types',
	explained: '✓ [{version}] {scenario}: {head} > {base} ({change}) explained: {note}',
	green:
		'✅ No instantiation growth over {percent}% left unexplained across {versions} version(s).',
} as const

/** The width of the scenario column, and of each count column. */
export const SCENARIO_WIDTH = 26
export const COUNT_WIDTH = 12
export const CHANGE_WIDTH = 7

/** How a row is marked after its change; a row within the threshold carries no mark. */
export const VERDICT_MARKS = {
	over: 'over',
	within: '',
	shrunk: 'gain',
	new: 'new',
	gone: 'gone',
} as const

/** A count a side does not have, a change that cannot be told. */
export const ABSENT_CELL = '—'

/** The change of a count from a base of 0. */
export const INFINITE_CHANGE = '+∞'

/** The values of `CI` that say it is off, lower case: a run with one of them is no CI run. */
export const CI_OFF_VALUES: readonly string[] = ['false', '0', '']
