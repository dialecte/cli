/** The code rules `dialecte rules` checks, in the order they are reported for one position. */
import type { FileKind } from './check-code-rules.types.ts'

/** The kinds of file whose code is walked for the function, parameter, name and await rules. */
export const CODE_VISITED_KINDS: readonly FileKind[] = [
	'implementation',
	'types',
	'constants',
	'config',
	'test',
]

export const RULE_NAMES = [
	'type-outside-types-file',
	'constant-outside-constants-file',
	'function-as-const',
	'await-in-argument',
	'positional-parameters',
	'abbreviation',
	'committed-text-reference',
	'temporary-root-shared',
	'raw-git-repository',
	'bare-tmpdir',
	'unreadable-file',
	'argument-mutation',
	'class',
	'query-in-loop',
	'long-function',
	'table-branch',
	'without-export-xml',
	'export-without-queries',
	'fixture-builder',
	'plan-tag',
	'xml-splice',
	'xml-replace',
	'fixtures-module',
	'transaction-spy',
	'act-repeats-call',
	'act-snapshot',
	'act-format-check',
	'inline-document-long',
	'expected-fixture',
	'fixture-case-comment',
	'test-file-long',
	'fixture-file-long',
	'invalid-allow',
	'unused-allow',
	'changelog-edit',
] as const

/** The quality rules a `dialecte-allow` comment may silence. */
export const ALLOWABLE_RULES = [
	'raw-git-repository',
	'bare-tmpdir',
	'argument-mutation',
	'class',
	'query-in-loop',
	'long-function',
	'table-branch',
	'without-export-xml',
	'export-without-queries',
	'fixture-builder',
	'plan-tag',
	'xml-splice',
	'xml-replace',
	'fixtures-module',
	'transaction-spy',
	'act-repeats-call',
	'act-snapshot',
	'act-format-check',
	'inline-document-long',
	'expected-fixture',
	'fixture-case-comment',
	'test-file-long',
	'fixture-file-long',
] as const

/** A module constant by its name: `MAX_DEPTH`, `ROOTS`. */
export const CONSTANT_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

/**
 * Leading parameters that may stay positional before the params object: the query or transaction a
 * domain function reads and writes through.
 */
export const LEADING_POSITIONAL_PARAMETERS: readonly string[] = ['query', 'tx', 'transaction']

/** Abbreviations a reviewer asks to spell out, compared with each camelCase word of a declared name. */
export const ABBREVIATIONS: Readonly<Record<string, string>> = {
	attr: 'attribute',
	attrs: 'attributes',
	el: 'element',
	els: 'elements',
	elem: 'element',
	idx: 'index',
}

/** Text files `rules` checks for references when it picks the changed files itself. */
export const TEXT_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|mjs|cjs|md|json|ya?ml)$/

/**
 * Calls that list, scan or remove the folder they are given: in a test, handed the system's temporary
 * folder itself, they see (or delete) what every other test and process left there.
 */
export const SCANNING_CALL_PATTERN = /^(readdir|opendir|glob|scan|walk|list|find|watch|rm)/i

/** Calls answering the same folder they are given, spelled another way. */
export const PATH_PASS_THROUGH_PATTERN = /^(realpath|realpathSync|resolve|normalize)$/

/** Option names that make a folder the root a test works in. */
export const ROOT_OPTION_PATTERN =
	/^(root|cwd|rootDir|rootFolder|projectRoot|workspace|folder|directory|dir|scratchRoot)$/

/** The `bare-tmpdir` finding's message: a production folder made in the system's temporary folder itself. */
export const BARE_TMPDIR_MESSAGE =
	'`tmpdir()` in production code: make the folder with `makeScratchFolder` (src/lib/scratch/), under the one scratch root prune and health read'

/** The folder whose files may read the system's temporary folder: the scratch module. */
export const SCRATCH_MODULE_PATTERN = /(^|[\\/])src[\\/]lib[\\/]scratch[\\/]/

/** The names the os module is imported by. */
export const OS_MODULE_NAMES: readonly string[] = ['node:os', 'os']
