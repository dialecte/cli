/**
 * `dialecte lot keep <id> --by <who> --reason <why> [--json]` and `lot unkeep` (KEEP 3.3): one signed line appended to
 * the lot's `keep.jsonl` and one `keep.changed` event, in every state, damaged included; `lot unkeep` never from the
 * lot's own worktree nor one of its throwaways; every refusal exits 2 and writes nothing; the keep in the JSON of the
 * status a verb prints (`lot answer`, `inbox`).
 */
import { mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { APPROVER } from '../../test/design-workspace.constants.ts'
import { design, designLot } from '../../test/design-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { inboxIn } from '../../test/inbox-workspace.ts'
import {
	KEEP_BY,
	KEEP_REASON,
	OTHER_KEEP_REASON,
	UNKEEP_REASON,
} from '../../test/keep-decision-workspace.constants.ts'
import {
	damageLot,
	keepEventsOf,
	keepLineOf,
	keepTextOf,
	jsonOrText,
	keepVerb,
	keptJsonOf,
	makeKeepFolder,
	signedBy,
	writeKeepDocument,
	writeKeepLine,
} from '../../test/keep-decision-workspace.ts'
import {
	addLotWithoutWorktree,
	addLotWorktree,
	pointIdentityAt,
} from '../../test/lot-keep-workspace.ts'
import { PLAN_ENTRY_ID } from '../../test/review-record-workspace.constants.ts'
import { markLotPlan } from '../../test/review-record-workspace.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { LotKeepState, LotWorktree } from '../../test/lot-keep-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NAME = '0001-repo-kept'

/** The parsed lines of the lot's `keep.jsonl`; none when there is no file. */
function keepLinesOf(lotFolder: string): unknown[] {
	return (keepTextOf(lotFolder) ?? '')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as unknown)
}

/** `lot <verb> <words>` from the main checkout of the workspace. */
function fromMain(params: {
	workspace: BriefWorkspace
	verb: string
	words: string[]
}): CommandResult {
	return keepVerb({ cwd: params.workspace.repository, verb: params.verb, words: params.words })
}

/** What a verb did: its exit, its output, and what it left in the lot folder. */
function outcomeOf(params: { lotFolder: string; run: () => CommandResult }): {
	exitCode: number | 'thrown'
	output: string
	lines: unknown[]
	events: unknown[]
} {
	let result: CommandResult
	try {
		result = params.run()
	} catch (error) {
		return { exitCode: 'thrown', output: String(error), lines: [], events: [] }
	}
	return {
		exitCode: result.exitCode,
		output: result.output,
		lines: keepLinesOf(params.lotFolder),
		events: keepEventsOf(params.lotFolder),
	}
}

type StateRow = { title: string; arrange: (workspace: BriefWorkspace) => string }

/** A lot of the workspace's store in `state`, no worktree. */
function lotIn(state: LotKeepState): StateRow['arrange'] {
	return (workspace) => addLotWithoutWorktree({ workspace, name: NAME, state })
}

const STATE_ROWS: StateRow[] = [
	{ title: 'working', arrange: lotIn('working') },
	{ title: 'ready', arrange: lotIn('ready') },
	{ title: 'failed', arrange: lotIn('failed') },
	{ title: 'canceled', arrange: lotIn('canceled') },
	{ title: 'committed', arrange: lotIn('committed') },
	{
		title: 'simulated',
		arrange: (workspace) =>
			addLotWithoutWorktree({ workspace, name: NAME, state: 'working', simulated: true }),
	},
	{
		title: 'damaged (a transition file that does not hold)',
		arrange: (workspace) => {
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			damageLot({ lotFolder })
			return lotFolder
		},
	},
]

describe('lot keep in every state', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(STATE_ROWS)(
		'a lot $title → exit 0, one keep line signed, one keep.changed event, the kept line printed',
		({ arrange }) => {
			const workspace = createBriefWorkspace()
			const lotFolder = arrange(workspace)

			expect(
				outcomeOf({
					lotFolder,
					run: () => fromMain({ workspace, verb: 'keep', words: [NAME, ...signedBy()] }),
				}),
			).toEqual({
				exitCode: 0,
				output: expect.stringContaining(`${NAME} kept by decision: ${KEEP_REASON}`),
				lines: [keepLineOf()],
				events: [{ op: 'keep', reason: KEEP_REASON, lot: NAME }],
			})
		},
	)
})

