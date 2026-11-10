import { STORE_FILES } from '../store/store.constants.ts'

import { describe, expect, it } from 'vitest'

describe('STORE_FILES', () => {
	it('events → the file beside transitions/ is events.jsonl', () => {
		expect(STORE_FILES.events).toBe('events.jsonl')
	})
})
