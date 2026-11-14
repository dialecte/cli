import { addedLineRangesOf } from '../git-diff.ts'
import { matchesGlob } from '../tdd/match-glob.ts'
import { MUTABLE_EXTENSION, NEVER_MUTABLE } from './mutation.constants.ts'

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
	const ranges = [...addedLineRangesOf({ diff })]
		.filter(([path]) => isMutable({ declaration, file: path }))
		.flatMap(([path, lines]) => lines.map((range) => `${path}:${range.start}-${range.end}`))
	return [
		...new Set([...ranges, ...untracked.filter((path) => isMutable({ declaration, file: path }))]),
	]
}
