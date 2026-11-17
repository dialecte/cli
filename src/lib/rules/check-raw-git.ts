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
	SHELL_CALLEES,
	SHELL_OPTION,
	SHELL_OPTION_CALLEES,
} from './check-raw-git.constants.ts'

import ts from 'typescript'

/**
 * The git calls of `sourceFile` that make a non-bare repository, a git argument list whose subcommand (after git's
 * options) is `'clone'` or `'init'`, without `'--bare'`:
 * - a call to `git` or the cli's git readers given the list (`git({ args: [...] })`, `readGit({ args: [...] })`);
 * - a call whose first argument is `'git'` and second the list (`spawnSync('git', [...])`, `execFileSync(GIT, [...])`);
 * - a shell string or template starting with `git` (`execSync('git init ...')`, `spawnSync(\`git clone ${a}\`, { shell: true })`).
 *
 * An identifier naming a `const` of the same file (`const GIT = 'git'`, `const ARGS = ['clone', a, b]`) is read as
 * its initializer. Known limit: a list whose subcommand follows a spread (`[...base, 'clone']`) or a placeholder of
 * a template (`\`git ${verb} x\``) is not read, nor a list or program built in another file.
 *
 * @intent find the repositories a test makes without the scratch helpers
 * @internal
 */
export function findRawGitRepositories(sourceFile: ts.SourceFile): ts.CallExpression[] {
	const constants = sameFileConstantsOf(sourceFile)
	const found: ts.CallExpression[] = []
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node) && isRepositoryMakingCall({ call: node, constants }))
			found.push(node)
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return found
}

/** The initializer of each `const` the file declares once, by name: a name declared twice is left out. */
function sameFileConstantsOf(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
	const constants = new Map<string, ts.Expression>()
	const repeated = new Set<string>()
	function visit(node: ts.Node): void {
		if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const) !== 0)
			for (const declaration of node.declarations)
				if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
					const name = declaration.name.text
					if (constants.has(name)) repeated.add(name)
					constants.set(name, declaration.initializer)
				}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	for (const name of repeated) constants.delete(name)
	return constants
}

/** `expression` without its wrappers (`(...)`, `as const`, `satisfies`), an identifier read as its same-file const. */
function resolved(params: {
	expression: ts.Expression
	constants: ReadonlyMap<string, ts.Expression>
}): ts.Expression {
	const { constants } = params
	let expression = params.expression
	const seen = new Set<string>()
	for (;;) {
		if (
			ts.isParenthesizedExpression(expression) ||
			ts.isAsExpression(expression) ||
			ts.isSatisfiesExpression(expression)
		)
			expression = expression.expression
		else if (
			ts.isIdentifier(expression) &&
			constants.has(expression.text) &&
			!seen.has(expression.text)
		) {
			seen.add(expression.text)
			expression = constants.get(expression.text) as ts.Expression
		} else return expression
	}
}

/** The call runs git with a repository-making argument list, in one of the forms `findRawGitRepositories` reads. */
function isRepositoryMakingCall(params: {
	call: ts.CallExpression
	constants: ReadonlyMap<string, ts.Expression>
}): boolean {
	const { call, constants } = params
	const callee = calleeName(call.expression)
	const [first, second] = call.arguments.map((expression) => resolved({ expression, constants }))
	if (GIT_CALLEES.includes(callee))
		return listsOf({ expressions: call.arguments, constants }).some(isRepositoryMakingList)
	if (first !== undefined && ts.isStringLiteralLike(first) && first.text === GIT_PROGRAM)
		return second !== undefined && isRepositoryMakingList(second)
	if (first === undefined || !runsThroughShell({ call, callee, constants })) return false
	const words = shellWordsOf(first)
	return words !== undefined && words[0] === GIT_PROGRAM && isRepositoryMakingWords(words.slice(1))
}

/** The array literals among `expressions` and the property values of their object literals, nested, resolved. */
function listsOf(params: {
	expressions: readonly ts.Expression[]
	constants: ReadonlyMap<string, ts.Expression>
}): ts.ArrayLiteralExpression[] {
	const { constants } = params
	return params.expressions.flatMap((expression) => listsIn({ expression, constants }))
}

function listsIn(params: {
	expression: ts.Expression
	constants: ReadonlyMap<string, ts.Expression>
}): ts.ArrayLiteralExpression[] {
	const { constants } = params
	const value = resolved(params)
	if (ts.isArrayLiteralExpression(value)) return [value]
	if (!ts.isObjectLiteralExpression(value)) return []
	return value.properties.flatMap(function propertyLists(property) {
		if (ts.isPropertyAssignment(property))
			return listsIn({ expression: property.initializer, constants })
		if (ts.isShorthandPropertyAssignment(property))
			return listsIn({ expression: property.name, constants })
		return []
	})
}

/** The call runs its first argument through a shell: `execSync`, or a spawning call given `{ shell: <not false> }`. */
function runsThroughShell(params: {
	call: ts.CallExpression
	callee: string
	constants: ReadonlyMap<string, ts.Expression>
}): boolean {
	const { call, callee, constants } = params
	if (SHELL_CALLEES.includes(callee)) return true
	if (!SHELL_OPTION_CALLEES.includes(callee)) return false
	return call.arguments.some(function namesShell(expression) {
		const value = resolved({ expression, constants })
		return (
			ts.isObjectLiteralExpression(value) &&
			value.properties.some(
				(property) =>
					ts.isPropertyAssignment(property) &&
					ts.isIdentifier(property.name) &&
					property.name.text === SHELL_OPTION &&
					property.initializer.kind !== ts.SyntaxKind.FalseKeyword,
			)
		)
	})
}

/**
 * The words of a shell string or template, split on white space; a template's placeholder is a word of unknown text
 * (undefined); undefined when `expression` is neither.
 */
function shellWordsOf(expression: ts.Expression): (string | undefined)[] | undefined {
	if (ts.isStringLiteralLike(expression)) return wordsOf(expression.text)
	if (!ts.isTemplateExpression(expression)) return undefined
	return [
		...wordsOf(expression.head.text),
		...expression.templateSpans.flatMap((span) => [undefined, ...wordsOf(span.literal.text)]),
	]
}

function wordsOf(text: string): string[] {
	return text.split(/\s+/).filter(Boolean)
}

/** The list's elements make a non-bare repository (`isRepositoryMakingWords`); a spread is an unknown element. */
function isRepositoryMakingList(expression: ts.Expression): boolean {
	if (!ts.isArrayLiteralExpression(expression)) return false
	return isRepositoryMakingWords(
		expression.elements.map((element) =>
			ts.isStringLiteralLike(element) ? element.text : undefined,
		),
	)
}

/**
 * The subcommand (the first word after git's options: `-C <path>`, `-c <name=value>`, `--git-dir <path>`, a flag) is
 * a repository-making one, and no word is `--bare` (nothing is committed in a bare repository, cloned or
 * initialised). A word of unknown text before the subcommand leaves it unknown: not reported.
 */
function isRepositoryMakingWords(words: readonly (string | undefined)[]): boolean {
	const subcommand = subcommandOf(words)
	if (subcommand === undefined || !REPOSITORY_MAKING_SUBCOMMANDS.includes(subcommand)) return false
	return !words.includes(BARE_FLAG)
}

function subcommandOf(words: readonly (string | undefined)[]): string | undefined {
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index]
		if (word === undefined) return undefined
		if (OPTIONS_WITH_VALUE.includes(word)) index += 1
		else if (!word.startsWith('-')) return word
	}
	return undefined
}
