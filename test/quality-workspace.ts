/** The base-aware rules' inputs built from whole source texts: both sides of a change, and a resolver over its files. */
import { posix } from 'node:path'

import { parseSourceFile } from '../src/lib/api/source-file-functions.ts'

import type { FileFacts } from '../src/lib/api/source-functions.types.ts'
import type {
	ChangeFacts,
	ChangedPath,
	ResolveSpecifier,
} from '../src/lib/quality/quality.types.ts'

/** The facts of `text` parsed as `file`; a file that does not parse is a fixture mistake. */
function factsOf(params: { file: string; text: string }): FileFacts {
	const { facts } = parseSourceFile(params)
	if (facts === undefined) throw new Error(`fixture ${params.file} does not parse`)
	return facts
}

/**
 * The change from `base` to `tree` (path to text): added, modified and deleted paths by their texts, `renamed` (new
 * path to old) paired; the tree's facts of every file, the base's facts of every changed, renamed-from or deleted one.
 */
export function changeFactsOf(params: {
	base: Readonly<Record<string, string>>
	tree: Readonly<Record<string, string>>
	renamed?: Readonly<Record<string, string>>
}): ChangeFacts {
	const renamed = params.renamed ?? {}
	const renamedFrom = new Set(Object.values(renamed))
	const changed: ChangedPath[] = [
		...Object.keys(params.tree).flatMap(function changeOf(path): ChangedPath[] {
			const from = renamed[path]
			if (from !== undefined) return [{ path, state: 'renamed', from }]
			const before = params.base[path]
			if (before === undefined) return [{ path, state: 'added' }]
			return before === params.tree[path] ? [] : [{ path, state: 'modified' }]
		}),
		...Object.keys(params.base)
			.filter((path) => params.tree[path] === undefined && !renamedFrom.has(path))
			.map((path): ChangedPath => ({ path, state: 'deleted' })),
	]
	const baseSide = new Set(
		changed.flatMap((change) => (change.state === 'renamed' ? [change.from] : [change.path])),
	)
	return {
		changed,
		tree: new Map(
			Object.entries(params.tree).map(([file, text]) => [file, factsOf({ file, text })]),
		),
		base: new Map(
			Object.entries(params.base)
				.filter(([file]) => baseSide.has(file))
				.map(([file, text]) => [file, factsOf({ file, text })]),
		),
	}
}

/** A resolver over `files`: a relative specifier from a file, as written or with `.ts` or `/index.ts`. */
export function resolverOver(files: Iterable<string>): ResolveSpecifier {
	const known = new Set(files)
	return function resolve(request) {
		if (!request.specifier.startsWith('.')) return undefined
		const joined = posix.normalize(posix.join(posix.dirname(request.from), request.specifier))
		return [joined, `${joined}.ts`, `${joined}/index.ts`].find((candidate) => known.has(candidate))
	}
}
