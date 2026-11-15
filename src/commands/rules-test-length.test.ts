import {
	DIALECTE_PACKAGE,
	NOT_GROWN,
	SOURCE_FILE,
	TEST_FILE,
	TEST_FILE_LONG_MESSAGE,
} from '../../test/rules-length-run.constants.ts'
import { commentsOf, runOn } from '../../test/rules-length-run.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('dialecte rules: test-file-long', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const LONG = TEST_FILE_LONG_MESSAGE

	it('a new test file of 401 lines, no base → one error at line 1 with the count', () => {
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE, [TEST_FILE]: commentsOf({ lineCount: 401 }) },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([
			{
				rule: 'test-file-long',
				file: TEST_FILE,
				line: 1,
				severity: 'error',
				message: LONG.replace('{count}', '401'),
			},
		])
	})

	it('a test file of 400 lines → none', () => {
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE, [TEST_FILE]: commentsOf({ lineCount: 400 }) },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([])
	})

	it('a 401-line implementation file → none', () => {
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE, [SOURCE_FILE]: commentsOf({ lineCount: 401 }) },
				argv: [SOURCE_FILE],
			}).findings,
		).toEqual([])
	})

	it('a test file created over the limit since the base → one error', () => {
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE },
				edited: { [TEST_FILE]: commentsOf({ lineCount: 401 }) },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([
			{
				rule: 'test-file-long',
				file: TEST_FILE,
				line: 1,
				severity: 'error',
				message: LONG.replace('{count}', '401'),
			},
		])
	})

	it('a committed file of 500 lines with one line changed and none added → one warning ending as not grown', () => {
		const committed = commentsOf({ lineCount: 500 })
		const edited = commentsOf({ lineCount: 500, first: '// one changed row' })
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE, [TEST_FILE]: committed },
				edited: { [TEST_FILE]: edited },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([
			{
				rule: 'test-file-long',
				file: TEST_FILE,
				line: 1,
				severity: 'warning',
				message: `${LONG.replace('{count}', '500')}${NOT_GROWN}`,
			},
		])
	})

	it('a committed file of 390 lines grown to 410 → one error', () => {
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE, [TEST_FILE]: commentsOf({ lineCount: 390 }) },
				edited: { [TEST_FILE]: commentsOf({ lineCount: 410 }) },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([
			{
				rule: 'test-file-long',
				file: TEST_FILE,
				line: 1,
				severity: 'error',
				message: LONG.replace('{count}', '410'),
			},
		])
	})

	it('a committed file of 500 lines cut to 450 → one warning ending as not grown', () => {
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE, [TEST_FILE]: commentsOf({ lineCount: 500 }) },
				edited: { [TEST_FILE]: commentsOf({ lineCount: 450 }) },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([
			{
				rule: 'test-file-long',
				file: TEST_FILE,
				line: 1,
				severity: 'warning',
				message: `${LONG.replace('{count}', '450')}${NOT_GROWN}`,
			},
		])
	})

	it('a committed file of 500 lines with 3 lines added → one error that is not softened as not added', () => {
		expect(
			runOn({
				files: { ...DIALECTE_PACKAGE, [TEST_FILE]: commentsOf({ lineCount: 500 }) },
				edited: { [TEST_FILE]: commentsOf({ lineCount: 503 }) },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([
			{
				rule: 'test-file-long',
				file: TEST_FILE,
				line: 1,
				severity: 'error',
				message: LONG.replace('{count}', '503'),
			},
		])
	})

	it('an opt-out with a reason on line 1 → no finding, one silenced finding counted', () => {
		const { findings, json } = runOn({
			files: {
				...DIALECTE_PACKAGE,
				[TEST_FILE]: commentsOf({
					lineCount: 401,
					first: '// dialecte-allow test-file-long: a generated table of every tag',
				}),
			},
			argv: [TEST_FILE],
		})

		expect({ findings, allowed: json.allowed?.['test-file-long'] }).toEqual({
			findings: [],
			allowed: 1,
		})
	})

	it('a 401-line test file in an app that is not a Dialecte change → nothing found, one file not judged', () => {
		const { json } = runOn({
			files: {
				'package.json': `${JSON.stringify({ name: 'demo-app' })}\n`,
				'src/view/panel.test.ts': commentsOf({ lineCount: 401 }),
			},
			argv: ['src/view/panel.test.ts'],
		})

		expect({ findings: json.findings, notJudged: json.notJudged }).toEqual({
			findings: [],
			notJudged: 1,
		})
	})
})
