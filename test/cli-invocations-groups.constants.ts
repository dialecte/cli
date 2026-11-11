import type { CliSurface } from '../src/lib/skills/cli-invocations.types.ts'

/** A surface built here, not the real map: the check reads whatever surface it is given. */
export const GROUPS_SURFACE: CliSurface = {
	commands: [
		{ name: 'gate', verbs: [], flags: ['--fast', '--full', '--json'] },
		{ name: 'doctor', verbs: [], flags: ['--brief', '--json'] },
	],
	renamed: [],
}