describe('lot keep and lot unkeep: what each writes', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot keep with the reason the lot is kept with already → exit 0, kept already, nothing written', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder })

		expect(
			outcomeOf({
				lotFolder,
				run: () => fromMain({ workspace, verb: 'keep', words: [NAME, ...signedBy()] }),
			}),
		).toEqual({
			exitCode: 0,
			output: expect.stringContaining(`${NAME} is kept already: nothing written`),
			lines: [keepLineOf()],
			events: [],
		})
	})

	it('lot keep with another reason → exit 0, a second line: the reason updated, the history kept', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder })

		expect(
			outcomeOf({
				lotFolder,
				run: () =>
					fromMain({
						workspace,
						verb: 'keep',
						words: [NAME, ...signedBy({ reason: OTHER_KEEP_REASON })],
					}),
			}),
		).toEqual({
			exitCode: 0,
			output: expect.stringContaining(`${NAME} kept by decision: ${OTHER_KEEP_REASON}`),
			lines: [keepLineOf(), keepLineOf({ reason: OTHER_KEEP_REASON })],
			events: [{ op: 'keep', reason: OTHER_KEEP_REASON, lot: NAME }],
		})
	})

	it('lot unkeep of a kept committed lot whose worktree is on disk → exit 0, an unkeep line, no longer kept, next lot prune', () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(
			outcomeOf({
				lotFolder: lot.lotFolder,
				run: () =>
					fromMain({
						workspace,
						verb: 'unkeep',
						words: [NAME, ...signedBy({ reason: UNKEEP_REASON })],
					}),
			}),
		).toEqual({
			exitCode: 0,
			output: expect.stringMatching(
				new RegExp(`${NAME} no longer kept[\\s\\S]*next: dialecte lot prune ${NAME}`),
			),
			lines: [keepLineOf(), keepLineOf({ op: 'unkeep', reason: UNKEEP_REASON })],
			events: [{ op: 'unkeep', reason: UNKEEP_REASON, lot: NAME }],
		})
	})

	it('lot unkeep of a kept damaged lot → exit 0, an unkeep line', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		damageLot({ lotFolder })
		writeKeepLine({ lotFolder })

		expect(
			outcomeOf({
				lotFolder,
				run: () =>
					fromMain({
						workspace,
						verb: 'unkeep',
						words: [NAME, ...signedBy({ reason: UNKEEP_REASON })],
					}),
			}),
		).toEqual({
			exitCode: 0,
			output: expect.stringContaining(`${NAME} no longer kept`),
			lines: [keepLineOf(), keepLineOf({ op: 'unkeep', reason: UNKEEP_REASON })],
			events: [{ op: 'unkeep', reason: UNKEEP_REASON, lot: NAME }],
		})
	})

	it('lot unkeep of a lot not kept → exit 0, not kept, nothing written', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })

		expect(
			outcomeOf({
				lotFolder,
				run: () =>
					fromMain({
						workspace,
						verb: 'unkeep',
						words: [NAME, ...signedBy({ reason: UNKEEP_REASON })],
					}),
			}),
		).toEqual({
			exitCode: 0,
			output: expect.stringContaining(`${NAME} is not kept: nothing written`),
			lines: [],
			events: [],
		})
	})

	it('--by Orchestrator → the line signed orchestrator', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })

		expect(
			outcomeOf({
				lotFolder,
				run: () =>
					fromMain({ workspace, verb: 'keep', words: [NAME, ...signedBy({ by: 'Orchestrator' })] }),
			}).lines,
		).toEqual([keepLineOf({ by: 'orchestrator' })])
	})
})

/** The lot's worktree beside which `suffix` names a worktree of its own (`-round-1`, `-verify`), on its own branch. */
function besideLotWorktree(params: { lot: LotWorktree; suffix: string }): string {
	const path = `${params.lot.worktree}${params.suffix}`
	git({
		root: params.lot.worktree,
		args: ['worktree', 'add', '-q', '-b', `${params.lot.branch}${params.suffix}`, path],
	})
	return realpathSync(path)
}

const OWN_PLACES: { title: string; place: (lot: LotWorktree) => string }[] = [
	{ title: "the lot's own worktree", place: (lot) => lot.worktree },
	{
		title: 'its -round-1 throwaway',
		place: (lot) => besideLotWorktree({ lot, suffix: '-round-1' }),
	},
	{ title: 'its -verify worktree', place: (lot) => besideLotWorktree({ lot, suffix: '-verify' }) },
]

