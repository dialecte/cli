/** What a file is for, from its name and folder: the rules that apply to it depend on it. */

import { SKILLS_FOLDER } from '../skills/skill-file.constants.ts'
import {
	CONFIG_NAME_PATTERN,
	CONSTANTS_FOLDER,
	CONSTANTS_NAME_PATTERN,
	DECLARATION_NAME_PATTERN,
	EVALS_FOLDER,
	GENERATED_NAME_PATTERN,
	SCRIPT_NAME_PATTERN,
	TEST_NAME_PATTERN,
	TESTS_FOLDER,
	TYPES_FOLDER,
	TYPES_NAME_PATTERN,
} from './file-kind.constants.ts'

import type { FileKind } from './check-code-rules.types.ts'

/**
 * What a file is for, from its name and folder, as the house layout places them: `<name>.types.ts`,
 * `types.ts`, `types.<topic>.ts` or a `types/` folder hold types; `<name>.constants.ts`, `constants.ts`,
 * `constant.ts`, `constants.<topic>.ts` or a `constants/` folder hold module constants; a `*.config.ts`
 * file holds a configuration object (module constants allowed, types still in their own file). Files
 * under `__tests__/` and `*.cases.ts` / `*.fixtures.ts` are test support; files in the `evals` folder of a skill
 * are eval fixtures, often wrong on purpose: only their references are checked.
 */
export function fileKindOf(file: string): FileKind {
	const segments = file.split(/[\\/]/)
	const name = segments.at(-1) ?? ''
	const folders = segments.slice(0, -1)
	if (GENERATED_NAME_PATTERN.test(name)) return 'generated'
	if (DECLARATION_NAME_PATTERN.test(name)) return 'declaration'
	if (
		folders.some((folder, index) => folder === SKILLS_FOLDER && folders[index + 2] === EVALS_FOLDER)
	)
		return 'eval-fixture'
	if (TEST_NAME_PATTERN.test(name) || folders.includes(TESTS_FOLDER)) return 'test'
	if (!SCRIPT_NAME_PATTERN.test(name)) return 'text'
	if (TYPES_NAME_PATTERN.test(name) || folders.includes(TYPES_FOLDER)) return 'types'
	if (CONSTANTS_NAME_PATTERN.test(name) || folders.includes(CONSTANTS_FOLDER)) return 'constants'
	if (CONFIG_NAME_PATTERN.test(name)) return 'config'
	return 'implementation'
}
