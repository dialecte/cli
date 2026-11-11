/**
 * A group a page opens in code is counted by its own kind (`<...>`, `[...]`, `(...)`): a process substitution
 * `<(dialecte ...)` holds an invocation that is read like any other, and a group of another kind never hides it.
 */
import { GROUPS_SURFACE } from '../../../test/cli-invocations-groups.constants.ts'
import { checkCliInvocations } from './cli-invocations.ts'

import { describe, expect, it } from 'vitest'

import type { SkillFinding } from './skill-file.types.ts'

/** The messages the check finds in a page that cites `code` inline, by page line. */
function findingsOf(code: string): Array<Pick<SkillFinding, 'line' | 'message'>> {
	return checkCliInvocations({
		file: 'skills/demo/SKILL.md',
		markdown: `Run \`${code}\`.\n`,
		surface: GROUPS_SURFACE,
		ignored: new Set(),
	}).map(({ line, message }) => ({ line, message }))
}

/** A message that names the flag `name` as one the command does not have. */
function unknownFlag(name: string): unknown {
	return expect.stringContaining(`has no flag \`${name}\``)
}

describe('checkCliInvocations, groups of their own kind', () => {
	it('a process substitution holding an invocation with an unknown flag -> that flag is the finding', () => {
		expect(findingsOf('diff <(dialecte gate --fats) expected.txt')).toEqual([
			{ line: 1, message: unknownFlag('--fats') },
		])
	})

	it('two process substitutions, a pipe inside the first -> the unknown flag of the second is the finding', () => {
		expect(findingsOf('diff <(dialecte gate --fast | sort) <(dialecte doctor --brif)')).toEqual([
			{ line: 1, message: unknownFlag('--brif') },
		])
	})

	it('a process substitution holding a valid invocation -> no finding', () => {
		expect(findingsOf('diff <(dialecte gate --fast) <(dialecte doctor --brief)')).toEqual([])
	})

	it('a process substitution closed, then an invocation with an unknown flag after it -> that flag is the finding', () => {
		expect(findingsOf('cat <(dialecte gate --full) && dialecte gate --fats')).toEqual([
			{ line: 1, message: unknownFlag('--fats') },
		])
	})

	it('a flag group closed, then an invocation with an unknown flag after it -> that flag is the finding', () => {
		expect(findingsOf('x(--fast | --full) && dialecte gate --fats')).toEqual([
			{ line: 1, message: unknownFlag('--fats') },
		])
	})
})
