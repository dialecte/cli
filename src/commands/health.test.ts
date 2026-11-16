import { ONE_HOUR_MS } from '../../test/health-stall.constants.ts'
/**
 * `dialecte health [--since <date|duration>] [--repository <name>] [--json]`: the stores walked as the inbox
 * walks them, each common dir read, the findings printed red first; exit 1 on a red, 0 otherwise, 2 for a usage error.
 * It reads files only.
 */
import {
	AFTER_FIXTURE_SINCE,
	OK_LINE,
	REAL_FINDINGS_NEWEST_FIRST,
} from '../../test/health-verb.constants.ts'
import {
	emptyHealthCommon,
	fileStatesOf,
	headOf,
	jsonRunOf,
	runHealthOn,
	scratchHeadOf,
	summaryOf,
	usageOf,
} from '../../test/health-verb.ts'
import { FIXTURE_0105 } from '../../test/health.constants.ts'
import { copyHealthFixture } from '../../test/health.ts'
import { SCRATCH_LEAK_MS } from '../lib/health/health.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const FIXTURE_SINCE = '2026-11-15T00:00:00.000Z'

/** The header a run prints for a window start and the counts. */
function headerOf(params: { since: string; red: number; amber: number }): string {
	return `health  since ${params.since}  ${params.red} red · ${params.amber} amber`
}

describe('health on the real 0105 records', () => {
	it('--since 2026-11-15 at noon → exit 1, the header counts three red, the first finding line is red', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(headOf(runHealthOn({ common, argv: ['--since', '2026-11-15'] }))).toEqual({
			exitCode: 1,
			header: headerOf({ since: FIXTURE_SINCE, red: 3, amber: 0 }),
			first: true,
		})
	})

	it('--since after every record of the fixture → exit 0, no finding, the ok line', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(summaryOf(runHealthOn({ common, argv: ['--since', AFTER_FIXTURE_SINCE] }))).toEqual({
			exitCode: 0,
			lines: [headerOf({ since: AFTER_FIXTURE_SINCE, red: 0, amber: 0 }), OK_LINE],
		})
	})

	it('--json → { since, findings, counts }, the findings red first and newest first', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(jsonRunOf(runHealthOn({ common, argv: ['--since', '2026-11-15', '--json'] }))).toEqual({
			exitCode: 1,
			since: FIXTURE_SINCE,
			keys: REAL_FINDINGS_NEWEST_FIRST,
			counts: { red: 3, amber: 0 },
			repositories: ['cli', 'cli', 'cli'],
		})
	})

	it('--repository cli → its three findings; --repository other and --repository cl → none, exit 0', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(
			[
				summaryOf(runHealthOn({ common, argv: ['--since', '2026-11-15', '--repository', 'cli'] })),
				summaryOf(
					runHealthOn({ common, argv: ['--since', '2026-11-15', '--repository', 'other'] }),
				),
				summaryOf(runHealthOn({ common, argv: ['--since', '2026-11-15', '--repository', 'cl'] })),
			].map(({ exitCode, lines }) => [exitCode, lines[0]]),
		).toEqual([
			[1, headerOf({ since: FIXTURE_SINCE, red: 3, amber: 0 })],
			[0, headerOf({ since: FIXTURE_SINCE, red: 0, amber: 0 })],
			[0, headerOf({ since: FIXTURE_SINCE, red: 0, amber: 0 })],
		])
	})

	it('run from inside the repository and the same store on the store list → the store is read once: three red, not six', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(
			summaryOf(runHealthOn({ common, argv: ['--since', '2026-11-15'], cwd: 'repository' }))
				.lines[0],
		).toBe(headerOf({ since: FIXTURE_SINCE, red: 3, amber: 0 }))
	})

	it('run from inside the repository, its store not on the list → its findings are read', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })

		expect(
			summaryOf(
				runHealthOn({
					common,
					argv: ['--since', '2026-11-15'],
					cwd: 'repository',
					listed: false,
				}),
			).lines[0],
		).toBe(headerOf({ since: FIXTURE_SINCE, red: 3, amber: 0 }))
	})

	it('a run → every file under the common dir keeps its bytes and its modification time', () => {
		const common = copyHealthFixture({ name: FIXTURE_0105 })
		const before = fileStatesOf(common)

		expect(runHealthOn({ common, argv: ['--since', '2026-11-15'] }).exitCode).toBe(1)
		expect(fileStatesOf(common)).toEqual(before)
	})
})

describe('health on a store with no finding', () => {
	it('no option → exit 0, the header with the default window (seven days before now), then the ok line', () => {
		const common = emptyHealthCommon()

		expect(summaryOf(runHealthOn({ common }))).toEqual({
			exitCode: 0,
			lines: [headerOf({ since: '2026-11-08T12:00:00.000Z', red: 0, amber: 0 }), OK_LINE],
		})
	})

	for (const { since, start } of [
		{ since: '24h', start: '2026-11-14T12:00:00.000Z' },
		{ since: '7d', start: '2026-11-08T12:00:00.000Z' },
		{ since: '2026-11-10', start: '2026-11-10T00:00:00.000Z' },
	])
		it(`--since ${since} → the window starts at ${start}, in any time zone`, () => {
			vi.stubEnv('TZ', 'America/New_York')
			const common = emptyHealthCommon()

			expect(summaryOf(runHealthOn({ common, argv: ['--since', since] })).lines[0]).toBe(
				headerOf({ since: start, red: 0, amber: 0 }),
			)
		})

	it('a leaked scratch folder → exit 0, one amber finding named scratch, the header counts it', () => {
		const common = emptyHealthCommon()

		expect(
			scratchHeadOf(
				runHealthOn({
					common,
					scratch: [{ name: 'dialecte-rehearse-1', ageMs: SCRATCH_LEAK_MS + ONE_HOUR_MS }],
				}),
			),
		).toEqual({
			exitCode: 0,
			header: headerOf({ since: '2026-11-08T12:00:00.000Z', red: 0, amber: 1 }),
			second: true,
		})
	})

	it('--disk → usage error (exit 2), the reason and the usage line', () => {
		const common = emptyHealthCommon()

		expect(
			usageOf({ result: runHealthOn({ common, argv: ['--disk'] }), mention: '--disk' }),
		).toEqual({
			exitCode: 2,
			reason: true,
			usage: true,
		})
	})

	it('--json → { since, findings: [], counts: { red: 0, amber: 0 } }, exit 0', () => {
		const common = emptyHealthCommon()

		expect(jsonRunOf(runHealthOn({ common, argv: ['--json'] }))).toEqual({
			exitCode: 0,
			since: '2026-11-08T12:00:00.000Z',
			keys: [],
			counts: { red: 0, amber: 0 },
			repositories: [],
		})
	})
})

describe('health usage errors', () => {
	for (const { name, argv, mention } of [
		{ name: 'a word', argv: ['extra'], mention: 'health takes no word: extra' },
		{ name: 'an unknown flag', argv: ['--bogus'], mention: '--bogus' },
		{ name: 'a --since that is no date nor duration', argv: ['--since', 'nope'], mention: 'nope' },
		{ name: 'a --since with no value', argv: ['--since'], mention: '--since' },
	])
		it(`${name} → exit 2, the reason and the usage line`, () => {
			const common = emptyHealthCommon()

			expect(usageOf({ result: runHealthOn({ common, argv }), mention })).toEqual({
				exitCode: 2,
				reason: true,
				usage: true,
			})
		})
})
