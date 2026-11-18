/**
 * The one git version parser and floor. The refusals built on them (a merge lot, the forecast) are pinned where they
 * run: `handover-merge.test.ts` ("a git older than 2.38") and `forecast-unknown.test.ts` (the version reason).
 */
import { createScratchRepository } from '../../test/scratch-repository.ts'
import { belowGitFloor, gitVersionOf, readGitVersion } from './git.ts'

import { describe, expect, it } from 'vitest'

describe('gitVersionOf', () => {
	it.each([
		{
			label: 'a 2.37.9 line',
			text: 'git version 2.37.9\n',
			version: { major: 2, minor: 37, version: '2.37.9', line: 'git version 2.37.9' },
		},
		{
			label: 'a 2.38.0 line',
			text: 'git version 2.38.0',
			version: { major: 2, minor: 38, version: '2.38.0', line: 'git version 2.38.0' },
		},
		{
			label: 'an Apple Git line',
			text: 'git version 2.54.0 (Apple Git-157)\n',
			version: {
				major: 2,
				minor: 54,
				version: '2.54.0',
				line: 'git version 2.54.0 (Apple Git-157)',
			},
		},
		{ label: 'text that is no version line', text: 'not git at all', version: undefined },
		{ label: 'no text', text: '', version: undefined },
	])('$label', ({ text, version }) => {
		expect(gitVersionOf({ text })).toEqual(version)
	})
})

describe('belowGitFloor', () => {
	it.each([
		{ label: '2.37.9', text: 'git version 2.37.9', below: true },
		{ label: '1.99.0', text: 'git version 1.99.0', below: true },
		{ label: '2.38.0', text: 'git version 2.38.0', below: false },
		{ label: '3.0.0', text: 'git version 3.0.0', below: false },
		{ label: '2.54.0 (Apple Git-157)', text: 'git version 2.54.0 (Apple Git-157)', below: false },
	])('git $label → below the floor: $below', ({ text, below }) => {
		const version = gitVersionOf({ text })

		expect(version !== undefined && belowGitFloor({ version })).toBe(below)
	})
})

describe('readGitVersion', () => {
	it('real git in a repository → its --version line, which gitVersionOf reads', () => {
		const root = createScratchRepository()

		expect(gitVersionOf({ text: readGitVersion({ root }) })).toMatchObject({
			line: expect.stringMatching(/^git version \d+\.\d+/),
		})
	})
})
