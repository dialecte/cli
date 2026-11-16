/**
 * Independent review, I-10: the help of `lot standard` says an outside record's `confirmed` flag decides whether the
 * card fails at effort high, never the text of its note.
 */
import { listedEntryOf } from './render-help.ts'

import { describe, expect, it } from 'vitest'

describe('the help of lot standard: the confirmed flag of an outside record', () => {
	it('names the confirmed flag as what decides and no longer the note ending', () => {
		const help = JSON.stringify(listedEntryOf('standard'))

		expect({
			namesFlag: /confirmed flag/u.test(help),
			readsNote: /unless its note ends/u.test(help),
		}).toEqual({ namesFlag: true, readsNote: false })
	})
})
