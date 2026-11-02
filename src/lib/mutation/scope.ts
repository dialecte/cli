import { matchesGlob } from '../tdd/match-glob.ts'
import { DIFF_HUNK, DIFF_NEW_PATH, MUTABLE_EXTENSION, NEVER_MUTABLE } from './mutation.constants.ts'

import type { MutationDeclaration } from './mutation.types.ts'

/**
 * Whether the runner may mutate a file (a `.ts` source, package-relative, `/` separators): inside a `scope` glob, outside every
 * `exclude` glob, and never a test, types, declaration, generated or setup file, nor under `fixtures/` or
 * `__tests__/`. Reach for it to filter any list of files before mutating.
 */
export function isMutable(params: { declaration: MutationDeclaration; file: string }): boolean {
	const { declaration, file } = params
	return (
		MUTABLE_EXTENSION.test(file) &&
		!NEVER_MUTABLE.test(file) &&
		declaration.scope.some((glob) => matchesGlob({ path: file, glob })) &&
		!declaration.exclude.some((glob) => matchesGlob({ path: file, glob }))
	)
}

/**
 * The ranges a change holds, from `git diff -U0` output (paths unquoted): the added and changed lines of each
 * mutable file, then the untracked mutable files whole. A hunk that only deletes lines has nothing to mutate.
 * Reach for it to turn a working-tree change into `--mutate` targets.
 */
export function changedRanges(params: {
	declaration: MutationDeclaration
	diff: string
	untracked: readonly string[]
}): string[] {
	const { declaration, diff, untracked } = params
	const ranges: string[] = []
	let file: string | undefined
	let previous = ''
	for (const line of diff.split('\n')) {
		// a file header follows its `--- ` line: an added line starting with `++ ` is content
		if (previous.startsWith('--- ') && line.startsWith('+++ ')) {
			const path = line.startsWith(DIFF_NEW_PATH)
				? line.slice(DIFF_NEW_PATH.length).replace(/\t$/, '')
				: undefined
			file = path !== undefined && isMutable({ declaration, file: path }) ? path : undefined
		} else {
			const hunk = DIFF_HUNK.exec(line)
			const count = hunk?.[2] === undefined ? 1 : Number(hunk[2])
			if (file && hunk && count > 0)
				ranges.push(`${file}:${Number(hunk[1])}-${Number(hunk[1]) + count - 1}`)
		}
		previous = line
	}
	return [
		...new Set([...ranges, ...untracked.filter((path) => isMutable({ declaration, file: path }))]),
	]
}
