/**
 * Whether a path, relative to the package root, matches a glob of the lot file: `**` stands for zero or
 * more folders, `*` for any characters but `/`, `?` for one character but `/`; every other character is
 * itself.
 */
import { GLOB_SPECIAL_CHARACTER_PATTERN } from './tdd.constants.ts'

export function matchesGlob(params: { path: string; glob: string }): boolean {
	return globExpression(params.glob).test(params.path)
}

/** The glob as a regular expression over a whole path. */
function globExpression(glob: string): RegExp {
	let source = ''
	for (let index = 0; index < glob.length; index++) {
		const character = glob[index]
		if (glob.startsWith('**/', index)) {
			// zero or more whole folders
			source += '(?:[^/]*/)*'
			index += 2
		} else if (glob.startsWith('**', index)) {
			source += '.*'
			index += 1
		} else if (character === '*') source += '[^/]*'
		else if (character === '?') source += '[^/]'
		else source += character.replace(GLOB_SPECIAL_CHARACTER_PATTERN, '\\$&')
	}
	return new RegExp(`^${source}$`)
}
