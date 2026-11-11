/**
 * What `dialecte gate` and `dialecte contrib` share around their records: the line naming the record that answers a
 * run, the steps that record holds as results, and the record of a run, written without a key when the state
 * changed while its steps ran.
 */

import { textOf } from '../print/print.ts'
import { isSameKey, originOfRecord } from './check-store.ts'
import { RECORD_REUSED_LINE, SHORT_SHA_LENGTH } from './gate-records.constants.ts'
import { recordGate } from './gate-records.ts'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { StepResult } from '../gate/gate.types.ts'
import type {
	CheckKey,
	GateRecord,
	GateRecordMode,
	RecordedRun,
	RecordedStep,
} from './gate-records.types.ts'

/**
 * `reused: <command> green on this tree at <time> (HEAD <short>)`, naming the run that checked: escaped here, it
 * quotes a record's values and a live output keeps colours.
 */
export function renderReuseLine(params: { command: string; record: GateRecord }): string {
	const { at, head } = originOfRecord(params.record)
	return textOf([
		RECORD_REUSED_LINE.replace('{command}', params.command)
			.replace('{at}', at)
			.replace('{head}', head.slice(0, SHORT_SHA_LENGTH)),
	])
}

/**
 * The steps of a reused record as results, but those named in `leftOut` (a step this run made its own): each with
 * its configured step when `steps` holds one of its name, else a step of that name with no command. A scoped
 * step's selection, a failed or flaky step's failing files and the heavy mark are the record's (`heavy` stays
 * outside the key, so the record says it).
 */
export function reusedResults(params: {
	record: GateRecord
	steps: readonly GateStep[]
	leftOut?: readonly string[]
}): StepResult[] {
	const leftOut = params.leftOut ?? []
	return params.record.steps
		.filter((step) => !leftOut.includes(step.name))
		.map(function resultOf(recorded: RecordedStep): StepResult {
			const { heavy: _configuredHeavy, ...configured } = params.steps.find(
				(step) => step.name === recorded.name,
			) ?? { name: recorded.name, run: '' }
			return {
				step: { ...configured, ...(recorded.heavy && { heavy: true }) },
				status: recorded.status,
				counts: recorded.counts,
				restored: [],
				...(recorded.note && { note: recorded.note }),
				...(recorded.reason && { reason: recorded.reason }),
				...(recorded.selection && { selection: recorded.selection }),
				...(recorded.failing && { failing: recorded.failing }),
			}
		})
}

/**
 * Records a run with the key of what it checked. A state changed while the steps ran (a step edited a file, an
 * install, a rebuilt dependency) was not the state they checked: the run is then recorded without a key, holding
 * the tree its steps started on (never current for the one they left), and never stored. Answers whether the
 * record went to the store, the state hash it holds (null when none was written) and whether the state changed.
 */
export function recordCheckedRun(params: {
	root: string
	mode: Exclude<GateRecordMode, 'hook'>
	results: StepResult[]
	/** The key before the steps; undefined when the run stopped before them. */
	keyBefore: CheckKey | undefined
	keyAfter: CheckKey
	/** The record that answered the run instead of its steps. */
	reused?: GateRecord
	/** The repository whose store holds the record, when the run is a rehearsal's in a scratch clone of it. */
	storeRoot?: string
	/** The gate base the run resolved for its scoped steps; absent without one. */
	base?: GateRecord['base']
	/** How long the machine slept during the run, when it did. */
	sleptMs?: number
}): RecordedRun & { changedWhileRunning: boolean } {
	const { keyBefore, keyAfter } = params
	const changedTree =
		keyBefore !== undefined && !isSameKey({ key: keyBefore, other: keyAfter })
			? keyBefore.tree
			: undefined
	const recorded = recordGate({
		root: params.root,
		mode: params.mode,
		results: params.results,
		...(changedTree === undefined ? { key: keyAfter } : { checkedTree: changedTree }),
		...(params.reused && { reused: originOfRecord(params.reused) }),
		...(params.storeRoot && { storeRoot: params.storeRoot }),
		...(params.base && { base: params.base }),
		...(params.sleptMs !== undefined && { sleptMs: params.sleptMs }),
	})
	return { ...recorded, changedWhileRunning: changedTree !== undefined }
}
