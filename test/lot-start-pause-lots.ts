/** Lots on the default brief's scope in each of the states the overlap check's one re-read tells apart. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { HANDOVER_RUN_MARKER_FILE } from '../src/lib/handover/handover.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { markAbandoned } from './handover-store-scenario.ts'
import { ENDED_LOT, MARKER_LOT } from './lot-start-simulate-cases.constants.ts'
import { transitionOf } from './store-records.ts'

import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** A lot on the brief's scope that is open (no marker). */
export function plainOpenLot(start: StartWorkspace): string {
	return writeStoreLot({
		workspace: start.workspace,
		name: ENDED_LOT,
		scope: ['src/dataflow/'],
		branch: 'feat/ended',
	})
}

/** A lot on the brief's scope canceled by a transition alone. */
export function transitionCanceledLot(start: StartWorkspace): string {
	return writeStoreLot({
		workspace: start.workspace,
		name: ENDED_LOT,
		scope: ['src/dataflow/'],
		branch: 'feat/ended',
		later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })],
	})
}

/** A lot on the brief's scope whose registry entry is abandoned. */
export function registryAbandonedLot(start: StartWorkspace): string {
	return writeStoreLot({
		workspace: start.workspace,
		name: ENDED_LOT,
		scope: ['src/dataflow/'],
		branch: 'feat/ended',
		registry: 'abandoned',
	})
}

/** A lot whose `abandoned.json` stands beside the run marker of a live process (a run takes the abandon back). */
export function markerBesideLiveRunLot(start: StartWorkspace): string {
	const folder = markerOnlyLot(start)
	writeFileSync(
		join(folder, HANDOVER_RUN_MARKER_FILE),
		`${JSON.stringify({ pid: process.pid, startedAt: '2026-11-08T10:00:00.000Z' })}\n`,
	)
	return folder
}

/** An open real lot on the brief's scope that `abandoned.json` alone marks canceled; its folder. */
export function markerOnlyLot(start: StartWorkspace): string {
	const folder = writeStoreLot({
		workspace: start.workspace,
		name: MARKER_LOT,
		scope: ['src/dataflow/'],
		branch: 'feat/ended',
	})
	markAbandoned({ folder, file: 'abandoned.json' })
	return folder
}
