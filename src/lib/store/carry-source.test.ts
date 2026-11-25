/**
 * The two checks `lot start --from <lot>` makes of the lot it carries receipts from: the state of the lot the id
 * names (before the brief is checked), then its repository, worktree, ledger and bases.
 */
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../../test/call-outcome.ts'
import {
	CARRY_CANCELED,
	CARRY_NOW,
	CARRY_DECLARATION_TEXT,
	DECLARATION_PATH,
	UNREADABLE_BASE,
	UNREADABLE_DECLARATION_TEXT,
	UNREADABLE_LEDGER_TEXT,
} from '../../../test/carry-workspace.constants.ts'
import { writeCarrySource } from '../../../test/carry-workspace.ts'
import { DAMAGED_NAME } from '../../../test/damaged-lot-workspace.constants.ts'
import { damagedLotIn } from '../../../test/damaged-lot-workspace.ts'
import { createStartWorkspace } from '../../../test/lot-start-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { questionTransitionOf, transitionOf } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { writeAbandonedMarker } from '../handover/handover-abandoned-marker.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { writeLanded } from '../landing/landed-record.ts'
import { CARRY_REFUSALS } from './carry-source.constants.ts'
import { checkCarrySource, checkCarrySourceState } from './carry-source.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CarryLedger } from '../../../test/carry-workspace.types.ts'
import type { StartWorkspace } from '../../../test/lot-start-workspace.types.ts'
import type { CarryRefusals, CarrySource } from './carry-source.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LANDED_TIP = 'e'.repeat(40)

/** The state check of the source lot named by `argument`, from the workspace's repository. */
function stateOf(params: { start: StartWorkspace; argument: string }) {
	return resultOf(() =>
		checkCarrySourceState({ cwd: params.start.repository, argument: params.argument }),
	)
}

/** What `call` answers, or `{ error }` when it throws: a stub's throw is a mismatch of the assertion, not a crash before it. */
function resultOf<Value extends object>(call: () => Value): Value | { error: string } {
	const outcome = outcomeOf(call)
	return 'error' in outcome ? { error: outcome.error } : outcome.value
}

/** `project` of the source a check answers; the answer itself when it is a refusal or an error. */
function sourceProjection<Projection>(params: {
	read: CarrySource | CarryRefusals | { error: string }
	project: (source: CarrySource) => Projection
}): Projection | CarryRefusals | { error: string } {
	const { read } = params
	return 'refusals' in read || 'error' in read ? read : params.project(read)
}

describe('checkCarrySourceState', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('canceled by a canceled transition → the lot and its state', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, later: CARRY_CANCELED })

		expect(stateOf({ start, argument: source.name })).toEqual({
			lot: source.lotFolder,
			state: 'canceled',
		})
	})

	it('canceled by a registry entry abandoned, no canceled transition → the lot and canceled', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, registry: 'abandoned' })

		expect(stateOf({ start, argument: source.name })).toEqual({
			lot: source.lotFolder,
			state: 'canceled',
		})
	})

	it('the index of a canceled lot names it as the full name does', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, later: CARRY_CANCELED })

		expect(stateOf({ start, argument: source.name.slice(0, 4) })).toEqual({
			lot: source.lotFolder,
			state: 'canceled',
		})
	})

	it.each([
		{ state: 'failed', later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })] },
		{ state: 'working', later: [] },
		{ state: 'ready', later: [transitionOf({ seq: 2, state: 'ready' })] },
		{
			state: 'input-required',
			later: [questionTransitionOf({ seq: 2, number: 1 })],
		},
	])('a $state source → refused naming lot stop, nothing else', ({ state, later }) => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, later })

		expect(stateOf({ start, argument: source.name })).toEqual({
			refusals: [
				fillMessage({ template: CARRY_REFUSALS.live, values: { lot: source.name, state } }),
			],
		})
	})

	it('a committed source (registry entry) → refused: its work is on main', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, registry: 'committed' })

		expect(stateOf({ start, argument: source.name })).toEqual({
			refusals: [
				fillMessage({
					template: CARRY_REFUSALS.onMain,
					values: { lot: source.name, state: 'committed' },
				}),
			],
		})
	})

	it('a landed source (landed.json), canceled by its transitions → refused: its work is on main', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, later: CARRY_CANCELED })
		writeLanded({
			lotFolder: source.lotFolder,
			fact: {
				schema: 1,
				how: 'ancestor',
				tip: LANDED_TIP,
				base: 'main',
				at: CARRY_NOW.toISOString(),
			},
		})

		expect(stateOf({ start, argument: source.name })).toEqual({
			refusals: [
				fillMessage({
					template: CARRY_REFUSALS.onMain,
					values: { lot: source.name, state: 'committed' },
				}),
			],
		})
	})

	it('a lot canceled by its abandoned.json marker only → refused as not settled, not told to stop', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start })
		writeAbandonedMarker({ folder: source.lotFolder, now: CARRY_NOW })

		expect(stateOf({ start, argument: source.name })).toEqual({
			refusals: [
				fillMessage({ template: CARRY_REFUSALS.markerOnly, values: { lot: source.name } }),
			],
		})
	})

	it('a simulated canceled lot → refused as simulated', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, simulated: true, later: CARRY_CANCELED })

		expect(stateOf({ start, argument: source.name })).toEqual({
			refusals: [fillMessage({ template: CARRY_REFUSALS.simulated, values: { lot: source.name } })],
		})
	})

	it('a damaged lot → refused as damaged', () => {
		const start = createStartWorkspace()
		damagedLotIn({ start, kind: 'identityMissing' })

		expect(stateOf({ start, argument: DAMAGED_NAME })).toEqual({
			refusals: [fillMessage({ template: CARRY_REFUSALS.damaged, values: { lot: DAMAGED_NAME } })],
		})
	})

	it('an id no store holds → refused as unknown', () => {
		const start = createStartWorkspace()
		writeCarrySource({ start, later: CARRY_CANCELED })

		expect(stateOf({ start, argument: '0042' })).toEqual({
			refusals: [fillMessage({ template: CARRY_REFUSALS.unknown, values: { lot: '0042' } })],
		})
	})

	it('the id resolves in the given repository, never in the process folder', () => {
		const start = createStartWorkspace()
		const source = writeCarrySource({ start, later: CARRY_CANCELED })
		const elsewhere = temporaryFolder('dialecte-elsewhere-')

		expect({
			inRepository: stateOf({ start, argument: source.name }),
			outside: resultOf(() => checkCarrySourceState({ cwd: elsewhere, argument: source.name })),
		}).toEqual({
			inRepository: { lot: source.lotFolder, state: 'canceled' },
			outside: {
				refusals: [fillMessage({ template: CARRY_REFUSALS.unknown, values: { lot: source.name } })],
			},
		})
	})
})

