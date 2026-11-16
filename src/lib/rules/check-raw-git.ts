/**
 * `raw-git-repository`: a test that clones or initialises a git repository itself makes one with no identity - green
 * where git falls back to user@host (macOS), red on a CI machine with none ("Author identity unknown"). The scratch
 * helpers give the identity a commit needs.
 */
import { calleeName } from './callee-name.ts'
import {
	BARE_FLAG,
	GIT_CALLEES,
	GIT_PROGRAM,
	OPTIONS_WITH_VALUE,
	REPOSITORY_MAKING_SUBCOMMANDS,
} from './check-raw-git.constants.ts'

import ts from 'typescript'

/**
 * The git argument lists of `sourceFile` that make a non-bare repository: an array literal whose subcommand (after
 * git's options) is `'clone'` or `'init'`, without `'--bare'`, inside a call to `git` or the cli's git readers
 * (`git({ args: [...] })`, `readGit({ args: [...] })`) or a call whose first argument is `'git'` (`spawnSync('git', [...])`).
 *
 * @intent find the repositories a test makes without the scratch helpers
 * @internal
 */
export function findRawGitRepositories(sourceFile: ts.SourceFile): ts.ArrayLiteralExpression[] {
	const found: ts.ArrayLiteralExpression[] = []
	function visit(node: ts.Node): void {
		if (ts.isArrayLiteralExpression(node) && isRepositoryMaking(node) && isGitCallArgument(node))
			found.push(node)
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return found
}

/**
 * The list's subcommand (after git's options: `-C <path>`, `-c <name=value>`, a flag) is a repository-making one, and
 * the list holds no `--bare` (nothing is committed in a bare repository, cloned or initialised).
 */
function isRepositoryMaking(list: ts.ArrayLiteralExpression): boolean {
	const subcommand = subcommandOf(list)
	if (subcommand === undefined || !REPOSITORY_MAKING_SUBCOMMANDS.includes(subcommand)) return false
	return !list.elements.some(
		(element) => ts.isStringLiteralLike(element) && element.text === BARE_FLAG,
	)
}

/** The first element after git's options, as text; undefined when it is no string literal or there is none. */
function subcommandOf(list: ts.ArrayLiteralExpression): string | undefined {
	for (let index = 0; index < list.elements.length; index += 1) {
		const element = list.elements[index]
		if (!ts.isStringLiteralLike(element)) return undefined
		if (OPTIONS_WITH_VALUE.includes(element.text)) index += 1
		else if (!element.text.startsWith('-')) return element.text
	}
	return undefined
}

/** The list is an argument of a git call, directly or as a property of an object argument. */
function isGitCallArgument(list: ts.ArrayLiteralExpression): boolean {
	let node: ts.Node = list
	while (ts.isPropertyAssignment(node.parent) || ts.isObjectLiteralExpression(node.parent))
		node = node.parent
	const call = node.parent
	if (!ts.isCallExpression(call) || !call.arguments.includes(node as ts.Expression)) return false
	if (GIT_CALLEES.includes(calleeName(call.expression))) return true
	const [program] = call.arguments
	return program !== undefined && ts.isStringLiteralLike(program) && program.text === GIT_PROGRAM
}
