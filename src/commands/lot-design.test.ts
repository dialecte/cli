/**
 * `dialecte lot design <id> --from <file> | --from-plan` (DESIGN-GATE section 2): a design recorded by the sha256 of its
 * bytes, a copy kept in the lot folder; a file outside every git work tree, missing or empty refused, nothing written;
 * `--from-plan` records the plan entry's spec only when no other entry of its block names that spec; `lot design <id>`
 * prints the standing. Each case runs on a scratch store lot, from the main checkout.
 */
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { DECLARED_GLOB, DESIGN_TEXT, DESIGN_TIME } from '../../test/design-workspace.constants.ts'
import {
	baseDeclaringLot,
	design,
	designCopiesOf,
	designCopyText,
	designLinesOf,
	designLot,
} from '../../test/design-workspace.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writePlanEntry } from '../lib/store/plan-entry.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DesignLot } from '../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DESIGN_HASH = createHash('sha256').update(DESIGN_TEXT).digest('hex')

/** A plan beside the lot's repository whose entries `E1` (the lot's) and `others` name the spec file `SPEC.md`. */
function lotWithPlan(params: { lot: DesignLot; others: number }): string {
	const folder = temporaryFolder('design-plan-')
	const spec = join(params.lot.cwd, 'plans', 'SPEC.md')
	writeFiles({ root: params.lot.cwd, files: { 'plans/SPEC.md': DESIGN_TEXT } })
	const entries = [
		'E1',
		...Array.from({ length: params.others }, (_, index) => `E${index + 2}`),
	].map((id) => ({
		id,
		title: 'an entry',
		kind: 'lot',
		spec,
		scope: { repo: ['src/'] },
		match: { branch: `feat/${id}` },
	}))
	const block = { schema: 1, repositories: { repo: params.lot.cwd }, lots: entries }
	writeFiles({
		root: folder,
		files: {
			'plan.md': `# The plan\n\n\`\`\`json dialecte-lots\n${JSON.stringify(block)}\n\`\`\`\n`,
		},
	})
	writePlanEntry({
		folder: params.lot.lotFolder,
		entry: { plan: join(folder, 'plan.md'), id: 'E1' },
	})
	return realpathSync(spec)
}

describe('lot design --from - recording', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a file of a git work tree -> exit 0, a recorded line with its hash, and its copy in the lot folder', () => {
		const lot = designLot()

		expect(design({ lot, words: ['--from', lot.designFile] })).toEqual({
			exitCode: 0,
			output: expect.stringContaining(
				`lot design: ${lot.name} recorded ${lot.designFile} (${DESIGN_HASH.slice(0, 12)})\n`,
			),
		})
		expect(designLinesOf(lot)).toEqual([
			{
				schema: 1,
				kind: 'recorded',
				at: DESIGN_TIME.toISOString(),
				file: lot.designFile,
				hash: DESIGN_HASH,
				from: 'file',
			},
		])
		expect(designCopiesOf(lot)).toEqual([`${DESIGN_HASH}.md`])
		expect(designCopyText({ lot, name: `${DESIGN_HASH}.md` })).toBe(DESIGN_TEXT)
	})

	it('a file outside every git work tree -> exit 2, refused, nothing written', () => {
		const lot = designLot()
		const outside = join(temporaryFolder('design-outside-'), 'DESIGN.md')
		writeFiles({ root: join(outside, '..'), files: { 'DESIGN.md': DESIGN_TEXT } })

		expect(design({ lot, words: ['--from', outside] })).toEqual({
			exitCode: 2,
			output: `lot design: ${outside} is in no git work tree: keep the design in a repository, beside its plan; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
		expect(designCopiesOf(lot)).toEqual([])
	})

	it('a missing file -> exit 2, refused, nothing written', () => {
		const lot = designLot()
		const missing = join(lot.cwd, 'plans', 'MISSING.md')

		expect(design({ lot, words: ['--from', missing] })).toEqual({
			exitCode: 2,
			output: `lot design: ${missing} cannot be read; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
	})

	it('an empty file -> exit 2, refused, nothing written', () => {
		const lot = designLot()
		writeFiles({ root: lot.cwd, files: { 'plans/EMPTY.md': '' } })
		const empty = join(lot.designFile, '..', 'EMPTY.md')

		expect(design({ lot, words: ['--from', empty] })).toEqual({
			exitCode: 2,
			output: `lot design: ${empty} is empty; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
	})

	it('a lot no longer at work -> exit 1, refused, nothing written', () => {
		const lot = designLot({ state: 'committed' })

		expect(design({ lot, words: ['--from', lot.designFile] })).toEqual({
			exitCode: 1,
			output: `lot design: ${lot.name} is committed: only a lot at work records a design`,
		})
		expect(designLinesOf(lot)).toEqual([])
	})
})

describe('lot design --from-plan', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the only entry naming its spec -> exit 0, the spec recorded from the plan', () => {
		const lot = designLot()
		const spec = lotWithPlan({ lot, others: 0 })

		expect(design({ lot, words: ['--from-plan'] }).exitCode).toBe(0)
		expect(designLinesOf(lot)).toEqual([
			expect.objectContaining({ kind: 'recorded', file: spec, hash: DESIGN_HASH, from: 'plan' }),
		])
	})

	it('a spec two other entries name -> exit 2, refused, nothing written', () => {
		const lot = designLot()
		const spec = lotWithPlan({ lot, others: 2 })

		expect(design({ lot, words: ['--from-plan'] })).toEqual({
			exitCode: 2,
			output: `lot design: spec ${spec} covers 3 entries: write this lot's design (it may cite the spec), then dialecte lot design ${lot.name} --from <file>; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
	})

	it('a lot carrying out no plan entry -> exit 2, refused, nothing written', () => {
		const lot = designLot()

		expect(design({ lot, words: ['--from-plan'] })).toEqual({
			exitCode: 2,
			output: `lot design: ${lot.name} carries out no plan entry with a spec: dialecte lot design ${lot.name} --from <file>; nothing written`,
		})
	})
})

describe('lot design <id> - the standing', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a light lot with nothing recorded -> exit 0, design not required', () => {
		const lot = designLot()

		expect(design({ lot, words: [] })).toEqual({ exitCode: 0, output: 'design not required' })
	})

	it('a lot reaching a declared area with nothing recorded -> exit 0, missing, the area and the next command named', () => {
		const lot = designLot({ declared: true })

		expect(design({ lot, words: [] })).toEqual({
			exitCode: 0,
			output: [
				`design missing · shared ${DECLARED_GLOB}`,
				`next: dialecte lot design ${lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${lot.name} --approve --by <who>`,
			].join('\n'),
		})
	})

	it('--json -> the standing as JSON, the approver by kind', () => {
		const lot = designLot({ declared: true })

		expect(JSON.parse(design({ lot, words: ['--json'] }).output)).toEqual({
			required: true,
			reasons: [{ kind: 'shared', glob: DECLARED_GLOB, path: 'src' }],
			state: 'missing',
			by: null,
			uncovered: [],
		})
	})

	it('a worktree whose package.json dropped an area its base declares -> the need still names it', () => {
		const lot = designLot()
		baseDeclaringLot(lot)

		expect(JSON.parse(design({ lot, words: ['--json'] }).output)).toMatchObject({
			required: true,
			reasons: [{ kind: 'shared', glob: DECLARED_GLOB, path: 'src' }],
		})
	})
})
