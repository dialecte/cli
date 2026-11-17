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

import type { WrittenList } from './check-raw-git.types.ts'

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
 * Each finding is the argument that makes the repository, where the call writes it: the `clone`/`init` element of a
 * list written in the call, the reference to a same-file const, the shell string - so a new argument line under an
 * unchanged call is a line the change added. A `dialecte-allow raw-git-repository` opt-out goes on that line or the one
 * before it, which in a call spanning lines is inside the call.
 *
 * @intent find the repositories a test makes without the scratch helpers
 * @internal
 */
export function findRawGitRepositories(sourceFile: ts.SourceFile): ts.Node[] {
	const constants = sameFileConstantsOf(sourceFile)
	const found: ts.Node[] = []
	function visit(node: ts.Node): void {
		const argument = ts.isCallExpression(node)
			? repositoryMakingArgumentOf({ call: node, constants })
			: undefined
		if (argument !== undefined) found.push(argument)
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

/**
 * The argument that makes a repository in a git call of one of the forms `findRawGitRepositories` reads, where the
 * call writes it (`anchorOf`); undefined when the call makes none.
 */
function repositoryMakingArgumentOf(params: {
	call: ts.CallExpression
	constants: ReadonlyMap<string, ts.Expression>
}): ts.Node | undefined {
	const { call, constants } = params
	const callee = calleeName(call.expression)
	if (GIT_CALLEES.includes(callee))
		return listsOf({ expressions: call.arguments, constants })
			.filter((written) => isRepositoryMakingList(written.list))
			.map(anchorOf)[0]
	const [firstWritten, secondWritten] = call.arguments
	const first = firstWritten && resolved({ expression: firstWritten, constants })
	if (first !== undefined && ts.isStringLiteralLike(first) && first.text === GIT_PROGRAM) {
		const second = secondWritten && resolved({ expression: secondWritten, constants })
		return second !== undefined && isRepositoryMakingList(second)
			? anchorOf({ written: secondWritten, list: second })
			: undefined
	}
	if (first === undefined || !runsThroughShell({ call, callee, constants })) return undefined
	const words = shellWordsOf(first)
	return words !== undefined && words[0] === GIT_PROGRAM && isRepositoryMakingWords(words.slice(1))
		? firstWritten
		: undefined
}

/**
 * Where a list is written in the call: its subcommand element when the list is written there, else the expression
 * the call writes (a reference to a same-file const).
 */
function anchorOf(params: WrittenList): ts.Node {
	const { list } = params
	if (unwrapped(params.written) !== list) return params.written
	const index = subcommandIndexOf(list.elements.map(textOfElement))
	return (index === undefined ? undefined : list.elements[index]) ?? list
}

/** `expression` without `(...)`, `as const` or `satisfies` around it. */
function unwrapped(expression: ts.Expression): ts.Expression {
	let current = expression
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current)
	)
		current = current.expression
	return current
}

/** A list element's text when it is a string literal; undefined (an unknown word) otherwise. */
function textOfElement(element: ts.Expression): string | undefined {
	return ts.isStringLiteralLike(element) ? element.text : undefined
}

/**
 * The array literals among `expressions` and the property values of their object literals, nested, resolved, each
 * with the expression the call writes for it.
 */
function listsOf(params: {
	expressions: readonly ts.Expression[]
	constants: ReadonlyMap<string, ts.Expression>
}): WrittenList[] {
	const { constants } = params
	return params.expressions.flatMap((expression) =>
		listsIn({ expression, written: expression, constants }),
	)
}

/**
 * The lists `expression` holds once resolved; `written` is the expression of the call they come from: the list itself
 * when the call writes it, the reference when a same-file const holds it (a property of a const object keeps the
 * reference to that const).
 */
function listsIn(params: {
	expression: ts.Expression
	written: ts.Expression
	constants: ReadonlyMap<string, ts.Expression>
}): WrittenList[] {
	const { constants } = params
	const value = resolved(params)
	// written in the call while the value is: each nested value is written there too
	const inCall = unwrapped(params.written) === value
	if (ts.isArrayLiteralExpression(value)) return [{ written: params.written, list: value }]
	if (!ts.isObjectLiteralExpression(value)) return []
	return value.properties.flatMap(function propertyLists(property) {
		const expression = ts.isPropertyAssignment(property)
			? property.initializer
			: ts.isShorthandPropertyAssignment(property)
				? property.name
				: undefined
		if (expression === undefined) return []
		return listsIn({ expression, written: inCall ? expression : params.written, constants })
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
function isRepositoryMakingList(
	expression: ts.Expression,
): expression is ts.ArrayLiteralExpression {
	if (!ts.isArrayLiteralExpression(expression)) return false
	return isRepositoryMakingWords(expression.elements.map(textOfElement))
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
	const index = subcommandIndexOf(words)
	return index === undefined ? undefined : words[index]
}

/** The index of the subcommand among `words` (the first after git's options); undefined when unknown or none. */
function subcommandIndexOf(words: readonly (string | undefined)[]): number | undefined {
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index]
		if (word === undefined) return undefined
		if (OPTIONS_WITH_VALUE.includes(word)) index += 1
		else if (!word.startsWith('-')) return index
	}
	return undefined
}
