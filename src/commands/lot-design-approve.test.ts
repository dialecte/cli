/**
 * `dialecte lot design <id> --approve --by <who> [--reason <text>] [--verdict <file>]...` and `--waive --by <who> --reason <text>`
 * (DESIGN-GATE section 2): an approval of the last recorded content, or a waiver, appended with the need it was given
 * against; never from the lot's own worktree; an approval refused when the source changed since recorded, accepted when
 * it is gone (the copy rules); a waiver refused on a lot that needs no design; `--by` checked as every lot verb's.
 */
import { createHash } from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import {
	APPROVER,
	DECLARED_GLOB,
	DESIGN_TEXT,
	DESIGN_TIME,
	EDITED_DESIGN_TEXT,
	NOT_READY_VERDICT_LINE,
	REVIEW_NAME,
	WAIVER_REASON,
} from '../../test/design-workspace.constants.ts'
import {
	design,
	designLinesOf,
	designLot,
	saveReadyVerdict,
	saveVerdict,
} from '../../test/design-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { linkLot } from '../../test/lot-stores.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { designGateOf } from '../lib/design/design-gate.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DesignLot } from '../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DESIGN_HASH = createHash('sha256').update(DESIGN_TEXT).digest('hex')
const EDITED_HASH = createHash('sha256').update(EDITED_DESIGN_TEXT).digest('hex')
const SHARED_NEED = [{ kind: 'shared', glob: DECLARED_GLOB, path: 'src' }]

/** A lot of the given kind whose design is recorded; a READY review beside it unless `reviewed` is false. */
function recordedLot(params: { declared?: boolean; reviewed?: boolean } = {}): DesignLot {
	const lot = designLot({ declared: params.declared })
	expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
	if (params.reviewed !== false) saveReadyVerdict({ designFile: lot.designFile })
	return lot
}

