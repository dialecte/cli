/**
 * The parts of a skill that drift fastest - a dialecte's verb map, core's method list, the hook files -
 * are rendered from the source between `<!-- dialecte-skills:generated <kind> -->` and
 * `<!-- /dialecte-skills:generated -->` markers. `dialecte skills generate` writes them;
 * `dialecte skills check` fails when one is stale.
 *
 * Its lists sort with the default code-unit `.sort()`: they hold identifiers and folder names, the order
 * is the same on every runtime, and a collation change would make every committed block stale.
 */
import {
	CORE_GROUPS,
	EMPHASIS_UNDERSCORE_PATTERN,
	GENERATED_BLOCK_PATTERN,
	GENERATED_MARKER_PATTERN,
	STRONG_UNDERSCORE_PATTERN,
} from './generated-blocks.constants.ts'

export function renderExtensionsTable(methodPaths: readonly string[]): string {
	const queryVerbs = groupedVerbs({ methodPaths, root: 'q' })
	const transactionVerbs = groupedVerbs({ methodPaths, root: 'tx' })
	const namespaces = [...new Set([...queryVerbs.keys(), ...transactionVerbs.keys()])].sort()
	if (namespaces.length === 0) return 'This package registers no extension.'

	const rows = namespaces.map((namespace) => {
		const reads = queryVerbs.get(namespace) ?? []
		const writes = (transactionVerbs.get(namespace) ?? []).filter((verb) => !reads.includes(verb))
		return `| \`${namespace}\` | ${codeList(reads)} | ${codeList(writes)} |`
	})
	return [
		'| Namespace | On `doc.query.<ns>` | On `tx.<ns>` (writes) |',
		'|---|---|---|',
		...rows,
	].join('\n')
}

export function renderCoreMethods(methodPaths: readonly string[]): string {
	const queryMethods = directMethods({ methodPaths, root: 'q' })
	const transactionOnly = directMethods({ methodPaths, root: 'tx' }).filter(
		(method) => !queryMethods.includes(method),
	)
	return [
		`- Query (\`doc.query\`, also on \`tx\`): ${codeList(queryMethods)}`,
		`- Transaction only (\`tx\`): ${codeList(transactionOnly)}`,
		`- Document: ${codeList(directMethods({ methodPaths, root: 'doc' }))}`,
		`- Project: ${codeList(directMethods({ methodPaths, root: 'project' }))}`,
	].join('\n')
}

export function renderHooksTable(concernFilesByFolder: Record<string, string[]>): string {
	if (Object.keys(concernFilesByFolder).length === 0) return 'This package has no hooks.'
	const rows = Object.keys(concernFilesByFolder)
		.sort()
		.map((folder) => `| \`${folder}/\` | ${codeList(concernFilesByFolder[folder])} |`)
	return ['| Folder | Concern files |', '|---|---|', ...rows].join('\n')
}

export function replaceGeneratedBlocks(params: {
	markdown: string
	blocks: Record<string, string>
}): { markdown: string; unknownKinds: string[] } {
	const unknownKinds: string[] = []
	const markdown = params.markdown.replace(
		GENERATED_BLOCK_PATTERN,
		function replaceBlock(block: string, start: string, kind: string, end: string): string {
			const content = params.blocks[kind]
			if (content === undefined) {
				unknownKinds.push(kind)
				return block
			}
			return `${start}\n${content}\n${end}`
		},
	)
	return { markdown, unknownKinds }
}

/** `tx.lifecycle.transplant.deep` → `lifecycle` → `transplant.deep`, core groups left out. */
function groupedVerbs(params: {
	methodPaths: readonly string[]
	root: string
}): Map<string, string[]> {
	const verbsByNamespace = new Map<string, string[]>()
	for (const path of params.methodPaths) {
		const [root, namespace, ...verb] = path.split('.')
		if (root !== params.root || verb.length === 0 || CORE_GROUPS.includes(namespace)) continue
		const verbs = verbsByNamespace.get(namespace) ?? []
		verbs.push(verb.join('.'))
		verbsByNamespace.set(namespace, verbs)
	}
	for (const verbs of verbsByNamespace.values()) verbs.sort()
	return verbsByNamespace
}

function directMethods(params: { methodPaths: readonly string[]; root: string }): string[] {
	return params.methodPaths
		.map((path) => path.split('.'))
		.filter((segments) => segments.length === 2 && segments[0] === params.root)
		.map((segments) => segments[1])
		.sort()
}

function codeList(names: readonly string[]): string {
	return names.length === 0 ? '-' : names.map((name) => `\`${name}\``).join(', ')
}

/** Kinds whose block differs from its rendering beyond layout: a formatter may re-pad tables and add blank lines. */
export function findStaleGeneratedKinds(params: {
	markdown: string
	blocks: Record<string, string>
}): string[] {
	const staleKinds: string[] = []
	for (const match of params.markdown.matchAll(GENERATED_BLOCK_PATTERN)) {
		const kind = match[2]
		const rendered = params.blocks[kind]
		if (rendered === undefined) continue
		const current = match[0].slice(match[1].length, match[0].length - match[3].length)
		if (layoutFree(current) !== layoutFree(rendered)) staleKinds.push(kind)
	}
	return staleKinds
}

/**
 * The content without what a formatter may change: the padding of table cells, the length of a separator
 * row, and the emphasis marker (`_x_` for `*x*`, `__x__` for `**x**`; code spans left as they are).
 */
function layoutFree(content: string): string {
	return content
		.split('\n')
		.map(function withoutPadding(line: string): string {
			return sameEmphasis(
				line
					.trim()
					.replace(/\s*\|\s*/g, '|')
					.replace(/-{3,}/g, '---'),
			)
		})
		.filter((line) => line !== '')
		.join('\n')
}

/** Underscore emphasis written with asterisks, outside code spans (the odd parts of a split on backticks). */
function sameEmphasis(line: string): string {
	return line
		.split('`')
		.map((part, index) =>
			index % 2 === 1
				? part
				: part
						.replace(STRONG_UNDERSCORE_PATTERN, '**$1**')
						.replace(EMPHASIS_UNDERSCORE_PATTERN, '$1*$2*'),
		)
		.join('`')
}

/** A start marker whose next marker is not an end: generating would swallow the next block. */
export function findUnclosedGeneratedBlocks(markdown: string): string[] {
	const markers = [...markdown.matchAll(GENERATED_MARKER_PATTERN)]
	return markers
		.filter((marker, index) => marker[1] !== undefined && markers[index + 1]?.[1] !== undefined)
		.concat(
			markers.length && markers.at(-1)?.[1] !== undefined
				? [markers.at(-1) as RegExpExecArray]
				: [],
		)
		.map((marker) => marker[1] as string)
}
