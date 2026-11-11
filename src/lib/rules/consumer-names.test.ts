import { createScratchRepository, git, isolateGitConfig } from '../../../test/scratch-repository.ts'
import { findReferences, readReferencePatterns } from './committed-text.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** A package of `profile` whose repository's git config names `names` (unset when undefined). */
function packageNaming(params: { profile: 'contributor' | 'consumer'; names?: string }): string {
	isolateGitConfig()
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: '@dialecte/demo', dialecte: { profile: params.profile } })}\n`,
	})
	if (params.names !== undefined)
		git({ root, args: ['config', 'dialecte.consumerNames', params.names] })
	return root
}

afterEach(() => vi.unstubAllEnvs())

describe('consumer tool names (git config dialecte.consumerNames)', () => {
	it('contributor with names set → one pattern, whole words, case kept', () => {
		const root = packageNaming({ profile: 'contributor', names: 'Acme, Acme Studio' })

		const patterns = readReferencePatterns(root)

		expect(patterns.filter((pattern) => pattern.label === 'consumer tool name')).toHaveLength(1)
		expect(findReferences({ text: 'built for Acme here', patterns })).toEqual([
			expect.objectContaining({ label: 'consumer tool name' }),
		])
		expect(findReferences({ text: 'acme in lower case, Acmeville', patterns })).toEqual([])
	})

	it('a name holding regular expression characters → matched literally', () => {
		const root = packageNaming({ profile: 'contributor', names: 'A.B' })

		const patterns = readReferencePatterns(root)

		expect(findReferences({ text: 'made by A.B', patterns })).toHaveLength(1)
		expect(findReferences({ text: 'made by AxB', patterns })).toEqual([])
	})

	it('contributor without the config → no consumer tool name pattern', () => {
		const root = packageNaming({ profile: 'contributor' })

		expect(
			readReferencePatterns(root).filter((pattern) => pattern.label === 'consumer tool name'),
		).toEqual([])
	})

	it('consumer → never the pattern, the app names itself freely', () => {
		const root = packageNaming({ profile: 'consumer', names: 'Acme' })

		expect(
			readReferencePatterns(root).filter((pattern) => pattern.label === 'consumer tool name'),
		).toEqual([])
	})
})