/** The sha256 of a file's bytes. */
function hashOfFile(file: string): string {
	return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** The refusal of an approval no saved review names. */
function missingLine(params: { lot: DesignLot; hash: string }): string {
	const short = params.hash.slice(0, 12)
	return `lot design: no saved verdict names design ${short} of ${params.lot.name} in ${dirname(params.lot.designFile)}: save the review there with the lines "Design: ${short}" and "Verdict: READY", or name it with --verdict <file>, or waive: dialecte lot design ${params.lot.name} --waive --by <who> --reason <text>; nothing written`
}

/** The text of the lot folder's copy of the review whose bytes hash to `hash`; undefined when there is none. */
function copyText(params: { lot: DesignLot; hash: string }): string | undefined {
	const copy = join(params.lot.lotFolder, STORE_FILES.designReviews, `${params.hash}.md`)
	return existsSync(copy) ? readFileSync(copy, 'utf8') : undefined
}

/** Whether the lot folder holds any review copy: a refusal writes none. */
function hasReviewCopies(lot: DesignLot): boolean {
	return existsSync(join(lot.lotFolder, STORE_FILES.designReviews))
}

describe('lot design --approve', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('from the main checkout -> exit 0, an approved line of the recorded hash with the need', () => {
		const lot = recordedLot({ declared: true })

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--reason', 'read it'] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				`lot design: ${lot.name} approved by ${APPROVER} (${DESIGN_HASH.slice(0, 12)})\n`,
			),
		})
		expect(designLinesOf(lot).at(-1)).toEqual({
			schema: 1,
			kind: 'approved',
			at: DESIGN_TIME.toISOString(),
			by: APPROVER,
			reason: 'read it',
			hash: DESIGN_HASH,
			need: SHARED_NEED,
			reviews: [
				{ name: REVIEW_NAME, hash: hashOfFile(join(dirname(lot.designFile), REVIEW_NAME)) },
			],
		})
	})

	it('--by orchestrator in another casing -> recorded as orchestrator', () => {
		const lot = recordedLot()

		expect(design({ lot, words: ['--approve', '--by', 'Orchestrator'] }).exitCode).toBe(0)
		expect(designLinesOf(lot).at(-1)).toEqual(expect.objectContaining({ by: 'orchestrator' }))
	})

	it("from the lot's own worktree -> exit 2, refused, nothing written", () => {
		const lot = recordedLot()
		linkLot({ worktree: lot.cwd, lotFolder: lot.lotFolder })

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: "lot design: approve from the main checkout, not the lot's worktree; nothing written",
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('the source changed since recorded -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()
		writeFileSync(lot.designFile, EDITED_DESIGN_TEXT)

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: `lot design: ${lot.designFile} changed since recorded: dialecte lot design ${lot.name} --from ${lot.designFile} records it again; nothing written`,
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('the source gone -> exit 0, the stored copy approved', () => {
		const lot = recordedLot()
		rmSync(lot.designFile)

		expect(design({ lot, words: ['--approve', '--by', APPROVER] }).exitCode).toBe(0)
		expect(designLinesOf(lot).at(-1)).toEqual(
			expect.objectContaining({ kind: 'approved', hash: DESIGN_HASH }),
		)
	})

	it('the source gone and its copy too -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()
		rmSync(lot.designFile)
		rmSync(join(lot.lotFolder, STORE_FILES.designCopies), { recursive: true })

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: `lot design: ${lot.designFile} is gone and so is its copy in the lot folder: dialecte lot design ${lot.name} --from <file> records it again; nothing written`,
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('from a review throwaway of the lot -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()
		const throwaway = join(
			realpathSync(lot.workspace.workspace),
			'.worktrees',
			`${lot.name}-round-1`,
		)
		git({ root: lot.cwd, args: ['worktree', 'add', '-q', '-b', 'review-round-1', throwaway] })

		expect(design({ lot, words: ['--approve', '--by', APPROVER], cwd: throwaway })).toEqual({
			exitCode: 2,
			output: "lot design: approve from the main checkout, not the lot's worktree; nothing written",
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('nothing recorded -> exit 2, refused, the recording named', () => {
		const lot = designLot({ declared: true })

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: `lot design: ${lot.name} has no design recorded: dialecte lot design ${lot.name} --from <file> records it; nothing written`,
		})
	})
})

describe('lot design --approve - the saved reviews', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a READY review beside the design -> its copy kept in the lot folder, as read', () => {
		const lot = recordedLot()
		const review = join(dirname(lot.designFile), REVIEW_NAME)
		const text = readFileSync(review, 'utf8')

		expect(design({ lot, words: ['--approve', '--by', APPROVER] }).exitCode).toBe(0)
		expect(copyText({ lot, hash: hashOfFile(review) })).toBe(text)
	})

	it('no saved review -> exit 2, the folder, the hash, how to save it and the waiver named, nothing written', () => {
		const lot = recordedLot({ reviewed: false })

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: missingLine({ lot, hash: DESIGN_HASH }),
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('a READY review of the previous revision only -> exit 2, the review of the new one asked, the old one named', () => {
		const lot = recordedLot()
		writeFileSync(lot.designFile, EDITED_DESIGN_TEXT)
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: [
				missingLine({ lot, hash: EDITED_HASH }),
				`! ${REVIEW_NAME} is READY for ${DESIGN_HASH.slice(0, 12)}, recorded before: the design changed since, so a review of ${EDITED_HASH.slice(0, 12)} is needed`,
			].join('\n'),
		})
		expect(designLinesOf(lot)).toHaveLength(2)
	})

	it('a review naming the hash without a Verdict line -> exit 2, a hint naming it', () => {
		const lot = recordedLot({ reviewed: false })
		writeFileSync(
			join(dirname(lot.designFile), 'notes.md'),
			`Design: ${DESIGN_HASH.slice(0, 12)}\n\n## Verdict\n\nREADY\n`,
		)

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: [
				missingLine({ lot, hash: DESIGN_HASH }),
				`! notes.md names design ${DESIGN_HASH.slice(0, 12)} but holds no Verdict: line`,
			].join('\n'),
		})
	})

	it('a READY and a NOT READY review of the same hash -> exit 2, the NOT READY one named', () => {
		const lot = recordedLot()
		saveVerdict({
			designFile: lot.designFile,
			name: 'critic-2.md',
			verdict: NOT_READY_VERDICT_LINE,
		})

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: `lot design: critic-2.md says NOT READY for design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}: record a new revision, or waive; nothing written`,
		})
		expect(designLinesOf(lot)).toHaveLength(1)
		expect(hasReviewCopies(lot)).toBe(false)
	})

	it('a review file named with --verdict that the scan reads too -> counted once', () => {
		const lot = recordedLot()
		const review = join(dirname(lot.designFile), REVIEW_NAME)

		expect(
			design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', review] }).exitCode,
		).toBe(0)
		expect(designLinesOf(lot).at(-1)).toEqual(
			expect.objectContaining({ reviews: [{ name: REVIEW_NAME, hash: hashOfFile(review) }] }),
		)
	})

	it('the same review named twice -> counted once', () => {
		const lot = recordedLot({ reviewed: false })
		const named = saveVerdict({ designFile: lot.designFile, folder: lot.reviewFolder })

		expect(
			design({
				lot,
				words: ['--approve', '--by', APPROVER, '--verdict', named, '--verdict', named],
			}).exitCode,
		).toBe(0)
		expect(designLinesOf(lot).at(-1)).toEqual(
			expect.objectContaining({ reviews: [{ name: REVIEW_NAME, hash: hashOfFile(named) }] }),
		)
	})

	it("a link in the design's folder to a review beside it -> the review counted once", () => {
		const lot = recordedLot()
		const second = saveVerdict({ designFile: lot.designFile, name: 'critic-2.md' })
		symlinkSync(second, join(dirname(lot.designFile), 'latest.md'))

		expect(design({ lot, words: ['--approve', '--by', APPROVER] }).exitCode).toBe(0)
		expect(designLinesOf(lot).at(-1)).toEqual(
			expect.objectContaining({
				reviews: [
					{ name: REVIEW_NAME, hash: hashOfFile(join(dirname(lot.designFile), REVIEW_NAME)) },
					{ name: 'critic-2.md', hash: hashOfFile(second) },
				],
			}),
		)
	})

	it('a named review without a Verdict line and no READY review -> its refusal and the missing line, no hint for it', () => {
		const lot = recordedLot({ reviewed: false })
		const named = join(lot.reviewFolder, 'notes.md')
		writeFileSync(named, `Design: ${DESIGN_HASH.slice(0, 12)}\n`)

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
			exitCode: 2,
			output: [
				`lot design: ${named} names design ${DESIGN_HASH.slice(0, 12)} but holds no Verdict: line; nothing written`,
				missingLine({ lot, hash: DESIGN_HASH }),
			].join('\n'),
		})
	})

	it("a review in the design's folder named with --verdict, without a Verdict line -> its refusal once, no hint for it", () => {
		const lot = recordedLot({ reviewed: false })
		const named = join(dirname(lot.designFile), 'notes.md')
		writeFileSync(named, `Design: ${DESIGN_HASH.slice(0, 12)}\n`)

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
			exitCode: 2,
			output: [
				`lot design: ${named} names design ${DESIGN_HASH.slice(0, 12)} but holds no Verdict: line; nothing written`,
				missingLine({ lot, hash: DESIGN_HASH }),
			].join('\n'),
		})
	})

	it("the design's folder gone and the named review refused -> its refusal and the folder named gone", () => {
		const lot = recordedLot()
		const folder = dirname(lot.designFile)
		rmSync(folder, { recursive: true })
		const missing = join(lot.reviewFolder, 'none.md')

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', missing] })).toEqual({
			exitCode: 2,
			output: [
				`lot design: review ${missing} cannot be read; nothing written`,
				`lot design: ${folder} is gone: name the review with --verdict <file>, or waive; nothing written`,
			].join('\n'),
		})
	})

	it("--verdict naming another lot's READY review -> exit 2, it names no design of this lot", () => {
		const lot = recordedLot()
		const otherDesign = join(lot.reviewFolder, 'DESIGN.md')
		writeFileSync(otherDesign, '# Another lot\n\nIts own design.\n')
		const named = saveVerdict({ designFile: otherDesign, folder: lot.reviewFolder })

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
			exitCode: 2,
			output: `lot design: ${named} names no design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}; nothing written`,
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('a review of the hash whose Verdict lines disagree -> exit 2, its own line', () => {
		const lot = recordedLot()
		saveVerdict({
			designFile: lot.designFile,
			name: 'critic-2.md',
			verdict: `${NOT_READY_VERDICT_LINE}\n\n    Verdict: READY`,
		})

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: `lot design: critic-2.md holds Verdict: lines that disagree for design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}: a changed verdict goes in a new review file; nothing written`,
		})
	})

	it('a review of the hash that leaves a code fence open -> exit 2, its own line', () => {
		const lot = recordedLot()
		saveVerdict({
			designFile: lot.designFile,
			name: 'critic-2.md',
			verdict: 'Verdict: READY\n\n```\nsample',
		})

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: `lot design: critic-2.md leaves a code fence open, so its verdict is not read, for design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}: close the fence; nothing written`,
		})
	})

	it('two reviews of the hash that do not pass it -> exit 2, both named, in the order of their names', () => {
		const lot = recordedLot()
		saveVerdict({
			designFile: lot.designFile,
			name: 'critic-2.md',
			verdict: NOT_READY_VERDICT_LINE,
		})
		saveVerdict({
			designFile: lot.designFile,
			name: 'critic-3.md',
			verdict: 'Verdict: READY WITH FIXES',
		})
		const short = DESIGN_HASH.slice(0, 12)

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: [
				`lot design: critic-2.md says NOT READY for design ${short} of ${lot.name}: record a new revision, or waive; nothing written`,
				`lot design: critic-3.md says READY WITH FIXES for design ${short} of ${lot.name}: record a new revision, or waive; nothing written`,
			].join('\n'),
		})
	})

	it('a named review refused and a review in the folder that does not pass -> exit 2, both named, the named one first', () => {
		const lot = recordedLot()
		saveVerdict({
			designFile: lot.designFile,
			name: 'critic-2.md',
			verdict: NOT_READY_VERDICT_LINE,
		})
		const missing = join(lot.reviewFolder, 'none.md')

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', missing] })).toEqual({
			exitCode: 2,
			output: [
				`lot design: review ${missing} cannot be read; nothing written`,
				`lot design: critic-2.md says NOT READY for design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}: record a new revision, or waive; nothing written`,
			].join('\n'),
		})
	})

	it('more READY reviews than one approval line holds -> exit 2, refused before any copy, nothing written', () => {
		const lot = recordedLot({ reviewed: false })
		for (let index = 0; index < 60; index += 1)
			saveVerdict({
				designFile: lot.designFile,
				name: `review-${String(index).padStart(2, '0')}-${'x'.repeat(30)}.md`,
			})

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: 'lot design: 60 reviews do not fit one approval line; nothing written',
		})
		expect(designLinesOf(lot)).toHaveLength(1)
		expect(hasReviewCopies(lot)).toBe(false)
	})

	it("the shared temporary folders reach the approval: a review under one is skipped in the design's folder", () => {
		const lot = recordedLot()

		expect(
			design({
				lot,
				words: ['--approve', '--by', APPROVER],
				sharedTemporaryRoots: [lot.cwd],
			}),
		).toEqual({ exitCode: 2, output: missingLine({ lot, hash: DESIGN_HASH }) })
	})

	it('the shared temporary folders reach the approval: a review named under one is refused', () => {
		const lot = recordedLot()
		const named = saveVerdict({ designFile: lot.designFile, folder: lot.reviewFolder })

		expect(
			design({
				lot,
				words: ['--approve', '--by', APPROVER, '--verdict', named],
				sharedTemporaryRoots: [lot.reviewFolder],
			}),
		).toEqual({
			exitCode: 2,
			output: `lot design: review ${named} is in a temporary or scratch folder, which is wiped: keep it beside the design; nothing written`,
		})
	})

	it('--verdict READY outside the folder and a NOT READY of the hash in it -> exit 2, the folder still read', () => {
		const lot = recordedLot({ reviewed: false })
		const named = saveVerdict({ designFile: lot.designFile, folder: lot.reviewFolder })
		saveVerdict({
			designFile: lot.designFile,
			name: 'critic-2.md',
			verdict: NOT_READY_VERDICT_LINE,
		})

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
			exitCode: 2,
			output: `lot design: critic-2.md says NOT READY for design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}: record a new revision, or waive; nothing written`,
		})
		expect(designLinesOf(lot)).toHaveLength(1)
		expect(hasReviewCopies(lot)).toBe(false)
	})

	it('--verdict READY outside the folder, nothing of the hash in it -> exit 0, the review recorded', () => {
		const lot = recordedLot({ reviewed: false })
		const named = saveVerdict({
			designFile: lot.designFile,
			folder: lot.reviewFolder,
			name: 'review.md',
		})

		expect(
			design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] }).exitCode,
		).toBe(0)
		expect(designLinesOf(lot).at(-1)).toEqual(
			expect.objectContaining({
				kind: 'approved',
				reviews: [{ name: 'review.md', hash: hashOfFile(named) }],
			}),
		)
	})

	it('two --verdict files, one READY and one NOT READY of the hash -> exit 2, the NOT READY one named', () => {
		const lot = recordedLot({ reviewed: false })
		const folder = lot.reviewFolder
		const ready = saveVerdict({ designFile: lot.designFile, folder, name: 'ready.md' })
		const notReady = saveVerdict({
			designFile: lot.designFile,
			folder,
			name: 'not-ready.md',
			verdict: NOT_READY_VERDICT_LINE,
		})

		expect(
			design({
				lot,
				words: ['--approve', '--by', APPROVER, '--verdict', ready, '--verdict', notReady],
			}),
		).toEqual({
			exitCode: 2,
			output: `lot design: not-ready.md says NOT READY for design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}: record a new revision, or waive; nothing written`,
		})
	})

	it('--verdict in the scratch root -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()
		const scratch = join(lot.isolated.scratch, 'reviews')
		mkdirSync(scratch, { recursive: true })
		const named = saveVerdict({ designFile: lot.designFile, folder: scratch })

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
			exitCode: 2,
			output: `lot design: review ${named} is in a temporary or scratch folder, which is wiped: keep it beside the design; nothing written`,
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('--verdict naming another hash -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()
		const named = saveVerdict({
			designFile: lot.designFile,
			folder: lot.reviewFolder,
			hash: EDITED_HASH,
		})

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
			exitCode: 2,
			output: `lot design: ${named} names no design ${DESIGN_HASH.slice(0, 12)} of ${lot.name}; nothing written`,
		})
	})

	it('--verdict naming the hash without a Verdict line -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()
		const named = join(lot.reviewFolder, 'notes.md')
		writeFileSync(named, `Design: ${DESIGN_HASH.slice(0, 12)}\n`)

		expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
			exitCode: 2,
			output: `lot design: ${named} names design ${DESIGN_HASH.slice(0, 12)} but holds no Verdict: line; nothing written`,
		})
	})

	it("the design's folder gone, its copy kept, no --verdict -> exit 2, --verdict named", () => {
		const lot = recordedLot()
		const folder = dirname(lot.designFile)
		rmSync(folder, { recursive: true })

		expect(design({ lot, words: ['--approve', '--by', APPROVER] })).toEqual({
			exitCode: 2,
			output: `lot design: ${folder} is gone: name the review with --verdict <file>, or waive; nothing written`,
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it("the design's folder gone, its copy kept, --verdict READY of the hash -> exit 0", () => {
		const lot = recordedLot({ reviewed: false })
		const named = saveVerdict({ designFile: lot.designFile, folder: lot.reviewFolder })
		rmSync(dirname(lot.designFile), { recursive: true })

		expect(
			design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] }).exitCode,
		).toBe(0)
	})

	it('--verdict without --approve -> exit 2, usage, nothing written', () => {
		const lot = recordedLot()
		const named = join(dirname(lot.designFile), REVIEW_NAME)

		const result = design({ lot, words: ['--verdict', named] })
		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('design <id> [--from <file>')
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('the review edited after the approval -> still approved, the copy holds what was read', () => {
		const lot = recordedLot()
		const review = join(dirname(lot.designFile), REVIEW_NAME)
		const read = readFileSync(review, 'utf8')
		const readHash = hashOfFile(review)
		expect(design({ lot, words: ['--approve', '--by', APPROVER] }).exitCode).toBe(0)
		saveVerdict({ designFile: lot.designFile, verdict: NOT_READY_VERDICT_LINE })

		const shown = design({ lot, words: [] }).output
		expect(shown).toContain('design approved by person')
		expect(shown).not.toMatch(/^verdict/m)
		expect(copyText({ lot, hash: readHash })).toBe(read)
	})
})

type NamedRefusalCase = { name: string; write: (file: string) => void; line: string }

const namedRefusalCases: NamedRefusalCase[] = [
	{
		name: 'a named review that does not exist -> exit 2, refused, nothing written',
		write: function writeNothing() {},
		line: 'cannot be read',
	},
	{
		name: 'a named review that is empty -> exit 2, refused, nothing written',
		write: function writeEmpty(file) {
			writeFileSync(file, '')
		},
		line: 'is empty',
	},
	{
		name: 'a named review that is not UTF-8 -> exit 2, refused, nothing written',
		write: function writeBytes(file) {
			writeFileSync(file, Buffer.from([0xff, 0xfe, 0xfd]))
		},
		line: 'is not UTF-8 text',
	},
]

describe(
	'lot design --approve --verdict - a named review refused',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each(namedRefusalCases)('$name', ({ write, line }) => {
			const lot = recordedLot()
			const named = join(lot.reviewFolder, 'review.md')
			write(named)

			expect(design({ lot, words: ['--approve', '--by', APPROVER, '--verdict', named] })).toEqual({
				exitCode: 2,
				output: `lot design: review ${named} ${line}; nothing written`,
			})
			expect(designLinesOf(lot)).toHaveLength(1)
		})
	},
)

