/**
 * The keep set up front (KEEP 3.4): `lot start --keep <why>` or a brief `keep` writes the lot's first `keep` line with
 * the start's records, before the publish rename (a lot is never visible without its keep), signed by the go-ahead's
 * `--by` (the orchestrator in any casing recorded as `orchestrator`) or `caller`; both given, a usage error; the keep's
 * text checked as every public text; a dry run names it and writes nothing.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith } from '../../test/brief-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { KEEP_REASON } from '../../test/keep-decision-workspace.constants.ts'
import { keepFileOf, keepLineOf, keepTextOf } from '../../test/keep-decision-workspace.ts'
import { createdBy, createStartWorkspace, withJson } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { checkBrief } from '../lib/store/brief.ts'
import { readKeepDecision } from '../lib/store/keep-decisions.ts'
import { startLot, writeStartRecordsTo } from './lot-start.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { StartRisk, StartSeams } from './lot-start.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The keep line a start writes: at the start's time, by `by`, with `reason`. */
function startKeepLine(params: { by: string; reason?: string }) {
	return keepLineOf({
		by: params.by,
		reason: params.reason ?? KEEP_REASON,
		at: START_NOW.toISOString(),
	})
}

/** The parsed lines of the started lot's `keep.jsonl`; none when there is no file. */
function keepLinesOf(start: StartWorkspace): unknown[] {
	return (keepTextOf(join(start.store, LOT_NAME)) ?? '')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as unknown)
}

/** `lot start <the workspace's brief> <words>` at the start time. */
function started(params: {
	start: StartWorkspace
	words: string[]
	seams?: StartSeams
}): CommandResult {
	return startLot({
		cwd: params.start.cwd,
		argv: [params.start.workspace.briefPath, ...params.words],
		now: START_NOW,
		seams: params.seams,
	})
}

/** What a start left: its exit, and the keep lines of the lot it published. */
function keptBy(params: { start: StartWorkspace; run: () => CommandResult }): {
	exitCode: number
	lines: unknown[]
} {
	const result = params.run()
	return { exitCode: result.exitCode, lines: keepLinesOf(params.start) }
}

/** What a refused start left: its exit, whether the output says `text`, the lots published. */
function refusedBy(params: { start: StartWorkspace; run: () => CommandResult; text: string }): {
	exitCode: number
	says: boolean
	lots: string[]
} {
	const result = params.run()
	return {
		exitCode: result.exitCode,
		says: result.output.includes(params.text),
		lots: createdBy(params.start).lots,
	}
}

describe('lot start --keep: the first keep line', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--keep <why> → the lot published with one keep line, by caller, at the start time', () => {
		const start = createStartWorkspace()

		expect(
			keptBy({ start, run: () => started({ start, words: ['--keep', KEEP_REASON] }) }),
		).toEqual({
			exitCode: 0,
			lines: [startKeepLine({ by: 'caller' })],
		})
	})

	it('--keep <why> --by Orchestrator --reason <text> --overlap-ok → the keep line signed orchestrator', () => {
		const start = createStartWorkspace()

		expect(
			keptBy({
				start,
				run: () =>
					started({
						start,
						words: [
							'--keep',
							KEEP_REASON,
							'--by',
							'Orchestrator',
							'--reason',
							'a spike',
							'--overlap-ok',
						],
					}),
			}),
		).toEqual({ exitCode: 0, lines: [startKeepLine({ by: 'orchestrator' })] })
	})

	it('a brief keep → the same line', () => {
		const start = createStartWorkspace({ brief: briefWith({ keep: KEEP_REASON }) })

		expect(keptBy({ start, run: () => started({ start, words: [] }) })).toEqual({
			exitCode: 0,
			lines: [startKeepLine({ by: 'caller' })],
		})
	})

	it('--simulate ready --keep <why> → the simulated lot with its keep line', () => {
		const start = createStartWorkspace()

		expect(
			keptBy({
				start,
				run: () => started({ start, words: ['--simulate', 'ready', '--keep', KEEP_REASON] }),
			}),
		).toEqual({ exitCode: 0, lines: [startKeepLine({ by: 'caller' })] })
	})

	it('no keep → no keep.jsonl, the lot read not kept', () => {
		const start = createStartWorkspace()

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				file: existsSync(keepFileOf(join(start.store, LOT_NAME))),
				keep: readKeepDecision({ lotFolder: join(start.store, LOT_NAME) }),
			}))(started({ start, words: [] })),
		).toEqual({ exitCode: 0, file: false, keep: undefined })
	})

	it('--keep <why> --json → the start JSON names the keep', () => {
		const start = createStartWorkspace()

		expect(
			((result: CommandResult) => (withJson(result).json as { kept?: unknown } | undefined)?.kept)(
				started({ start, words: ['--keep', KEEP_REASON, '--json'] }),
			),
		).toBe(KEEP_REASON)
	})

	it('--dry-run --keep <why> → prints keep: <why>, writes nothing', () => {
		const start = createStartWorkspace()

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				names: result.output.split('\n').includes(`keep: ${KEEP_REASON}`),
				lots: createdBy(start).lots,
			}))(started({ start, words: ['--dry-run', '--keep', KEEP_REASON] })),
		).toEqual({ exitCode: 0, names: true, lots: [] })
	})
})