describe("lot unkeep never from the lot's own worktree", { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(OWN_PLACES)(
		'lot unkeep run from $title → exit 2, refused, nothing written',
		({ place }) => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
			writeKeepLine({ lotFolder: lot.lotFolder })
			const cwd = place(lot)

			expect(
				outcomeOf({
					lotFolder: lot.lotFolder,
					run: () =>
						keepVerb({
							cwd,
							verb: 'unkeep',
							words: [NAME, ...signedBy({ reason: UNKEEP_REASON })],
						}),
				}),
			).toEqual({
				exitCode: 2,
				output: expect.stringContaining("from the main checkout, not the lot's worktree"),
				lines: [keepLineOf()],
				events: [],
			})
		},
	)

	it("lot unkeep run from its verify worktree, the lot's worktree removed and its identity spelled through a link → exit 2, refused, nothing written", () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder: lot.lotFolder })
		const throwaway = besideLotWorktree({ lot, suffix: '-verify' })
		const link = join(temporaryFolder('dialecte-keep-link-'), 'worktrees')
		symlinkSync(dirname(lot.worktree), link)
		pointIdentityAt({ lotFolder: lot.lotFolder, worktree: join(link, basename(lot.worktree)) })
		git({ root: workspace.repository, args: ['worktree', 'remove', '--force', lot.worktree] })

		expect(
			outcomeOf({
				lotFolder: lot.lotFolder,
				run: () =>
					keepVerb({
						cwd: throwaway,
						verb: 'unkeep',
						words: [NAME, ...signedBy({ reason: UNKEEP_REASON })],
					}),
			}),
		).toEqual({
			exitCode: 2,
			output: expect.stringContaining("from the main checkout, not the lot's worktree"),
			lines: [keepLineOf()],
			events: [],
		})
	})

	it("lot keep run from the lot's own worktree → exit 0, written: it only ever keeps", () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })

		expect(
			outcomeOf({
				lotFolder: lot.lotFolder,
				run: () => keepVerb({ cwd: lot.worktree, verb: 'keep', words: [NAME, ...signedBy()] }),
			}),
		).toEqual({
			exitCode: 0,
			output: expect.stringContaining(`${NAME} kept by decision: ${KEEP_REASON}`),
			lines: [keepLineOf()],
			events: [{ op: 'keep', reason: KEEP_REASON, lot: NAME }],
		})
	})

	it("lot design --approve run from the lot's -verify worktree → exit 2, refused as from its own worktree", () => {
		const lot = designLot()
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		const verify = join(realpathSync(lot.workspace.workspace), '.worktrees', `${lot.name}-verify`)
		git({ root: lot.cwd, args: ['worktree', 'add', '-q', '-b', 'review-verify', verify] })

		expect(design({ lot, words: ['--approve', '--by', APPROVER], cwd: verify })).toEqual({
			exitCode: 2,
			output: "lot design: approve from the main checkout, not the lot's worktree; nothing written",
		})
	})
})

const REFUSED_WORDS: { title: string; verb: string; words: string[]; arrange?: () => void }[] = [
	{ title: 'lot keep without --by', verb: 'keep', words: [NAME, '--reason', KEEP_REASON] },
	{ title: 'lot keep without --reason', verb: 'keep', words: [NAME, '--by', KEEP_BY] },
	{ title: 'lot unkeep without --reason', verb: 'unkeep', words: [NAME, '--by', KEEP_BY] },
	{ title: 'lot keep with a blank --by', verb: 'keep', words: [NAME, ...signedBy({ by: ' ' })] },
	{
		title: 'lot keep with a blank --reason',
		verb: 'keep',
		words: [NAME, ...signedBy({ reason: '' })],
	},
	{
		title: 'lot keep with a --reason of two lines',
		verb: 'keep',
		words: [NAME, ...signedBy({ reason: 'one line\nand another' })],
	},
	{
		title: 'lot keep with a --by of two lines',
		verb: 'keep',
		words: [NAME, ...signedBy({ by: 'person\nother' })],
	},
	{
		title: 'lot keep with a --reason over 200 characters',
		verb: 'keep',
		words: [NAME, ...signedBy({ reason: 'a'.repeat(201) })],
	},
	{
		title: 'lot keep with a forbidden word in --by',
		verb: 'keep',
		words: [NAME, ...signedBy({ by: `${FIRST_WORD} person` })],
		arrange: () => configureMachine({ userFileLines: [FIRST_WORD] }),
	},
	{
		title: 'lot unkeep with a forbidden word in --reason',
		verb: 'unkeep',
		words: [NAME, ...signedBy({ reason: `${FIRST_WORD} is done` })],
		arrange: () => configureMachine({ userFileLines: [FIRST_WORD] }),
	},
]

