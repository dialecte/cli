import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describeElement } from '../src/lib/schema/describe-element.ts'
import { loadDialectes } from '../src/lib/schema/load-dialectes.ts'
import { GADGET_PACKAGE, WIDGET_PACKAGE } from './installed-test-dialecte.constants.ts'
import { installTestDialecte } from './installed-test-dialecte.ts'
import { coreEntries } from './real-core.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

function writeManifest(params: {
	folder: string
	name: string
	exports: Record<string, unknown>
}): void {
	write(
		`${params.folder}/package.json`,
		JSON.stringify({
			name: params.name,
			type: 'module',
			dependencies: { '@dialecte/core': '1' },
			exports: params.exports,
		}),
	)
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-load-dialectes-'))
	write(
		'package.json',
		JSON.stringify({
			dependencies: {
				'@acme/widget': '1',
				'@acme/broken': '1',
				'left-pad': '1',
				'@acme/absent': '1',
			},
		}),
	)
	// a dialecte on its own core (the real one), core's test dialecte as its config
	writeManifest({
		folder: 'node_modules/@acme/widget',
		name: '@acme/widget',
		exports: {
			'./v1': { types: './dist/v1/index.d.ts', default: './dist/v1/index.js' },
			'./v1/test': { types: './dist/v1/test.d.ts', default: './dist/v1/test.js' },
		},
	})
	write(
		'node_modules/@acme/widget/dist/v1/index.js',
		[
			"export { TEST_DIALECTE_CONFIG as WIDGET_DIALECTE_CONFIG } from '@dialecte/core/test'",
			'export const NOT_A_CONFIG = { rootElementName: 1 }',
			'',
		].join('\n'),
	)
	write(
		'node_modules/@acme/widget/dist/v1/test.js',
		"throw new Error('the test entry was imported')\n",
	)
	mkdirSync(join(root, 'node_modules/@acme/widget/node_modules/@dialecte'), { recursive: true })
	symlinkSync(
		coreEntries().folder,
		join(root, 'node_modules/@acme/widget/node_modules/@dialecte/core'),
		'dir',
	)
	// a core hoisted at the top that must not answer for the widget
	write(
		'node_modules/@dialecte/core/package.json',
		JSON.stringify({
			name: '@dialecte/core',
			type: 'module',
			exports: { './utils': './utils.js' },
		}),
	)
	write(
		'node_modules/@dialecte/core/utils.js',
		"throw new Error('the hoisted core was imported')\n",
	)
	// built on core, its entry file not built
	writeManifest({
		folder: 'node_modules/@acme/broken',
		name: '@acme/broken',
		exports: { '.': { default: './dist/index.js' } },
	})
	write(
		'node_modules/left-pad/package.json',
		JSON.stringify({ name: 'left-pad', type: 'module', exports: { '.': './index.js' } }),
	)
	write(
		'node_modules/left-pad/index.js',
		"throw new Error('a package without core was imported')\n",
	)
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('loadDialectes dialecte.standard (installed test dialecte)', () => {
	type LoadedCase = {
		description: string
		manifestFields: Record<string, unknown>
		expected: string | undefined
	}
	type SkippedCase = { description: string; standard: unknown }

	/** The widget under test, installed beside a gadget that declares `Example 0000`. */
	const LOADED_CASES: LoadedCase[] = [
		{
			description: 'a dialecte declaring a standard → loaded with it',
			manifestFields: { dialecte: { standard: 'Example 0000' } },
			expected: 'Example 0000',
		},
		{
			description: 'no dialecte field → loaded, standard undefined (its neighbour keeps its own)',
			manifestFields: {},
			expected: undefined,
		},
		{
			description:
				'a dialecte field without standard → loaded, standard undefined (its neighbour keeps its own)',
			manifestFields: { dialecte: {} },
			expected: undefined,
		},
		{
			description: 'standard at the manifest top level → not read, standard undefined',
			manifestFields: { standard: 'Example 0000' },
			expected: undefined,
		},
		{
			description: '"dialecte" a string → loaded, standard undefined',
			manifestFields: { dialecte: 'Example 0000' },
			expected: undefined,
		},
		{
			description: '"dialecte" null → loaded, standard undefined',
			manifestFields: { dialecte: null },
			expected: undefined,
		},
	]
	const SKIPPED_CASES: SkippedCase[] = [
		{ description: 'an empty standard', standard: '' },
		{ description: 'a blank standard', standard: '   ' },
		{ description: 'a number as standard', standard: 7 },
		{ description: 'an object as standard', standard: {} },
	]

	function installApp(params: { manifestFields: Record<string, unknown> }): string {
		const cwd = join(root, 'standard-app')
		write('standard-app/package.json', '{}')
		installTestDialecte({
			cwd,
			packageName: GADGET_PACKAGE,
			manifestFields: { dialecte: { standard: 'Example 0000' } },
		})
		installTestDialecte({ cwd, manifestFields: params.manifestFields })
		return cwd
	}

	it.each(LOADED_CASES)('$description', async ({ manifestFields, expected }) => {
		const cwd = installApp({ manifestFields })

		const { dialectes } = await loadDialectes({ cwd })

		expect(
			Object.fromEntries(dialectes.map((dialecte) => [dialecte.packageName, dialecte.standard])),
		).toEqual({ [GADGET_PACKAGE]: 'Example 0000', [WIDGET_PACKAGE]: expected })
	})

	it.each(SKIPPED_CASES)(
		'$description → skipped, dialecte.standard named',
		async ({ standard }) => {
			const cwd = installApp({ manifestFields: { dialecte: { standard } } })

			const { dialectes, skipped } = await loadDialectes({ cwd })

			expect({
				loaded: dialectes.map((dialecte) => dialecte.packageName),
				skipped: skipped.map((entry) => ({
					packageName: entry.packageName,
					names: entry.reason.includes('dialecte.standard'),
				})),
			}).toEqual({
				loaded: [GADGET_PACKAGE],
				skipped: [{ packageName: WIDGET_PACKAGE, names: true }],
			})
		},
	)
})

describe('loadDialectes (real core)', () => {
	it('a dialecte on its own core → its config read through that core; test entries and others left alone', async () => {
		const { dialectes } = await loadDialectes({ cwd: root })

		expect(dialectes.map((dialecte) => dialecte.packageName)).toEqual(['@acme/widget'])
		expect(describeElement({ dialecte: dialectes[0], tagName: 'AA_1' })?.parents).toEqual(['A'])
	})

	it('a package built on core whose entry file is missing → skipped, with the file named', async () => {
		const { skipped } = await loadDialectes({ cwd: root })

		expect(skipped).toEqual([
			{
				packageName: '@acme/broken',
				reason: `entry file not found: ${join(root, 'node_modules/@acme/broken/dist/index.js')} (is the package built?)`,
			},
		])
	})
})