describe('lot start --keep: when the keep is written', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a worktree maker that reads the lot folder’s keep.jsonl → it finds the keep line: written before the worktree', () => {
		const start = createStartWorkspace()
		const seen: (string | undefined)[] = []
		const seams: StartSeams = {
			addWorktree: function readKeepFirst() {
				seen.push(keepTextOf(join(start.store, LOT_NAME)))
				return 'the case stops the start here'
			},
		}

		expect(
			((result: CommandResult) => ({ exitCode: result.exitCode, seen }))(
				started({ start, words: ['--keep', KEEP_REASON], seams }),
			),
		).toEqual({ exitCode: 1, seen: [`${JSON.stringify(startKeepLine({ by: 'caller' }))}\n`] })
	})

	it('writeStartRecordsTo on a temporary folder with a keep → keep.jsonl written there, with the risk lines (before the publish)', () => {
		const start = createStartWorkspace()
		const { checked } = checkBrief({ briefPath: start.workspace.briefPath, cwd: start.cwd })
		if (checked === undefined) throw new Error('the default brief does not check')
		const folder = temporaryFolder('dialecte-start-records-')
		const risk: StartRisk = {
			effort: { level: 'medium', source: 'brief' },
			derivation: { class: 'light', reasons: [] },
			goAhead: undefined,
			lines: [],
		}
		const keep = startKeepLine({ by: 'caller' })

		expect(
			((write: () => void) => {
				write()
				return keepTextOf(folder)
			})(() =>
				writeStartRecordsTo({
					folder,
					brief: checked,
					risk,
					now: START_NOW,
					stack: undefined,
					keep,
				}),
			),
		).toBe(`${JSON.stringify(keep)}\n`)
	})
})

/** The refused fields of a `lot start --json`: field, rule and detail of each. */
function refusedFieldsOf(result: CommandResult): unknown {
	const json = withJson(result).json as {
		refused?: { field: string; rule: string; detail: string }[]
	}
	return {
		exitCode: result.exitCode,
		refused: (json?.refused ?? []).map((refusal) => ({
			field: refusal.field,
			rule: refusal.rule,
			detail: refusal.detail,
		})),
	}
}

const BRIEF_KEEP_FAULTS: { title: string; keep: unknown; detail: string }[] = [
	{ title: 'of two lines', keep: 'one line\nand another', detail: 'keep must be one line' },
	{
		title: 'over 200 characters',
		keep: 'a'.repeat(201),
		detail: 'keep must be at most 200 characters',
	},
	{ title: 'that is no string', keep: 7, detail: 'keep must be a non-empty string' },
]

