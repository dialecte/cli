import { PACKAGE_NAME, SCOPE_FILE, OTHER_FILE } from '../../test/mutation-package.constants.ts'
import {
	mutationPackage,
	parsedOutput,
	runMutantsIn,
	storedReportedRun,
	survivorOf,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'

import { describe, expect, it } from 'vitest'

const NUMBERED = Array.from(
	{ length: 30 },
	(_unused, index) => `const v${index + 1} = ${index + 1}`,
).join('\n')

/** A package with two engine files and one pending survivor in each, reported by a stored run. */
function pendingPackage(): string {
	const root = mutationPackage({ files: { [SCOPE_FILE]: NUMBERED, [OTHER_FILE]: NUMBERED } })
	storedReportedRun({
		root,
		startedAt: '2026-11-02T10:00:00.000Z',
		survivors: [
			survivorOf({ key: 'in-a', line: 5 }),
			survivorOf({ key: 'in-b', file: OTHER_FILE, line: 8 }),
		],
	})
	return root
}

describe('mutants judge', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('nothing pending → exit 0, "nothing pending for <package>"', async () => {
		await expect(runMutantsIn({ root: mutationPackage(), argv: ['judge'] })).resolves.toMatchObject(
			{
				exitCode: 0,
				output: expect.stringMatching(new RegExp(`nothing pending for ${PACKAGE_NAME}`)),
			},
		)
	})

	it('pending survivors → every packet printed: the file, the key and the window', async () => {
		const root = pendingPackage()

		await expect(runMutantsIn({ root, argv: ['judge'] })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(
				/src\/engine\/a\.ts - 1 pending survivor[\s\S]*in-a[\s\S]*5 \| const v5 = 5[\s\S]*src\/engine\/b\.ts - 1 pending survivor[\s\S]*in-b/,
			),
		})
	})

	it('a pending survivor on a tab-indented line → the window shows the tab as four spaces, no \\u{9}', async () => {
		const root = mutationPackage({
			files: { [OTHER_FILE]: NUMBERED.replace('const v5 = 5', '\tconst v5 = 5') },
		})
		storedReportedRun({
			root,
			startedAt: '2026-11-02T10:00:00.000Z',
			survivors: [survivorOf({ key: 'in-b', file: OTHER_FILE, line: 5 })],
		})

		const { output } = await runMutantsIn({ root, argv: ['judge'] })

		expect(output).toMatch(/5 \|     const v5 = 5/)
		expect(output).not.toContain('\\u{9}')
	})

	it.each([[SCOPE_FILE], [`./${SCOPE_FILE}`]])(
		'--file %s → that file’s packet only',
		async (file) => {
			const root = pendingPackage()

			await expect(runMutantsIn({ root, argv: ['judge', '--file', file] })).resolves.toMatchObject({
				exitCode: 0,
				output: expect.stringContaining('in-a'),
			})
			await expect(runMutantsIn({ root, argv: ['judge', '--file', file] })).resolves.toMatchObject({
				output: expect.not.stringContaining('in-b'),
			})
		},
	)

	it('--file with no pending item → exit 0, "nothing pending in <file>"', async () => {
		await expect(
			runMutantsIn({ root: pendingPackage(), argv: ['judge', '--file', 'src/engine/none.ts'] }),
		).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringContaining('nothing pending in src/engine/none.ts'),
		})
	})

	it('--json → exactly one JSON object: verb, ok, package, the packets', async () => {
		const root = pendingPackage()

		await expect(
			runMutantsIn({ root, argv: ['judge', '--json'] }).then(({ exitCode, output }) => ({
				exitCode,
				json: parsedOutput(output),
			})),
		).resolves.toMatchObject({
			exitCode: 0,
			json: {
				verb: 'judge',
				ok: true,
				package: PACKAGE_NAME,
				packets: [
					{ file: SCOPE_FILE, survivors: [{ key: 'in-a', line: 5 }], more: 0 },
					{ file: OTHER_FILE, survivors: [{ key: 'in-b', line: 8 }], more: 0 },
				],
			},
		})
	})

	it('--json with nothing pending → ok, no packets', async () => {
		await expect(
			runMutantsIn({ root: mutationPackage(), argv: ['judge', '--json'] }).then(({ output }) =>
				parsedOutput(output),
			),
		).resolves.toEqual({ verb: 'judge', ok: true, package: PACKAGE_NAME, packets: [] })
	})

	it('--json --file → that file’s packet only', async () => {
		await expect(
			runMutantsIn({
				root: pendingPackage(),
				argv: ['judge', '--json', '--file', OTHER_FILE],
			}).then(({ output }) => parsedOutput(output)),
		).resolves.toMatchObject({ packets: [{ file: OTHER_FILE }] })
	})

	it('--json with a usage error → one JSON object, ok false, exit 2', async () => {
		await expect(
			runMutantsIn({ root: mutationPackage(), argv: ['judge', '--json', 'extra'] }).then(
				({ exitCode, output }) => ({ exitCode, json: parsedOutput(output) }),
			),
		).resolves.toMatchObject({
			exitCode: 2,
			json: { verb: 'judge', ok: false, reason: expect.any(String) },
		})
	})

	it.each([
		['an unknown option', ['judge', '--bogus'], '--bogus'],
		['a word', ['judge', 'extra'], 'mutants judge'],
		['--file without a file', ['judge', '--file'], '--file'],
	])('%s → usage, exit 2', async (_label, argv, shown) => {
		await expect(runMutantsIn({ root: pendingPackage(), argv })).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(shown),
		})
		await expect(runMutantsIn({ root: pendingPackage(), argv })).resolves.toMatchObject({
			output: expect.stringContaining('mutants judge'),
		})
	})
})
