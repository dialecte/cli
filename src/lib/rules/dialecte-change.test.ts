import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { packageKindOf, isDialecteChange } from './dialecte-change.ts'

import { describe, expect, it } from 'vitest'

import type { DialecteChangeVerdict, PackageKind } from './dialecte-change.types.ts'

type VerdictCase = {
	files: Record<string, string>
	file: string
	expected: DialecteChangeVerdict
}

type KindCase = {
	files: Record<string, string>
	expected: PackageKind
}

function packageJsonOf(name: string): string {
	return `${JSON.stringify({ name })}\n`
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

const NO_IMPORT = moduleOf(['export function widgetName() {', "\treturn 'widget'", '}'])

function ownImportOf(specifier: string): string {
	return moduleOf([
		`import { use } from '${specifier}'`,
		'export function forward() {',
		'\treturn use()',
		'}',
	])
}

function valueImportOf(specifier: string): string {
	return moduleOf([
		`import { read } from '${specifier}'`,
		'export function use() {',
		'\treturn read',
		'}',
	])
}

const TYPE_IMPORT = moduleOf([
	"import type { Widget } from '@dialecte/demo'",
	'export type Own = Widget',
])

const INLINE_TYPE_IMPORT = moduleOf([
	"import { type Widget, type Gadget } from '@dialecte/demo'",
	'export type Own = Widget | Gadget',
])

const TSCONFIG_PATHS = `${JSON.stringify({ compilerOptions: { paths: { '@/*': ['src/*'] } } })}\n`

const CORE_PACKAGE = { 'package.json': packageJsonOf('@dialecte/core') }

const DIALECTE_PACKAGE = {
	'package.json': packageJsonOf('@dialecte/demo'),
	'src/v1/generated/definition.generated.ts': 'export {}\n',
}

const CREATE_PACKAGE = { 'package.json': packageJsonOf('@dialecte/create') }

const CLI_PACKAGE = { 'package.json': packageJsonOf('@dialecte/cli') }

const APP_PACKAGE = { 'package.json': packageJsonOf('demo-app') }

const INSTALLED_DIALECTE = {
	'node_modules/@dialecte/demo/package.json': packageJsonOf('@dialecte/demo'),
	'node_modules/@dialecte/demo/dist/v1/generated/definition.generated.js': 'export {}\n',
}

const INSTALLED_TOOLS = {
	'node_modules/@dialecte/tools/package.json': packageJsonOf('@dialecte/tools'),
	'node_modules/@dialecte/tools/dist/index.js': 'export {}\n',
}

const WIDGETS_SERVICE = {
	'src/services/widgets.ts': valueImportOf('@dialecte/core'),
}

function packageHolding(files: Record<string, string>): string {
	const root = temporaryFolder('dialecte-change-')
	writeFiles({ root, files })
	return root
}

describe('isDialecteChange', () => {
	const testCases: Record<string, VerdictCase> = {
		'src/helpers/read.ts in core -> package source': {
			files: { ...CORE_PACKAGE, 'src/helpers/read.ts': NO_IMPORT },
			file: 'src/helpers/read.ts',
			expected: { dialecteChange: true, rule: 'package-source' },
		},
		'src/v1/extensions/widget/add-widget.ts in a dialecte package -> package source': {
			files: { ...DIALECTE_PACKAGE, 'src/v1/extensions/widget/add-widget.ts': NO_IMPORT },
			file: 'src/v1/extensions/widget/add-widget.ts',
			expected: { dialecteChange: true, rule: 'package-source' },
		},
		'src/v1/generated/x.generated.ts in a dialecte package -> file kind': {
			files: { ...DIALECTE_PACKAGE, 'src/v1/generated/x.generated.ts': NO_IMPORT },
			file: 'src/v1/generated/x.generated.ts',
			expected: { dialecteChange: false, rule: 'file-kind' },
		},
		'src/v1/x.d.ts in a dialecte package -> file kind': {
			files: { ...DIALECTE_PACKAGE, 'src/v1/x.d.ts': 'export {}\n' },
			file: 'src/v1/x.d.ts',
			expected: { dialecteChange: false, rule: 'file-kind' },
		},
		'vite.config.ts at the root of a dialecte package -> file kind': {
			files: { ...DIALECTE_PACKAGE, 'vite.config.ts': 'export default {}\n' },
			file: 'vite.config.ts',
			expected: { dialecteChange: false, rule: 'file-kind' },
		},
		'scripts/build.ts at the root of a dialecte package, outside src -> none': {
			files: { ...DIALECTE_PACKAGE, 'scripts/build.ts': NO_IMPORT },
			file: 'scripts/build.ts',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'templates/demo/src/v1/x.test.ts in create -> template': {
			files: { ...CREATE_PACKAGE, 'templates/demo/src/v1/x.test.ts': NO_IMPORT },
			file: 'templates/demo/src/v1/x.test.ts',
			expected: { dialecteChange: true, rule: 'template' },
		},
		'src/x.ts in create, no Dialecte import -> none': {
			files: { ...CREATE_PACKAGE, 'src/x.ts': NO_IMPORT },
			file: 'src/x.ts',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'src/view/panel.ts in an app, only a type import -> none': {
			files: { ...APP_PACKAGE, 'src/view/panel.ts': TYPE_IMPORT },
			file: 'src/view/panel.ts',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'src/view/panel.ts in an app, every specifier type-only inline -> none': {
			files: { ...APP_PACKAGE, 'src/view/panel.ts': INLINE_TYPE_IMPORT },
			file: 'src/view/panel.ts',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'src/view/panel.ts in an app, value import of an installed dialecte -> import': {
			files: {
				...APP_PACKAGE,
				...INSTALLED_DIALECTE,
				'src/view/panel.ts': valueImportOf('@dialecte/demo'),
			},
			file: 'src/view/panel.ts',
			expected: { dialecteChange: true, rule: 'import' },
		},
		'src/view/panel.ts in an app, value import of an installed package with no dist definition -> none':
			{
				files: {
					...APP_PACKAGE,
					...INSTALLED_TOOLS,
					'src/view/panel.ts': valueImportOf('@dialecte/tools'),
				},
				file: 'src/view/panel.ts',
				expected: { dialecteChange: false, rule: 'none' },
			},
		'src/view/panel.ts in an app, value import of @dialecte/core/helpers -> import': {
			files: { ...APP_PACKAGE, 'src/view/panel.ts': valueImportOf('@dialecte/core/helpers') },
			file: 'src/view/panel.ts',
			expected: { dialecteChange: true, rule: 'import' },
		},
		'src/view/panel.ts in an app, value import of @dialecte/demo/test -> import': {
			files: {
				...APP_PACKAGE,
				...INSTALLED_DIALECTE,
				'src/view/panel.ts': valueImportOf('@dialecte/demo/test'),
			},
			file: 'src/view/panel.ts',
			expected: { dialecteChange: true, rule: 'import' },
		},
		'src/view/panel.ts in an app, imports a Dialecte file through @/ -> own import': {
			files: {
				...APP_PACKAGE,
				...WIDGETS_SERVICE,
				'tsconfig.json': TSCONFIG_PATHS,
				'src/view/panel.ts': ownImportOf('@/services/widgets'),
			},
			file: 'src/view/panel.ts',
			expected: { dialecteChange: true, rule: 'own-import' },
		},
		'src/view/panel.ts in an app, imports a Dialecte file relatively -> own import': {
			files: {
				...APP_PACKAGE,
				...WIDGETS_SERVICE,
				'src/view/panel.ts': ownImportOf('../services/widgets'),
			},
			file: 'src/view/panel.ts',
			expected: { dialecteChange: true, rule: 'own-import' },
		},
		'src/view/panel.ts in an app, imports a Dialecte file through the folder index -> own import': {
			files: {
				...APP_PACKAGE,
				...WIDGETS_SERVICE,
				'src/services/index.ts': "export { use } from './widgets'\n",
				'src/view/panel.ts': ownImportOf('../services'),
			},
			file: 'src/view/panel.ts',
			expected: { dialecteChange: true, rule: 'own-import' },
		},
		'src/view/panel.ts in an app, imports a file that imports a Dialecte file -> none (one level)':
			{
				files: {
					...APP_PACKAGE,
					...WIDGETS_SERVICE,
					'src/services/relay.ts': ownImportOf('./widgets'),
					'src/view/panel.ts': ownImportOf('../services/relay'),
				},
				file: 'src/view/panel.ts',
				expected: { dialecteChange: false, rule: 'none' },
			},
		'src/view/panel.ts in an app, type-only import of a Dialecte file -> none': {
			files: {
				...APP_PACKAGE,
				...WIDGETS_SERVICE,
				'src/view/panel.ts': moduleOf([
					"import type { use } from '../services/widgets'",
					'export type Own = typeof use',
				]),
			},
			file: 'src/view/panel.ts',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'src/view/panel.vue in an app -> none (not parsed)': {
			files: {
				...APP_PACKAGE,
				'src/view/panel.vue': moduleOf([
					'<script setup lang="ts">',
					"import { read } from '@dialecte/core'",
					'</script>',
				]),
			},
			file: 'src/view/panel.vue',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'src/lib/schema/x.ts in the cli, value import of core -> cli': {
			files: { ...CLI_PACKAGE, 'src/lib/schema/x.ts': valueImportOf('@dialecte/core') },
			file: 'src/lib/schema/x.ts',
			expected: { dialecteChange: false, rule: 'cli' },
		},
		'src/lib/x.test.ts in the cli, value import of core -> cli': {
			files: { ...CLI_PACKAGE, 'src/lib/x.test.ts': valueImportOf('@dialecte/core') },
			file: 'src/lib/x.test.ts',
			expected: { dialecteChange: false, rule: 'cli' },
		},
		'src/x.generated.ts in an app, value import of core -> file kind (before the import rule)': {
			files: { ...APP_PACKAGE, 'src/x.generated.ts': valueImportOf('@dialecte/core') },
			file: 'src/x.generated.ts',
			expected: { dialecteChange: false, rule: 'file-kind' },
		},
		'templates/demo/src/v1/x.generated.ts in create -> file kind (before the template rule)': {
			files: { ...CREATE_PACKAGE, 'templates/demo/src/v1/x.generated.ts': NO_IMPORT },
			file: 'templates/demo/src/v1/x.generated.ts',
			expected: { dialecteChange: false, rule: 'file-kind' },
		},
		'src/view/panel.ts in an app, one type and one value specifier from core -> import': {
			files: {
				...APP_PACKAGE,
				'src/view/panel.ts': moduleOf([
					"import { type Widget, read } from '@dialecte/core'",
					'export type Own = Widget',
					'export function use() {',
					'\treturn read',
					'}',
				]),
			},
			file: 'src/view/panel.ts',
			expected: { dialecteChange: true, rule: 'import' },
		},
		'templates/demo/scripts/x.ts in create, outside the template src -> none': {
			files: { ...CREATE_PACKAGE, 'templates/demo/scripts/x.ts': NO_IMPORT },
			file: 'templates/demo/scripts/x.ts',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'scripts/x.ts in core, outside src -> none': {
			files: { ...CORE_PACKAGE, 'scripts/x.ts': NO_IMPORT },
			file: 'scripts/x.ts',
			expected: { dialecteChange: false, rule: 'none' },
		},
		'src/view/panel.ts in an app, value import of an installed dialecte shipping only a .d.ts definition -> import':
			{
				files: {
					...APP_PACKAGE,
					'node_modules/@dialecte/demo/package.json': packageJsonOf('@dialecte/demo'),
					'node_modules/@dialecte/demo/dist/v1/generated/definition.generated.d.ts': 'export {}\n',
					'src/view/panel.ts': valueImportOf('@dialecte/demo'),
				},
				file: 'src/view/panel.ts',
				expected: { dialecteChange: true, rule: 'import' },
			},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(
				isDialecteChange({ root: packageHolding(testCase.files), file: testCase.file }),
			).toEqual(testCase.expected)
		})
})

describe('packageKindOf', () => {
	const testCases: Record<string, KindCase> = {
		'the name @dialecte/core -> core': {
			files: CORE_PACKAGE,
			expected: 'core',
		},
		'a src definition.generated.ts -> dialecte': {
			files: DIALECTE_PACKAGE,
			expected: 'dialecte',
		},
		'the name @dialecte/create -> create': {
			files: CREATE_PACKAGE,
			expected: 'create',
		},
		'the name @dialecte/cli -> cli': {
			files: CLI_PACKAGE,
			expected: 'cli',
		},
		'the name demo-app, no definition -> app': {
			files: APP_PACKAGE,
			expected: 'app',
		},
		'an app whose node_modules holds a src definition -> app': {
			files: {
				...APP_PACKAGE,
				'node_modules/@dialecte/demo/src/v1/generated/definition.generated.ts': 'export {}\n',
			},
			expected: 'app',
		},
		'an app with a definition outside its own src -> app': {
			files: { ...APP_PACKAGE, 'tools/definition.generated.ts': 'export {}\n' },
			expected: 'app',
		},
		'the name @dialecte/other, no definition -> app': {
			files: { 'package.json': packageJsonOf('@dialecte/other') },
			expected: 'app',
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(packageKindOf({ root: packageHolding(testCase.files) })).toBe(testCase.expected)
		})
})
