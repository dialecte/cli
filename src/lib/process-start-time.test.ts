import { processStartTime } from './process-start-time.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

describe('processStartTime', () => {
	it('the same process read under two time zones → the same start time', () => {
		const zone = process.env.TZ
		onTestFinished(function restoreZone() {
			if (zone === undefined) delete process.env.TZ
			else process.env.TZ = zone
		})

		process.env.TZ = 'Asia/Tokyo'
		const inTokyo = processStartTime(process.pid)
		process.env.TZ = 'America/New_York'
		const inNewYork = processStartTime(process.pid)

		expect(inTokyo).toBeDefined()
		expect(inNewYork).toBe(inTokyo)
	})
})
