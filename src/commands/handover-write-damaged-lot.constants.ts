import type { DamageKind } from '../../test/damaged-lot-workspace.types.ts'

/** The damages that leave the lot's identity readable: the folder still names a lot, a record of it is broken. */
export const READABLE_IDENTITY_DAMAGES: readonly DamageKind[] = [
	'badTransition',
	'strayAnswer',
	'unknownEntryState',
]

/** The command a refusal names for a lot that must be moved aside, and the one a pending hand-over is ended with. */
export const STOP_COMMAND = 'lot stop'
export const ABANDON_COMMAND = 'handover abandon'
