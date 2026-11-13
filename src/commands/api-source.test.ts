import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { SOURCE_TREE_SCAN_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runApi } from './api.ts'

import { describe, expect, it } from 'vitest'

import type { ApiJson } from '../lib/api/api-json.types.ts'

const PACKAGE_NAME = 'scratch-pkg'

/** The cli's own worktree root: this file is `<root>/src/commands/api-source.test.ts`. */
const CLI_ROOT = join(import.meta.dirname, '..', '..')

const OWN_INDEX: ApiJson = {
	package: PACKAGE_NAME,
	methods: [
		{
			path: 'doc.query.gizmo.spin',
			root: 'q',
			otherRoutes: [],
			signature: '(params: { angle: number }) => void',
			summary: 'Spins a gizmo around its axis.',
			intents: ['spin a gizmo'],
			declaredAt: 'src/a.ts:2',
			example: undefined,
		},
		{
			path: 'tx.zorb.flip',
			root: 'tx',
			otherRoutes: [],
			signature: '() => void',
			summary: 'Flips a zorb.',
			intents: ['flip a zorb'],
			declaredAt: 'src/other.ts:1',
			example: undefined,
		},
	],
}

const SCRATCH_FILES: Record<string, string> = {
	'package.json': JSON.stringify({ name: PACKAGE_NAME }),
	'skills/scratch/SKILL.md': '---\n',
	'skills/scratch/references/api.json': JSON.stringify(OWN_INDEX),
	'src/a.ts': [
		'/** Spins a gizmo around its axis. */',
		'export function spinGizmo(params: { angle: number }): void {}',
		'',
		'export function bareWidget(): string {',
		"\treturn 'x'",
		'}',
		'',
	].join('\n'),
	'src/b.ts': [
		'/**',
		' * Buffs a surface.',
		' *',
		' * @intent polish the gizmo surface',
		' */',
		'export const buffSurface = (): void => {}',
		'',
	].join('\n'),
	'src/c.ts': [
		'/** Trims every sprocket tooth. */',
		'export function trimSprocket(params: { teeth: number }): void {}',
		'',
	].join('\n'),
	'src/d.ts': [
		'/**',
		' * Flips a zorb.',
		' *',
		' * @intent flip a zorb',
		' */',
		'export function zorbFlip(): void {}',
		'',
	].join('\n'),
}

function scratchPackage(): string {
	const root = temporaryFolder('dialecte-cli-api-source-')
	writeFiles({ root, files: SCRATCH_FILES })
	return root
}

type FoundRow = { path: string; root: string; package: string; declaredAt?: string }

