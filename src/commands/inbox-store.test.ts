/**
 * `dialecte inbox` against hostile and broken stores (33S cases 40 and 42), and against the hand-over registry
 * (G16): text an agent wrote is printed escaped and kept as stored in JSON; a damaged lot among ten is a line of its
 * own and the nine others list; the registry of a store is read once for all its lots, and the one function that
 * names its path agrees with the writer of the entries, the state and the keep rule.
 */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { setEntryState } from '../../test/handover-store-scenario.ts'
import {
	CALLER_QUESTION,
	DAMAGED_LOT,
	ESCAPED_QUESTION,
	ESCAPED_REASON,
	HOSTILE_FAILED_LOT,
	HOSTILE_LOT,
	HOSTILE_REASON,
	SCL_REPOSITORY,
} from '../../test/inbox-workspace.constants.ts'
import {
	failedTransitionFor,
	inboxIn,
	inboxLine,
	listedIndexesOf,
	lotBranchOf,
	questionTransitionFor,
	storePathOf,
} from '../../test/inbox-workspace.ts'
import { HOSTILE_TEXT } from '../../test/lot-questions.constants.ts'
import { snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { readyLot } from '../../test/lot-stop-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { transitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { DISPLAY_ESCAPED_RANGES } from '../lib/print/print.constants.ts'
import { lotsKeepingWorktrees } from '../lib/store/lot-keep.ts'
import { lotStatusOf } from './lot-status.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The characters of `text` that a terminal would act on (or that reorder it): none when it is safe to print. */
function unsafeCharactersIn(text: string): string[] {
	return Array.from(text).filter(function isUnsafe(character) {
		const code = character.codePointAt(0) ?? 0
		return DISPLAY_ESCAPED_RANGES.some(([first, last]) => code >= first && code <= last)
	})
}

/** The exit code, the indexes listed and the damaged lines of a text inbox. */
function textSummaryOf(result: CommandResult): {
	exitCode: number
	indexes: string[]
	damaged: string[]
} {
	return {
		exitCode: result.exitCode,
		indexes: listedIndexesOf(result.output),
		damaged: result.output.split('\n').filter((line) => line.startsWith('damaged ')),
	}
}

/** The exit code, the number of waiting lots and the damaged list (as text) of a JSON inbox. */
function jsonSummaryOf(result: CommandResult): {
	exitCode: number
	waiting: number
	damaged: string
} {
	const parsed = withJson(result)
	const json = parsed.json as { waiting: unknown[]; damaged: unknown }
	return {
		exitCode: parsed.exitCode,
		waiting: json.waiting.length,
		damaged: JSON.stringify(json.damaged),
	}
}

/** The exit code, the number of waiting lots and the hand-over state of each waiting lot that has one, of a JSON inbox. */
function handoversSummaryOf(result: CommandResult): {
	exitCode: number
	waiting: number
	handovers: Record<string, string>
} {
	const parsed = withJson(result)
	const waiting = (
		parsed.json as { waiting: { lot: string; handover: { state: string } | null }[] }
	).waiting
	return {
		exitCode: parsed.exitCode,
		waiting: waiting.length,
		handovers: Object.fromEntries(
			waiting.flatMap((status) => (status.handover ? [[status.lot, status.handover.state]] : [])),
		),
	}
}

/** A workspace with the hostile caller lot and the hostile failed lot; the workspace. */
function hostileWorkspace(): BriefWorkspace {
	const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
	const base = { workspace, scope: ['src/'], repository: workspace.repository }
	writeStoreLot({
		...base,
		name: HOSTILE_LOT,
		branch: lotBranchOf(HOSTILE_LOT),
		later: [
			questionTransitionFor({
				seq: 2,
				question: { ...CALLER_QUESTION, text: HOSTILE_TEXT },
			}),
		],
	})
	writeStoreLot({
		...base,
		name: HOSTILE_FAILED_LOT,
		branch: lotBranchOf(HOSTILE_FAILED_LOT),
		later: [failedTransitionFor({ seq: 2, reason: HOSTILE_REASON })],
	})
	return workspace
}

/** A workspace of nine ready lots (`0101` to `0109`) and a tenth folder, `0110`, whose identity.json is cut short. */
function workspaceWithDamagedLot(): BriefWorkspace {
	const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
	for (let number = 1; number <= 9; number++) {
		const name = `010${number}-scl-lot-${number}`
		writeStoreLot({
			workspace,
			name,
			scope: ['src/'],
			branch: lotBranchOf(name),
			repository: workspace.repository,
			later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })],
		})
	}
	const folder = join(workspace.store, DAMAGED_LOT)
	writeRecordFile({
		folder,
		name: 'identity.json',
		text: '{\n  "schema": 1,\n  "name": "0110-scl-da',
	})
	writeRecordFile({
		folder,
		name: 'transitions/000001.json',
		text: `${JSON.stringify(transitionOf({ seq: 1 }))}\n`,
	})
	writeStoreListFile({ stores: [storePathOf(workspace)] })
	return workspace
}