describe('lot keep and lot unkeep: the signature refused', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(REFUSED_WORDS)(
		'$title → exit 2, its own refusal (not the whole lot usage), nothing written',
		({ verb, words, arrange }) => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			writeKeepLine({ lotFolder })
			arrange?.()

			expect(
				((outcome) => ({
					...outcome,
					output: {
						namesVerb: outcome.output.includes('keep'),
						wholeUsage: outcome.output.includes('start <brief.json>'),
					},
				}))(outcomeOf({ lotFolder, run: () => fromMain({ workspace, verb, words }) })),
			).toEqual({
				exitCode: 2,
				output: { namesVerb: true, wholeUsage: false },
				lines: [keepLineOf()],
				events: [],
			})
		},
	)

	it('a forbidden word in --by → the forbidden-word refusal naming --by', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(
			outcomeOf({
				lotFolder,
				run: () =>
					fromMain({
						workspace,
						verb: 'keep',
						words: [NAME, ...signedBy({ by: `${FIRST_WORD} x` })],
					}),
			}),
		).toEqual({
			exitCode: 2,
			output: expect.stringContaining('lot keep: --by holds a forbidden word: nothing written'),
			lines: [],
			events: [],
		})
	})

	const PUBLIC_TEXT: { title: string; words: string[]; option: string }[] = [
		{ title: '--by holding a path', words: signedBy({ by: '/home/person' }), option: '--by' },
		{
			title: '--reason holding a link',
			words: signedBy({ reason: 'see https://host.test/audit' }),
			option: '--reason',
		},
		{
			title: '--reason holding a path',
			words: signedBy({ reason: 'rerun src/lib/store/audit.ts later' }),
			option: '--reason',
		},
	]

	it.each(PUBLIC_TEXT)(
		'$title → exit 2, the public-text refusal naming its option, nothing written',
		({ words, option }) => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })

			expect(
				outcomeOf({
					lotFolder,
					run: () => fromMain({ workspace, verb: 'keep', words: [NAME, ...words] }),
				}),
			).toEqual({
				exitCode: 2,
				output: expect.stringContaining(
					`lot keep: ${option} holds a path or a link: nothing written`,
				),
				lines: [],
				events: [],
			})
		},
	)

	it("--reason holding the lot's plan entry id → exit 2, the public-text refusal naming --reason, nothing written", () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		markLotPlan({ cwd: workspace.repository, lotFolder })

		expect(
			outcomeOf({
				lotFolder,
				run: () =>
					fromMain({
						workspace,
						verb: 'keep',
						words: [NAME, ...signedBy({ reason: `rerun ${PLAN_ENTRY_ID} later` })],
					}),
			}),
		).toEqual({
			exitCode: 2,
			output: expect.stringContaining('lot keep: --reason holds a plan entry id: nothing written'),
			lines: [],
			events: [],
		})
	})
})

describe('lot keep and lot unkeep: the lot refused', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an unknown id → exit 2 naming it, nothing written', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })

		expect(
			((outcome) => ({ ...outcome, output: outcome.output.includes('0099') }))(
				outcomeOf({
					lotFolder,
					run: () => fromMain({ workspace, verb: 'keep', words: ['0099', ...signedBy()] }),
				}),
			),
		).toEqual({ exitCode: 2, output: true, lines: [], events: [] })
	})

	it('an index two lots share → exit 2 listing them, nothing written', () => {
		const workspace = createBriefWorkspace()
		const first = addLotWithoutWorktree({ workspace, name: '0001-repo-a', state: 'committed' })
		const second = addLotWithoutWorktree({ workspace, name: '0001-repo-b', state: 'committed' })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				lists: ['0001-repo-a', '0001-repo-b'].map((name) => result.output.includes(name)),
				written: [keepTextOf(first), keepTextOf(second)],
			}))(fromMain({ workspace, verb: 'keep', words: ['0001', ...signedBy()] })),
		).toEqual({ exitCode: 2, lists: [true, true], written: [undefined, undefined] })
	})

	it.each(['keep', 'unkeep'])(
		'lot %s of a lot whose keep.jsonl holds a line that does not read → exit 2 naming the file, the file unchanged',
		(verb) => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			const text = `${JSON.stringify(keepLineOf())}\n{"schema":1,\n`
			writeKeepDocument({ lotFolder, text })

			expect(
				((result: CommandResult) => ({
					exitCode: result.exitCode,
					namesFile: result.output.includes('keep.jsonl'),
					text: keepTextOf(lotFolder),
					events: keepEventsOf(lotFolder),
				}))(
					fromMain({ workspace, verb, words: [NAME, ...signedBy({ reason: OTHER_KEEP_REASON })] }),
				),
			).toEqual({ exitCode: 2, namesFile: true, text, events: [] })
		},
	)

	it.each(['keep', 'unkeep'])(
		'lot %s of a lot whose keep.jsonl is a folder (EISDIR) → exit 2 naming the file, no throw, nothing written',
		(verb) => {
			const workspace = createBriefWorkspace()
			const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
			makeKeepFolder({ lotFolder })

			expect(
				((run: () => CommandResult) => {
					try {
						const result = run()
						return {
							exitCode: result.exitCode,
							namesFile: result.output.includes('keep.jsonl'),
							events: keepEventsOf(lotFolder),
						}
					} catch (error) {
						return { thrown: String(error) }
					}
				})(() => fromMain({ workspace, verb, words: [NAME, ...signedBy()] })),
			).toEqual({ exitCode: 2, namesFile: true, events: [] })
		},
	)
})

