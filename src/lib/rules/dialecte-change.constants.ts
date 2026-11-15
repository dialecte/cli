import type { FileKind } from './check-code-rules.types.ts'

/** The package names the Dialecte-change scope tells apart, and the scope of every dialecte package. */
export const CORE_PACKAGE_NAME = '@dialecte/core'
export const CREATE_PACKAGE_NAME = '@dialecte/create'
export const CLI_PACKAGE_NAME = '@dialecte/cli'
export const DIALECTE_SCOPE = '@dialecte/'

/** A generated Dialecte definition in a package's source, and the one an installed package ships in `dist`. */
export const SOURCE_DEFINITION_PATTERN = /(^|\/)definition\.generated\.ts$/
export const DIST_DEFINITION_PATTERN = /(^|\/)definition\.generated\.(js|d\.ts)$/

/** The line of a run that left files out of its judgement: `{count}` is how many. */
export const NOT_JUDGED_LINE = 'rules: {count} file(s) not Dialecte changes: not judged'

/** A package's own source (rule 1) and a dialecte template's source in the create package (rule 2). */
export const PACKAGE_SOURCE_PATTERN = /^src\//
export const TEMPLATE_SOURCE_PATTERN = /^templates\/[^/]+\/src\//

/** The folders a package keeps its source in, its installed packages in, and an installed package ships. */
export const SOURCE_FOLDER = 'src'
export const NODE_MODULES_FOLDER = 'node_modules'
export const DIST_FOLDER = 'dist'

/** The file kinds never a Dialecte change, whatever their folder or imports. */
export const EXCLUDED_FILE_KINDS: ReadonlySet<FileKind> = new Set<FileKind>([
	'generated',
	'declaration',
	'config',
])

/** A folder's index module: importing the folder reaches what it re-exports. */
export const INDEX_MODULE_PATTERN = /(^|\/)index\.[cm]?[jt]sx?$/
