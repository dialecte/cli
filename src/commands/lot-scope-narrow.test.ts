/**
 * `lot scope` narrows a folder entry to files (FIX-scope-narrow D1-D5): an `--add` of a path inside a held entry is
 * recorded; `--drop` and `--add` may come in one call, written in one append (the drop line first); a drop is kept when
 * every file the lot's worktree changed inside the dropped entries stays covered by the entries left, the call's adds
 * counted; `--drop` requires `--by` / `--reason` like `--add`. The lot is a real started lot: brief scope
 * `src/dataflow/`, `src/dataflow/**\/*.test.ts`, its worktree changing `src/dataflow/subscribe.ts`.
 */
import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	briefWith,
	checkArgumentsOf,
	refusalKeysOf,
	writeStoreLot,
} from '../../test/brief-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { startRealLot } from '../../test/lot-handover-workspace.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { checkBrief } from '../lib/store/brief.ts'
import { readLotScope } from '../lib/store/lot-records.ts'
import { runLotScope } from './lot-scope.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-15T10:00:00.000Z')
const AT = NOW.toISOString()
const USAGE =
	'lot scope: expected <id> [--drop <path>]... [--add <path>]... [--overlap-ok] --by <who> --reason <text>'
/** An entry long enough that two lines naming such paths pass the line limit together, never alone. */
const LONG_ENTRY = `docs/${'x'.repeat(2_200)}`

/** The other open lots a case starts. */
const SUB_LOT = '0009-repo-sub'
const DOCS_LOT = '0009-repo-docs'

/** Who and why, as every case gives them. */
const WHO = ['--by', 'person-a', '--reason', 'hand back the folder']

/** `lot scope <lot> <extra...>` from the lot's main checkout. */
function scopeOf(params: { lot: LotHandoverWorkspace; extra: string[] }) {
	return runLot({
		cwd: params.lot.start.cwd,
		argv: ['scope', params.lot.lotName, ...params.extra],
		now: NOW,
	})
}

/** The words of `--<op> <path>` for each path. */
function optionWords(params: { op: 'add' | 'drop'; paths: string[] }): string[] {
	return params.paths.flatMap((path) => [`--${params.op}`, path])
}

/** The lines of the lot's `scope-changes.jsonl`, parsed; none when it does not exist. */
function changesOf(lot: LotHandoverWorkspace): unknown[] {
	const path = join(lot.lotFolder, 'scope-changes.jsonl')
	if (!existsSync(path)) return []
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line))
}

