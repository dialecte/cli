/** The texts of `testEvidenceRefusalOf`; `{…}` placeholders filled. */
export const TEST_EVIDENCE_TEXTS = {
	failing: 'tests.json holds failing tests: {items}: {fix}',
	itemSeparator: '; ',
	more: '+{more} more',
	named: '{key}{cases} - gate --{mode} at {head}, {tree}',
	namedCases: ' ({cases})',
	nameless: 'gate --{mode} at {head}, {tree}: the test step failed with no file named ({failed})',
	namelessFailed: '{failed} failed',
	namelessNoCounts: 'no counts',
	unknown: '{why}: only a whole-suite pass clears it',
	counts: 'gate --{mode} at {head}, {tree}: {failed} failed (no names recorded)',
	tdd: 'tdd green at {head}, {tree}: red {cases}',
	thisTree: 'this tree',
	anotherTree: 'another tree',
	noMode: 'unknown',
	fixSeparator: '; ',
	fixGate:
		'fix them, then run dialecte gate --{mode} in {worktree} (or dialecte gate --release) to record a pass (add --no-reuse when a green record answers it); a flake: run it again, a pass recorded flaky in parallel clears it',
	fixWholeSuite: 'run dialecte gate --release in {worktree} to record a whole-suite pass',
	fixTdd: 'make them pass and run dialecte tdd green in {worktree}',
	unreadable:
		'tests.json cannot be read: {why}: run dialecte gate --release, then dialecte tdd green, in {worktree} to write it again',
	noHeadTree: 'the committed HEAD of {worktree} cannot be read: {why}',
} as const

/** How many failures the refusal names before `+<k> more`. */
export const EVIDENCE_ITEMS_SHOWN = 3

/** `git ls-tree` of the files the committed HEAD holds under the package root, relative to it. */
export const HEAD_FILES_ARGUMENTS: readonly string[] = ['ls-tree', '-r', '--name-only', 'HEAD']