describe('lot design --waive', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a design recorded on a lot that needs none -> exit 0, waived, the lot goes on', () => {
		const lot = recordedLot({ reviewed: false })

		expect(
			design({ lot, words: ['--waive', '--by', APPROVER, '--reason', WAIVER_REASON] }).exitCode,
		).toBe(0)
		const shown = design({ lot, words: [] }).output
		expect(shown).toMatch(/^design waived by person/)
		expect(shown).not.toMatch(/^verdict/m)
		const base = git({ root: lot.cwd, args: ['rev-parse', 'HEAD'] }).trim()
		expect(
			designGateOf({ lotFolder: lot.lotFolder, root: lot.cwd, base, touched: [], verb: 'tddRed' })
				.refusal,
		).toBeUndefined()
	})

	it('a lot that needs a design -> exit 0, a waived line with the need', () => {
		const lot = designLot({ declared: true })

		expect(
			design({ lot, words: ['--waive', '--by', APPROVER, '--reason', WAIVER_REASON] }),
		).toEqual({
			exitCode: 0,
			output: expect.stringContaining(`lot design: ${lot.name} waived by ${APPROVER}\n`),
		})
		expect(designLinesOf(lot)).toEqual([
			{
				schema: 1,
				kind: 'waived',
				at: DESIGN_TIME.toISOString(),
				by: APPROVER,
				reason: WAIVER_REASON,
				need: SHARED_NEED,
			},
		])
	})

	it('a lot that needs no design -> exit 2, refused, nothing written', () => {
		const lot = designLot()

		expect(
			design({ lot, words: ['--waive', '--by', APPROVER, '--reason', WAIVER_REASON] }),
		).toEqual({
			exitCode: 2,
			output: `lot design: ${lot.name} needs no design: nothing to waive; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
	})

	it("from the lot's own worktree -> exit 2, refused, nothing written", () => {
		const lot = designLot({ declared: true })
		linkLot({ worktree: lot.cwd, lotFolder: lot.lotFolder })

		expect(
			design({ lot, words: ['--waive', '--by', APPROVER, '--reason', WAIVER_REASON] }),
		).toEqual({
			exitCode: 2,
			output: "lot design: waive from the main checkout, not the lot's worktree; nothing written",
		})
		expect(designLinesOf(lot)).toEqual([])
	})
})

describe('lot design --by checks', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--by holding a word of the forbidden list -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()
		configureMachine({ userFileLines: [FIRST_WORD] })

		expect(design({ lot, words: ['--approve', '--by', FIRST_WORD] })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot design: --by /),
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('--by holding a path -> exit 2, refused, nothing written', () => {
		const lot = recordedLot()

		expect(design({ lot, words: ['--approve', '--by', '/home/someone'] })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot design: --by /),
		})
		expect(designLinesOf(lot)).toHaveLength(1)
	})

	it('--waive without --reason -> exit 2, usage, nothing written', () => {
		const lot = designLot({ declared: true })

		expect(design({ lot, words: ['--waive', '--by', APPROVER] }).exitCode).toBe(2)
		expect(designLinesOf(lot)).toEqual([])
	})
})
