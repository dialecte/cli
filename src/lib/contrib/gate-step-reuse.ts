/**
 * The package steps of `dialecte contrib` a `gate --full` already passed: its green records of the tree and install
 * the worktree has now, run with the gate's steps of today, and among their steps one of the same name and command.
 */

import { computeCheckKey, gateCommandHash } from '../gate-records/check-key.ts'
import {
	isGreenRecord,
	isSameKey,
	originOfRecord,
	readTreeRecords,
} from '../gate-records/check-store.ts'
import { readGateRecords } from '../gate-records/gate-records.ts'
import { resolveGateSteps } from '../gate/gate-config.ts'

import type {
	CheckKey,
	GateRecord,
	RecordOrigin,
	RecordedStep,
} from '../gate-records/gate-records.types.ts'
import type { GateStep } from '../gate/gate-config.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { FullGateRecords } from './contrib.types.ts'

/**
 * The green `gate --full` records whose key is the one a `gate --full` would have now: the worktree's own first, then
 * the store's of any worktree, newest first in each. A gate that failed answers no step, even one it passed.
 */
export function readFullGateRecords(params: {
	root: string
	packageJson: PackageJson
}): FullGateRecords {
	const { root } = params
	const fullSteps = resolveGateSteps({ packageJson: params.packageJson, mode: 'full' })
	const key = computeCheckKey({ root, commandHash: gateCommandHash({ root, steps: fullSteps }) })
	const own = readGateRecords(root).filter((record) => isCurrentGreenFull({ record, key }))
	const stored = readTreeRecords({ root, tree: key.tree })
		.filter((record) => isCurrentGreenFull({ record, key }))
		.sort((first, second) => second.at.localeCompare(first.at))
	return { fullSteps, records: [...own, ...stored] }
}

/** The step a current `gate --full` record passed for `step` (same name, and today's gate runs it with the same command), and when it ran. */
export function findPassedGateStep(params: {
	gate: FullGateRecords
	step: GateStep
}): { recorded: RecordedStep; origin: RecordOrigin } | undefined {
	const { gate, step } = params
	const sameCommand = gate.fullSteps.some(
		(fullStep) => fullStep.name === step.name && fullStep.run === step.run,
	)
	if (!sameCommand) return undefined
	for (const record of gate.records) {
		const recorded = record.steps.find(
			(candidate) => candidate.name === step.name && candidate.status === 'passed',
		)
		if (recorded) return { recorded, origin: originOfRecord(record) }
	}
	return undefined
}

/** A green `gate --full` record of `key`. */
function isCurrentGreenFull(params: { record: GateRecord; key: CheckKey }): boolean {
	const { record, key } = params
	return record.mode === 'full' && isSameKey({ key, other: record.key }) && isGreenRecord(record)
}
