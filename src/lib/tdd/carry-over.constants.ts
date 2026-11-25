/** A carried red's detail line: `{lot}` the source lot, `{at}` the time of the source's red. */
export const CARRIED_FROM = 'carried from {lot}: its red of {at}'

/** A carried case refused: as written now it passes on the base's production, `{lot}` the source lot. */
export const CARRIED_PASSES_ON_BASE =
	'carried from {lot}, but it passes on the base production: the carry proves nothing'

/** The refusal in place of `PROVES_NOTHING`: `{lot}` the source lot, `{why}` one of `NOT_CARRIED_REASONS`. */
export const NOT_CARRIED = 'not carried from {lot}: {why}'

/**
 * Why a case is not carried; `{file}` the first file that differs (or the pytest file whose freeze recorded no
 * conftests), `{files}` the conftests that differ, `{kind}` what the source proved it by.
 */
export const NOT_CARRIED_REASONS = {
	callDiffers: 'its test call differs from the one the source proved',
	fileDiffers: 'its test file {file} differs from the one the source froze',
	helperDiffers: 'the test code {file} it depends on differs from the one the source ran on',
	conftestsDiffer: 'the conftests {files} it runs under differ from the ones the source ran under',
	conftestsUnrecorded: 'the source recorded no conftests for its test file {file}',
	notRed: 'the source proved it by {kind}: only a red is carried',
	noGreen: 'the source holds no green of it to compare',
	productionDiffers: 'the production file {file} differs from the one the source ran on',
	unrecorded: 'the source recorded no production state for its green',
	baseUnreadable: 'git cannot read the base the source measured its green from',
} as const

/** The flag a carried red wears. */
export const CARRIED_FLAG = 'carried'

/**
 * Why the carry records of a lot (`carry.json`, `carry/ledger.json`, `carry/lot.json`) cannot be trusted: `tdd red`
 * refuses the whole run on any of them and records nothing. `{file}` the file, `{why}` the lot file's own fault.
 */
export const CARRY_RECORD_FAILURES = {
	notJson: 'the carry record {file} cannot be read (not JSON): nothing recorded',
	shape: 'the carry record {file} is not one lot start --from writes: nothing recorded',
	missing: 'the carry copy {file} is missing: nothing recorded',
	changed:
		'the carry copy {file} differs from the one lot start --from made (its sha256 is not the recorded one): nothing recorded',
	unrecorded: 'the carry copy {file} has no sha256 in the carry record: nothing recorded',
	ledger: 'the carry copy {file} holds no tdd receipts of this cli: nothing recorded',
	declaration: 'the carry copy {file} cannot be read ({why}): nothing recorded',
} as const