/** The ops and paths of the lot's `scope.changed` events. */
function scopeEventsOf(lot: LotHandoverWorkspace): unknown[] {
	return readFileSync(join(lot.lotFolder, 'events.jsonl'), 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((event) => event.kind === 'scope.changed')
		.map((event) => ({ op: event.op, paths: event.paths }))
}

describe('lot scope - narrowing a folder entry to files', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--add of a file inside a held folder entry -> recorded as an explicit entry', () => {
		const lot = startRealLot()

		expect({
			result: scopeOf({
				lot,
				extra: [...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }), ...WHO],
			}),
			changes: changesOf(lot),
		}).toEqual({
			result: {
				exitCode: 0,
				output: `lot scope: ${lot.lotName} added src/dataflow/subscribe.ts by person-a - effective scope: src/dataflow, src/dataflow/**/*.test.ts, src/dataflow/subscribe.ts`,
			},
			changes: [
				{
					schema: 1,
					at: AT,
					op: 'add',
					paths: ['src/dataflow/subscribe.ts'],
					by: 'person-a',
					reason: 'hand back the folder',
				},
			],
		})
	})

	it('--add of a path equal to an entry -> already holds, nothing written', () => {
		const lot = startRealLot()

		expect({
			result: scopeOf({
				lot,
				extra: [...optionWords({ op: 'add', paths: ['src/dataflow'] }), ...WHO],
			}),
			changes: changesOf(lot),
		}).toEqual({
			result: {
				exitCode: 0,
				output: `lot scope: ${lot.lotName} already holds src/dataflow: nothing written`,
			},
			changes: [],
		})
	})

	it('--drop of the folder with --add of its changed file in one call -> a drop line then an add line, both with who and why; two events', () => {
		const lot = startRealLot()

		const result = scopeOf({
			lot,
			extra: [
				...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
				...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }),
				...WHO,
			],
		})

		expect({
			result,
			changes: changesOf(lot),
			events: scopeEventsOf(lot),
			scope: readLotScope({ lotFolder: lot.lotFolder }),
		}).toEqual({
			result: {
				exitCode: 0,
				output: `lot scope: ${lot.lotName} dropped src/dataflow, added src/dataflow/subscribe.ts by person-a - effective scope: src/dataflow/subscribe.ts`,
			},
			changes: [
				{
					schema: 1,
					at: AT,
					op: 'drop',
					paths: ['src/dataflow'],
					by: 'person-a',
					reason: 'hand back the folder',
				},
				{
					schema: 1,
					at: AT,
					op: 'add',
					paths: ['src/dataflow/subscribe.ts'],
					by: 'person-a',
					reason: 'hand back the folder',
				},
			],
			events: [
				{ op: 'drop', paths: ['src/dataflow'] },
				{ op: 'add', paths: ['src/dataflow/subscribe.ts'] },
			],
			scope: ['src/dataflow/subscribe.ts'],
		})
	})

	it('--drop of the folder with --add of a glob matching its changed file -> accepted, the glob held', () => {
		const lot = startRealLot()

		expect({
			result: scopeOf({
				lot,
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({ op: 'add', paths: ['src/dataflow/*.ts'] }),
					...WHO,
				],
			}),
			scope: readLotScope({ lotFolder: lot.lotFolder }),
		}).toEqual({
			result: {
				exitCode: 0,
				output: `lot scope: ${lot.lotName} dropped src/dataflow, added src/dataflow/*.ts by person-a - effective scope: src/dataflow/*.ts`,
			},
			scope: ['src/dataflow/*.ts'],
		})
	})

	it('--add of an entry and a path inside it in one call -> only the inside path recorded', () => {
		const lot = startRealLot()
		scopeOf({
			lot,
			extra: [...optionWords({ op: 'add', paths: ['src/dataflow', 'src/dataflow/x.ts'] }), ...WHO],
		})

		expect(changesOf(lot).map((line) => (line as { paths: string[] }).paths)).toEqual([
			['src/dataflow/x.ts'],
		])
	})

	it('--drop of a folder an entry left still holds -> accepted, the wider entry kept', () => {
		const lot = startRealLot()
		scopeOf({ lot, extra: [...optionWords({ op: 'add', paths: ['src'] }), ...WHO] })

		expect({
			exitCode: scopeOf({
				lot,
				extra: [...optionWords({ op: 'drop', paths: ['src/dataflow'] }), ...WHO],
			}).exitCode,
			scope: readLotScope({ lotFolder: lot.lotFolder }),
		}).toEqual({ exitCode: 0, scope: ['src'] })
	})

	it('narrowing in two calls (add the file, then drop the folder alone) -> the drop refused: a folder drop takes its inner entries', () => {
		const lot = startRealLot()
		// another entry, so the drop leaves the lot a scope and the refusal comes from coverage
		scopeOf({ lot, extra: [...optionWords({ op: 'add', paths: ['docs/notes.md'] }), ...WHO] })
		scopeOf({
			lot,
			extra: [...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }), ...WHO],
		})

		expect(
			scopeOf({ lot, extra: [...optionWords({ op: 'drop', paths: ['src/dataflow'] }), ...WHO] }),
		).toEqual({
			exitCode: 2,
			output: `lot scope: ${lot.lotName}: src/dataflow holds src/dataflow/subscribe.ts, changed in the lot's worktree: nothing written`,
		})
	})

	it('--drop of the folder with --add of a file the lot already held explicitly -> accepted, the file kept', () => {
		const lot = startRealLot()
		scopeOf({
			lot,
			extra: [...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }), ...WHO],
		})

		expect({
			exitCode: scopeOf({
				lot,
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }),
					...WHO,
				],
			}).exitCode,
			last: changesOf(lot).at(-1),
			scope: readLotScope({ lotFolder: lot.lotFolder }),
		}).toEqual({
			exitCode: 0,
			last: {
				schema: 1,
				at: AT,
				op: 'add',
				paths: ['src/dataflow/subscribe.ts'],
				by: 'person-a',
				reason: 'hand back the folder',
			},
			scope: ['src/dataflow/subscribe.ts'],
		})
	})

	it('--drop of an entry with --by and --reason alone -> the drop line holds them', () => {
		const lot = startRealLot()
		scopeOf({ lot, extra: [...optionWords({ op: 'add', paths: ['docs/notes.md'] }), ...WHO] })

		scopeOf({ lot, extra: [...optionWords({ op: 'drop', paths: ['docs/notes.md'] }), ...WHO] })

		expect(changesOf(lot).at(-1)).toEqual({
			schema: 1,
			at: AT,
			op: 'drop',
			paths: ['docs/notes.md'],
			by: 'person-a',
			reason: 'hand back the folder',
		})
	})

	it('a drop of a folder with 11 file adds in one call -> one drop and one add line, the folder freed for another lot', () => {
		const lot = startRealLot()
		const files = Array.from({ length: 11 }, (_, index) => `src/lib/handover/file-${index + 1}.ts`)
		scopeOf({ lot, extra: [...optionWords({ op: 'add', paths: ['src/lib/handover/'] }), ...WHO] })
		writeFiles({
			root: lot.worktree,
			files: Object.fromEntries(files.map((file) => [file, 'export {}\n'])),
		})

		const result = scopeOf({
			lot,
			extra: [
				...optionWords({ op: 'drop', paths: ['src/lib/handover/'] }),
				...optionWords({ op: 'add', paths: files }),
				...WHO,
			],
		})
		const second = checkBrief(
			checkArgumentsOf({
				workspace: lot.start.workspace,
				brief: briefWith({
					scope: ['src/lib/handover/close-handovers.ts'],
					lots: [{ paths: ['src/lib/handover/close-handovers.ts'], message: 'feat: x' }],
				}),
				caseInsensitive: false,
			}),
		)

		expect({
			exitCode: result.exitCode,
			lines: changesOf(lot)
				.slice(1)
				.map((line) => (line as { op: string; paths: string[] }).op),
			held: files.every((file) => readLotScope({ lotFolder: lot.lotFolder }).includes(file)),
			folder: readLotScope({ lotFolder: lot.lotFolder }).includes('src/lib/handover'),
			// only the overlap guard is in question: the second brief reuses the first's branch on purpose
			secondLot: refusalKeysOf(second.refused).filter((key) => key.startsWith('overlap')),
		}).toEqual({ exitCode: 0, lines: ['drop', 'add'], held: true, folder: false, secondLot: [] })
	})
})