/** A canceled source of the workspace, with the options of `writeCarrySource`. */
function canceledSource(params: {
	start: StartWorkspace
	ledger?: CarryLedger
	declaration?: string
	noWorktree?: boolean
	repository?: string
}) {
	return writeCarrySource({ ...params, later: CARRY_CANCELED })
}

/** The file check of `source` as the start runs it, in `start`'s repository. */
function sourceOf(params: { start: StartWorkspace; lotFolder: string; repository?: string }) {
	return resultOf(() =>
		checkCarrySource({
			source: { lot: params.lotFolder, state: 'canceled' },
			repository: params.repository ?? params.start.repository,
		}),
	)
}

describe('checkCarrySource', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a canceled source with a ledger → the ledger bytes and their sha256, no declaration, its readable base', () => {
		const start = createStartWorkspace()
		const source = canceledSource({ start })
		const read = sourceOf({ start, lotFolder: source.lotFolder })

		expect(
			sourceProjection({
				read,
				project: (found) => ({
					worktree: found.worktree,
					ledger: found.ledger.bytes.toString('utf8'),
					hash: found.ledger.hash,
					declaration: found.declaration,
					bases: found.bases,
					state: found.state,
				}),
			}),
		).toEqual({
			worktree: source.worktree,
			ledger: expect.stringContaining('"version": 3'),
			hash: expect.stringMatching(/^[0-9a-f]{64}$/),
			declaration: undefined,
			bases: [source.base],
			state: 'canceled',
		})
	})

	it('the ledger hash is the sha256 of the bytes it carries', () => {
		const start = createStartWorkspace()
		const source = canceledSource({ start })
		const read = sourceOf({ start, lotFolder: source.lotFolder })

		expect(
			sourceProjection({
				read,
				project: (found) =>
					createHash('sha256').update(found.ledger.bytes).digest('hex') === found.ledger.hash,
			}),
		).toBe(true)
	})

	it("a lot file in the worktree → its bytes and sha256 beside the ledger's", () => {
		const start = createStartWorkspace()
		const source = canceledSource({ start, declaration: CARRY_DECLARATION_TEXT })
		const read = sourceOf({ start, lotFolder: source.lotFolder })

		expect(
			sourceProjection({
				read,
				project: (found) => ({
					text: found.declaration?.bytes.toString('utf8'),
					hash: found.declaration?.hash,
				}),
			}),
		).toEqual({
			text: CARRY_DECLARATION_TEXT,
			hash: createHash('sha256').update(CARRY_DECLARATION_TEXT).digest('hex'),
		})
	})

	it('the ledger names an unreadable base first and a readable one second → only the readable base is kept', () => {
		const start = createStartWorkspace()
		const source = canceledSource({
			start,
			ledger: { bases: [UNREADABLE_BASE, start.workspace.commit] },
		})
		const read = sourceOf({ start, lotFolder: source.lotFolder })

		expect(sourceProjection({ read, project: (found) => found.bases })).toEqual([
			start.workspace.commit,
		])
	})

	it.each([
		{
			row: 'ledger file missing',
			setup: { ledger: 'none' as const },
			refusals: (name: string) => [
				fillMessage({ template: CARRY_REFUSALS.ledgerMissing, values: { lot: name } }),
			],
		},
		{
			row: 'ledger not JSON',
			setup: { ledger: { text: UNREADABLE_LEDGER_TEXT } },
			refusals: (name: string, file: string) => [
				fillMessage({ template: CARRY_REFUSALS.ledgerUnreadable, values: { lot: name, file } }),
			],
		},
		{
			row: 'ledger of version 2',
			setup: { ledger: { version: 2 } },
			refusals: (name: string, file: string) => [
				fillMessage({ template: CARRY_REFUSALS.ledgerVersion, values: { lot: name, file } }),
			],
		},
		{
			row: 'ledger with no production state',
			setup: { ledger: { production: 'none' as const } },
			refusals: (name: string, file: string) => [
				fillMessage({ template: CARRY_REFUSALS.ledgerNoProduction, values: { lot: name, file } }),
			],
		},
		{
			row: 'no base of the ledger readable by git',
			setup: { ledger: { bases: [UNREADABLE_BASE] } },
			refusals: (name: string) => [
				fillMessage({ template: CARRY_REFUSALS.noBase, values: { lot: name } }),
			],
		},
		{
			row: 'lot file present but no JSON',
			setup: { declaration: UNREADABLE_DECLARATION_TEXT },
			refusals: (name: string, _file: string, declaration: string) => [
				fillMessage({
					template: CARRY_REFUSALS.declarationUnreadable,
					values: { lot: name, file: declaration },
				}),
			],
		},
	])('$row → refused with its own line', ({ setup, refusals }) => {
		const start = createStartWorkspace()
		const source = canceledSource({ start, ...setup })

		expect(sourceOf({ start, lotFolder: source.lotFolder })).toEqual({
			refusals: refusals(
				source.name,
				source.ledgerFile ?? '',
				join(source.worktree, DECLARATION_PATH),
			),
		})
	})

	it('the worktree is gone → refused naming it', () => {
		const start = createStartWorkspace()
		const source = canceledSource({ start, noWorktree: true })

		expect(sourceOf({ start, lotFolder: source.lotFolder })).toEqual({
			refusals: [
				fillMessage({
					template: CARRY_REFUSALS.worktreeGone,
					values: { lot: source.name, worktree: source.worktree },
				}),
			],
		})
	})

	it('a lot of another repository → refused naming both repositories', () => {
		const start = createStartWorkspace()
		const other = realpathSync(temporaryFolder('dialecte-other-repository-'))
		const source = canceledSource({ start })

		expect(sourceOf({ start, lotFolder: source.lotFolder, repository: other })).toEqual({
			refusals: [
				fillMessage({
					template: CARRY_REFUSALS.repository,
					values: { lot: source.name, sourceRepository: start.repository, repository: other },
				}),
			],
		})
	})

	it('another repository and a missing ledger together → both lines, in the order of the checks', () => {
		const start = createStartWorkspace()
		const other = realpathSync(temporaryFolder('dialecte-other-repository-'))
		const source = canceledSource({ start, ledger: 'none' })

		expect(sourceOf({ start, lotFolder: source.lotFolder, repository: other })).toEqual({
			refusals: [
				fillMessage({
					template: CARRY_REFUSALS.repository,
					values: { lot: source.name, sourceRepository: start.repository, repository: other },
				}),
				fillMessage({ template: CARRY_REFUSALS.ledgerMissing, values: { lot: source.name } }),
			],
		})
	})

	it('a lot whose lot file and ledger both fail → every refusal at once', () => {
		const start = createStartWorkspace()
		const source = canceledSource({
			start,
			ledger: { version: 2 },
			declaration: UNREADABLE_DECLARATION_TEXT,
		})

		expect(sourceOf({ start, lotFolder: source.lotFolder })).toEqual({
			refusals: [
				fillMessage({
					template: CARRY_REFUSALS.ledgerVersion,
					values: { lot: source.name, file: source.ledgerFile ?? '' },
				}),
				fillMessage({
					template: CARRY_REFUSALS.declarationUnreadable,
					values: { lot: source.name, file: join(source.worktree, DECLARATION_PATH) },
				}),
			],
		})
	})
})
