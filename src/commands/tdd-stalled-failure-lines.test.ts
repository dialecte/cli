/**
 * R1-A2: a tdd run whose vitest stalled prints the cli's reason on its own line and vitest's tail as separate
 * relayed lines: no escaped line feed, a colour in the tail kept, a cursor move escaped.
 */
import { createScratchRepository, writeFiles } from '../../test/scratch-repository.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runChild } from '../lib/progress/run-child.ts'
import {
	COLOURED_TAIL_LINE,
	LINE_FEED_ESCAPE,
	MOVED_TAIL_LINE,
	NEW_TEST_FILES,
	PACKAGE_FILES,
	PRINTED_MOVED_TAIL_LINE,
} from './tdd-vitest-failure-lines.constants.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/progress/run-child.ts', () => ({ runChild: vi.fn() }))

const NOW = new Date('2026-11-10T12:00:00.000Z')
const STALL_PATTERN = /^tdd red: vitest .*stalled/

describe('a tdd run whose vitest stalled', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('tdd red -> the reason on its own line, the tail as separate lines, no escaped line feed', async () => {
		vi.mocked(runChild).mockResolvedValue({
			exitCode: undefined,
			output: `${COLOURED_TAIL_LINE}\n${MOVED_TAIL_LINE}\n`,
			stalled: {
				processes: [],
				report: '  424242 R 2 m 0 s node server.js',
			},
		})
		const root = createScratchRepository(PACKAGE_FILES)
		writeFiles({ root, files: NEW_TEST_FILES })

		const result = await runTdd({ cwd: root, argv: ['red'], now: () => NOW })

		expect(result.exitCode).toBe(1)
		expect(result.output).not.toContain(LINE_FEED_ESCAPE)
		const lines = result.output.split('\n')
		const reason = lines.find((line) => STALL_PATTERN.test(line))
		expect(reason).toBeDefined()
		expect(reason).not.toContain('tail')
		expect(lines).toContain(COLOURED_TAIL_LINE)
		expect(lines).toContain(PRINTED_MOVED_TAIL_LINE)
	})
})
