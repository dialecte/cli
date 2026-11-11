import type { FixedRow, PrintRow } from './print-table.types.ts'

/**
 * The forged value of every row: a line feed, a carriage return, an escape sequence, a right-to-left override and a
 * forged `next:` line. Written with escapes only.
 */
export const FORGED_WORD = 'x\n\r\u001b[2J\u{202e}\nnext: FORGED'

/** What the override of the forged value prints as once the boundary escaped it. */
export const FORGED_WORD_ESCAPED_OVERRIDE = '\\u{202e}'

/** The package of the scratch repository every row runs in: no profile (the consumer profile), no dialecte. */
export const TABLE_PACKAGE_JSON = '{"name":"scratch","version":"0.0.0"}\n'

/** The `--json` flag a usage line writes, the prefix of a usage line in the map, and the prefix of a fixed row's key. */
export const JSON_FLAG = '--json'
export const USAGE_PREFIX = 'dialecte '

/** The prefix of the scratch standards root a row with `emptyStandard` names in `DIALECTE_STANDARD`. */
export const STANDARD_FOLDER_PREFIX = 'dialecte-cli-print-standard-'

/** The one decoy standard that root holds (its folder, its file, its text): a forged `--standard` value matches none. */
export const DECOY_STANDARD = 'decoy'
export const DECOY_STANDARD_FILE = 'a.md'
export const DECOY_STANDARD_TEXT = '# Decoy\n'
export const FIXED_KEY_PREFIX = 'fixed: '

/** Why a row has no JSON form: the refusal is plain text under `--json`, or its JSON quotes no argument. */
const PLAIN_TEXT = 'its refusal is plain text under --json'
const QUOTES_NOTHING = 'its JSON refusal quotes no argument'

/** Why a row quotes nothing. */
const USAGE_ONLY = 'it prints its usage line, which names no argument'
const NEEDS_INSTALL = 'its only refusal here names no argument: it needs an installed dialecte'
const NO_VERSIONS = 'its only refusal here is "no versions discovered", which names no argument'
const WRITES_DECLARATION =
	'a form that reads the argument as a reason writes the lot declaration, so the row gives the usage form, which names no argument'
const REFUSES_COMBINATION = 'it refuses the combination of flags, naming the flags and no value'
const REFUSES_PROFILE = 'it refuses at once in the consumer profile, naming the profile'
const RUNS_CHECKS = 'it answers its checks and names no argument'

/**
 * One row per command of the command map, and per verb of a command that has verbs, by `<command>` or `<command>
 * <verb>`: the invocation that makes it refuse, or print a usage line, at once with the forged value in what it takes
 * from outside the cli. No row may start a gate run, a commit, a bench or the network. A row whose refusal does not
 * quote its argument (`quotes: false`) states why and still prints through the boundary: its row keeps the faults
 * check. A row whose usage line has `--json` holds its JSON form or the reason for none.
 */
