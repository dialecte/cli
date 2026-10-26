/** Agent Skills spec: lowercase letters, digits and single hyphens, 1-64 characters. */
export const SKILL_NAME_PATTERN = /^(?=.{1,64}$)[a-z0-9]+(-[a-z0-9]+)*$/

export const DESCRIPTION_MAX_LENGTH = 1024

/** `<!-- dialecte-skills ignore: a b -->` and `<!-- dialecte-skills workspace -->`. */
export const DIRECTIVE_PATTERN = /<!--\s*dialecte-skills\s+([\s\S]*?)-->/g

/**
 * Roots an API claim may start from, longest first, with the variable `discoverMethodPaths` uses for
 * them. A bare `query.` reads the same surface as `doc.query.`.
 */
export const API_ROOTS: readonly (readonly [prefix: string, root: string])[] = [
	['doc.query.', 'q'],
	['query.', 'q'],
	['q.', 'q'],
	['tx.', 'tx'],
	['doc.', 'doc'],
	['project.', 'project'],
]

/**
 * A ` ```ts ` (or js) fence, also indented in a list item: its calls are claims too; other languages
 * are not checked.
 */
export const CODE_FENCE_PATTERN =
	/^[ \t]*```(?:ts|typescript|js|javascript)\n([\s\S]*?)^[ \t]*```/gm

/** Any fence, indented or not: what it holds is code, not prose. */
export const ANY_FENCE_PATTERN = /^[ \t]*```[\s\S]*?^[ \t]*```/gm

/** Inline code on one line: `` `npm run check` ``. */
export const INLINE_CODE_PATTERN = /`([^`\n]+)`/g

/** npm options that take the next word as their value: `npm run -w scl check`. */
export const NPM_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
	'-w',
	'--workspace',
	'--prefix',
])

/** A call from a known root, not a member of something else: `await tx.addChild(`. */
export const CODE_CALL_PATTERN =
	/(?<![\w.$])((?:doc\.query|query|q|tx|doc|project)(?:\.\w+)+)\s*\(/g

/** `query.ts`, `tx.types.ts`: file names, not API paths. */
export const FILE_EXTENSION_PATTERN = /\.(ts|tsx|js|mjs|cjs|md|json)$/
