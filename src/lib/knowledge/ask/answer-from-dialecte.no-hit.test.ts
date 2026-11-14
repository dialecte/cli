import { newFactsFolder, requestOf, setupOf } from '../../../../test/ask-ladder-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { answerFromDialecte } from './answer-from-dialecte.ts'

import { describe, expect, it } from 'vitest'

describe('answerFromDialecte: a method need with no hit (D11b)', () => {
	it('no method holds a word of the need -> no answer, no path listed: { methods: [] }', async () => {
		const dialecte = await loadMultiDeclaredDialecte()

		expect(
			answerFromDialecte({
				kind: 'method',
				slots: { rest: 'zzzz' },
				request: requestOf({ question: 'which method zzzz' }),
				setup: setupOf({ dialecte, factsFolder: newFactsFolder() }),
			}),
		).toEqual({ methods: [] })
	})
})