describe('lot keep: an event that cannot be written', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('events.jsonl a folder → exit 0, the keep line written, one line naming the event failure', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		const events = join(lotFolder, 'events.jsonl')
		rmSync(events, { force: true })
		mkdirSync(events)

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				failure: result.output
					.split('\n')
					.filter((line) => /the event could not be written in .+events\.jsonl/.test(line)).length,
				lines: keepLinesOf(lotFolder),
			}))(fromMain({ workspace, verb: 'keep', words: [NAME, ...signedBy()] })),
		).toEqual({ exitCode: 0, failure: 1, lines: [keepLineOf()] })
	})
})

describe('lot keep and lot unkeep --json', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot keep --json → { lot, kept, written, next }', () => {
		const workspace = createBriefWorkspace()
		addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })

		expect(
			((result: CommandResult) => {
				const { next, ...json } = jsonOrText(result.output) as Record<string, unknown>
				return {
					exitCode: result.exitCode,
					json,
					next: next === null ? 'null' : typeof next,
				}
			})(fromMain({ workspace, verb: 'keep', words: [NAME, ...signedBy(), '--json'] })),
		).toEqual({
			exitCode: 0,
			json: { lot: NAME, kept: keptJsonOf(), written: true },
			next: expect.stringMatching(/^(null|string)$/),
		})
	})

	it('lot unkeep --json of a kept committed lot whose worktree is on disk → kept null, written, next lot prune', () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				json: jsonOrText(result.output),
			}))(
				fromMain({
					workspace,
					verb: 'unkeep',
					words: [NAME, ...signedBy({ reason: UNKEEP_REASON }), '--json'],
				}),
			),
		).toEqual({
			exitCode: 0,
			json: { lot: NAME, kept: null, written: true, next: `dialecte lot prune ${NAME}` },
		})
	})

	it('lot keep --json with the reason kept already → written false', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder })

		expect(
			((result: CommandResult) => jsonOrText(result.output))(
				fromMain({ workspace, verb: 'keep', words: [NAME, ...signedBy(), '--json'] }),
			),
		).toEqual(expect.objectContaining({ lot: NAME, kept: keptJsonOf(), written: false }))
	})
})

describe('the keep in the status other verbs print', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot answer --json on a kept lot input-required → its kept field', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'input-required' })
		writeKeepLine({ lotFolder })

		expect(
			((result: CommandResult) => (JSON.parse(result.output) as { kept?: unknown }).kept)(
				fromMain({ workspace, verb: 'answer', words: [NAME, 'q1', 'fix', '--json'] }),
			),
		).toEqual(keptJsonOf())
	})

	it('inbox --json with a kept lot input-required → its status carries kept', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = addLotWithoutWorktree({ workspace, name: NAME, state: 'input-required' })
		writeKeepLine({ lotFolder })

		expect(
			((result: CommandResult) =>
				(JSON.parse(result.output) as { waiting: { lot: string; kept?: unknown }[] }).waiting.map(
					(status) => ({ lot: status.lot, kept: status.kept }),
				))(inboxIn({ cwd: workspace.repository, words: ['--json'] })),
		).toEqual([{ lot: NAME, kept: keptJsonOf() }])
	})
})
