export const LOT_NAME = '0084-repo-widget'
export const TEST_FILE = 'src/widget/add-widget.test.ts'
/** The release tag `<name>@v<version>` of the package of each kind. */
export const RELEASE_TAG = { dialecte: '@dialecte/demo@v0.1.0', app: 'demo-app@v0.1.0' } as const
export const GATE_BASE_VARIABLE = 'DIALECTE_GATE_BASE'

const DIALECTE_PACKAGE_FILES = {
	'package.json': `${JSON.stringify({ name: '@dialecte/demo' })}\n`,
	'src/v1/generated/definition.generated.ts': 'export {}\n',
}

/** An app that installs a dialecte shipping a built definition: its test file importing it is a Dialecte change. */
const APP_PACKAGE_FILES = {
	'package.json': `${JSON.stringify({ name: 'demo-app' })}\n`,
	'node_modules/@dialecte/demo/package.json': `${JSON.stringify({ name: '@dialecte/demo' })}\n`,
	'node_modules/@dialecte/demo/dist/v1/generated/definition.generated.js': 'export {}\n',
}

/** The files a commit on the lot's branch and a commit on main add, neither touching the test file. */
export const LOT_BRANCH_FILE = 'src/widget/notes-lot.ts'
export const MAIN_BRANCH_FILE = 'src/widget/notes-main.ts'

function testModuleOf(lines: string[]): string {
	return [
		"import { runWidgetTestCases } from '@dialecte/demo/test'",
		'',
		'const testCases = {',
		...lines,
		'}',
		'runWidgetTestCases.withExport({ testCases, act: async () => {} })',
		'',
	].join('\n')
}

/** The package files and the test file at the base, per kind of package: one case that splices XML, on line 4. */
export const BASE_FILES: Readonly<Record<'dialecte' | 'app', Readonly<Record<string, string>>>> = {
	dialecte: {
		...DIALECTE_PACKAGE_FILES,
		[TEST_FILE]: testModuleOf([
			"\t'a widget with children': { sourceXml: `<Root>${CHILDREN}</Root>` },",
		]),
	},
	app: {
		...APP_PACKAGE_FILES,
		[TEST_FILE]: testModuleOf([
			"\t'a widget with children': { sourceXml: `<Root>${CHILDREN}</Root>` },",
		]),
	},
}

/** The same file with a second splicing case added on line 5; line 4 is unchanged. */
export const CHANGED_TEST_FILE = testModuleOf([
	"\t'a widget with children': { sourceXml: `<Root>${CHILDREN}</Root>` },",
	"\t'a widget with items': { sourceXml: `<Root>${ITEMS}</Root>` },",
])
