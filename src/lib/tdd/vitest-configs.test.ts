/**
 * Which vitest config holds a test file, read from the package's config files: the default include, an include
 * list, `projects` naming a config file, an inline project with its own include, `exclude`, and the vite config
 * standing in for a missing vitest config.
 */
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { CONFIG_READ_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { configHolding, readVitestConfigs } from './vitest-configs.ts'

import { describe, expect, it } from 'vitest'

import type { ConfigHolding } from './tdd.types.ts'

const DEFAULT_CONFIG = 'vitest.config.ts'
const UNIT_CONFIG = 'vitest.unit.config.ts'

const SRC_INCLUDE = "export default { test: { include: ['src/**/*.test.ts'] } }\n"
const UNIT_INCLUDE = "export default { test: { include: ['unit/**/*.test.ts'] } }\n"

const HELD_BY_DEFAULT: ConfigHolding = { kind: 'default' }
const HELD_BY_NONE: ConfigHolding = { kind: 'none' }
const HELD_BY_UNKNOWN: ConfigHolding = { kind: 'unknown' }
const HELD_BY_UNIT: ConfigHolding = { kind: 'other', config: UNIT_CONFIG }

const SCENARIOS: {
	title: string
	files: Record<string, string>
	path: string
	holding: ConfigHolding
	timeout?: number
}[] = [
	{
		title:
			'a default config with no include, a test file of any folder → held by the default config',
		files: { [DEFAULT_CONFIG]: 'export default { test: {} }\n' },
		path: 'deep/folder/a.test.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title: 'a default config with no include, a spec file → held by the default config',
		files: { [DEFAULT_CONFIG]: 'export default { test: {} }\n' },
		path: 'e2e/a.spec.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title: 'a default config with no include, a file that is no test file by name → held by none',
		files: { [DEFAULT_CONFIG]: 'export default { test: {} }\n' },
		path: 'src/helper.ts',
		holding: HELD_BY_NONE,
	},
	{
		title: 'a default config with an include list, a file it matches → held by the default config',
		files: { [DEFAULT_CONFIG]: SRC_INCLUDE },
		path: 'src/a.test.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title: 'a default config with an include list, a test file outside it → held by none',
		files: { [DEFAULT_CONFIG]: SRC_INCLUDE },
		path: 'unit/a.test.ts',
		holding: HELD_BY_NONE,
	},
	{
		title:
			'a default config with an include list and another config including the file, no projects → held by the other config',
		files: { [DEFAULT_CONFIG]: SRC_INCLUDE, [UNIT_CONFIG]: UNIT_INCLUDE },
		path: 'unit/a.test.ts',
		holding: HELD_BY_UNIT,
	},
	{
		title:
			'a default config whose projects name the other config, a file the other config includes → held by the default config',
		files: {
			[DEFAULT_CONFIG]: `export default { test: { include: ['src/**/*.test.ts'], projects: ['./${UNIT_CONFIG}'] } }\n`,
			[UNIT_CONFIG]: UNIT_INCLUDE,
		},
		path: 'unit/a.test.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title:
			'a default config with an inline project of its own include, a file that include matches → held by the default config',
		files: {
			[DEFAULT_CONFIG]:
				"export default { test: { projects: [{ test: { name: 'unit', include: ['unit/**/*.test.ts'] } }] } }\n",
		},
		path: 'unit/a.test.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title:
			'a default config with an inline project of its own include, a test file that include does not match → held by none',
		files: {
			[DEFAULT_CONFIG]:
				"export default { test: { projects: [{ test: { name: 'unit', include: ['unit/**/*.test.ts'] } }] } }\n",
		},
		path: 'src/a.test.ts',
		holding: HELD_BY_NONE,
	},
	{
		title: 'a default config whose exclude names the file its include matches → held by none',
		files: {
			[DEFAULT_CONFIG]:
				"export default { test: { include: ['src/**/*.test.ts'], exclude: ['src/legacy/**'] } }\n",
		},
		path: 'src/legacy/a.test.ts',
		holding: HELD_BY_NONE,
	},
	{
		title:
			'a default config wrapped in defineConfig with an include list, a file it matches → held by the default config',
		files: {
			[DEFAULT_CONFIG]: `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['src/**/*.test.ts'] } })\n`,
		},
		path: 'src/a.test.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title:
			'a default config and another config both including the file, no projects → held by the default config',
		files: { [DEFAULT_CONFIG]: SRC_INCLUDE, [UNIT_CONFIG]: SRC_INCLUDE },
		path: 'src/a.test.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title: 'no vitest config but a vite config with a test include → held by the default config',
		files: { 'vite.config.ts': SRC_INCLUDE },
		path: 'src/a.test.ts',
		holding: HELD_BY_DEFAULT,
	},
	{
		title:
			'a vitest config and a vite config both present, the file only in the vite config include → held by the vite config, which the default config does not list',
		files: { [DEFAULT_CONFIG]: SRC_INCLUDE, 'vite.config.ts': UNIT_INCLUDE },
		path: 'unit/a.test.ts',
		holding: { kind: 'other', config: 'vite.config.ts' },
	},
	{
		title:
			'a default config whose projects hold a function call and a glob string, a file only another config may hold → unknown, never none',
		files: {
			[DEFAULT_CONFIG]: `export default { test: { projects: [someProject({ name: 'a' }), './vitest.*.config.ts'] } }\n`,
			[UNIT_CONFIG]: UNIT_INCLUDE,
		},
		path: 'unit/a.test.ts',
		holding: HELD_BY_UNKNOWN,
	},
	{
		title:
			'a default config whose projects hold a function call, no other config → unknown, never none',
		files: {
			[DEFAULT_CONFIG]: "export default { test: { projects: [someProject({ name: 'a' })] } }\n",
		},
		path: 'unit/a.test.ts',
		holding: HELD_BY_UNKNOWN,
	},
	{
		title:
			'a default config whose include holds a constant instead of a string, a file the constant may name → unknown, never none',
		files: {
			[DEFAULT_CONFIG]: `import { SRC_GLOB } from './globs.constants.ts'\nexport default { test: { include: [SRC_GLOB] } }\n`,
		},
		path: 'src/a.test.ts',
		holding: HELD_BY_UNKNOWN,
	},
	{
		title:
			'a default config with a literal include, another config whose include holds a constant, a file the first does not include → unknown, never none',
		files: {
			[DEFAULT_CONFIG]: SRC_INCLUDE,
			[UNIT_CONFIG]: `import { UNIT_GLOB } from './globs.constants.ts'\nexport default { test: { include: [UNIT_GLOB] } }\n`,
		},
		path: 'unit/a.test.ts',
		holding: HELD_BY_UNKNOWN,
	},
	{
		title:
			'R3-1 a default config whose helper constant calls itself, its default export holding the include literal in a conditional → the reader returns, held by the default config',
		files: {
			[DEFAULT_CONFIG]: `const depth = (n) => (n > 0 ? depth(n - 1) : 0)\nexport default defineConfig(depth(2) === 0 ? { test: { include: ['src/**/*.test.ts'] } } : {})\n`,
		},
		path: 'src/a.test.ts',
		holding: HELD_BY_DEFAULT,
		timeout: CONFIG_READ_CASE_TIMEOUT,
	},
]

describe('configHolding over the configs of a package', () => {
	for (const scenario of SCENARIOS)
		it(scenario.title, { timeout: scenario.timeout }, () => {
			const root = temporaryFolder('dialecte-vitest-configs-')
			writeFiles({ root, files: scenario.files })

			expect(configHolding({ configs: readVitestConfigs({ root }), path: scenario.path })).toEqual(
				scenario.holding,
			)
		})
})
