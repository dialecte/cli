/**
 * `dialecte lot scope <id> [--drop <path>]... [--add <path>]... --by <who> --reason <text>` (FIX-lot-scope D3-D6): a
 * change appends one line to the lot folder's `scope-changes.jsonl` and a `scope.changed` event; every refusal exits 2
 * and writes nothing. The lot is a real started lot: brief scope `src/dataflow/`, `src/dataflow/**\/*.test.ts`, its
 * worktree changing `src/dataflow/subscribe.ts`.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { setEntryState } from '../../test/handover-store-scenario.ts'
import {
	startRealLot,
	writeLotHandover,
	writeTransition,
} from '../../test/lot-handover-workspace.ts'
import { createStartWorkspace, snapshotOf } from '../../test/lot-start-workspace.ts'
import { commitReadyLotByHand } from '../../test/lot-stop-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { rewriteRecord } from '../../test/station-records-workspace.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readLotScope } from '../lib/store/lot-records.ts'
import { runLotScope } from './lot-scope.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-14T10:00:00.000Z')
const SCOPE_CHANGES_FILE = 'scope-changes.jsonl'
const USAGE =
	'lot scope: expected <id> [--drop <path>]... [--add <path>]... --by <who> --reason <text>'
/** Who and why, which every drop gives (FIX-scope-narrow D4). */
const DROP_WHO = ['--by', 'person-a', '--reason', 'hand back']

/** Another open lot of the store, whose scope is `docs/`. */
const OTHER_LOT = '0009-repo-docs'
/** The real lot's effective scope before any change, as printed (normalised entries). */
const BRIEF_SCOPE = 'src/dataflow, src/dataflow/**/*.test.ts'

/** `lot scope <lot> <extra...>` from the lot's main checkout. */
function scopeOf(params: { lot: LotHandoverWorkspace; extra: string[] }) {
	return runLot({
		cwd: params.lot.start.cwd,
		argv: ['scope', params.lot.lotName, ...params.extra],
		now: NOW,
	})
}

/** An add of `paths` by person-a with a reason. */
function addWords(paths: string[]): string[] {
	return [
		...paths.flatMap((path) => ['--add', path]),
		'--by',
		'person-a',
		'--reason',
		'approved widening',
	]
}

/** The lines of the lot's `scope-changes.jsonl`, parsed; none when it does not exist. */
function changesOf(lot: LotHandoverWorkspace): unknown[] {
	const path = join(lot.lotFolder, SCOPE_CHANGES_FILE)
	if (!existsSync(path)) return []
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line))
}

/** The lot's `scope.changed` events: their op and paths. */
function scopeEventsOf(lot: LotHandoverWorkspace): unknown[] {
	const path = join(lot.lotFolder, 'events.jsonl')
	if (!existsSync(path)) return []
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((event) => event.kind === 'scope.changed')
		.map((event) => ({ op: event.op, paths: event.paths, lot: event.lot }))
}

describe('lot scope - changes on the record', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--add of two paths -> exit 0, one add line, one scope.changed event, the effective scope printed', () => {
		const lot = startRealLot()

		const result = scopeOf({ lot, extra: addWords(['docs/notes.md', './tools/x/']) })

		expect({ result, changes: changesOf(lot), events: scopeEventsOf(lot) }).toEqual({
			result: {
				exitCode: 0,
				output: `lot scope: ${lot.lotName} added docs/notes.md, tools/x by person-a - effective scope: ${BRIEF_SCOPE}, docs/notes.md, tools/x`,
			},
			changes: [
				{
					schema: 1,
					at: NOW.toISOString(),
					op: 'add',
					paths: ['docs/notes.md', 'tools/x'],
					by: 'person-a',
					reason: 'approved widening',
				},
			],
			events: [{ op: 'add', paths: ['docs/notes.md', 'tools/x'], lot: lot.lotName }],
		})
	})

	it('--drop of an added entry the worktree did not change -> exit 0, one drop line with who and why, one event', () => {
		const lot = startRealLot()
		scopeOf({ lot, extra: addWords(['docs/notes.md']) })

		const result = scopeOf({ lot, extra: ['--drop', 'docs/notes.md', ...DROP_WHO] })

		expect({ result, last: changesOf(lot).at(-1), events: scopeEventsOf(lot).at(-1) }).toEqual({
			result: {
				exitCode: 0,
				output: `lot scope: ${lot.lotName} dropped docs/notes.md by person-a - effective scope: ${BRIEF_SCOPE}`,
			},
			last: {
				schema: 1,
				at: NOW.toISOString(),
				op: 'drop',
				paths: ['docs/notes.md'],
				by: 'person-a',
				reason: 'hand back',
			},
			events: { op: 'drop', paths: ['docs/notes.md'], lot: lot.lotName },
		})
	})
})