describe('inbox: text an agent wrote (case 40)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a question text with an escape sequence and a right-to-left override, a reason with a line break -> printed escaped on one line each', () => {
		const workspace = hostileWorkspace()

		expect(inboxIn({ cwd: workspace.repository }).output.split('\n')).toEqual([
			expect.stringMatching(
				inboxLine([
					'0171',
					SCL_REPOSITORY,
					lotBranchOf(HOSTILE_LOT),
					'question q1 (caller)',
					ESCAPED_QUESTION,
					`dialecte lot answer ${HOSTILE_LOT} q1 "<answer>"`,
				]),
			),
			expect.stringMatching(
				inboxLine([
					'0175',
					SCL_REPOSITORY,
					lotBranchOf(HOSTILE_FAILED_LOT),
					'FAILED',
					ESCAPED_REASON,
					`dialecte lot stop ${HOSTILE_FAILED_LOT} --reason <text>`,
				]),
			),
			'working 0 · simulated 0 (listed with --simulated)',
		])
	})

	it('the same lots -> no character a terminal acts on is left in the text output', () => {
		const workspace = hostileWorkspace()

		expect(
			unsafeCharactersIn(inboxIn({ cwd: workspace.repository }).output.replaceAll('\n', '')),
		).toEqual([])
	})

	it('the same lots with --json -> the question text is the text as stored, the status JSON of the lot', () => {
		const workspace = hostileWorkspace()

		expect(withJson(inboxIn({ cwd: workspace.repository, words: ['--json'] }))).toMatchObject({
			exitCode: 0,
			json: {
				waiting: [
					{ lot: HOSTILE_LOT, questions: [{ id: 'q1', text: HOSTILE_TEXT }] },
					{ lot: HOSTILE_FAILED_LOT, state: 'failed' },
				],
			},
		})
	})
})

describe('inbox: a damaged lot among ten (case 42)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('nine ready lots and one whose identity.json is truncated -> the nine listed, one damaged line naming the folder and a reason, exit 0', () => {
		const workspace = workspaceWithDamagedLot()

		expect(textSummaryOf(inboxIn({ cwd: workspace.repository }))).toEqual({
			exitCode: 0,
			indexes: ['0101', '0102', '0103', '0104', '0105', '0106', '0107', '0108', '0109'],
			damaged: [expect.stringMatching(new RegExp(`^damaged \\S*${DAMAGED_LOT}: \\S.*$`))],
		})
	})

	it('the same store with --json -> nine waiting, one damaged entry naming the folder', () => {
		const workspace = workspaceWithDamagedLot()

		expect(jsonSummaryOf(inboxIn({ cwd: workspace.repository, words: ['--json'] }))).toEqual({
			exitCode: 0,
			waiting: 9,
			damaged: expect.stringContaining(DAMAGED_LOT),
		})
	})

	it('a damaged lot and nothing else that waits -> exit 0: the damaged lot is something to show', () => {
		const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		writeStoreLot({
			workspace,
			name: '0101-scl-busy',
			scope: ['src/'],
			repository: workspace.repository,
		})
		writeRecordFile({
			folder: join(workspace.store, DAMAGED_LOT),
			name: 'identity.json',
			text: '{ "schema": 1, ',
		})

		expect(inboxIn({ cwd: workspace.repository })).toEqual({
			exitCode: 0,
			output: expect.stringMatching(new RegExp(`damaged \\S*${DAMAGED_LOT}: \\S`)),
		})
	})

	it('a folder being built (.<name>.tmp-<pid>) and a file in the store -> neither is a damaged lot', () => {
		const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		writeStoreLot({
			workspace,
			name: '0101-scl-busy',
			scope: ['src/'],
			repository: workspace.repository,
		})
		writeRecordFile({
			folder: join(workspace.store, '.0120-scl-building.tmp-4242'),
			name: 'brief.json',
			text: '{}',
		})
		writeRecordFile({ folder: workspace.store, name: 'notes.txt', text: 'not a lot' })

		expect(inboxIn({ cwd: workspace.repository })).toEqual({
			exitCode: 1,
			output: 'working 1 · simulated 0 (listed with --simulated)',
		})
	})

	it('a damaged lot -> the folder is left as the hand had written it', () => {
		const workspace = workspaceWithDamagedLot()
		const before = snapshotOf(join(workspace.store, DAMAGED_LOT))

		expect(inboxIn({ cwd: workspace.repository }).exitCode).toBe(0)
		expect(snapshotOf(join(workspace.store, DAMAGED_LOT))).toEqual(before)
	})
})