describe(
	'lot scope - narrowing refusals: exit 2, nothing written',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const ROWS: {
			title: string
			/** Sets the lot (or the machine) up before the call. */
			arrange?: (lot: LotHandoverWorkspace) => void
			extra: string[]
			output: (lot: LotHandoverWorkspace) => unknown
		}[] = [
			{
				title: '--drop of the folder with --add of a glob that does not match its changed file',
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({ op: 'add', paths: ['src/dataflow/*.md'] }),
					...WHO,
				],
				output: (lot) =>
					`lot scope: ${lot.lotName}: src/dataflow holds src/dataflow/subscribe.ts, changed in the lot's worktree: nothing written`,
			},
			{
				title: '--drop of the folder holding two changed files, the adds covering one',
				arrange: (lot) =>
					writeFiles({ root: lot.worktree, files: { 'src/dataflow/b.ts': 'export {}\n' } }),
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }),
					...WHO,
				],
				output: (lot) =>
					`lot scope: ${lot.lotName}: src/dataflow holds src/dataflow/b.ts, changed in the lot's worktree: nothing written`,
			},
			{
				title: 'a narrowing call whose add is over the line limit (no drop line left alone)',
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({
						op: 'add',
						paths: ['src/dataflow/subscribe.ts', `src/dataflow/${'x'.repeat(5_000)}`],
					}),
					...WHO,
				],
				output: (lot) =>
					expect.stringMatching(
						new RegExp(
							`^lot scope: ${lot.lotName}: event line of \\d+ bytes is over the limit of 4096 bytes: nothing written$`,
						),
					),
			},
			{
				title: "a narrowing call whose add meets another open lot's scope",
				arrange: (lot) =>
					writeStoreLot({ workspace: lot.start.workspace, name: DOCS_LOT, scope: ['docs/'] }),
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts', 'docs/notes.md'] }),
					...WHO,
				],
				output: (lot) =>
					`lot scope: ${lot.lotName}: the added paths meet the open lot ${DOCS_LOT}: docs/notes.md meets docs: nothing written`,
			},
			{
				title:
					'a narrowing call whose drop and add lines each fit and together pass the line limit',
				arrange: (lot) =>
					scopeOf({ lot, extra: [...optionWords({ op: 'add', paths: [LONG_ENTRY] }), ...WHO] }),
				extra: [
					...optionWords({ op: 'drop', paths: [LONG_ENTRY] }),
					...optionWords({ op: 'add', paths: [`docs/${'y'.repeat(2_200)}`] }),
					...WHO,
				],
				output: (lot) =>
					expect.stringMatching(
						new RegExp(
							`^lot scope: ${lot.lotName}: event line of \\d+ bytes is over the limit of 4096 bytes: nothing written$`,
						),
					),
			},
			{
				title: 'a narrowing call whose take-back would pass the line limit (many entries dropped)',
				arrange: (lot) => {
					for (const index of [1, 2, 3])
						scopeOf({
							lot,
							extra: [
								...optionWords({
									op: 'add',
									paths: Array.from(
										{ length: 10 },
										(_, entry) => `src/many/${index}-${entry}-${'z'.repeat(120)}.ts`,
									),
								}),
								...WHO,
							],
						})
				},
				extra: [
					...optionWords({ op: 'drop', paths: ['src/many'] }),
					...optionWords({ op: 'add', paths: ['src/many/kept.ts'] }),
					...WHO,
				],
				output: (lot) =>
					expect.stringMatching(
						new RegExp(
							`^lot scope: ${lot.lotName}: its take-back on a late overlap .*over the limit of 4096 bytes: nothing written$`,
						),
					),
			},
			{
				title: '--drop with a forbidden word in --by',
				arrange: () => configureMachine({ userFileLines: [FIRST_WORD] }),
				extra: ['--drop', 'src/dataflow/**/*.test.ts', '--by', FIRST_WORD, '--reason', 'r'],
				output: () => 'lot scope: --by holds a forbidden word: nothing written',
			},
			{
				title: '--drop with a forbidden word in --reason',
				arrange: () => configureMachine({ userFileLines: [FIRST_WORD] }),
				extra: [
					'--drop',
					'src/dataflow/**/*.test.ts',
					'--by',
					'person-a',
					'--reason',
					`for ${FIRST_WORD}`,
				],
				output: () => 'lot scope: --reason holds a forbidden word: nothing written',
			},
			{
				title: '--drop with a --reason on two lines',
				extra: ['--drop', 'src/dataflow/**/*.test.ts', '--by', 'person-a', '--reason', 'one\ntwo'],
				output: () => USAGE,
			},
			{
				title: '--drop with --reason and no --by',
				extra: ['--drop', 'src/dataflow/**/*.test.ts', '--reason', 'r'],
				output: () => USAGE,
			},
			{
				title: '--drop of the folder whose changed file the adds of the call leave uncovered',
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({ op: 'add', paths: ['src/dataflow/other.ts'] }),
					...WHO,
				],
				output: (lot) =>
					`lot scope: ${lot.lotName}: src/dataflow holds src/dataflow/subscribe.ts, changed in the lot's worktree: nothing written`,
			},
			{
				title: '--drop without --by and --reason (both required on every drop)',
				extra: ['--drop', 'src/dataflow/**/*.test.ts'],
				output: () => USAGE,
			},
			{
				title: '--drop with --by and no --reason',
				extra: ['--drop', 'src/dataflow/**/*.test.ts', '--by', 'person-a'],
				output: () => USAGE,
			},
			{
				title: '--drop and --add in one call without --by and --reason',
				extra: [
					...optionWords({ op: 'drop', paths: ['src/dataflow'] }),
					...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }),
				],
				output: () => USAGE,
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
	},
)

