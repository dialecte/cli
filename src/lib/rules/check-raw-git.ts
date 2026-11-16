/**
 * `raw-git-repository`: a test that clones or initialises a git repository itself makes one with no identity - green
 * where git falls back to user@host (macOS), red on a CI machine with none ("Author identity unknown"). The scratch
 * helpers give the identity a commit needs.
 */
import { calleeName } from './callee-name.ts'
import { BARE_FLAG, GIT_PROGRAM, REPOSITORY_MAKING_SUBCOMMANDS } from './check-raw-git.constants.ts'

import ts from 'typescript'

/**
 * The git argument lists of `sourceFile` that make a non-bare repository: an array literal starting with `'clone'` or
 * `'init'`, without `'--bare'`, inside a call to `git` (`git({ args: [...] })`, `git([...])`) or a call whose first
 * argument is `'git'` (`spawnSync('git', [...])`).
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

/** The list starts with a repository-making subcommand and holds no `--bare`. */
function isRepositoryMaking(list: ts.ArrayLiteralExpression): boolean {
	const [first] = list.elements
	if (first === undefined || !ts.isStringLiteralLike(first)) return false
	if (!REPOSITORY_MAKING_SUBCOMMANDS.includes(first.text)) return false
	return !list.elements.some(
		(element) => ts.isStringLiteralLike(element) && element.text === BARE_FLAG,
	)
}

/** The list is an argument of a git call, directly or as a property of an object argument. */
function isGitCallArgument(list: ts.ArrayLiteralExpression): boolean {
	let node: ts.Node = list
	while (ts.isPropertyAssignment(node.parent) || ts.isObjectLiteralExpression(node.parent))
		node = node.parent
	const call = node.parent
	if (!ts.isCallExpression(call) || !call.arguments.includes(node as ts.Expression)) return false
	if (calleeName(call.expression) === GIT_PROGRAM) return true
	const [program] = call.arguments
	return program !== undefined && ts.isStringLiteralLike(program) && program.text === GIT_PROGRAM
}
