import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { chooseInstalledBinding, findInstalledBindings } from './installed-bindings.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { InstalledBinding } from './installed-bindings.types.ts'

let root: string

function write(params: { path: string; content: unknown }): void {
	mkdirSync(dirname(join(root, params.path)), { recursive: true })
	writeFileSync(join(root, params.path), JSON.stringify(params.content))
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-bindings-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('findInstalledBindings', () => {
	const testCases = {
		'a dialecte exporting a version and its test entry → one binding, the test entry left out': {
			dependencies: { '@dialecte/scl': '1' },
			packages: {
				'@dialecte/scl': {
					name: '@dialecte/scl',
					dependencies: { '@dialecte/core': '1' },
					exports: { './v2019C1': './dist/v2019C1/index.js', './v2019C1/test': './dist/test.js' },
				},
			},
			expected: [
				{
					packageName: '@dialecte/scl',
					version: 'v2019C1',
					binding: { kind: 'namespace', name: 'Scl', import: '@dialecte/scl/v2019C1' },
				},
			],
		},
		'core itself and a package not built on core → no binding': {
			dependencies: { '@dialecte/core': '1', vue: '3' },
			packages: {
				'@dialecte/core': { name: '@dialecte/core', exports: { '.': './dist/index.js' } },
				vue: { name: 'vue', exports: { '.': './index.js' } },
			},
			expected: [],
		},
		'a library built on core without a version and its test entry (an app library) → no binding': {
			dependencies: { '@acme/ui': '1' },
			packages: {
				'@acme/ui': {
					name: '@acme/ui',
					peerDependencies: { '@dialecte/core': '1' },
					exports: { '.': './dist/index.js', './configcss': './dist/config.css' },
				},
			},
			expected: [],
		},
		'a dialecte with core as a peer → bound like the others': {
			dependencies: { '@acme/widget': '1' },
			packages: {
				'@acme/widget': {
					name: '@acme/widget',
					peerDependencies: { '@dialecte/core': '1' },
					exports: { './v1': './dist/v1/index.js', './v1/test': './dist/v1/test.js' },
				},
			},
			expected: [
				{
					packageName: '@acme/widget',
					version: 'v1',
					binding: { kind: 'namespace', name: 'Widget', import: '@acme/widget/v1' },
				},
			],
		},
		'a dependency not installed → skipped': {
			dependencies: { '@dialecte/nsd': '1' },
			packages: {},
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			write({ path: 'package.json', content: { dependencies: testCase.dependencies } })
			for (const [name, manifest] of Object.entries(testCase.packages))
				write({ path: `node_modules/${name}/package.json`, content: manifest })

			expect(findInstalledBindings({ cwd: root })).toEqual(testCase.expected)
		})
	}
})

describe('chooseInstalledBinding', () => {
	const SCL: InstalledBinding = {
		packageName: '@dialecte/scl',
		version: 'v2019C1',
		binding: { kind: 'namespace', name: 'Scl', import: '@dialecte/scl/v2019C1' },
	}
	const NSD: InstalledBinding = {
		packageName: '@dialecte/nsd',
		version: 'v2016',
		binding: { kind: 'namespace', name: 'Nsd', import: '@dialecte/nsd/v2016' },
	}

	const testCases = {
		'one installed → that one': {
			bindings: [SCL],
			packageName: undefined,
			version: undefined,
			expected: { kind: 'binding', binding: SCL },
		},
		'two installed, --package names one → that one': {
			bindings: [SCL, NSD],
			packageName: '@dialecte/nsd',
			version: undefined,
			expected: { kind: 'binding', binding: NSD },
		},
		'two installed, nothing named → each listed with --package and --version': {
			bindings: [SCL, NSD],
			packageName: undefined,
			version: undefined,
			expected: {
				kind: 'output',
				message:
					'several dialectes are installed: pass --package <name> [--version <v>]\n  @dialecte/scl --version v2019C1\n  @dialecte/nsd --version v2016\n',
			},
		},
		'none installed → says so and how to bind by hand': {
			bindings: [],
			packageName: undefined,
			version: undefined,
			expected: {
				kind: 'output',
				message:
					'no dialecte installed here (a dependency built on @dialecte/core exporting ./<version> with ./<version>/test): pass --namespace <Name> --entry <module>\n',
			},
		},
		'--version alone naming one → that one': {
			bindings: [SCL, NSD],
			packageName: undefined,
			version: 'v2016',
			expected: { kind: 'binding', binding: NSD },
		},
		'--package matching none while dialectes are installed → says so and lists them': {
			bindings: [SCL, NSD],
			packageName: '@dialecte/sc1',
			version: undefined,
			expected: {
				kind: 'output',
				message:
					'no installed dialecte matches --package @dialecte/sc1; installed:\n  @dialecte/scl --version v2019C1\n  @dialecte/nsd --version v2016\n',
			},
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(
				chooseInstalledBinding({
					bindings: testCase.bindings,
					packageName: testCase.packageName,
					version: testCase.version,
				}),
			).toEqual(testCase.expected)
		})
	}
})