describe('lot scope - a late overlap on a narrowing call', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** A narrowing call of `drop` with an add of subscribe.ts, a lot of scope subscribe.ts started at the seam. */
	function lateNarrowing(params: { drop: string; failUndo?: boolean }) {
		const lot = startRealLot()
		const result = runLotScope({
			cwd: lot.start.cwd,
			argv: [
				lot.lotName,
				...optionWords({ op: 'drop', paths: [params.drop] }),
				...optionWords({ op: 'add', paths: ['src/dataflow/subscribe.ts'] }),
				...WHO,
			],
			now: NOW,
			seams: {
				afterAppend: () => {
					if (params.failUndo) chmodSync(join(lot.lotFolder, 'scope-changes.jsonl'), 0o444)
					writeStoreLot({
						workspace: lot.start.workspace,
						name: SUB_LOT,
						scope: ['src/dataflow/subscribe.ts'],
					})
				},
			},
		})
		return { lot, result }
	}

	it('a lot meeting the adds starts meanwhile -> the adds undone and the entries the drop removed put back, exit 2, no event', () => {
		const { lot, result } = lateNarrowing({ drop: 'src' })

		expect({
			result,
			lines: changesOf(lot).map((line) => {
				const { op, paths } = line as { op: string; paths: string[] }
				return { op, paths }
			}),
			last: changesOf(lot).at(-1),
			scope: readLotScope({ lotFolder: lot.lotFolder }),
			events: scopeEventsOf(lot),
		}).toEqual({
			result: {
				exitCode: 2,
				output: `lot scope: ${lot.lotName}: the added paths meet the open lot ${SUB_LOT} (changed meanwhile): src/dataflow/subscribe.ts meets src/dataflow/subscribe.ts: the add is undone, the dropped entries put back`,
			},
			lines: [
				{ op: 'drop', paths: ['src'] },
				{ op: 'add', paths: ['src/dataflow/subscribe.ts'] },
				{ op: 'undo', paths: ['src/dataflow/subscribe.ts'] },
				{ op: 'add', paths: ['src/dataflow', 'src/dataflow/**/*.test.ts'] },
			],
			last: {
				schema: 1,
				at: AT,
				op: 'add',
				paths: ['src/dataflow', 'src/dataflow/**/*.test.ts'],
				by: 'person-a',
				reason: 'restored: hand back the folder',
			},
			scope: ['src/dataflow', 'src/dataflow/**/*.test.ts'],
			events: [],
		})
	})

	it('the undo cannot be written -> exit 1 naming the paths and the lot met', () => {
		const { lot, result } = lateNarrowing({ drop: 'src/dataflow', failUndo: true })

		expect(result).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				new RegExp(
					`^lot scope: ${lot.lotName}: the added paths src/dataflow/subscribe\\.ts meet the open lot ${SUB_LOT} \\(changed meanwhile\\), and their undo could not be written: .+$`,
				),
			),
		})
	})
})
