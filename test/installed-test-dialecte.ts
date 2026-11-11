/**
 * Installs core's test dialecte in a package folder, as an app holds a dialecte: a `package.json` that depends
 * on it, its built entry re-exporting core's test configuration, its own link to the core the tests run on.
 * The vocabulary of the installed dialectes is then core's test tags (`A`, `AA_1`, `D`, `DD_1`...) and attributes.
 * Called again with another `packageName`, it installs a second dialecte beside the first.
 */
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { WIDGET_PACKAGE } from './installed-test-dialecte.constants.ts'
import { coreEntries } from './real-core.ts'

export function installTestDialecte(params: {
	cwd: string
	version?: string
	packageName?: string
	/** Fields added to the dialecte's `package.json` (a `dialecte` field, as a dialecte declares its standard). */
	manifestFields?: Record<string, unknown>
	/**
	 * Parts of the test config to replace (plain data, written into the module): its `elements`, and entries of
	 * its `parents`, `children` and `definition`, as `AAA_1` declared several ways.
	 */
	configPatch?: {
		elements: unknown
		parents: Record<string, unknown>
		children: Record<string, unknown>
		definition: Record<string, unknown>
	}
}): void {
	const { cwd } = params
	const packageName = params.packageName ?? WIDGET_PACKAGE
	const folder = join(cwd, 'node_modules', packageName)
	writeFileSync(
		join(cwd, 'package.json'),
		JSON.stringify({
			name: 'app',
			dependencies: { ...dependenciesOf({ cwd }), [packageName]: '1' },
		}),
	)
	writeJson({
		path: join(folder, 'package.json'),
		content: {
			name: packageName,
			version: params.version ?? '1.0.0',
			type: 'module',
			dependencies: { '@dialecte/core': '1' },
			exports: { './v1': { default: './dist/v1/index.js' } },
			...params.manifestFields,
		},
	})
	mkdirSync(join(folder, 'dist/v1'), { recursive: true })
	writeFileSync(
		join(folder, 'dist/v1/index.js'),
		params.configPatch === undefined
			? "export { TEST_DIALECTE_CONFIG as WIDGET_DIALECTE_CONFIG } from '@dialecte/core/test'\n"
			: [
					"import { TEST_DIALECTE_CONFIG } from '@dialecte/core/test'",
					`const patch = ${JSON.stringify(params.configPatch)}`,
					'export const WIDGET_DIALECTE_CONFIG = {',
					'\t...TEST_DIALECTE_CONFIG,',
					'\telements: patch.elements,',
					'\tparents: { ...TEST_DIALECTE_CONFIG.parents, ...patch.parents },',
					'\tchildren: { ...TEST_DIALECTE_CONFIG.children, ...patch.children },',
					'\tdefinition: { ...TEST_DIALECTE_CONFIG.definition, ...patch.definition },',
					'}',
					'',
				].join('\n'),
	)
	mkdirSync(join(folder, 'node_modules/@dialecte'), { recursive: true })
	const coreLink = join(folder, 'node_modules/@dialecte/core')
	if (!existsSync(coreLink)) symlinkSync(coreEntries().folder, coreLink, 'dir')
}

/** The dependencies the folder's `package.json` already holds, none when it has no dependency. */
function dependenciesOf(params: { cwd: string }): Record<string, string> {
	const manifest: { dependencies?: Record<string, string> } = JSON.parse(
		readFileSync(join(params.cwd, 'package.json'), 'utf8'),
	)
	return manifest.dependencies ?? {}
}

function writeJson(params: { path: string; content: unknown }): void {
	mkdirSync(dirname(params.path), { recursive: true })
	writeFileSync(params.path, JSON.stringify(params.content))
}
