import { createFakeClock } from '../../../test/fake-clock.ts'
import { formatDuration } from './format-duration.ts'
import { startHeartbeat } from './heartbeat.ts'

import { describe, expect, it } from 'vitest'

describe('startHeartbeat', () => {
	it('silent for 75 s → a beat at 30 s and at 60 s, each with the time since the start', () => {
		const clock = createFakeClock()
		const beats: string[] = []
		startHeartbeat({
			clock,
			every: 30_000,
			startedAt: clock.now(),
			onBeat: (beat) => beats.push(formatDuration(beat.elapsed)),
		})

		clock.advance(75_000)

		expect(beats).toEqual(['30 s', '1 m 0 s'])
	})

	it('a line at 20 s → the silence starts again: the first beat at 50 s; none after stop', () => {
		const clock = createFakeClock()
		const beats: number[] = []
		const heartbeat = startHeartbeat({
			clock,
			every: 30_000,
			startedAt: clock.now(),
			onBeat: (beat) => beats.push(beat.elapsed),
		})

		clock.advance(20_000)
		heartbeat.touch()
		clock.advance(40_000)
		heartbeat.stop()
		clock.advance(120_000)

		expect(beats).toEqual([50_000])
	})
})

describe('formatDuration', () => {
	it('each range → its own form', () => {
		expect([400, 42_000, 130_000, 3_900_000].map(formatDuration)).toEqual([
			'0.4 s',
			'42 s',
			'2 m 10 s',
			'1 h 5 m',
		])
	})
})
