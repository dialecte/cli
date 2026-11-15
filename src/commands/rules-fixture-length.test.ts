import {
	DIALECTE_PACKAGE,
	FIXTURE_FILE,
	FIXTURE_LONG_MESSAGE,
	FIXTURE_READER,
	NOT_GROWN,
	TEST_FILE,
} from '../../test/rules-length-run.constants.ts'
import { documentOf, runOn } from '../../test/rules-length-run.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('dialecte rules: fixture-file-long', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const WITH_READER = { ...DIALECTE_PACKAGE, [TEST_FILE]: FIXTURE_READER }

	it('a 121-line fixture a checked test reads with ?raw → one error at line 1 of the xml', () => {
		expect(
			runOn({
				files: { ...WITH_READER, [FIXTURE_FILE]: documentOf({ lineCount: 121 }) },
				argv: [TEST_FILE],
			}).findings,
		).toEqual([
			{
				rule: 'fixture-file-long',
				file: FIXTURE_FILE,
				line: 1,
				severity: 'error',
				message: FIXTURE_LONG_MESSAGE.replace('{count}', '121'),
			},
		])
	})

	it('a 120-line fixture → none; a 41-line fixture → none', () => {
		expect({
			atLimit: runOn({
				files: { ...WITH_READER, [FIXTURE_FILE]: documentOf({ lineCount: 120 }) },
				argv: [TEST_FILE],
			}).findings,
			short: runOn({
				files: { ...WITH_READER, [FIXTURE_FILE]: documentOf({ lineCount: 41 }) },
				argv: [TEST_FILE],
			}).findings,
		}).toEqual({ atLimit: [], short: [] })
	})

	it('a 121-line xml no checked test imports, the checked test reading another fixture or none → not read, none', () => {
		const OTHER_READER = FIXTURE_READER.replace('big.xml', 'small.xml')
		const NO_READER = "it('adds a widget', () => {\n\texpect(1).toBe(1)\n})\n"
		expect({
			otherFixture: runOn({
				files: {
					...DIALECTE_PACKAGE,
					[TEST_FILE]: OTHER_READER,
					'src/widget/fixtures/small.xml': documentOf({ lineCount: 41 }),
					[FIXTURE_FILE]: documentOf({ lineCount: 121 }),
				},
				argv: [TEST_FILE],
			}).findings,
			noFixture: runOn({
				files: {
					...DIALECTE_PACKAGE,
					[TEST_FILE]: NO_READER,
					[FIXTURE_FILE]: documentOf({ lineCount: 121 }),
				},
				argv: [TEST_FILE],
			}).findings,
		}).toEqual({ otherFixture: [], noFixture: [] })
	})

	it('one fixture read by two checked tests → one finding', () => {
		expect(
			runOn({
				files: {
					...WITH_READER,
					'src/widget/remove-widget.test.ts': FIXTURE_READER,
					[FIXTURE_FILE]: documentOf({ lineCount: 121 }),
				},
				argv: [TEST_FILE, 'src/widget/remove-widget.test.ts'],
			}).findings.map(({ rule, file, line }) => ({ rule, file, line })),
		).toEqual([{ rule: 'fixture-file-long', file: FIXTURE_FILE, line: 1 }])
	})

	it('a fixture created since the base, over 120 lines → one error', () => {
		expect(
			runOn({
				files: WITH_READER,
				edited: { [FIXTURE_FILE]: documentOf({ lineCount: 121 }) },
				argv: [TEST_FILE],
			}).findings.map(({ rule, file, severity }) => ({ rule, file, severity })),
		).toEqual([{ rule: 'fixture-file-long', file: FIXTURE_FILE, severity: 'error' }])
	})

	it('an xml opt-out with a reason on its first line → no finding, one silenced finding counted', () => {
		const { findings, json } = runOn({
			files: {
				...WITH_READER,
				[FIXTURE_FILE]: documentOf({
					lineCount: 121,
					first: '<!-- dialecte-allow fixture-file-long: one document of every variant -->',
				}),
			},
			argv: [TEST_FILE],
		})

		expect({ findings, allowed: json.allowed?.['fixture-file-long'] }).toEqual({
			findings: [],
			allowed: 1,
		})
	})

	it('an xml opt-out whose reason is under 15 characters → an invalid opt-out error on the xml, the length error stays', () => {
		expect(
			runOn({
				files: {
					...WITH_READER,
					[FIXTURE_FILE]: documentOf({
						lineCount: 121,
						first: '<!-- dialecte-allow fixture-file-long: too short -->',
					}),
				},
				argv: [TEST_FILE],
			}).findings.map(({ rule, file, line, severity }) => ({ rule, file, line, severity })),
		).toEqual([
			{ rule: 'fixture-file-long', file: FIXTURE_FILE, line: 1, severity: 'error' },
			{ rule: 'invalid-allow', file: FIXTURE_FILE, line: 1, severity: 'error' },
		])
	})

	it('a committed fixture of 130 lines with 3 lines added since the base → one error', () => {
		expect(
			runOn({
				files: { ...WITH_READER, [FIXTURE_FILE]: documentOf({ lineCount: 130 }) },
				edited: { [FIXTURE_FILE]: documentOf({ lineCount: 133 }) },
				argv: [TEST_FILE],
			}).findings.map(({ rule, file, line, severity }) => ({ rule, file, line, severity })),
		).toEqual([{ rule: 'fixture-file-long', file: FIXTURE_FILE, line: 1, severity: 'error' }])
	})

	it('a committed fixture of 130 lines, one line changed → one warning ending as not grown', () => {
		expect(
			runOn({
				files: { ...WITH_READER, [FIXTURE_FILE]: documentOf({ lineCount: 130 }) },
				edited: { [FIXTURE_FILE]: documentOf({ lineCount: 130, first: '<Root id="1">' }) },
				argv: [TEST_FILE],
			}).findings.map(({ rule, severity, message }) => ({ rule, severity, message })),
		).toEqual([
			{
				rule: 'fixture-file-long',
				severity: 'warning',
				message: `${FIXTURE_LONG_MESSAGE.replace('{count}', '130')}${NOT_GROWN}`,
			},
		])
	})
})