describe(
	'lot scope - an event that cannot be written (D6)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('events.jsonl a folder -> exit 0, the change line kept, one more line naming the event failure', () => {
			const lot = startRealLot()
			const events = join(lot.lotFolder, 'events.jsonl')
			rmSync(events, { force: true })
			mkdirSync(events)

			const result = scopeOf({ lot, extra: addWords(['docs/notes.md']) })

			expect({
				exitCode: result.exitCode,
				lines: result.output.split('\n'),
				changes: changesOf(lot).length,
			}).toEqual({
				exitCode: 0,
				lines: [
					`lot scope: ${lot.lotName} added docs/notes.md by person-a - effective scope: ${BRIEF_SCOPE}, docs/notes.md`,
					expect.stringMatching(
						/^lot scope: the event could not be written in .+events\.jsonl: .+$/,
					),
				],
				changes: 1,
			})
		})
	},
)

describe('lot scope - refusals: exit 2, nothing written', { timeout: STORE_CASE_TIMEOUT }, () => {
	type RefusalRow = {
		title: string
		/** Sets the lot (or the machine) up before the call. */
		arrange?: (lot: LotHandoverWorkspace) => void
		extra: string[]
		output: (lot: LotHandoverWorkspace) => string
	}

	const ROWS: RefusalRow[] = [
		{ title: 'no option', extra: [], output: () => USAGE },
		{ title: '--drop with no path', extra: ['--drop'], output: () => USAGE },
		{
			title: '--add without --by',
			extra: ['--add', 'docs/a', '--reason', 'r'],
			output: () => USAGE,
		},
		{
			title: '--add without --reason',
			extra: ['--add', 'docs/a', '--by', 'person-a'],
			output: () => USAGE,
		},
		{
			title: '--add with a --reason on two lines',
			extra: ['--add', 'docs/a', '--by', 'person-a', '--reason', 'one\ntwo'],
			output: () => USAGE,
		},
		{
			title: '--add with a forbidden word in --by',
			arrange: () => configureMachine({ userFileLines: [FIRST_WORD] }),
			extra: ['--add', 'docs/a', '--by', FIRST_WORD, '--reason', 'r'],
			output: () => 'lot scope: --by holds a forbidden word: nothing written',
		},
		{
			title: "--add with a forbidden word in --reason (the lot's repository's git config)",
			arrange: (lot) => {
				configureMachine()
				git({ root: lot.start.repository, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
			},
			extra: ['--add', 'docs/a', '--by', 'person-a', '--reason', `for ${FIRST_WORD}`],
			output: () => 'lot scope: --reason holds a forbidden word: nothing written',
		},
		{
			title: '--add of a path the brief check refuses (a .. segment)',
			extra: addWords(['../outside']),
			output: (lot) =>
				expect.stringMatching(
					new RegExp(`^lot scope: ${lot.lotName}: \\.\\./outside: .+: nothing written$`),
				),
		},
		{
			title: "--add meeting another open lot's scope",
			arrange: (lot) =>
				writeStoreLot({ workspace: lot.start.workspace, name: OTHER_LOT, scope: ['docs/'] }),
			extra: addWords(['docs/notes.md']),
			output: (lot) =>
				`lot scope: ${lot.lotName}: the added paths meet the open lot ${OTHER_LOT}: docs/notes.md meets docs: nothing written`,
		},
		{
			title: '--drop of a path that is no entry of the scope',
			extra: ['--drop', 'docs/a', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: docs/a is no entry of the lot's scope: nothing written`,
		},
		{
			title: '--drop of a path inside a wider entry',
			extra: ['--drop', 'src/dataflow/deep', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: src/dataflow/deep lies inside the entry src/dataflow: drop the entry and add what stays: nothing written`,
		},
		{
			title: '--drop of an entry holding a file the worktree changed',
			// another entry first, so the drop leaves the lot a scope
			arrange: (lot) => scopeOf({ lot, extra: addWords(['docs/notes.md']) }),
			extra: ['--drop', 'src/dataflow', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: src/dataflow holds src/dataflow/subscribe.ts, changed in the lot's worktree: nothing written`,
		},
		{
			title: 'a --drop while scope-changes.jsonl holds a line that does not read',
			arrange: (lot) => writeFileSync(join(lot.lotFolder, SCOPE_CHANGES_FILE), 'not json\n'),
			extra: ['--drop', 'src/dataflow/**/*.test.ts', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: ${join(lot.lotFolder, SCOPE_CHANGES_FILE)} holds 1 line(s) that do not read: nothing written`,
		},
		{
			title: 'an --add while scope-changes.jsonl holds a line that does not read',
			arrange: (lot) => writeFileSync(join(lot.lotFolder, SCOPE_CHANGES_FILE), 'not json\n'),
			extra: addWords(['docs/a']),
			output: (lot) =>
				`lot scope: ${lot.lotName}: ${join(lot.lotFolder, SCOPE_CHANGES_FILE)} holds 1 line(s) that do not read: nothing written`,
		},
		{
			title: '--drop of a path that only prefixes an entry by text (src/data against src/dataflow)',
			extra: ['--drop', 'src/data', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: src/data is no entry of the lot's scope: nothing written`,
		},
		{
			title: "--drop when the lot's worktree cannot be read (removed)",
			arrange: (lot) => rmSync(lot.worktree, { recursive: true, force: true }),
			extra: ['--drop', 'src/dataflow/**/*.test.ts', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: the lot's worktree ${lot.worktree} cannot be read: nothing written`,
		},
		{
			title: 'an --add over the line limit (a path of 5,000 characters)',
			extra: addWords([`docs/${'x'.repeat(5_000)}`]),
			output: (lot) =>
				expect.stringMatching(
					new RegExp(
						`^lot scope: ${lot.lotName}: .*over the limit of 4096 bytes: nothing written$`,
					),
				),
		},
		{
			title: 'a committed lot',
			arrange: (lot) => {
				const name = writeLotHandover(lot)
				commitReadyLotByHand(lot)
				setEntryState({ root: lot.start.repository, name, state: 'committed' })
			},
			extra: addWords(['docs/a']),
			output: (lot) => `lot scope: ${lot.lotName} is committed: nothing to record`,
		},
		{
			title: 'a failed lot',
			arrange: (lot) =>
				writeTransition({
					lotFolder: lot.lotFolder,
					transition: transitionOf({ seq: 2, state: 'failed', kind: 'fail' }),
				}),
			extra: addWords(['docs/a']),
			output: (lot) => `lot scope: ${lot.lotName} is failed: nothing to record`,
		},
		{
			title: '--drop of every entry (the lot would hold no scope)',
			extra: ['--drop', 'src/dataflow', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: the drop leaves the lot no scope: stop it instead (dialecte lot stop ${lot.lotName} --reason <text>): nothing written`,
		},
		{
			title: '--drop of a glob path that is no entry',
			extra: ['--drop', 'src/dataflow/**', ...DROP_WHO],
			output: (lot) =>
				`lot scope: ${lot.lotName}: src/dataflow/** is no entry of the lot's scope: nothing written`,
		},
		{
			title: 'a damaged lot',
			arrange: (lot) => {
				const path = join(lot.lotFolder, 'identity.json')
				const identity = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
				rewriteRecord({ path, text: JSON.stringify({ ...identity, index: 'x' }) })
			},
			extra: addWords(['docs/a']),
			output: (lot) =>
				`lot scope: ${lot.lotName} damaged: identity.json holds an index that is not digits`,
		},
		{
			title: 'a canceled lot',
			arrange: (lot) =>
				runLot({ cwd: lot.start.cwd, argv: ['stop', lot.lotName, '--reason', 'r'], now: NOW }),
			extra: addWords(['docs/a']),
			output: (lot) => `lot scope: ${lot.lotName} is canceled: nothing to record`,
		},
	]

	for (const row of ROWS)
		it(`${row.title} -> exit 2, nothing written`, () => {
			const lot = startRealLot()
			row.arrange?.(lot)
			const before = JSON.stringify(snapshotOf(lot.lotFolder))

			expect(scopeOf({ lot, extra: row.extra })).toEqual({ exitCode: 2, output: row.output(lot) })
			expect(JSON.stringify(snapshotOf(lot.lotFolder))).toBe(before)
		})
})

describe(
	'lot scope - glob-only scopes, simulated lots, a lot started meanwhile',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/** A store lot of the start workspace whose scope is `scope` (no worktree), and the call of lot scope on it. */
		function storeLot(params: { name: string; scope: string[]; simulated?: boolean }) {
			const start = createStartWorkspace()
			const lotFolder = writeStoreLot({
				workspace: start.workspace,
				name: params.name,
				scope: params.scope,
				simulated: params.simulated,
			})
			return {
				start,
				lotFolder,
				scope: (extra: string[]) =>
					runLot({ cwd: start.cwd, argv: ['scope', lotFolder, ...extra], now: NOW }),
			}
		}

		it('--add of a file a glob-only scope does not cover -> added, not "already holds"', () => {
			const lot = storeLot({ name: '0004-repo-glob', scope: ['src/dataflow/**/*.test.ts'] })

			expect(lot.scope(addWords(['src/dataflow/x.ts']))).toEqual({
				exitCode: 0,
				output:
					'lot scope: 0004-repo-glob added src/dataflow/x.ts by person-a - effective scope: src/dataflow/**/*.test.ts, src/dataflow/x.ts',
			})
		})

		const SIMULATED_ROWS: { title: string; extra: string[] }[] = [
			{ title: '--add', extra: addWords(['docs/a']) },
			{ title: '--drop', extra: ['--drop', 'src/', ...DROP_WHO] },
		]

		for (const { title, extra } of SIMULATED_ROWS)
			it(`${title} on a simulated lot -> exit 2, nothing to record, nothing written`, () => {
				const lot = storeLot({ name: '0002-repo-simulated', scope: ['src/'], simulated: true })
				const before = JSON.stringify(snapshotOf(lot.lotFolder))

				expect(lot.scope(extra)).toEqual({
					exitCode: 2,
					output: 'lot scope: 0002-repo-simulated is simulated: nothing to record',
				})
				expect(JSON.stringify(snapshotOf(lot.lotFolder))).toBe(before)
			})

		it('an open lot meeting the add started between the check and the append -> the add undone by an undo line, exit 2, no event', () => {
			const lot = startRealLot()

			const result = runLotScope({
				cwd: lot.start.cwd,
				argv: [lot.lotName, ...addWords(['docs/notes.md'])],
				now: NOW,
				seams: {
					afterAppend: () =>
						writeStoreLot({ workspace: lot.start.workspace, name: OTHER_LOT, scope: ['docs/'] }),
				},
			})

			expect({ result, changes: changesOf(lot), events: scopeEventsOf(lot) }).toEqual({
				result: {
					exitCode: 2,
					output: `lot scope: ${lot.lotName}: the added paths meet the open lot ${OTHER_LOT} (changed meanwhile): docs/notes.md meets docs: the add is undone`,
				},
				changes: [
					{
						schema: 1,
						at: NOW.toISOString(),
						op: 'add',
						paths: ['docs/notes.md'],
						by: 'person-a',
						reason: 'approved widening',
					},
					{ schema: 1, at: NOW.toISOString(), op: 'undo', paths: ['docs/notes.md'] },
				],
				events: [],
			})
		})

		it('an add undone keeps the entries that lay inside its path before it', () => {
			const lot = startRealLot()

			const result = runLotScope({
				cwd: lot.start.cwd,
				argv: [lot.lotName, ...addWords(['src'])],
				now: NOW,
				seams: {
					afterAppend: () =>
						writeStoreLot({
							workspace: lot.start.workspace,
							name: OTHER_LOT,
							scope: ['src/other'],
						}),
				},
			})

			expect({
				exitCode: result.exitCode,
				scope: readLotScope({ lotFolder: lot.lotFolder }),
			}).toEqual({
				exitCode: 2,
				scope: ['src/dataflow', 'src/dataflow/**/*.test.ts'],
			})
		})

		it('an undo that cannot be written -> exit 1 naming the paths and the lot met, the add left with no event', () => {
			const lot = startRealLot()

			const result = runLotScope({
				cwd: lot.start.cwd,
				argv: [lot.lotName, ...addWords(['docs/notes.md'])],
				now: NOW,
				seams: {
					afterAppend: () => {
						chmodSync(join(lot.lotFolder, SCOPE_CHANGES_FILE), 0o444)
						writeStoreLot({ workspace: lot.start.workspace, name: OTHER_LOT, scope: ['docs/'] })
					},
				},
			})

			expect({ result, changes: changesOf(lot).length, events: scopeEventsOf(lot) }).toEqual({
				result: {
					exitCode: 1,
					output: expect.stringMatching(
						new RegExp(
							`^lot scope: ${lot.lotName}: the added paths docs/notes\\.md meet the open lot ${OTHER_LOT} \\(changed meanwhile\\), and their undo could not be written: .+: both lots hold them until one drops them$`,
						),
					),
				},
				changes: 1,
				events: [],
			})
		})
	},
)
