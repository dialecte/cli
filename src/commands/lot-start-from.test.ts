/**
 * `lot start <brief> --from <lot>`: a lot rebuilt from a canceled one keeps the source's receipts. The start checks
 * the source with every other refusal before anything is published, and copies its ledger (and lot file) into the
 * new lot's folder; a start without `--from` writes nothing of it.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith, writeBriefFile } from '../../test/brief-workspace.ts'
import {
	CARRY_CANCELED,
	CARRY_DECLARATION_TEXT,
	DECLARATION_PATH,
	CARRY_NOW,
	CARRY_REBUILT_BRANCH,
	CARRY_REBUILT_FEATURE,
	UNREADABLE_BASE,
	UNREADABLE_DECLARATION_TEXT,
} from '../../test/carry-workspace.constants.ts'
import { writeCarrySource } from '../../test/carry-workspace.ts'
import {
	createStartWorkspace,
	entriesOf,
	recordOf,
	snapshotOf,
	withJson,
} from '../../test/lot-start-workspace.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writeAbandonedMarker } from '../lib/handover/handover-abandoned-marker.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import {
	CARRY_DRY_RUN_LINE,
	CARRY_REFUSALS,
	CARRY_SIMULATE_USAGE,
	CARRY_START_LINE,
	CARRY_STOP_COMMAND,
} from '../lib/store/carry-source.constants.ts'
import {
	CARRY_DECLARATION_COPY_NAME,
	CARRY_LEDGER_COPY_NAME,
} from '../lib/store/carry-source.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { startLot } from './lot-start.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CarryLedger, CarrySourceLot } from '../../test/carry-workspace.types.ts'
import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'
import type { Transition } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The red receipts of the default ledger: three, for two cases (a re-red, and a refused receipt that is no red). */
const RECEIPTS = 3

/** A workspace whose brief rebuilds the source's scope on a fresh branch, and the source lot in its store. */
function rebuiltWorkspace(
	params: {
		heldWork?: boolean
		later?: Transition[]
		registry?: 'committed'
		ledger?: CarryLedger
		declaration?: string
	} = {},
): { start: StartWorkspace; source: CarrySourceLot } {
	const start = createStartWorkspace({
		brief: briefWith({
			branch: CARRY_REBUILT_BRANCH,
			feature: CARRY_REBUILT_FEATURE,
		}),
	})
	const source = writeCarrySource({
		start,
		...params,
		later: params.later ?? CARRY_CANCELED,
	})
	return { start, source }
}

/** `lot start <brief> --from <source>` with the extra words; the exit code and the text. */
function startFrom(params: {
	start: StartWorkspace
	from: string
	extra?: string[]
	cwd?: string
}) {
	return runLot({
		cwd: params.cwd ?? params.start.cwd,
		argv: [
			'start',
			params.start.workspace.briefPath,
			'--from',
			params.from,
			...(params.extra ?? []),
		],
		now: CARRY_NOW,
	})
}

/** The lot folder the start made: the store's entry that is not the source. */
function newLotOf(params: { start: StartWorkspace; source: CarrySourceLot }): string {
	const [name] = entriesOf(params.start.store).filter((entry) => entry !== params.source.name)
	return join(params.start.store, name ?? 'no-started-lot')
}

/** The carry record of a started lot folder; undefined when there is none (a start refused, or without `--from`). */
function carryOf(folder: string): { from?: string } | undefined {
	return existsSync(join(folder, STORE_FILES.carry))
		? (recordOf({ folder, name: STORE_FILES.carry }) as { from?: string })
		: undefined
}

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

