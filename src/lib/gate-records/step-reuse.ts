/** A step answered by any green record of the same tree and install that ran it as it is now. */
import { createHash } from 'node:crypto'

import { readHeadOrNone } from '../git.ts'
import { foldMachineLists, hashedStepOf } from './check-key.ts'
import { isGreenRecord, readTreeRecords } from './check-store.ts'
import { RULES_STEP_PATTERN } from './gate-records.constants.ts'

import type { GateStep } from '../gate/gate-config.types.ts'
import type { CheckKey, GateRecord, RecordedStep } from './gate-records.types.ts'

/**
 * sha256 (hex) of the step as `hashGateCommand` hashes one step (name, run, scoped mark, wiring mark), plus
 * `gateBase` only when the step is scoped, folded with the machine lists only when the step's run is a rules run.
 * A `changedOnly` step also holds HEAD, as `gateCommandHash` does: its selection depends on the diff against it.
 */
export function hashGateStep(params: { root: string; step: GateStep; gateBase?: string }): string {
	const { root, step, gateBase } = params
	const hash = sha256(
		JSON.stringify({
			step: hashedStepOf(step),
			base: step.changedOnly ? (readHeadOrNone(root) ?? null) : null,
			...(step.scoped === true && { gateBase }),
		}),
	)
	return RULES_STEP_PATTERN.test(step.run) ? foldMachineLists({ root, hash }) : hash
}

/**
 * The newest record in the store of `tree`, any mode, whose key has that tree, lockHash and linked, that is green as
 * a whole and holds a passed step of that `stepHash`; undefined when none does.
 */
export function findStepAnswer(params: {
	root: string
	tree: string
	treeKey: Pick<CheckKey, 'lockHash' | 'linked'>
	stepHash: string
	/** The absolute git common dir whose store to read instead of the repository's own. */
	checkStore?: string
}): { record: GateRecord; recorded: RecordedStep } | undefined {
	const { treeKey, stepHash } = params
	const answers = readTreeRecords({
		root: params.root,
		tree: params.tree,
		checkStore: params.checkStore,
	})
		.filter(
			(record) =>
				record.key?.tree === params.tree &&
				record.key.lockHash === treeKey.lockHash &&
				record.key.linked === treeKey.linked &&
				isGreenRecord(record),
		)
		.sort((first, second) => second.at.localeCompare(first.at))
	for (const record of answers) {
		const recorded = record.steps.find(
			(step) => step.stepHash === stepHash && step.status === 'passed',
		)
		if (recorded) return { record, recorded }
	}
	return undefined
}

function sha256(data: string): string {
	return createHash('sha256').update(data).digest('hex')
}