describe('lot start: a keep refused', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a brief keep and --keep → exit 2, usage: keep given twice, nothing published', () => {
		const start = createStartWorkspace({ brief: briefWith({ keep: KEEP_REASON }) })

		expect(
			refusedBy({
				start,
				run: () => started({ start, words: ['--keep', 'another reason'] }),
				text: "keep given twice: the brief's keep and --keep",
			}),
		).toEqual({ exitCode: 2, says: true, lots: [] })
	})

	it.each(BRIEF_KEEP_FAULTS)(
		'a brief keep $title → refused, exit 2, field keep',
		({ keep, detail }) => {
			const start = createStartWorkspace({ brief: briefWith({ keep }) })

			expect(refusedFieldsOf(started({ start, words: ['--json'] }))).toEqual({
				exitCode: 2,
				refused: [{ field: 'keep', rule: 'shape', detail }],
			})
		},
	)

	it('--keep <a path> → refused naming --keep, nothing published', () => {
		const start = createStartWorkspace()

		expect(
			refusedBy({
				start,
				run: () => started({ start, words: ['--keep', 'rerun src/lib/store/audit.ts'] }),
				text: 'lot start: --keep holds a path or a link: nothing written',
			}),
		).toEqual({ exitCode: 2, says: true, lots: [] })
	})

	it('a brief keep holding a path → refused naming keep, never --keep, nothing published', () => {
		const start = createStartWorkspace({
			brief: briefWith({ keep: 'see https://host.test/audit' }),
		})

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				namesKeep: result.output.includes('keep holds a path or a link'),
				namesFlag: result.output.includes('--keep'),
				lots: createdBy(start).lots,
			}))(started({ start, words: [] })),
		).toEqual({ exitCode: 2, namesKeep: true, namesFlag: false, lots: [] })
	})

	it('--keep holding a forbidden word → refused naming --keep, nothing published', () => {
		const start = createStartWorkspace()
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(
			refusedBy({
				start,
				run: () => started({ start, words: ['--keep', `${FIRST_WORD} audit`] }),
				text: 'lot start: --keep holds a forbidden word: nothing written',
			}),
		).toEqual({ exitCode: 2, says: true, lots: [] })
	})

	it('a brief keep holding a forbidden word → refused naming keep, nothing published', () => {
		const start = createStartWorkspace({ brief: briefWith({ keep: `${FIRST_WORD} audit` }) })
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				namesKeep: result.output.includes('keep holds a forbidden word'),
				namesFlag: result.output.includes('--keep'),
				lots: createdBy(start).lots,
			}))(started({ start, words: [] })),
		).toEqual({ exitCode: 2, namesKeep: true, namesFlag: false, lots: [] })
	})

	it('--keep <why> --by <a path> --reason <text>, no --overlap-ok → refused (public text) naming --by, nothing published', () => {
		const start = createStartWorkspace()

		expect(
			refusedBy({
				start,
				run: () =>
					started({
						start,
						words: ['--keep', KEEP_REASON, '--by', '/home/person', '--reason', 'a spike'],
					}),
				text: 'lot start: --by holds a path or a link: nothing written',
			}),
		).toEqual({ exitCode: 2, says: true, lots: [] })
	})
})

describe('lot brief of a lot started with a keep', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot brief --from a brief whose keep differs → refused: keep is fixed after the start', () => {
		const start = createStartWorkspace({ brief: briefWith({ keep: KEEP_REASON }) })
		const first = started({ start, words: [] })
		const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
		writeFileSync(from, `${JSON.stringify(briefWith({ keep: 'another reason' }), null, 2)}\n`)

		expect(
			((result: CommandResult) => ({
				started: first.exitCode,
				exitCode: result.exitCode,
				output: result.output.trim(),
			}))(
				runLot({
					cwd: start.workspace.repository,
					argv: ['brief', LOT_NAME, '--from', from, '--by', 'person', '--reason', 'a new keep'],
				}),
			),
		).toEqual({
			started: 0,
			exitCode: 1,
			output:
				"lot brief: keep changed: only the summary, the issue, step titles and behaviours, and each lot's commit message change after the start, nothing written",
		})
	})
})
