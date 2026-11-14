import type { CommandFamily } from '../src/lib/command-map/command-map.types.ts'

/** The families in the order the help prints them, each with its commands in the order it lists them. */
export const DECLARED_FAMILIES: Array<[CommandFamily, string[]]> = [
	['Discover', ['api', 'members', 'schema', 'explain', 'standard', 'facts', 'ask']],
	['Use', ['run', 'fixture', 'new']],
	['Grow', ['lot', 'inbox']],
	['Plan', ['plan']],
	['Check', ['gate', 'tdd', 'rules', 'contrib', 'mutants']],
	['Hand over', ['handover']],
	['Workspace', ['worktree', 'doctor', 'models', 'skills']],
	['Maintain', ['bench', 'coverage', 'narrowing', 'audit', 'text']],
]

/** Registered only to answer that they were renamed: no family lists them. */
export const RENAMED_ONLY_COMMANDS = ['record', 'review', 'recap']

/** The first line of the global help. */
export const HELP_TITLE = 'dialecte - the Dialecte cli: discover, use and grow a Dialecte'

/** The two lines under the families, spaced as the help prints them. */
export const HELP_FOOTER_LINES = [
	'dialecte <command> --help      that command only',
	'dialecte --help --json         every command, verb, flag and exit code',
]

/** The most lines the global help may take. */
export const HELP_MAX_LINES = 45