describe('lot start --from', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a canceled source of the same scope → carry.json records it, the ledger copy holds its bytes', () => {
		const { start, source } = rebuiltWorkspace()

		const started = startFrom({ start, from: source.name })

		expect(started.exitCode).toBe(0)
		const folder = newLotOf({ start, source })
		const ledgerText = readFileSync(source.ledgerFile ?? '', 'utf8')
		expect({
			carry: recordOf({ folder, name: STORE_FILES.carry }),
			ledger: readFileSync(join(folder, STORE_FILES.carryCopies, CARRY_LEDGER_COPY_NAME), 'utf8'),
			declaration: existsSync(join(folder, STORE_FILES.carryCopies, CARRY_DECLARATION_COPY_NAME)),
		}).toEqual({
			carry: {
				schema: 1,
				from: source.name,
				state: 'canceled',
				at: CARRY_NOW.toISOString(),
				ledger: sha256(ledgerText),
				receipts: RECEIPTS,
			},
			ledger: ledgerText,
			declaration: false,
		})
	})

	it("a source with a lot file → its copy beside the ledger's and its hash in carry.json", () => {
		const { start, source } = rebuiltWorkspace({
			declaration: CARRY_DECLARATION_TEXT,
		})

		const started = startFrom({ start, from: source.name })

		expect(started.exitCode).toBe(0)
		const folder = newLotOf({ start, source })
		expect({
			copy: readFileSync(
				join(folder, STORE_FILES.carryCopies, CARRY_DECLARATION_COPY_NAME),
				'utf8',
			),
			hash: (recordOf({ folder, name: STORE_FILES.carry }) as { declaration?: string }).declaration,
		}).toEqual({
			copy: CARRY_DECLARATION_TEXT,
			hash: sha256(CARRY_DECLARATION_TEXT),
		})
	})

	it('the start line names the source, its state and the receipts kept', () => {
		const { start, source } = rebuiltWorkspace()

		const started = startFrom({ start, from: source.name })

		expect(started.output).toContain(
			fillMessage({
				template: CARRY_START_LINE,
				values: {
					lot: source.name,
					state: 'canceled',
					receipts: String(RECEIPTS),
				},
			}),
		)
	})

	it('the index of the source names it as the full name does', () => {
		const { start, source } = rebuiltWorkspace()

		const started = startFrom({ start, from: source.name.slice(0, 4) })

		expect({
			exitCode: started.exitCode,
			from: carryOf(newLotOf({ start, source }))?.from,
		}).toEqual({ exitCode: 0, from: source.name })
	})

	it("--from resolves in the brief's repository, from a folder outside it", () => {
		const { start, source } = rebuiltWorkspace()

		const started = startFrom({
			start,
			from: source.name.slice(0, 4),
			cwd: temporaryFolder('dialecte-outside-'),
		})

		expect({
			exitCode: started.exitCode,
			from: existsSync(join(newLotOf({ start, source }), STORE_FILES.carry)),
		}).toEqual({ exitCode: 0, from: true })
	})

	it('a start with --from and a start without it → each lot holds its own carry: only the first has one', () => {
		const { start, source } = rebuiltWorkspace()
		const first = startFrom({ start, from: source.name })
		writeBriefFile({
			workspace: start.workspace,
			brief: briefWith({
				branch: 'feat/second',
				feature: 'second',
				scope: ['src/index.ts'],
				lots: [{ paths: ['src/index.ts'], message: 'feat: second' }],
			}),
		})

		const second = runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath],
			now: CARRY_NOW,
		})

		const [carried, plain] = entriesOf(start.store)
			.filter((entry) => entry !== source.name)
			.map((entry) => join(start.store, entry))
		expect({
			exits: [first.exitCode, second.exitCode],
			carried: carryOf(carried ?? '')?.from,
			plain: entriesOf(plain ?? '').filter((name) => name.startsWith('carry')),
		}).toEqual({ exits: [0, 0], carried: source.name, plain: [] })
	})

	it('--json adds carry { from, state, receipts }', () => {
		const { start, source } = rebuiltWorkspace()

		const started = withJson(startFrom({ start, from: source.name, extra: ['--json'] }))

		expect({
			exitCode: started.exitCode,
			carry: (started.json as { carry?: unknown }).carry,
		}).toEqual({
			exitCode: 0,
			carry: { from: source.name, state: 'canceled', receipts: RECEIPTS },
		})
	})

	it('--dry-run names the source and what it would carry, and writes nothing', () => {
		const { start, source } = rebuiltWorkspace()
		const before = {
			store: snapshotOf(start.store),
			worktrees: entriesOf(start.worktreesFolder),
			branches: git({ root: start.repository, args: ['branch', '--list'] }),
		}

		const dry = startFrom({ start, from: source.name, extra: ['--dry-run'] })

		expect({
			exitCode: dry.exitCode,
			store: snapshotOf(start.store),
			worktrees: entriesOf(start.worktreesFolder),
			branches: git({ root: start.repository, args: ['branch', '--list'] }),
		}).toEqual({ exitCode: 0, ...before })
		expect(dry.output).toContain(
			fillMessage({
				template: CARRY_DRY_RUN_LINE,
				values: {
					lot: source.name,
					state: 'canceled',
					receipts: String(RECEIPTS),
				},
			}),
		)
	})

	it('--from with --simulate → a usage error, nothing written', () => {
		const { start, source } = rebuiltWorkspace()

		const started = startFrom({
			start,
			from: source.name,
			extra: ['--simulate', 'ready'],
		})

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).toContain(CARRY_SIMULATE_USAGE)
	})

	it('a failed source with the same scope as the brief → refused naming lot stop, never an overlap', () => {
		const { start, source } = rebuiltWorkspace({
			later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })],
			heldWork: true,
		})

		// control: without --from the same start meets the held source as an overlap, so the live line below
		// proves the state check runs before the overlap check
		const control = runLot({
			cwd: start.cwd,
			argv: ['start', start.workspace.briefPath],
			now: CARRY_NOW,
		})
		expect(control.exitCode).toBe(2)
		expect(control.output).toContain(`overlap with ${source.name}`)

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.live,
				values: { lot: source.name, state: 'failed' },
			}),
		)
		expect(started.output).toContain(CARRY_STOP_COMMAND)
		expect(started.output).not.toContain('overlap')
	})

	it('a refused brief (its branch exists) → nothing is published: no lot, no temporary folder, no worktree', () => {
		const { start, source } = rebuiltWorkspace()
		git({ root: start.repository, args: ['branch', CARRY_REBUILT_BRANCH, start.workspace.commit] })
		const worktrees = entriesOf(start.worktreesFolder)

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
			worktrees: entriesOf(start.worktreesFolder),
		}).toEqual({ exitCode: 2, lots: [source.name], worktrees })
		expect(started.output).toContain('branch-exists')
	})

	it('the copies are written before the publish: a lot failed at its worktree already holds carry.json and both copies', () => {
		const { start, source } = rebuiltWorkspace({ declaration: CARRY_DECLARATION_TEXT })

		const started = startLot({
			cwd: start.cwd,
			argv: [start.workspace.briefPath, '--from', source.name],
			now: CARRY_NOW,
			seams: {
				addWorktree: function refuse() {
					return 'a worktree folder is there already'
				},
			},
		})

		const folder = newLotOf({ start, source })
		expect({
			exitCode: started.exitCode,
			carry: existsSync(join(folder, STORE_FILES.carry)),
			ledger: existsSync(join(folder, STORE_FILES.carryCopies, CARRY_LEDGER_COPY_NAME)),
			declaration: existsSync(join(folder, STORE_FILES.carryCopies, CARRY_DECLARATION_COPY_NAME)),
		}).toEqual({ exitCode: 1, carry: true, ledger: true, declaration: true })
	})

	it('a working source with the same scope → refused naming lot stop, never an overlap', () => {
		const { start, source } = rebuiltWorkspace({ later: [], heldWork: true })

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).not.toContain('overlap')
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.live,
				values: { lot: source.name, state: 'working' },
			}),
		)
	})

	it('a source canceled by its marker only → refused, nothing written', () => {
		const { start, source } = rebuiltWorkspace({ later: [] })
		writeAbandonedMarker({ folder: source.lotFolder, now: CARRY_NOW })

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.markerOnly,
				values: { lot: source.name },
			}),
		)
	})

	it('a committed source → refused: its work is on main, nothing written', () => {
		const { start, source } = rebuiltWorkspace({
			later: [],
			registry: 'committed',
		})

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.onMain,
				values: { lot: source.name, state: 'committed' },
			}),
		)
	})

	it('an id no store holds → refused as unknown, nothing written', () => {
		const { start, source } = rebuiltWorkspace()

		const started = startFrom({ start, from: '0042' })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.unknown,
				values: { lot: '0042' },
			}),
		)
	})

	it.each([
		{
			row: 'ledger missing',
			setup: { ledger: 'none' as const },
			template: CARRY_REFUSALS.ledgerMissing,
		},
		{
			row: 'none of the ledger bases readable',
			setup: { ledger: { bases: [UNREADABLE_BASE] } },
			template: CARRY_REFUSALS.noBase,
		},
	])('$row → refused, no lot folder, no worktree', ({ setup, template }) => {
		const { start, source } = rebuiltWorkspace(setup)
		const worktrees = entriesOf(start.worktreesFolder)

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
			worktrees: entriesOf(start.worktreesFolder),
		}).toEqual({ exitCode: 2, lots: [source.name], worktrees })
		expect(started.output).toContain(fillMessage({ template, values: { lot: source.name } }))
	})

	it('an unreadable lot file in the source → refused, nothing written', () => {
		const { start, source } = rebuiltWorkspace({
			declaration: UNREADABLE_DECLARATION_TEXT,
		})

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.declarationUnreadable,
				values: { lot: source.name, file: join(source.worktree, DECLARATION_PATH) },
			}),
		)
	})

	it('several carry refusals → printed together, nothing written', () => {
		const { start, source } = rebuiltWorkspace({
			ledger: { version: 2 },
			declaration: UNREADABLE_DECLARATION_TEXT,
		})

		const started = startFrom({ start, from: source.name })

		expect({
			exitCode: started.exitCode,
			lots: entriesOf(start.store),
		}).toEqual({
			exitCode: 2,
			lots: [source.name],
		})
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.ledgerVersion,
				values: { lot: source.name, file: source.ledgerFile ?? '' },
			}),
		)
		expect(started.output).toContain(
			fillMessage({
				template: CARRY_REFUSALS.declarationUnreadable,
				values: {
					lot: source.name,
					file: join(source.worktree, DECLARATION_PATH),
				},
			}),
		)
	})
})
