import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readRecordedArguments, writeRecordingScript } from '../../../test/recording-script.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { VITEST_FOLDER } from '../../../test/scratch-vitest-package.constants.ts'
import { runTestCases } from './run-test-cases.ts'
import { VITEST_BIN_PATH } from './tdd.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** npx cannot start: the only way to run vitest is the package binary itself. */
function withoutNpx(): void {
	vi.stubEnv('PATH', temporaryFolder('dialecte-tdd-empty-path-'))
}

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A package whose `node_modules/.bin/vitest` records its argv and writes an empty report. */
function packageWithRecordingVitest(): string {
	const root = temporaryFolder('dialecte-tdd-binary-')
	writeFileSync(join(root, 'package.json'), '{"name":"demo"}\n')
	writeRecordingScript({ path: join(root, ...VITEST_BIN_PATH) })
	return root
}

describe('runTestCases starts the package binary', { timeout: 30_000 }, () => {
	it('node_modules/.bin/vitest exists → it is the one started, run first, then the files and today arguments in order', async () => {
		const root = packageWithRecordingVitest()
		withoutNpx()

		await expect(
			runTestCases({ root, files: ['a.test.ts', 'b.test.ts'], filter: 'all' }),
		).resolves.toEqual([])

		expect(readRecordedArguments({ folder: root })).toEqual([
			'run',
			'a.test.ts',
			'b.test.ts',
			expect.stringMatching(/^--reporter=.*tdd-reporter\.(js|ts)$/),
			'--includeTaskLocation',
			'--passWithNoTests',
			'--update=none',
		])
	})

	it('a filter of names → -t and the pattern follow the binary arguments', async () => {
		const root = packageWithRecordingVitest()
		withoutNpx()

		await expect(
			runTestCases({ root, files: ['a.test.ts'], filter: { names: ['group > one'] } }),
		).resolves.toEqual([])

		const argv = readRecordedArguments({ folder: root })
		expect(argv[0]).toBe('run')
		expect(argv.slice(argv.indexOf('-t'))).toEqual(['-t', '^(?:group one)$'])
	})

	it('no node_modules/.bin/vitest → npx --no-install vitest run is started, the files after', async () => {
		const root = temporaryFolder('dialecte-tdd-fallback-')
		writeFileSync(join(root, 'package.json'), '{"name":"demo"}\n')
		const toolFolder = temporaryFolder('dialecte-tdd-fake-npx-')
		writeRecordingScript({ path: join(toolFolder, 'npx') })
		vi.stubEnv('PATH', toolFolder)

		await expect(runTestCases({ root, files: ['a.test.ts'], filter: 'all' })).resolves.toEqual([])

		expect(readRecordedArguments({ folder: root }).slice(0, 4)).toEqual([
			'--no-install',
			'vitest',
			'run',
			'a.test.ts',
		])
	})

	it('no node_modules/.bin/vitest, a vitest only on the PATH → real npx runs it and the real report comes back', async () => {
		const root = temporaryFolder('dialecte-tdd-real-npx-')
		writeFileSync(join(root, 'package.json'), '{"name":"demo","type":"module"}\n')
		mkdirSync(join(root, 'node_modules'), { recursive: true })
		symlinkSync(VITEST_FOLDER, join(root, 'node_modules', 'vitest'))
		writeFileSync(
			join(root, 'demo.test.ts'),
			"import { expect, it } from 'vitest'\nit('adds', () => {\n\texpect(1 + 1).toBe(2)\n})\n",
		)
		const toolFolder = temporaryFolder('dialecte-tdd-path-vitest-')
		symlinkSync(join(VITEST_FOLDER, 'vitest.mjs'), join(toolFolder, 'vitest'))
		vi.stubEnv('PATH', [toolFolder, dirname(process.execPath), '/bin'].join(':'))

		await expect(
			runTestCases({ root, files: ['demo.test.ts'], filter: 'all' }),
		).resolves.toMatchObject([{ cases: [{ name: 'adds', state: 'passed' }] }])
	})
})
