import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { createModuleResolver } from './module-resolver.ts'
import { listTestDependencies } from './test-dependencies.ts'

import { describe, expect, it } from 'vitest'

/** A package folder holding `files`, its test file `src/add.test.ts` importing `specifier`. */
function packageWith(params: { files: Record<string, string>; specifier: string }): string {
	const root = temporaryFolder('dialecte-dependencies-')
	writeFiles({
		root,
		files: {
			'src/add.test.ts': `import { EXPECTED } from '${params.specifier}'\nimport { expect, it } from 'vitest'\nit('a', () => { expect(EXPECTED).toBe(3) })\n`,
			...params.files,
		},
	})
	return root
}

function dependenciesOf(root: string) {
	return listTestDependencies({
		root,
		file: 'src/add.test.ts',
		changedTestCode: [],
		resolveModule: createModuleResolver({ root }),
	})
}

const BARREL = {
	'src/test/index.ts': "export { EXPECTED } from './values.ts'\n",
	'src/test/values.ts': 'export const EXPECTED = 3\n',
}

const PATHS_TSCONFIG = JSON.stringify({
	compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', paths: { '@/*': ['./src/*'] } },
})

describe('listTestDependencies: imports by alias', () => {
	it('a tsconfig paths alias to a barrel (@/test) → the barrel and what it re-exports', () => {
		const root = packageWith({
			files: { ...BARREL, 'tsconfig.json': PATHS_TSCONFIG },
			specifier: '@/test',
		})

		expect(dependenciesOf(root)).toEqual({
			dependencies: ['src/test/index.ts', 'src/test/values.ts'],
			unresolved: [],
		})
	})

	it('the paths in a tsconfig the solution file references (tsconfig.vitest.json extending tsconfig.build.json)', () => {
		const root = packageWith({
			files: {
				...BARREL,
				'tsconfig.json': JSON.stringify({
					files: [],
					references: [{ path: './tsconfig.vitest.json' }],
				}),
				'tsconfig.build.json': PATHS_TSCONFIG,
				'tsconfig.vitest.json': JSON.stringify({ extends: './tsconfig.build.json' }),
			},
			specifier: '@/test/values',
		})

		expect(dependenciesOf(root).dependencies).toEqual(['src/test/values.ts'])
	})

	it('a vite alias (resolve.alias in vite.config.ts, no tsconfig paths) → resolved', () => {
		const root = packageWith({
			files: {
				...BARREL,
				'vite.config.ts': [
					"import { fileURLToPath } from 'node:url'",
					'export default {',
					"\tresolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },",
					'}',
					'',
				].join('\n'),
			},
			specifier: '@/test',
		})

		expect(dependenciesOf(root).dependencies).toEqual(['src/test/index.ts', 'src/test/values.ts'])
	})

	it('bare package names (vitest, @dialecte/core) → neither a dependency nor unresolved', () => {
		const root = packageWith({
			files: { 'tsconfig.json': PATHS_TSCONFIG },
			specifier: '@dialecte/core',
		})

		expect(dependenciesOf(root)).toEqual({ dependencies: [], unresolved: [] })
	})

	it('an alias that looks local and resolves nowhere (@/missing, #test) → unresolved, named', () => {
		const viaPaths = packageWith({
			files: { 'tsconfig.json': PATHS_TSCONFIG },
			specifier: '@/missing',
		})
		const viaHash = packageWith({ files: {}, specifier: '#test/values' })

		expect(dependenciesOf(viaPaths).unresolved).toEqual(['@/missing'])
		expect(dependenciesOf(viaHash).unresolved).toEqual(['#test/values'])
	})
})

/** The dependencies of `file` in a package folder holding `files`, `changed` as the change's test code. */
function dependenciesIn(params: {
	files: Record<string, string>
	file: string
	changed: string[]
}): string[] {
	const root = temporaryFolder('dialecte-dependencies-')
	writeFiles({ root, files: params.files })
	return listTestDependencies({
		root,
		file: params.file,
		changedTestCode: params.changed,
		resolveModule: createModuleResolver({ root }),
	}).dependencies
}

describe('listTestDependencies: a dependency found by its name is followed', () => {
	it('a fixture named by path → its `import type` of a .types file and the file its own text names are dependencies too', () => {
		const dependencies = dependenciesIn({
			files: {
				'src/scan.test.ts': [
					"import { expect, it } from 'vitest'",
					"const FOLDER = 'src/test'",
					"it('scans', () => { expect(`${FOLDER}/fixtures/scan-recursive.ts`).toContain('scan') })",
					'',
				].join('\n'),
				'src/test/fixtures/scan-recursive.ts': [
					"import type { Shape } from './scan-recursive.types'",
					"export const TREE = 'tree.json'",
					'export const shape: Shape = { depth: 1 }',
					'',
				].join('\n'),
				'src/test/fixtures/scan-recursive.types.ts': 'export type Shape = { depth: number }\n',
				'src/test/fixtures/tree.json': '{}\n',
			},
			file: 'src/scan.test.ts',
			changed: [
				'src/test/fixtures/scan-recursive.ts',
				'src/test/fixtures/scan-recursive.types.ts',
				'src/test/fixtures/tree.json',
			],
		})

		expect(dependencies).toEqual([
			'src/test/fixtures/scan-recursive.ts',
			'src/test/fixtures/scan-recursive.types.ts',
			'src/test/fixtures/tree.json',
		])
	})
})

describe('listTestDependencies: the text of production imported directly is searched for names', () => {
	it('a production constants module naming a fixture → the fixture and its imports; the module itself and a fixture named two hops into production are not', () => {
		const dependencies = dependenciesIn({
			files: {
				'src/tiers.test.ts': [
					"import { LOGGING_CONFIG_FIXTURE } from './tiers.constants.ts'",
					"import { runTiers } from './tiers.ts'",
					"import { expect, it } from 'vitest'",
					"it('runs', () => { expect(runTiers(LOGGING_CONFIG_FIXTURE)).toBe(true) })",
					'',
				].join('\n'),
				'src/tiers.constants.ts':
					"export const LOGGING_CONFIG_FIXTURE = 'src/fixtures/logging.vitest.config.ts'\n",
				'src/tiers.ts': [
					"import { TIMING_CONFIG } from './tiers-timing.constants.ts'",
					'export function runTiers(config: string): boolean { return config !== TIMING_CONFIG }',
					'',
				].join('\n'),
				'src/tiers-timing.constants.ts':
					"export const TIMING_CONFIG = 'src/fixtures/timing.vitest.config.ts'\n",
				'src/fixtures/logging.vitest.config.ts': [
					"import { LEVEL } from './logging-level'",
					'export default { level: LEVEL }',
					'',
				].join('\n'),
				'src/fixtures/logging-level.ts': "export const LEVEL = 'info'\n",
				'src/fixtures/timing.vitest.config.ts': 'export default {}\n',
			},
			file: 'src/tiers.test.ts',
			changed: [
				'src/fixtures/logging-level.ts',
				'src/fixtures/logging.vitest.config.ts',
				'src/fixtures/timing.vitest.config.ts',
			],
		})

		expect(dependencies).toEqual([
			'src/fixtures/logging-level.ts',
			'src/fixtures/logging.vitest.config.ts',
		])
	})
})

describe('listTestDependencies: a bare file name is a weak hit', () => {
	it('a test writing a scratch index.ts → the changed helper src/test/xml/index.ts is still a dependency, its own imports are not followed', () => {
		const dependencies = dependenciesIn({
			files: {
				'src/scratch.test.ts': [
					"import { writeFileSync } from 'node:fs'",
					"import { expect, it } from 'vitest'",
					"it('writes', () => { expect(writeFileSync('index.ts', '')).toBeUndefined() })",
					'',
				].join('\n'),
				'src/test/xml/index.ts': "export { parse } from './parse'\n",
				'src/test/xml/parse.ts': 'export function parse() {}\n',
			},
			file: 'src/scratch.test.ts',
			changed: ['src/test/xml/index.ts', 'src/test/xml/parse.ts'],
		})

		expect(dependencies).toEqual(['src/test/xml/index.ts'])
	})

	it('a test naming the right basename under another folder (other/index.ts) → the changed helper src/test/xml/index.ts is still a dependency, its own imports are not followed', () => {
		const dependencies = dependenciesIn({
			files: {
				'src/scratch.test.ts': [
					"import { readFileSync } from 'node:fs'",
					"import { expect, it } from 'vitest'",
					"it('reads', () => { expect(() => readFileSync('other/index.ts')).toThrow() })",
					'',
				].join('\n'),
				'src/test/xml/index.ts': "export { parse } from './parse'\n",
				'src/test/xml/parse.ts': 'export function parse() {}\n',
			},
			file: 'src/scratch.test.ts',
			changed: ['src/test/xml/index.ts', 'src/test/xml/parse.ts'],
		})

		expect(dependencies).toEqual(['src/test/xml/index.ts'])
	})
})

/** The dependencies and the unresolved specifiers of `src/add.test.ts`, which holds `lines` after its vitest import. */
function resolutionOf(params: {
	lines: string[]
	files?: Record<string, string>
	changed?: string[]
}) {
	const root = temporaryFolder('dialecte-dependencies-')
	writeFiles({
		root,
		files: {
			'src/add.test.ts': ["import { expect, it } from 'vitest'", ...params.lines, ''].join('\n'),
			...params.files,
		},
	})
	return listTestDependencies({
		root,
		file: 'src/add.test.ts',
		changedTestCode: params.changed ?? [],
		resolveModule: createModuleResolver({ root }),
	})
}

const VITE_ALIAS_CONFIG = [
	"import { fileURLToPath } from 'node:url'",
	'export default {',
	"\tresolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },",
	'}',
	'',
].join('\n')

describe('listTestDependencies: a vite import query is not part of the file name', () => {
	const WORKER_QUERIES = [
		{ name: '?worker&url', specifier: './test/x.worker?worker&url' },
		{ name: '?worker', specifier: './test/x.worker?worker' },
	]

	for (const { name, specifier } of WORKER_QUERIES)
		it(`a worker beside test code imported with ${name} → the local file x.worker.ts is a dependency, nothing unresolved`, () => {
			const resolution = resolutionOf({
				lines: [
					`import workerUrl from '${specifier}'`,
					'it("a", () => { expect(workerUrl).toBeTypeOf("string") })',
				],
				files: { 'src/test/x.worker.ts': 'export {}\n' },
			})

			expect(resolution).toEqual({ dependencies: ['src/test/x.worker.ts'], unresolved: [] })
		})

	it('a production worker imported with ?worker&url → resolved to the local file, so neither a dependency nor unresolved', () => {
		const resolution = resolutionOf({
			lines: [
				"import workerUrl from './x.worker?worker&url'",
				'it("a", () => { expect(workerUrl).toBeTypeOf("string") })',
			],
			files: { 'src/x.worker.ts': 'export {}\n' },
		})

		expect(resolution).toEqual({ dependencies: [], unresolved: [] })
	})

	const FIXTURE_QUERIES = ['?raw', '?url', '?inline']

	for (const query of FIXTURE_QUERIES)
		it(`a fixture of the change imported with ${query} → the local file fixtures/a.xml is a dependency, nothing unresolved`, () => {
			const resolution = resolutionOf({
				lines: [
					`import xml from './fixtures/a.xml${query}'`,
					'it("a", () => { expect(xml).toBeTypeOf("string") })',
				],
				files: { 'src/fixtures/a.xml': '<a/>\n' },
				changed: ['src/fixtures/a.xml'],
			})

			expect(resolution).toEqual({ dependencies: ['src/fixtures/a.xml'], unresolved: [] })
		})

	const ALIASED_QUERIES: Array<{ name: string; files: Record<string, string> }> = [
		{
			name: 'a tsconfig paths alias',
			files: { 'tsconfig.json': PATHS_TSCONFIG },
		},
		{
			name: 'a vite resolve.alias',
			files: { 'vite.config.ts': VITE_ALIAS_CONFIG },
		},
	]

	for (const { name, files } of ALIASED_QUERIES)
		it(`${name} specifier with a query (@/test/x.worker?worker&url) → resolved like the same specifier without it`, () => {
			const resolution = resolutionOf({
				lines: [
					"import workerUrl from '@/test/x.worker?worker&url'",
					'it("a", () => { expect(workerUrl).toBeTypeOf("string") })',
				],
				files: { ...files, 'src/test/x.worker.ts': 'export {}\n' },
			})

			expect(resolution).toEqual({ dependencies: ['src/test/x.worker.ts'], unresolved: [] })
		})

	it('a fragment on a relative specifier (./test/a.ts#part) → a.ts; a specifier starting with # (#internal/x, a subpath import) keeps unresolved as written', () => {
		const resolution = resolutionOf({
			lines: [
				"import { A } from './test/a.ts#part'",
				"import { INTERNAL } from '#internal/x'",
				'it("a", () => { expect([A, INTERNAL]).toHaveLength(2) })',
			],
			files: { 'src/test/a.ts': 'export const A = 1\n' },
		})

		expect(resolution).toEqual({
			dependencies: ['src/test/a.ts'],
			unresolved: ['#internal/x'],
		})
	})

	it('a query on a file that does not exist (./missing?raw) beside one on a file that does → the first resolved, the missing one unresolved with its query kept', () => {
		const resolution = resolutionOf({
			lines: [
				"import xml from './fixtures/a.xml?raw'",
				"import missing from './missing?raw'",
				'it("a", () => { expect([xml, missing]).toHaveLength(2) })',
			],
			files: { 'src/fixtures/a.xml': '<a/>\n' },
			changed: ['src/fixtures/a.xml'],
		})

		expect(resolution).toEqual({
			dependencies: ['src/fixtures/a.xml'],
			unresolved: ['./missing?raw'],
		})
	})
})

describe('listTestDependencies: files an import.meta.glob matches', () => {
	const FIXTURES: Record<string, string> = {
		'src/fixtures/a.xml': '<a/>\n',
		'src/fixtures/b.xml': '<b/>\n',
		'src/fixtures/skip-me.xml': '<skip/>\n',
		'src/fixtures/deep/c.xml': '<c/>\n',
	}

	/** A test whose text holds `glob` as the first argument of import.meta.glob, and names none of the fixtures. */
	function globLines(glob: string): string[] {
		return [
			`const files = import.meta.glob(${glob}, { query: '?raw', eager: true })`,
			'it("a", () => { expect(Object.keys(files)).toHaveLength(2) })',
		]
	}

	it("a glob over the fixtures folder ('./fixtures/*.xml') → every changed fixture it matches is a dependency, one it does not match is not", () => {
		const resolution = resolutionOf({
			lines: globLines("'./fixtures/*.xml'"),
			files: FIXTURES,
			changed: Object.keys(FIXTURES),
		})

		expect(resolution.dependencies).toEqual([
			'src/fixtures/a.xml',
			'src/fixtures/b.xml',
			'src/fixtures/skip-me.xml',
		])
	})

	it("an array of globs with a negative pattern (['./fixtures/*.xml', '!./fixtures/skip.xml']) → the negated fixture is not a dependency, the others the first glob matches are", () => {
		const resolution = resolutionOf({
			lines: globLines("['./fixtures/*.xml', '!./fixtures/skip.xml']"),
			files: { ...FIXTURES, 'src/fixtures/skip.xml': '<skip/>\n' },
			changed: [...Object.keys(FIXTURES), 'src/fixtures/skip.xml'],
		})

		expect(resolution.dependencies).toEqual([
			'src/fixtures/a.xml',
			'src/fixtures/b.xml',
			'src/fixtures/skip-me.xml',
		])
	})

	const GLOB_FORMS: Array<{
		name: string
		glob: string
		files: Record<string, string>
		expected: string[]
	}> = [
		{
			name: "a root-absolute glob ('/src/fixtures/*.xml', the project root)",
			glob: "'/src/fixtures/*.xml'",
			files: {},
			expected: ['src/fixtures/a.xml'],
		},
		{
			name: "a vite alias glob ('@/fixtures/*.xml', @ → ./src)",
			glob: "'@/fixtures/*.xml'",
			files: { 'vite.config.ts': VITE_ALIAS_CONFIG },
			expected: ['src/fixtures/a.xml'],
		},
		{
			name: "a recursive glob ('./fixtures/**/*.xml')",
			glob: "'./fixtures/**/*.xml'",
			files: {},
			expected: ['src/fixtures/a.xml', 'src/fixtures/deep/c.xml'],
		},
	]

	for (const { name, glob, files, expected } of GLOB_FORMS)
		it(`${name} → matched against the package root or the alias target: the changed fixtures it reaches are dependencies`, () => {
			const resolution = resolutionOf({
				lines: globLines(glob),
				files: { ...FIXTURES, ...files },
				changed: ['src/fixtures/a.xml', 'src/fixtures/deep/c.xml'],
			})

			expect(resolution.dependencies).toEqual(expected)
		})
})
