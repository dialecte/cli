/**
 * `dialecte lot design <id> --from <file> | --from-plan` (DESIGN-GATE section 2): a design recorded by the sha256 of its
 * bytes, a copy kept in the lot folder; a file in a temporary or scratch folder, missing or empty refused, nothing
 * written, a file outside every git work tree recorded (plans live there);
 * `--from-plan` records the plan entry's spec only when no other entry of its block names that spec; `lot design <id>`
 * prints the standing. Each case runs on a scratch store lot, from the main checkout.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
	DECLARED_GLOB,
	DESIGN_PATH,
	DESIGN_TEXT,
	DESIGN_TIME,
	EDITED_DESIGN_TEXT,
} from '../../test/design-workspace.constants.ts'
import {
	baseDeclaringLot,
	declaringManifest,
	design,
	designCopiesOf,
	designCopyText,
	designLinesOf,
	designLot,
	landingLot,
	saveReadyVerdict,
	saveVerdict,
} from '../../test/design-workspace.ts'
import { landOnOrigin } from '../../test/land-lot.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writePlanEntry } from '../lib/store/plan-entry.ts'
import { SYSTEM_TEMPORARY_ROOTS } from './lot-design.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { DesignLot } from '../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DESIGN_HASH = createHash('sha256').update(DESIGN_TEXT).digest('hex')

/** The note of a lot whose worktree is gone: the cases' lots never make theirs (the records' fixed base). */
const RECORDED_BASE_LINE =
	'! the worktree is gone: the shared areas are read at the base recorded at the start, aaaaaaaaaaaa'

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

	it('a file in the temporary folder -> exit 2, refused, nothing written', () => {
		const lot = designLot()
		const temporary = join(temporaryFolder('design-outside-'), 'DESIGN.md')
		writeFiles({ root: join(temporary, '..'), files: { 'DESIGN.md': DESIGN_TEXT } })

		expect(design({ lot, words: ['--from', temporary] })).toEqual({
			exitCode: 2,
			output: `lot design: ${temporary} is in a temporary or scratch folder, which is wiped: keep the design beside its plan; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
		expect(designCopiesOf(lot)).toEqual([])
	})

	it("a file in the cli's scratch root -> exit 2, refused, nothing written", () => {
		const lot = designLot()
		const scratch = join(process.env.DIALECTE_SCRATCH ?? '', 'plans', 'DESIGN.md')
		writeFiles({ root: join(scratch, '..'), files: { 'DESIGN.md': DESIGN_TEXT } })

		expect(design({ lot, words: ['--from', scratch] })).toEqual({
			exitCode: 2,
			output: `lot design: ${scratch} is in a temporary or scratch folder, which is wiped: keep the design beside its plan; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
	})

	it('a file under /tmp, outside the temporary folder the process names -> exit 2, refused, nothing written', () => {
		const lot = designLot()
		const folder = mkdtempSync(join('/tmp', 'design-tmp-'))
		onTestFinished(function removeFolder() {
			rmSync(folder, { recursive: true, force: true })
		})
		const file = join(folder, 'DESIGN.md')
		writeFiles({ root: folder, files: { 'DESIGN.md': DESIGN_TEXT } })

		expect(
			design({ lot, words: ['--from', file], sharedTemporaryRoots: SYSTEM_TEMPORARY_ROOTS }),
		).toEqual({
			exitCode: 2,
			output: `lot design: ${file} is in a temporary or scratch folder, which is wiped: keep the design beside its plan; nothing written`,
		})
		expect(designLinesOf(lot)).toEqual([])
	})

	it('a file outside every git work tree, beside its plan -> exit 0, recorded', () => {
		const lot = designLot()
		const outside = join(realpathSync(lot.workspace.workspace), 'plans', 'DESIGN.md')
		writeFiles({ root: join(outside, '..'), files: { 'DESIGN.md': DESIGN_TEXT } })

		expect(design({ lot, words: ['--from', outside] }).exitCode).toBe(0)
		expect(designLinesOf(lot)).toEqual([
			expect.objectContaining({ kind: 'recorded', file: outside, hash: DESIGN_HASH }),
		])
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

		expect(design({ lot, words: [] })).toEqual({
			exitCode: 0,
			output: ['design not required', RECORDED_BASE_LINE].join('\n'),
		})
	})

	it('a lot reaching a declared area with nothing recorded -> exit 0, missing, the area and the next command named', () => {
		const lot = designLot({ declared: true })

		expect(design({ lot, words: [] })).toEqual({
			exitCode: 0,
			output: [
				`design missing · shared ${DECLARED_GLOB}`,
				`next: dialecte lot design ${lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${lot.name} --approve --by <who>`,
				RECORDED_BASE_LINE,
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
			verdict: null,
		})
	})

	it('--from with no saved review -> the verdict line names the hash a review must name', () => {
		const lot = designLot({ declared: true })
		const short = DESIGN_HASH.slice(0, 12)

		expect(design({ lot, words: ['--from', lot.designFile] }).output.split('\n')).toContain(
			`verdict missing: a review saved in ${dirname(lot.designFile)} names it with "Design: ${short}" and "Verdict: READY"`,
		)
	})

	it('the standing of a design not approved with a READY review -> the verdict line names it, --json too', () => {
		const lot = designLot({ declared: true })
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		saveReadyVerdict({ designFile: lot.designFile })

		expect(design({ lot, words: [] }).output.split('\n')).toContain('verdict READY in critic-1.md')
		expect(JSON.parse(design({ lot, words: ['--json'] }).output)).toMatchObject({
			state: 'unapproved',
			verdict: { state: 'ready', files: ['critic-1.md'] },
		})
	})

	it('the standing of a design not approved with a NOT READY review -> the verdict line names it, --json blocked', () => {
		const lot = designLot({ declared: true })
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		saveVerdict({ designFile: lot.designFile, name: 'critic-2.md', verdict: 'Verdict: NOT READY' })

		expect(design({ lot, words: [] }).output.split('\n')).toContain(
			'verdict NOT READY in critic-2.md',
		)
		expect(JSON.parse(design({ lot, words: ['--json'] }).output)).toMatchObject({
			verdict: { state: 'blocked', files: ['critic-2.md'] },
		})
	})

	it('the standing of a design not approved, only an earlier revision reviewed -> missing, the hint, --json missing', () => {
		const lot = designLot({ declared: true })
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		saveReadyVerdict({ designFile: lot.designFile })
		writeFiles({ root: lot.cwd, files: { [DESIGN_PATH]: EDITED_DESIGN_TEXT } })
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		const edited = createHash('sha256').update(EDITED_DESIGN_TEXT).digest('hex').slice(0, 12)

		expect(design({ lot, words: [] }).output.split('\n')).toEqual(
			expect.arrayContaining([
				`verdict missing: a review saved in ${dirname(lot.designFile)} names it with "Design: ${edited}" and "Verdict: READY"`,
				`! critic-1.md is READY for ${DESIGN_HASH.slice(0, 12)}, recorded before: the design changed since, so a review of ${edited} is needed`,
			]),
		)
		expect(JSON.parse(design({ lot, words: ['--json'] }).output)).toMatchObject({
			verdict: { state: 'missing', files: [] },
		})
	})

	it('the standing of a design not approved, its folder gone -> the folder named in the verdict line', () => {
		const lot = designLot({ declared: true })
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		rmSync(dirname(lot.designFile), { recursive: true })

		expect(design({ lot, words: [] }).output.split('\n')).toContain(
			`verdict: ${dirname(lot.designFile)} is gone: name the review with --verdict <file>, or waive`,
		)
	})

	it('the standing of a missing design -> no verdict line', () => {
		const lot = designLot({ declared: true })

		expect(design({ lot, words: [] }).output).not.toMatch(/^verdict /m)
	})

	it('a design recorded from the plan -> the reviews read beside the spec', () => {
		const lot = designLot()
		const spec = lotWithPlan({ lot, others: 0 })
		expect(design({ lot, words: ['--from-plan'] }).exitCode).toBe(0)
		saveReadyVerdict({ designFile: spec })

		expect(design({ lot, words: ['--approve', '--by', 'person-a'] }).exitCode).toBe(0)
	})

	it('the standing of an approved design -> --json holds verdict null', () => {
		const lot = designLot({ declared: true })
		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		saveReadyVerdict({ designFile: lot.designFile })
		expect(design({ lot, words: ['--approve', '--by', 'person-a'] }).exitCode).toBe(0)

		expect(JSON.parse(design({ lot, words: ['--json'] }).output)).toMatchObject({
			state: 'approved',
			verdict: null,
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

	it('a real worktree rebased onto a base that adds a shared area, its own file dropping it -> --json names the area', () => {
		const lot = landingLot()
		landOnOrigin({ origin: lot.origin, files: { 'package.json': declaringManifest() } })
		git({ root: lot.worktree, args: ['fetch', '-q', 'origin'] })
		git({ root: lot.worktree, args: ['rebase', '-q', 'origin/main'] })
		writeFiles({
			root: lot.worktree,
			files: { 'package.json': `${JSON.stringify({ name: 'demo' })}\n` },
		})

		expect(
			JSON.parse(runLot({ cwd: lot.root, argv: ['design', lot.name, '--json'] }).output),
		).toMatchObject({
			required: true,
			reasons: [{ kind: 'shared', glob: DECLARED_GLOB, path: 'src' }],
		})
	})
})
