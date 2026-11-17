/** `forecast.jsonl`: each line within the store's atomic append, a reader that trusts complete runs only (33CO 4.6). */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { fitForecastLine, readForecastRecord } from './forecast-record.ts'
import { FORECAST_LINE_LIMIT } from './forecast.constants.ts'

import { describe, expect, it } from 'vitest'

import type { ForecastLine } from './forecast.types.ts'

/** A line of run `run` (of `of` lines) against `against`, clean. */
function lineOf(params: { run: string; of: number; against: string }): ForecastLine {
	return {
		schema: 1,
		run: params.run,
		at: '2026-11-17T12:00:00.000Z',
		trigger: 'forecast',
		of: params.of,
		self: { commit: 'a'.repeat(40), snapshot: 'a'.repeat(40), dirty: false },
		main: { ref: 'origin/main', commit: 'b'.repeat(40) },
		against: params.against,
		verdict: 'clean',
		shared: [],
		conflicts: [],
	}
}

/** What the cut kept of a line: its conflict paths, the count left out, the ranges of its first path, its fit. */
function fitSummaryOf(fitted: ForecastLine): Record<string, unknown> {
	return {
		conflicts: fitted.conflicts?.length,
		more: fitted.more,
		ranges: fitted.conflicts?.[0]?.lines.length,
		shared: fitted.shared?.length,
		moreShared: fitted.moreShared,
		fits: Buffer.byteLength(`${JSON.stringify(fitted)}\n`) <= FORECAST_LINE_LIMIT,
	}
}

describe('the forecast record', () => {
	it('30 conflicting files in one pair -> the line holds 10, more 20, within 4 KiB', () => {
		const conflicts = Array.from({ length: 30 }, (_, index) => ({
			path: `src/conflicting/file-${String(index).padStart(2, '0')}.ts`,
			kind: 'content',
			lines: [
				[1, 5],
				[10, 15],
				[20, 25],
				[30, 35],
			] as [number, number][],
		}))
		const shared = Array.from(
			{ length: 15 },
			(_, index) => `src/shared/file-${String(index).padStart(2, '0')}.ts`,
		)
		const line = {
			...lineOf({ run: 'r1', of: 2, against: '0002-repo-b' }),
			verdict: 'conflict' as const,
			shared,
			conflicts,
		}

		expect(fitSummaryOf(fitForecastLine(line))).toEqual({
			conflicts: 10,
			more: 20,
			ranges: 3,
			shared: 10,
			moreShared: 5,
			fits: true,
		})
		// long paths: the line limit, not the cap, cuts; the paths it drops are counted too
		const long = conflicts.map((conflict) => ({
			...conflict,
			path: `${'deep/'.repeat(80)}${conflict.path}`,
		}))
		expect(fitSummaryOf(fitForecastLine({ ...line, shared: [], conflicts: long }))).toMatchObject({
			more: 30 - (fitForecastLine({ ...line, shared: [], conflicts: long }).conflicts?.length ?? 0),
			fits: true,
		})
		expect(
			fitForecastLine({ ...line, shared: [], conflicts: long }).conflicts?.length,
		).toBeLessThan(10)
	})

	it('a torn last line, a line with an unknown key and a run with fewer lines than its of -> counted unreadable, the reader falls back to the newest complete run', () => {
		const lotFolder = temporaryFolder('dialecte-forecast-record-')
		const complete = [
			lineOf({ run: 'r1', of: 2, against: 'main' }),
			lineOf({ run: 'r1', of: 2, against: '0002-repo-b' }),
		]
		const short = lineOf({ run: 'r2', of: 2, against: 'main' })
		const unknownKey = { ...lineOf({ run: 'r3', of: 1, against: 'main' }), extra: true }
		const torn = JSON.stringify(lineOf({ run: 'r4', of: 1, against: 'main' }))
		writeFileSync(
			join(lotFolder, 'forecast.jsonl'),
			`${[...complete, short, unknownKey].map((line) => JSON.stringify(line)).join('\n')}\n${torn}`,
		)

		expect(readForecastRecord({ lotFolder })).toEqual({ lines: complete, unreadable: 3 })
	})
})
