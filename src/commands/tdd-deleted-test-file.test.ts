/**
 * Moved and deleted test files (FIX-ci-loop design, section 4, item 7): tdd reads test code through one presence map,
 * so a test file deleted with plain `rm` is a deleted file, never a read, in a package whose vitest setup file imports
 * a helper; a plain `mv` with a `moved` entry carries its cases; a `gone` or `moved` entry naming a path the lot leaves
 * unchanged, or one known nowhere, is one refusal naming the verb that removes it.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')

/** The vitest config names a setup file, which imports a helper of the test folder. */
const SETUP_FILES = {
	'vitest.config.ts': "export default { test: { setupFiles: ['./test/setup.ts'] } }\n",
	'test/setup.ts': "import { mark } from './mark.ts'\nmark()\n",
	'test/mark.ts': 'export function mark(): void {\n\tglobalThis.setupMark = 1\n}\n',
}

const ADD = 'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const ADD_STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"

/** A test file of one case in `describe(title)`. */
function addTest(title: string): string {
	return [
		"import { add } from './add.ts'",
		"import { describe, expect, it } from 'vitest'",
		`describe('${title}', () => {`,
		"\tit('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
		'})',
		'',
	].join('\n')
}

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

/** A package with the setup files whose base commit holds the stub `src/add.ts` and its test `src/a.test.ts`. */
function basePackage(): string {
	return createVitestPackage({
		files: {
			...SETUP_FILES,
			'src/add.ts': ADD_STUB,
			'src/a.test.ts': addTest('add'),
		},
	})
}

/** The lot declaration written as `declaration`. */
function declare(params: { root: string; declaration: unknown }): void {
	writeFiles({
		root: params.root,
		files: { '.dialecte/lot.json': JSON.stringify(params.declaration) },
	})
}

describe(
	'a deleted or moved test file in a package with setup files',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('a committed test file deleted with plain rm, not staged, a helper added → tdd status lists it deleted, no ENOENT', async () => {
			const root = basePackage()
			writeFiles({ root, files: { 'test/expected.ts': 'export const EXPECTED = 3\n' } })
			rmSync(join(root, 'src/a.test.ts'))

			await expect(tdd({ cwd: root, argv: ['status'] })).resolves.toMatchObject({
				exitCode: 0,
				output: expect.stringContaining(
					'deleted  src/a.test.ts  the test file of the base is deleted',
				),
			})
		})

		it('a test file changed, proven red, then moved with plain mv and a moved entry → red carries its case', async () => {
			const root = basePackage()
			writeFiles({ root, files: { 'src/a.test.ts': addTest('sum') } })
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, 'src/add.ts'), ADD)
			await tdd({ cwd: root, argv: ['green'] })
			writeFiles({ root, files: { 'src/b.test.ts': addTest('sum') } })
			rmSync(join(root, 'src/a.test.ts'))
			declare({
				root,
				declaration: {
					moved: [{ from: 'src/a.test.ts', to: 'src/b.test.ts', reason: 'a rename' }],
				},
			})

			await expect(tdd({ cwd: root, argv: ['red'] })).resolves.toMatchObject({
				output: expect.stringMatching(/^tdd red: 1 red, /m),
			})
		})
	},
)

/** Entries naming a path the lot leaves unchanged, or one known nowhere, and the verb that removes each. */
const STALE_ENTRIES = [
	{
		entry: 'a gone entry naming a test file present and unchanged',
		declaration: { gone: [{ file: 'src/a.test.ts', reason: 'stale' }] },
		remove: 'dialecte lot gone --remove src/a.test.ts',
	},
	{
		entry: 'a moved entry from a test file present and unchanged',
		declaration: {
			moved: [{ from: 'src/a.test.ts', to: 'src/c.test.ts', reason: 'stale' }],
		},
		remove: 'dialecte lot moved --remove src/a.test.ts src/c.test.ts',
	},
	{
		entry: 'a gone entry naming a path known nowhere',
		declaration: {
			gone: [{ file: 'src/never.test.ts', reason: 'a typo' }],
		},
		remove: 'dialecte lot gone --remove src/never.test.ts',
	},
	{
		entry: 'a moved entry from a path known nowhere',
		declaration: {
			moved: [
				{
					from: 'src/never.test.ts',
					to: 'src/c.test.ts',
					reason: 'a typo',
				},
			],
		},
		remove: 'dialecte lot moved --remove src/never.test.ts src/c.test.ts',
	},
]

describe(
	'a gone or moved entry the presence map refuses',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		for (const { entry, declaration, remove } of STALE_ENTRIES)
			it(`${entry} → tdd status refuses in one line naming the verb that removes it`, async () => {
				const root = basePackage()
				writeFiles({ root, files: { 'src/c.test.ts': addTest('add') } })
				declare({ root, declaration })

				await expect(tdd({ cwd: root, argv: ['status'] })).resolves.toEqual({
					exitCode: 1,
					output: expect.stringMatching(new RegExp(`^tdd status: [^\\n]*${escaped(remove)}$`)),
				})
			})
	},
)

/** `text` as a regular expression matching it literally. */
function escaped(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
