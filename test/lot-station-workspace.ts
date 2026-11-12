/** A scratch store with one lot, and the calls of `lot station` the station tests make against it. */
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { readEvents } from '../src/lib/events/read-events.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { LINKED_WORKTREES_FOLDER, STATION_LOT } from './lot-station-workspace.constants.ts'
import { entryOf, transitionOf, writeRecordFile } from './store-records.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { StationAnswer, StationLot, StationRecording } from './lot-station-workspace.types.ts'

/**
 * A workspace whose store holds the lot `name`, in the state asked for (`working` unless said); its identity names
 * the workspace's repository. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function createStationLot(
	params: {
		name?: string
		state?: 'working' | 'committed' | 'canceled' | 'failed'
		simulated?: boolean
		/** The identity's feature; the records' fixed one when left out. */
		feature?: string
		/** The identity names the worktree through a link to the folder that holds it: not the real spelling. */
		symlinkedWorktree?: boolean
	} = {},
): StationLot {
	const name = params.name ?? STATION_LOT
	const state = params.state ?? 'working'
	const workspace = createBriefWorkspace()
	// the worktree is named by its real path, as `worktree add` names it (the step events name the same)
	const realTop = realpathSync(workspace.workspace)
	const worktree = params.symlinkedWorktree
		? join(linkedFolderOf({ realTop }), name)
		: join(realTop, '.worktrees', name)
	const lotFolder = writeStoreLot({
		workspace,
		name,
		scope: ['src/'],
		branch: `feat/${name.split('-').slice(2).join('-')}`,
		simulated: params.simulated,
		feature: params.feature,
		worktree,
		repository: workspace.repository,
		...(state === 'committed' && { registry: 'committed' as const }),
		...((state === 'canceled' || state === 'failed') && {
			later: [transitionOf({ seq: 2, state })],
		}),
	})
	return {
		workspace,
		name,
		lotFolder,
		cwd: workspace.repository,
		eventsFile: join(lotFolder, STORE_FILES.events),
		worktree,
	}
}

/** A link beside `.worktrees` that leads to it: the worktrees reached through it have another spelling. */
function linkedFolderOf(params: { realTop: string }): string {
	const target = join(params.realTop, '.worktrees')
	const link = join(params.realTop, LINKED_WORKTREES_FOLDER)
	mkdirSync(target, { recursive: true })
	symlinkSync(target, link)
	return link
}

/** The lot, working so far, is committed now: its registry entry says so (what the hand-over run writes last). */
export function commitStationLot(lot: StationLot): void {
	writeRecordFile({
		folder: lot.workspace.registry,
		name: `${lot.name}.json`,
		text: JSON.stringify(entryOf({ state: 'committed', folder: lot.lotFolder })),
	})
}

/** `lot station <lot's full name> <words>` from the lot's repository. */
export function station(lot: StationLot, words: string[]): CommandResult {
	return runLot({ cwd: lot.cwd, argv: ['station', lot.name, ...words] })
}

/** The events the lot's file holds, read by the library. */
export function eventsOf(lot: StationLot): LotEvent[] {
	return readEvents({ file: lot.eventsFile }).events
}

/**
 * Runs the calls in order (each is given the answers so far, to name a run an earlier call made), then reads the
 * lot's events: what a case compares.
 */
export function recordedAfter(
	lot: StationLot,
	calls: ReadonlyArray<(previous: StationAnswer[]) => CommandResult>,
): StationRecording {
	const answers: StationAnswer[] = []
	for (const call of calls) answers.push(answerOf(call(answers)))
	return { answers, events: eventsOf(lot) }
}

function answerOf(result: CommandResult): StationAnswer {
	let json: any
	try {
		json = JSON.parse(result.output)
	} catch {
		json = undefined
	}
	return { exitCode: result.exitCode, output: result.output, json }
}
