import { FORBIDDEN_WORDS_KEY } from '../../../test/forbidden-words-workspace.constants.ts'
/**
 * R1-C2: forbidden words and consumer names are whole words even when they start or end with a non-ASCII letter or
 * a non-word character, and never match inside a longer word.
 */
import { configureMachine } from '../../../test/forbidden-words-workspace.ts'
import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { findReferences, readReferencePatterns } from './committed-text.ts'
import { BOUNDARY_CASES } from './forbidden-words-boundaries.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const CONSUMER_NAMES_KEY = 'dialecte.consumerNames'

/** A contributor package whose repository's git config holds `value` under `key`. */
function contributorWith(params: { key: string; value: string }): string {
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: '@dialecte/demo', dialecte: { profile: 'contributor' } })}\n`,
	})
	git({ root, args: ['config', params.key, params.value] })
	return root
}

/** How many times `word` is found in `text` by the package's patterns of `label`. */
function foundCount(params: { root: string; label: string; text: string }): number {
	const patterns = readReferencePatterns(params.root).filter(
		(pattern) => pattern.label === params.label,
	)
	return findReferences({ text: params.text, patterns }).length
}

afterEach(() => vi.unstubAllEnvs())

describe('forbidden words at their edges', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const boundary of BOUNDARY_CASES)
		it(`${boundary.title} -> ${boundary.found ? 'found' : 'not found'}`, () => {
			configureMachine()
			const root = contributorWith({ key: FORBIDDEN_WORDS_KEY, value: boundary.word })

			const count = foundCount({ root, label: 'forbidden word', text: boundary.text })

			expect(count > 0).toBe(boundary.found)
		})
})

describe('consumer names at their edges', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const boundary of BOUNDARY_CASES)
		it(`${boundary.title} -> ${boundary.found ? 'found' : 'not found'}`, () => {
			configureMachine()
			const root = contributorWith({ key: CONSUMER_NAMES_KEY, value: boundary.word })

			const count = foundCount({ root, label: 'consumer tool name', text: boundary.text })

			expect(count > 0).toBe(boundary.found)
		})
})
