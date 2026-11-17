/**
 * `dialecte lot design <id> --approve --by <who> [--reason <text>]` and `--waive --by <who> --reason <text>`
 * (DESIGN-GATE section 2): an approval of the last recorded content, or a waiver, appended with the need it was given
 * against; never from the lot's own worktree; an approval refused when the source changed since recorded, accepted when
 * it is gone (the copy rules); a waiver refused on a lot that needs no design; `--by` checked as every lot verb's.
 */
import { createHash } from 'node:crypto'
import { realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	APPROVER,
	DECLARED_GLOB,
	DESIGN_TEXT,
	DESIGN_TIME,
	EDITED_DESIGN_TEXT,
	WAIVER_REASON,
} from '../../test/design-workspace.constants.ts'
import { design, designLinesOf, designLot } from '../../test/design-workspace.ts'
import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import { linkLot } from '../../test/lot-stores.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DesignLot } from '../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DESIGN_HASH = createHash('sha256').update(DESIGN_TEXT).digest('hex')
const SHARED_NEED = [{ kind: 'shared', glob: DECLARED_GLOB, path: 'src' }]

/** A lot of the given kind whose design is recorded. */
function recordedLot(params: { declared?: boolean } = {}): DesignLot {
	const lot = designLot(params)
	expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
	return lot
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

describe('lot design --waive', { timeout: STORE_CASE_TIMEOUT }, () => {
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
