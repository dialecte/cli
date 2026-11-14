import { relative, resolve, sep } from 'node:path'

import { readEmptyTree } from '../gate/gate-base.ts'
import { addedLineRangesOf } from '../git-diff.ts'
import { tryReadGit } from '../git.ts'
import { NOT_ADDED_SUFFIX } from './added-lines.constants.ts'
import { ALLOWABLE_RULES } from './check-code-rules.constants.ts'

import type { AddedLines } from './added-lines.types.ts'
import type { RuleFinding, RuleName } from './check-code-rules.types.ts'

/**
 * The lines of `files` that the working tree adds against `base`; a file the base lacks, or a base that is neither a
 * commit nor the empty tree, is whole. The repository's empty tree as the base means no change is known: every file
 * maps to nothing added.
 */
export function readAddedLines(params: {
	root: string
	base: string
	files: readonly string[]
}): AddedLines {
	const { root, base, files } = params
	const whole: AddedLines = new Map(files.map((file) => [file, 'whole']))
	if (files.length === 0) return whole
	const commit = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${base}^{commit}`],
	})?.trim()
	if (!commit) return isEmptyTree({ root, base }) ? nothingAddedTo(files) : whole
	const paths = files.map((file) => packagePathOf({ root, file }))
	const diff = tryReadGit({
		root,
		args: [
			'diff',
			'--relative',
			'--no-color',
			'--no-ext-diff',
			'--no-renames',
			'-U0',
			commit,
			'--',
			...paths,
		],
	})
	const listed = tryReadGit({
		root,
		args: ['ls-tree', '-r', '--name-only', commit, '--', ...paths],
	})
	// a diff git cannot read judges every file whole: never softer than a run without a base
	if (diff === undefined || listed === undefined) return whole
	const atBase = new Set(listed.split('\n').filter(Boolean))
	const ranges = addedLineRangesOf({ diff })
	const added: AddedLines = new Map()
	for (const [index, file] of files.entries()) {
		const path = paths[index] ?? file
		if (!atBase.has(path)) {
			added.set(file, 'whole')
			continue
		}
		const lines = (ranges.get(path) ?? []).flatMap((range) =>
			Array.from({ length: range.end - range.start + 1 }, (_, offset) => range.start + offset),
		)
		added.set(file, new Set(lines))
	}
	return added
}

/** The findings with each error of a quality rule on a line the change did not add made a warning that says so. */
export function softenNotAdded(params: {
	findings: readonly RuleFinding[]
	added: AddedLines
}): RuleFinding[] {
	const softened: readonly RuleName[] = ALLOWABLE_RULES
	return params.findings.map((finding) => {
		const lines = params.added.get(finding.file)
		if (
			finding.severity !== 'error' ||
			!softened.includes(finding.rule) ||
			lines === undefined ||
			lines === 'whole' ||
			lines.has(finding.line)
		)
			return finding
		return { ...finding, severity: 'warning', message: `${finding.message}${NOT_ADDED_SUFFIX}` }
	})
}

/** True when `base`, as given or as git resolves it, is the empty tree of the repository at `root`. */
function isEmptyTree(params: { root: string; base: string }): boolean {
	const { root, base } = params
	const resolved = tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', base] })?.trim()
	if (!resolved) return false
	const emptyTree = readEmptyTree(root)
	return resolved === emptyTree || base === emptyTree
}

/** Every file of `files` mapped to an empty set of added lines. */
function nothingAddedTo(files: readonly string[]): AddedLines {
	return new Map(files.map((file) => [file, new Set<number>()]))
}

/** `file` as git names it from `root`: relative, `/` separators. */
function packagePathOf(params: { root: string; file: string }): string {
	return relative(params.root, resolve(params.root, params.file)).split(sep).join('/')
}
