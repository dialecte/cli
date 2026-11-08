/** A name starting with this is hidden: never a standard folder nor a standard file. */
export const HIDDEN_NAME_START = '.'

/** The extension of a standard file. */
export const STANDARD_FILE_EXTENSION = '.md'

/** The entry that makes a folder the top of a git work tree (a folder, or a file in a linked work tree). */
export const GIT_ENTRY = '.git'

/** The expected layout of the root, said with every refusal of the root. */
export const STANDARD_LAYOUT =
	'set DIALECTE_STANDARD to one root folder holding one folder per standard, each holding its .md files: <root>/<standard id>/<file>.md (the folder name is the standard id); keep it outside every repository'

/** The refusals of the input; `{...}` are filled in. */
export const INPUT_MESSAGES = {
	notSet: 'no standard configured: DIALECTE_STANDARD is not set',
	missing: 'DIALECTE_STANDARD names {path}, which does not exist',
	notFolder: 'DIALECTE_STANDARD names {path}, a file, not a root folder',
	noStandard: 'the root {path} holds no standard folder',
	topLevelFiles: 'the root {path} holds .md files directly: {names}',
	workTree:
		'{path} is inside a git work tree ({top}): the standard and its index never live in a repository',
	folderCollision: 'two standard folders have the same id: {names}',
	fileCollision: 'two files of the standard {id} have the same id: {names}',
	unknownStandard: 'no standard folder {id} in {path} - known: {known}',
} as const

/** The separator the names of a refusal are listed with. */
export const NAME_LIST_SEPARATOR = ', '
