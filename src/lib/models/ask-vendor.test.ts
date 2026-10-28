import { PassThrough } from 'node:stream'

import { askVendor } from './ask-vendor.ts'

import { describe, expect, it } from 'vitest'

describe('askVendor', () => {
	it('"2" -> the second candidate; an invalid answer asks again', async () => {
		const input = new PassThrough()
		const output = new PassThrough()
		input.write('9\n2\n')

		const chosen = await askVendor({ candidates: ['anthropic', 'openai', 'google'], input, output })

		expect(chosen).toBe('openai')
	})
})