describe('inbox: the hand-over registry (G16)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('ten lots in one store, one with a registry entry -> the registry is read once, and its entry still gives the READY state its hand-over', () => {
		const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		for (let number = 1; number <= 10; number++) {
			const name = `01${String(number).padStart(2, '0')}-scl-lot-${number}`
			writeStoreLot({
				workspace,
				name,
				scope: ['src/'],
				branch: lotBranchOf(name),
				repository: workspace.repository,
				later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })],
				registry: number === 3 ? 'pending' : undefined,
			})
		}
		writeStoreListFile({ stores: [storePathOf(workspace)] })
		const reads: string[] = []

		expect({
			summary: handoversSummaryOf(
				inboxIn({
					cwd: workspace.repository,
					words: ['--json'],
					seams: { onRegistryRead: (registry) => reads.push(registry) },
				}),
			),
			registries: reads.map((registry) => realpathSync(registry)),
		}).toEqual({
			summary: { exitCode: 0, waiting: 10, handovers: { '0103-scl-lot-3': 'pending' } },
			registries: [realpathSync(workspace.registry)],
		})
	})

	it('the entry of the one registered lot -> its status in the waiting list carries the hand-over and its show line', () => {
		const workspace = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		const name = '0103-scl-lot-3'
		writeStoreLot({
			workspace,
			name,
			scope: ['src/'],
			branch: lotBranchOf(name),
			repository: workspace.repository,
			later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })],
			registry: 'pending',
		})
		writeStoreListFile({ stores: [storePathOf(workspace)] })

		expect(withJson(inboxIn({ cwd: workspace.repository, words: ['--json'] }))).toMatchObject({
			exitCode: 0,
			json: {
				waiting: [
					{
						lot: name,
						state: 'ready',
						handover: { name, state: 'pending' },
						next: `dialecte handover show ${name}`,
					},
				],
			},
		})
	})

	it('two stores -> each store registry is read once', () => {
		const first = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
		const second = createBriefWorkspace({ repositoryFolder: 'core' })
		for (const [workspace, names] of [
			[first, ['0101-scl-a', '0102-scl-b']],
			[second, ['0103-core-c', '0104-core-d']],
		] as const)
			for (const name of names)
				writeStoreLot({
					workspace,
					name,
					scope: ['src/'],
					branch: lotBranchOf(name),
					repository: workspace.repository,
					later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })],
					registry: 'pending',
				})
		writeStoreListFile({ stores: [storePathOf(first), storePathOf(second)] })
		const reads: string[] = []

		expect({
			exitCode: inboxIn({
				cwd: first.repository,
				seams: { onRegistryRead: (registry) => reads.push(registry) },
			}).exitCode,
			registries: reads.map((registry) => realpathSync(registry)).sort(),
		}).toEqual({
			exitCode: 0,
			registries: [realpathSync(first.registry), realpathSync(second.registry)].sort(),
		})
	})

	it('a hand-over written by handover write -> status says ready, the keep rule keeps the worktree as ready, the inbox lists it once as READY with the show line', () => {
		const { lot, name } = readyLot()
		const lotFolder = lot.lotFolder

		expect({
			status: lotStatusOf({ lotFolder })?.state,
			kept: Object.fromEntries(lotsKeepingWorktrees({ repository: lot.start.repository })),
			inbox: withJson(inboxIn({ cwd: lot.start.repository, words: ['--json'] })),
		}).toMatchObject({
			status: 'ready',
			kept: { [lot.worktree]: `lot ${lot.lotName} ready` },
			inbox: {
				exitCode: 0,
				json: {
					waiting: [
						{
							lot: lot.lotName,
							state: 'ready',
							handover: { name, state: 'pending' },
							next: `dialecte handover show ${name}`,
						},
					],
					damaged: [],
				},
			},
		})
	})

	it('the same hand-over once its entry says committed -> status committed, nothing kept, nothing for the inbox to show', () => {
		const { lot, name } = readyLot()
		setEntryState({ root: lot.start.repository, name, state: 'committed' })

		expect(Object.fromEntries(lotsKeepingWorktrees({ repository: lot.start.repository }))).toEqual(
			{},
		)
		expect({
			status: lotStatusOf({ lotFolder: lot.lotFolder })?.state,
			inbox: withJson(inboxIn({ cwd: lot.start.repository, words: ['--json'] })),
		}).toMatchObject({
			status: 'committed',
			inbox: { exitCode: 1, json: { waiting: [], working: 0 } },
		})
	})
})
