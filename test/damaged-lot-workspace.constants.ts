import { RECORD_DAMAGE_REASONS } from '../src/lib/store/store.constants.ts'

import type { ScenarioTable } from '../src/lib/store/scenarios.types.ts'
import type { BriefRow, DamageRow } from './damaged-lot-workspace.types.ts'

/** The damaged lot of the cases (index 0007, as the question lots), and the lot a start of the default brief makes beside it. */
export const DAMAGED_NAME = '0007-repo-damaged'

/** A scope the default brief overlaps (its `src/dataflow/`), and one it does not. */
export const OVERLAPPING_SCOPE = ['src/dataflow/']
export const DISJOINT_SCOPE = ['lib/other/']

/** The folder beside the store that holds the lots moved aside, and the record written into a moved folder. */
export const ASIDE_FOLDER = 'dialecte-lots-aside'
export const STOPPED_FILE = 'stopped.json'

/** What a refusal says when the scope of a damaged lot cannot be read. */
export const SCOPE_UNREADABLE = 'its scope cannot be read: it holds every path'

/** The name another folder's identity holds. */
export const OTHER_LOT_NAME = '0099-repo-other'

/** An index that is not digits, and a transition's step below zero (the records a hand forges). */
export const BAD_INDEX = 'abc'
export const BAD_STEP = -1

/** Every way a lot is damaged (P2.5) and the reason its readers give; the reasons are fixed words of the store. */
export const DAMAGES: readonly DamageRow[] = [
	{
		kind: 'identityMissing',
		title: 'identity missing',
		reason: RECORD_DAMAGE_REASONS.identityUnreadable,
	},
	{
		kind: 'identityUnparsable',
		title: 'identity unparsable',
		reason: RECORD_DAMAGE_REASONS.identityUnreadable,
	},
	{
		kind: 'identityOtherName',
		title: 'identity naming another folder',
		reason: RECORD_DAMAGE_REASONS.identityName,
	},
	{
		kind: 'identityIndex',
		title: 'identity index not digits',
		reason: RECORD_DAMAGE_REASONS.index,
	},
	{
		kind: 'badTransition',
		title: 'a bad transition',
		reason: RECORD_DAMAGE_REASONS.position,
	},
	{
		kind: 'strayAnswer',
		title: 'an answer file named after no question',
		reason: RECORD_DAMAGE_REASONS.answerName,
	},
	{
		kind: 'unknownEntryState',
		title: 'a registry entry with an unknown state',
		reason: RECORD_DAMAGE_REASONS.entryState,
	},
]

/** The lot a start made beside the damaged one in the interleaving cases, and a lot that holds. */
export const SECOND_NAME = '0008-repo-second'
export const HEALTHY_NAME = '0008-repo-healthy'

/** The line of an inbox with nothing that waits, no lot working and none simulated. */
export const NO_ONE_WAITS = 'working 0 · simulated 0 (listed with --simulated)'

/** What a stop says of a lot whose hand-over run is in progress (the wording of `handover abandon`); the braces are filled by the helper. */
export const RUNNING_REFUSAL =
	'handover abandon: the hand-over {folder} is running (pid {pid}, since {startedAt}, marked by {marker}): nothing abandoned; wait until its run ends'

/** A scenario of one station step: played once, then nothing is left to play and the lot still reads working. */
export const ONE_STEP_SCENARIO_NAME = 'one-step'
export const ONE_STEP_SCENARIO: ScenarioTable = {
	[ONE_STEP_SCENARIO_NAME]: [
		{
			kind: 'station',
			station: 'test-writer',
			position: { step: 1, of: 1, station: 'test-writer', round: null },
			durationMs: 0,
		},
	],
}

/** The ways the brief of a lot with no identity cannot give its scope. */
export const BRIEF_DAMAGES: readonly BriefRow[] = [
	{ kind: 'missing', title: 'brief missing' },
	{ kind: 'unparsable', title: 'brief unparsable' },
	{ kind: 'scopeNotList', title: 'brief scope not a list' },
]