describe('runApi --source', () => {
	const acceptanceCases: { need: string; paths: string[] }[] = [
		{
			need: 'current branch',
			paths: [
				'src/lib/git.ts#currentBranchOf',
				'src/lib/review-rounds/review-delta.ts#currentBranchOf',
			],
		},
		{
			need: 'work tree holding a path',
			paths: [
				'src/lib/knowledge/standard/work-tree-holding.ts#workTreeHolding',
				'src/lib/store/store-folder.ts#workTreeHolding',
			],
		},
	]
	const scopes: { label: string; flags: string[] }[] = [
		{ label: 'every installed index', flags: [] },
		{ label: '--package @dialecte/cli', flags: ['--package', '@dialecte/cli'] },
	]

	for (const { need, paths } of acceptanceCases)
		for (const scope of scopes)
			it(
				`find --source "${need}" in the cli, default limit, ${scope.label} → both functions listed`,
				() => {
					const result = runApi({ argv: ['find', '--source', need, ...scope.flags], cwd: CLI_ROOT })

					expect(result.exitCode).toBe(0)
					for (const path of paths) expect(result.output).toContain(path)
				},
				SOURCE_TREE_SCAN_CASE_TIMEOUT,
			)

	it('a source function an indexed method is declared at → listed once, by its indexed route', () => {
		const result = runApi({
			argv: ['find', '--source', 'spin gizmo polish'],
			cwd: scratchPackage(),
		})

		expect(result.output).toBe(
			[
				'doc.query.gizmo.spin  q  spin a gizmo  scratch-pkg',
				'src/b.ts#buffSurface  source  src/b.ts:6  polish the gizmo surface  scratch-pkg',
				'',
			].join('\n'),
		)
		expect(result.exitCode).toBe(0)
	})

	it('a source function with an @intent → text row: path, source, declaredAt, matching intent, package', () => {
		const result = runApi({ argv: ['find', '--source', 'polish surface'], cwd: scratchPackage() })

		expect(result.output).toBe(
			'src/b.ts#buffSurface  source  src/b.ts:6  polish the gizmo surface  scratch-pkg\n',
		)
		expect(result.exitCode).toBe(0)
	})

	it('a source function with a summary and no matching intent → text row ends on its short summary', () => {
		const result = runApi({ argv: ['find', '--source', 'trims sprocket'], cwd: scratchPackage() })

		expect(result.output).toBe(
			'src/c.ts#trimSprocket  source  src/c.ts:2  Trims every sprocket tooth.  scratch-pkg\n',
		)
		expect(result.exitCode).toBe(0)
	})

	it('a source function with no JSDoc → text row says (no summary)', () => {
		const result = runApi({ argv: ['find', '--source', 'bare widget'], cwd: scratchPackage() })

		expect(result.output).toBe(
			'src/a.ts#bareWidget  source  src/a.ts:4  (no summary)  scratch-pkg\n',
		)
		expect(result.exitCode).toBe(0)
	})

	it('equal hits, one indexed method and one source function → the indexed one first', () => {
		const result = runApi({ argv: ['find', '--source', 'flip zorb'], cwd: scratchPackage() })

		expect(result.output.split('\n').filter(Boolean)).toEqual([
			'tx.zorb.flip  tx  flip a zorb  scratch-pkg',
			'src/d.ts#zorbFlip  source  src/d.ts:6  flip a zorb  scratch-pkg',
		])
	})

	it('--source --json → a source row has root source, path and declaredAt; an indexed row has no declaredAt key', () => {
		const result = runApi({
			argv: ['find', '--source', 'flip zorb', '--json'],
			cwd: scratchPackage(),
		})

		const methods: FoundRow[] = JSON.parse(result.output).methods
		expect(methods.map((method) => method.path)).toEqual(['tx.zorb.flip', 'src/d.ts#zorbFlip'])
		expect(methods[0]).not.toHaveProperty('declaredAt')
		expect(methods[1]).toMatchObject({
			path: 'src/d.ts#zorbFlip',
			root: 'source',
			package: 'scratch-pkg',
			declaredAt: 'src/d.ts:6',
		})
	})

	for (const flags of [[], ['--source']])
		it(`show src/c.ts#trimSprocket with flags [${flags.join(' ')}] → the contract: path, signature, summary, declaration`, () => {
			const result = runApi({
				argv: ['show', 'src/c.ts#trimSprocket', ...flags],
				cwd: scratchPackage(),
			})

			expect(result.output).toBe(
				[
					'src/c.ts#trimSprocket  (scratch-pkg)',
					'(params: { teeth: number }): void',
					'Trims every sprocket tooth.',
					'source (repository): src/c.ts:2',
					'',
				].join('\n'),
			)
			expect(result.exitCode).toBe(0)
		})

	it('show a source path nobody declares, close to a real one → exit 1, the closest source paths named', () => {
		const result = runApi({ argv: ['show', 'src/c.ts#trimSprocke'], cwd: scratchPackage() })

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(/^no source function "src\/c\.ts#trimSprocke" in /)
		expect(result.output).toContain('closest:')
		expect(result.output).toContain('src/c.ts#trimSprocket')
	})

	it('show src/c.ts#nope, a real file and a name far from its functions → exit 1, the functions of that file named as closest', () => {
		const result = runApi({ argv: ['show', 'src/c.ts#nope'], cwd: scratchPackage() })

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(/^no source function "src\/c\.ts#nope" in /)
		expect(result.output).toContain('closest:')
		expect(result.output).toContain('src/c.ts#trimSprocket')
	})

	it('show src/zz.ts#nope, a file nobody has → exit 1, no closest, the api find --source line', () => {
		const result = runApi({ argv: ['show', 'src/zz.ts#nope'], cwd: scratchPackage() })

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(/^no source function "src\/zz\.ts#nope" in /)
		expect(result.output).toMatch(/api find --source/)
		expect(result.output).not.toContain('closest:')
	})

	it('find "bare widget" without --source → exit 1 and the not-found text', () => {
		const result = runApi({ argv: ['find', 'bare widget'], cwd: scratchPackage() })

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(/^no method found for "bare widget" in scratch-pkg: /)
	})

	it('find "bare widget" with --source → exit 0 and the source row', () => {
		const result = runApi({ argv: ['find', '--source', 'bare widget'], cwd: scratchPackage() })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('src/a.ts#bareWidget')
	})

	it('find "flip zorb" --json without --source → only the indexed row, no declaredAt key', () => {
		const result = runApi({ argv: ['find', 'flip zorb', '--json'], cwd: scratchPackage() })

		const rows: FoundRow[] = JSON.parse(result.output).methods
		expect(rows.map((method) => method.path)).toEqual(['tx.zorb.flip'])
		expect(rows[0]).not.toHaveProperty('declaredAt')
	})

	it('find --source --package of another package → exit 1, no source row', () => {
		const result = runApi({
			argv: ['find', '--source', 'bare widget', '--package', 'other-pkg'],
			cwd: scratchPackage(),
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).not.toContain('src/a.ts#bareWidget')
	})

	it('find --source --package of the own package → its source row', () => {
		const result = runApi({
			argv: ['find', '--source', 'bare widget', '--package', PACKAGE_NAME],
			cwd: scratchPackage(),
		})

		expect(result.output).toBe(
			'src/a.ts#bareWidget  source  src/a.ts:4  (no summary)  scratch-pkg\n',
		)
		expect(result.exitCode).toBe(0)
	})

	it('find "bare widget" without --source from a subfolder → exit 2, no package.json in the folder', () => {
		const folder = join(scratchPackage(), 'src')

		const result = runApi({ argv: ['find', 'bare widget'], cwd: folder })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain(`no package.json in ${folder}`)
	})

	it('--source run from a subfolder of the package → the same answer as from its root (D3)', () => {
		const result = runApi({
			argv: ['find', '--source', 'bare widget'],
			cwd: join(scratchPackage(), 'src'),
		})

		expect(result.output).toBe(
			'src/a.ts#bareWidget  source  src/a.ts:4  (no summary)  scratch-pkg\n',
		)
		expect(result.exitCode).toBe(0)
	})

	it('--source with no package.json at or above cwd → exit 2, no package named, the fix', () => {
		const cwd = temporaryFolder('dialecte-cli-api-nopackage-')

		const result = runApi({ argv: ['find', '--source', 'anything'], cwd })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain(`api find --source: no package at ${cwd}`)
		expect(result.output.toLowerCase()).toContain('inside a package')
	})
})