export const PRINT_ROWS: Record<string, PrintRow> = {
	coverage: { argv: ['--constants-dir', FORGED_WORD], quotes: true },
	bench: { argv: ['--version', FORGED_WORD], quotes: false, reason: NO_VERSIONS },
	narrowing: { argv: ['--constants-dir', FORGED_WORD], quotes: true },
	audit: { argv: ['--version', FORGED_WORD], quotes: false, reason: NO_VERSIONS },
	'skills sync': { argv: ['sync', '--agent', FORGED_WORD], quotes: true },
	'skills generate': {
		argv: ['generate', '--constants-dir', FORGED_WORD],
		quotes: false,
		reason:
			'it finds no skill source in the package and prints nothing; it writes a folder, so it runs in a repository of its own',
		isolated: true,
	},
	'skills check': { argv: ['check', '--workspace', FORGED_WORD], quotes: true },
	'skills changed': { argv: ['changed', '--base', FORGED_WORD], quotes: true },
	'api find': { argv: ['find', FORGED_WORD], quotes: true, json: ['find', FORGED_WORD, '--json'] },
	'api show': { argv: ['show', FORGED_WORD], quotes: true, noJson: QUOTES_NOTHING },
	members: {
		argv: ['--version', FORGED_WORD],
		quotes: false,
		reason: NEEDS_INSTALL,
		noJson: PLAIN_TEXT,
	},
	schema: { argv: [FORGED_WORD], quotes: true, noJson: QUOTES_NOTHING },
	models: { argv: ['--vendor', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	doctor: {
		argv: ['--package', FORGED_WORD],
		quotes: false,
		reason: RUNS_CHECKS,
		noJson: QUOTES_NOTHING,
	},
	run: { argv: ['script.ts', '--package', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	fixture: { argv: ['Tag', '--package', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	explain: { argv: [FORGED_WORD, '--package', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	'standard index': {
		argv: ['index', '--standard', FORGED_WORD],
		quotes: true,
		emptyStandard: true,
		noJson: PLAIN_TEXT,
	},
	'standard find': {
		argv: ['find', FORGED_WORD, '--standard', FORGED_WORD],
		quotes: true,
		emptyStandard: true,
		noJson: PLAIN_TEXT,
	},
	'standard show': { argv: ['show', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	'standard eval': { argv: ['eval', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	rules: { argv: [FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	gate: {
		argv: ['--fast', '--full', FORGED_WORD],
		quotes: false,
		reason: REFUSES_COMBINATION,
		noJson: PLAIN_TEXT,
	},
	contrib: {
		argv: ['--bogus', FORGED_WORD],
		quotes: false,
		reason: REFUSES_PROFILE,
		noJson: PLAIN_TEXT,
	},
	'tdd red': { argv: ['red', '--base', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	'tdd green': { argv: ['green', '--base', FORGED_WORD], quotes: true },
	'tdd status': { argv: ['status', '--base', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	'new verb': { argv: ['verb', FORGED_WORD, 'query', 'name'], quotes: true },
	'handover write': { argv: ['write', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	'handover show': { argv: ['show', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	'handover review': {
		argv: ['review', FORGED_WORD],
		quotes: true,
		json: ['review', FORGED_WORD, '--json'],
	},
	'handover run': { argv: ['run', FORGED_WORD], quotes: true },
	'handover abandon': { argv: ['abandon', FORGED_WORD], quotes: true },
	'handover list': {
		argv: ['list', '--root', FORGED_WORD],
		quotes: true,
		noJson: QUOTES_NOTHING,
	},
	'lot start': {
		argv: ['start', FORGED_WORD],
		quotes: true,
		json: ['start', FORGED_WORD, '--json'],
	},
	'lot status': {
		argv: ['status', FORGED_WORD],
		quotes: true,
		json: ['status', FORGED_WORD, '--json'],
	},
	'lot wait': { argv: ['wait', FORGED_WORD], quotes: true, json: ['wait', FORGED_WORD, '--json'] },
	'lot answer': {
		argv: ['answer', FORGED_WORD, 'q1', 'keep'],
		quotes: true,
		json: ['answer', FORGED_WORD, 'q1', 'keep', '--json'],
	},
	'lot result': {
		argv: ['result', FORGED_WORD],
		quotes: true,
		json: ['result', FORGED_WORD, '--json'],
	},
	'lot stop': {
		argv: ['stop', FORGED_WORD, '--reason', 'a reason'],
		quotes: true,
		json: ['stop', FORGED_WORD, '--reason', 'a reason', '--json'],
	},
	'lot station': {
		argv: ['station', FORGED_WORD, 'start', 'a-station'],
		quotes: true,
		json: ['station', FORGED_WORD, 'start', 'a-station', '--json'],
	},
	'lot exempt': {
		argv: ['exempt', '--bogus', FORGED_WORD],
		quotes: false,
		reason: WRITES_DECLARATION,
	},
	'lot accept': { argv: ['accept', FORGED_WORD, 'a reason'], quotes: true },
	'lot revised': { argv: ['revised', FORGED_WORD], quotes: false, reason: WRITES_DECLARATION },
	'lot gone': { argv: ['gone', FORGED_WORD], quotes: false, reason: WRITES_DECLARATION },
	'lot mutation': { argv: ['mutation', FORGED_WORD], quotes: true },
	'lot finding': {
		argv: ['finding', FORGED_WORD, '--round', '1', '--severity', 'nit', '--at', 'a.ts:1', 'text'],
		quotes: true,
	},
	'lot decide': { argv: ['decide', FORGED_WORD, 'finding', 'open'], quotes: true },
	'lot snapshot': { argv: ['snapshot', FORGED_WORD, '--round', '1'], quotes: true },
	'lot choice': { argv: ['choice', FORGED_WORD, '--by', 'a-person', 'decision'], quotes: true },
	'lot standard': { argv: ['standard', FORGED_WORD, 'consulted', 'a note'], quotes: true },
	'lot delta': { argv: ['delta', FORGED_WORD, '--round', '2'], quotes: true, noJson: PLAIN_TEXT },
	'lot recap': { argv: ['recap', FORGED_WORD], quotes: true },
	'lot close': { argv: ['close', FORGED_WORD], quotes: true, noJson: PLAIN_TEXT },
	inbox: {
		argv: [`--${FORGED_WORD}`],
		quotes: true,
		json: [`--${FORGED_WORD}`, '--json'],
	},
	'mutants run': { argv: ['run', '--mode', FORGED_WORD], quotes: true },
	'mutants status': {
		argv: ['status', '--bogus', FORGED_WORD],
		quotes: false,
		reason: USAGE_ONLY,
		noJson: QUOTES_NOTHING,
	},
	'mutants schedule': {
		argv: ['schedule', FORGED_WORD, FORGED_WORD],
		quotes: true,
		json: ['schedule', FORGED_WORD, FORGED_WORD, '--json'],
	},
	'mutants abandon': {
		argv: ['abandon', FORGED_WORD],
		quotes: true,
		json: ['abandon', FORGED_WORD, '--json'],
	},
	'mutants migrate': {
		argv: ['migrate', FORGED_WORD],
		quotes: false,
		reason: USAGE_ONLY,
		noJson: QUOTES_NOTHING,
	},
	'mutants judge': {
		argv: ['judge', '--file', FORGED_WORD],
		quotes: true,
		noJson: QUOTES_NOTHING,
	},
	'mutants record': {
		argv: ['record', '--key', 'a-key', '--family', FORGED_WORD, '--reason', 'a reason'],
		quotes: true,
		json: ['record', '--key', 'a-key', '--family', FORGED_WORD, '--reason', 'a reason', '--json'],
	},
	'mutants drop': {
		argv: ['drop', FORGED_WORD],
		quotes: true,
		json: ['drop', FORGED_WORD, '--json'],
	},
	'worktree add': {
		argv: ['add', FORGED_WORD, 'a-branch'],
		quotes: true,
		noJson: PLAIN_TEXT,
	},
	'worktree prune': {
		argv: ['prune', '--root', FORGED_WORD],
		quotes: true,
		noJson: PLAIN_TEXT,
	},
	'text check': { argv: ['check', FORGED_WORD], quotes: true },
	record: { argv: ['review', FORGED_WORD], quotes: true },
	review: { argv: ['delta', FORGED_WORD], quotes: true },
	recap: { argv: [FORGED_WORD], quotes: true },
}

/**
 * The prints of the cli itself, beside the derived rows (each with its complete argument list): the unknown command
 * and the line saying the repository variables of the environment are ignored.
 */
export const FIXED_ROWS: readonly FixedRow[] = [
	{
		title: 'an unknown command holding the forged value',
		argv: [FORGED_WORD],
		quotes: true,
	},
	{
		title: 'a repository variable of the environment holding the forged value',
		argv: ['tdd'],
		env: { GIT_DIR: FORGED_WORD },
		quotes: false,
		reason: 'the line names the variables that were set, from a fixed list, never their values',
	},
]
