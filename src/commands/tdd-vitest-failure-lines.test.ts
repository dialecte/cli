/**
 * R1-A2: a tdd run whose vitest wrote no report prints the cli's reason on its own line and vitest's tail as
 * separate relayed lines: no escaped line feed, a colour in the tail kept, a cursor move escaped.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, writeFiles } from '../../test/scratch-repository.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import {
	COLOURED_TAIL_LINE,
	LINE_FEED_ESCAPE,
	NEW_TEST_FILES,
	NO_REPORT_REASON_PATTERN,
	PACKAGE_FILES,
	PRINTED_MOVED_TAIL_LINE,
	STAND_IN_BINARY,
	VITEST_WITHOUT_REPORT,
} from './tdd-vitest-failure-lines.constants.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const SUBCOMMANDS = ['red', 'green', 'status'] as const

/** A repository holding the package, a stand-in vitest that writes no report, and a test file new in the tree. */
function packageWithVitestWithoutReport(): string {
	const root = createScratchRepository(PACKAGE_FILES)
	const binary = join(root, STAND_IN_BINARY)
	mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true })
	writeFileSync(binary, VITEST_WITHOUT_REPORT)
	chmodSync(binary, 0o755)
	writeFiles({ root, files: NEW_TEST_FILES })
	return root
}

describe('a tdd run without a vitest report', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	for (const subcommand of SUBCOMMANDS)
		it(`tdd ${subcommand} -> the reason on its own line, the tail as separate lines, no escaped line feed`, async () => {
			const root = packageWithVitestWithoutReport()

			const result = await runTdd({ cwd: root, argv: [subcommand], now: () => NOW })

			expect(result.exitCode).toBe(1)
			expect(result.output).not.toContain(LINE_FEED_ESCAPE)
			const lines = result.output.split('\n')
			const reason = lines.find((line) => NO_REPORT_REASON_PATTERN.test(line))
			expect(reason).toBeDefined()
			expect(reason).not.toContain('tail')
			expect(lines).toContain(COLOURED_TAIL_LINE)
			expect(lines).toContain(PRINTED_MOVED_TAIL_LINE)
		})
})
