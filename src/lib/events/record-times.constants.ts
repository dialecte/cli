import type { GateRecordFamily, TddEntryTime } from './unrecorded-steps.types.ts'

/** The gate record of each time field: the `{mode}` of its `dialecte-gate-{mode}.json`. */
export const RECORD_MODES: Readonly<Record<GateRecordFamily['field'], string>> = {
	gateFast: 'fast',
	gateFull: 'full',
	gateRelease: 'release',
	contrib: 'contrib',
	gateHook: 'hook',
}

/** The tdd step a ledger entry's kind names: a red receipt or a freeze is a red run's, a green receipt a green run's. */
export const TDD_STEP_OF_KIND: Readonly<Record<string, TddEntryTime['step']>> = {
	red: 'tdd-red',
	freeze: 'tdd-red',
	green: 'tdd-green',
}

/** The most tdd ledger entries a reader keeps: the newest, the older ones dropped with `cut`. */
export const TDD_ENTRY_LIMIT = 200

/** The extension of a mutation run file. */
export const RUN_FILE_EXTENSION = '.json'

/** The status of a gate record's step that failed: the one status that makes the record not green. */
export const FAILED_STEP_STATUS = 'failed'
