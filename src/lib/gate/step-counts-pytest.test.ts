/** pytest's summary line counted as a test step's counts: what `uv run pytest` prints, colored or quiet. */
import { readStepCounts } from './step-counts.ts'

import { describe, expect, it } from 'vitest'

describe('readStepCounts on pytest output', () => {
	for (const { title, output, expected } of [
		{
			title: 'a passing run, the framed summary line → passed and total',
			output:
				'tests/test_a.py ....                [100%]\n\n============================== 4 passed in 0.12s ===============================\n',
			expected: { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } },
		},
		{
			title: 'failures, errors and skips → failed counts errors too, total the sum',
			output: '=========== 2 failed, 5 passed, 1 skipped, 1 error in 1.03s ============\n',
			expected: { tests: { passed: 5, failed: 3, skipped: 1, total: 9 } },
		},
		{
			title:
				'quiet output (-q), xfailed and xpassed, warnings and deselected → xpassed passed, xfailed skipped, the rest left out',
			output: '....x\n3 passed, 1 xfailed, 1 xpassed, 2 deselected, 4 warnings in 0.50s\n',
			expected: { tests: { passed: 4, failed: 0, skipped: 1, total: 5 } },
		},
		{
			title: 'a summary with its duration in minutes → still read',
			output: '======== 12 passed in 75.20s (0:01:15) ========\n',
			expected: { tests: { passed: 12, failed: 0, skipped: 0, total: 12 } },
		},
		{
			title: 'colored output → the escape codes stripped first',
			output:
				'\u001b[32m======== \u001b[32m\u001b[1m3 passed\u001b[0m\u001b[32m in 0.02s\u001b[0m\u001b[32m ========\u001b[0m\n',
			expected: { tests: { passed: 3, failed: 0, skipped: 0, total: 3 } },
		},
		{
			title: 'no tests collected → total 0, nothing passed',
			output: '============================ no tests ran in 0.01s =============================\n',
			expected: { tests: { passed: 0, failed: 0, skipped: 0, total: 0 } },
		},
		{
			title: 'a line that only looks like it (a log line with "in 3s") → no test counts',
			output: 'downloaded 3 packages in 0.4s\n',
			expected: {},
		},
		{
			title: 'plural errors → each error counted failed',
			output: '======== 1 passed, 2 errors in 0.30s ========\n',
			expected: { tests: { passed: 1, failed: 2, skipped: 0, total: 3 } },
		},
		{
			title: 'a vitest Tests line beside a pytest summary → the vitest counts win',
			output: '======== 9 passed in 0.10s ========\n      Tests  4 passed (4)\n',
			expected: { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } },
		},
		{
			title: 'vitest output naming a duration → vitest counts, pytest not read',
			output: '      Tests  4 passed (4)\n   Duration  1.20s\n',
			expected: { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } },
		},
	]) {
		it(title, () => {
			expect(readStepCounts(output)).toEqual(expected)
		})
	}
})
