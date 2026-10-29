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
