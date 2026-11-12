/**
 * The package steps of `dialecte contrib` a gate already passed: the green `gate --full` records of the tree and
 * install the worktree has now, run with the gate's steps of today at the gate base (the base branch's merge-base
 * when a gate list holds a scoped step), then the green `gate --release` records of a release list that covers
 * full; among their steps one of the same name and command. A scoped full step never answers (it checked only what
 * changed since its base); a release step does (it ran on everything).
 */

import { computeCheckKey } from '../gate-records/check-key.ts'
import {
	isGreenRecord,
	isSameKey,
	originOfRecord,
	readTreeRecords,
} from '../gate-records/check-store.ts'
import { RELEASE_RECORD_MODE } from '../gate-records/gate-records.constants.ts'
import { readGateRecords, readReleaseRecord } from '../gate-records/gate-records.ts'
import { readModeCommandHashes } from '../gate-records/mode-command-hashes.ts'
import { resolveConfiguredBase } from '../gate/gate-base.ts'
import { resolveGateSteps } from '../gate/gate-config.ts'

import type {
	CheckKey,
	GateRecord,
	GateRecordMode,
	RecordOrigin,
	RecordedStep,
} from '../gate-records/gate-records.types.ts'
import type { GateStep } from '../gate/gate-config.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { AnsweringGateRecords, FullGateRecords } from './contrib.types.ts'

/**
 * The green gate records whose key is the one a gate would have now: `gate --full`'s, then `gate --release`'s when its
 * list covers full; in each the worktree's own first, then the store's of any worktree, newest first. A gate that
 * failed answers no step, even one it passed.
 */
export function readFullGateRecords(params: {
	root: string
	packageJson: PackageJson
}): FullGateRecords {
	const { root, packageJson } = params
	const base = resolveConfiguredBase({ root, packageJson })
	// a refused gate base (a set dialecte.baseBranch naming no branch): no record answers, the steps run
	if (base !== undefined && 'refusal' in base) return { sources: [] }
	const hashes = readModeCommandHashes({ root, packageJson, gateBase: base?.commit })
	// one key of the worktree now; the release lookup swaps in its command hash
	const key = computeCheckKey({ root, commandHash: hashes.full })
	const full: AnsweringGateRecords = {
		steps: resolveGateSteps({ packageJson, mode: 'full' }),
		records: readCurrentGreenRecords({
			root,
			mode: 'full',
			key,
			own: readGateRecords(root),
		}),
		scopedAnswers: false,
	}
	if (!hashes.releaseCoversFull) return { sources: [full] }
	const ownRelease = readReleaseRecord(root)
	const release: AnsweringGateRecords = {
		steps: resolveGateSteps({ packageJson, mode: 'release' }),
		records: readCurrentGreenRecords({
			root,
			mode: RELEASE_RECORD_MODE,
			key: { ...key, commandHash: hashes.release },
			own: ownRelease ? [ownRelease] : [],
		}),
		scopedAnswers: true,
	}
	return { sources: [full, release] }
}

/**
 * The step a current gate record passed for `step` (same name, and today's list runs it with the same command, not
 * scoped unless the list's scoped steps answer), and when it ran: `gate --full`'s records first.
 */
export function findPassedGateStep(params: {
	gate: FullGateRecords
	step: GateStep
}): { recorded: RecordedStep; origin: RecordOrigin } | undefined {
	const { step } = params
	for (const source of params.gate.sources) {
		const sameCommand = source.steps.some(
			(listed) =>
				listed.name === step.name &&
				listed.run === step.run &&
				(source.scopedAnswers || listed.scoped !== true),
		)
		if (!sameCommand) continue
		for (const record of source.records) {
			const recorded = record.steps.find(
				(candidate) => candidate.name === step.name && candidate.status === 'passed',
			)
			if (recorded) return { recorded, origin: originOfRecord(record) }
		}
	}
	return undefined
}

/** The green records of `mode` and `key`: the worktree's own (`own`) first, then the store's, newest first. */
function readCurrentGreenRecords(params: {
	root: string
	mode: GateRecordMode
	key: CheckKey
	own: readonly GateRecord[]
}): GateRecord[] {
	const { mode, key } = params
	function isCurrentGreen(record: GateRecord): boolean {
		return record.mode === mode && isSameKey({ key, other: record.key }) && isGreenRecord(record)
	}
	const stored = readTreeRecords({ root: params.root, tree: key.tree })
		.filter(isCurrentGreen)
		.sort((first, second) => second.at.localeCompare(first.at))
	return [...params.own.filter(isCurrentGreen), ...stored]
}
