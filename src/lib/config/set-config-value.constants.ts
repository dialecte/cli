/** The first line of a config file the writer creates, per layer (33CF 3.1 and 3.2). */
export const CONFIG_FILE_HEADERS: Readonly<Record<'project' | 'personal', string>> = {
	project: '# Dialecte project settings - shared, committed',
	personal: '# Dialecte personal settings - this machine, never committed',
}

/** The separator of a key path (`gate.fast`). */
export const CONFIG_PATH_SEPARATOR = '.'

/** A Windows line ending, kept by the writer when the file holds one (D23). */
export const CRLF = '\r\n'

/** The line ending the writer works with, and writes in a new file. */
export const LF = '\n'

/** The platform whose comparison of path keys is exact (the writer's when none is given). */
export const EXACT_PATH_PLATFORM: NodeJS.Platform = 'linux'

/** How the writer prints a document: flow lists as written (`[check, test]`), no line folded. */
export const YAML_WRITE_OPTIONS = { flowCollectionPadding: false, lineWidth: 0 } as const

/** The indent of a file holding no nested block mapping, and of a new file. */
export const DEFAULT_INDENT = 2
