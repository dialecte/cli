/**
 * The family a judge most likely files a survivor under, guessed from the code around it: the first rule its code
 * matches. A guess for the judge to confirm after reading the code; `unclassified` when no rule matches (a gap to
 * test, or a family only the code tells).
 */
import { parseTarget } from './judge.ts'
import {
	CONSTANTS_FILE,
	COULD_NOT_LOCATE,
	ERROR_CALL_CALLEE,
	ERRORS_FOLDER_FILE,
	ERROR_PAYLOAD_MUTATORS,
	EXHAUSTIVE_DEFAULT_TEXT,
	NO_RULE_MATCHED,
	NON_CHILD_KEYS,
	STRING_LITERAL_MUTATOR,
	UNCLASSIFIED_FAMILY,
	WORDING_PROPERTY_NAMES,
} from './mutation-agent.constants.ts'

import { parse } from '@babel/parser'

import type { ClassifyParams, FamilyGuess, Span, SyntaxNode } from './mutation-agent.types.ts'

/** The family a survivor most likely belongs to, by the first rule its code matches (a guess: the judge reads the code). */
export function classifyFamily(params: ClassifyParams): FamilyGuess {
	const { file, source, mutation, line, range } = params
	if (ERRORS_FOLDER_FILE.test(file))
		return {
			familyGuess: 'wording',
			guessReason: 'a file of an errors/ folder: the error catalogue',
		}
	if (CONSTANTS_FILE.test(file))
		return {
			familyGuess: 'static-init',
			guessReason: 'a .constants.ts file: values set once at load',
		}
	const { mutator, original } = partsOf(mutation)
	const located = locate({ source, original, line, range })
	if ('missing' in located)
		return {
			familyGuess: UNCLASSIFIED_FAMILY,
			guessReason: `${COULD_NOT_LOCATE}: ${located.missing}`,
		}
	return guessOf({ source: located.source, mutator, chain: located.chain })
}

/** The chain of nodes from the program down to the smallest one holding the mutant; why not, when it cannot be found. */
function locate(params: {
	source: string | undefined
	original: string
	line: number
	range: string | undefined
}): { source: string; chain: SyntaxNode[] } | { missing: string } {
	const { source, original, line, range } = params
	if (source === undefined) return { missing: 'the file is gone' }
	const program = parsed(source)
	if (program === undefined) return { missing: 'the file does not parse' }
	const span =
		range === undefined ? spanOfText({ source, original, line }) : spanOfRange({ source, range })
	if (span === undefined) return { missing: 'its code is not in the file' }
	return { source, chain: ancestorsOf({ root: program, span }) }
}

/** The rules 4 to 8 on the chain of nodes from the program down to the smallest one holding the mutant. */
function guessOf(params: {
	source: string
	mutator: string
	chain: readonly SyntaxNode[]
}): FamilyGuess {
	const { source, mutator, chain } = params
	const node = chain[chain.length - 1]
	const exhaustive = chain.some(
		(ancestor) =>
			ancestor.type === 'SwitchCase' &&
			ancestor.test === null &&
			EXHAUSTIVE_DEFAULT_TEXT.test(textOf({ source, node: ancestor })),
	)
	if (exhaustive)
		return {
			familyGuess: 'exhaustive-default',
			guessReason: 'inside the default clause of a switch that covers every case',
		}

	const inThrow = chain.some((ancestor) => ancestor.type === 'ThrowStatement')
	const inErrorCall = chain.some(
		(ancestor) =>
			(ancestor.type === 'CallExpression' || ancestor.type === 'NewExpression') &&
			ERROR_CALL_CALLEE.test(textOf({ source, node: ancestor.callee })),
	)
	const inWordingProperty = chain.some(
		(ancestor) =>
			ancestor.type === 'ObjectProperty' &&
			WORDING_PROPERTY_NAMES.test(propertyNameOf({ source, property: ancestor })),
	)
	const isString = mutator === STRING_LITERAL_MUTATOR || node.type === 'TemplateLiteral'
	if (isString && (inThrow || inErrorCall || inWordingProperty))
		return {
			familyGuess: 'wording',
			guessReason: 'a text inside a throw, an error call or a message property',
		}
	if ((inThrow || inErrorCall) && ERROR_PAYLOAD_MUTATORS.test(mutator))
		return { familyGuess: 'wording', guessReason: 'the payload of a throw or an error call' }

	const moduleLevel = chain.some(
		(ancestor, index) =>
			ancestor.type === 'VariableDeclaration' && isModuleLevel({ parents: chain.slice(0, index) }),
	)
	if (moduleLevel)
		return {
			familyGuess: 'static-init',
			guessReason: 'a module-level declaration: set once at load',
		}
	return { familyGuess: UNCLASSIFIED_FAMILY, guessReason: NO_RULE_MATCHED }
}

/** A declaration's parents end with the program, or with an `export` the program holds. */
function isModuleLevel(params: { parents: readonly SyntaxNode[] }): boolean {
	const types = params.parents.map((parent) => parent.type)
	const last = types[types.length - 1]
	if (last === 'Program') return true
	return (
		(last === 'ExportNamedDeclaration' || last === 'ExportDefaultDeclaration') &&
		types[types.length - 2] === 'Program'
	)
}

/** The mutator and the original code of `"<Mutator>: <original> -> <replacement>"`. */
function partsOf(mutation: string): { mutator: string; original: string } {
	const colon = mutation.indexOf(':')
	const rest = mutation.slice(colon + 2)
	return { mutator: mutation.slice(0, colon), original: rest.split(' -> ')[0] }
}

/** The program of a TypeScript module; undefined when it does not parse. */
function parsed(source: string): SyntaxNode | undefined {
	try {
		return parse(source, { sourceType: 'module', plugins: ['typescript'], errorRecovery: false })
			.program
	} catch {
		// a source that does not parse: the mutant cannot be located
		return undefined
	}
}

/** The occurrence of the original's first line nearest the survivor's line; undefined when it is not in the source. */
function spanOfText(params: { source: string; original: string; line: number }): Span | undefined {
	const { source, original, line } = params
	const needle = original.split('\n')[0].trim()
	if (needle === '') return undefined
	let best: number | undefined
	let bestDistance = Number.POSITIVE_INFINITY
	for (let index = source.indexOf(needle); index >= 0; index = source.indexOf(needle, index + 1)) {
		const distance = Math.abs(lineAt({ source, offset: index }) - line)
		if (distance < bestDistance) {
			bestDistance = distance
			best = index
		}
	}
	return best === undefined ? undefined : { start: best, end: best + needle.length }
}

/** The span a `file:line:col-line:col` range names (columns from 0); undefined when it lies outside the source. */
function spanOfRange(params: { source: string; range: string }): Span | undefined {
	const { source, range } = params
	const target = parseTarget({ target: range }).range
	if (target === undefined) return undefined
	const starts = lineStartsOf(source)
	const start = offsetOf({ source, starts, ...target.start })
	const end = offsetOf({ source, starts, ...target.end })
	return start === undefined || end === undefined || end < start ? undefined : { start, end }
}

function offsetOf(params: {
	source: string
	starts: readonly number[]
	line: number
	column: number
}): number | undefined {
	const { source, starts, line, column } = params
	const start = starts[line - 1]
	if (start === undefined) return undefined
	const offset = start + column
	return offset > source.length ? undefined : offset
}

function lineStartsOf(source: string): number[] {
	const starts = [0]
	for (let index = source.indexOf('\n'); index >= 0; index = source.indexOf('\n', index + 1))
		starts.push(index + 1)
	return starts
}

function lineAt(params: { source: string; offset: number }): number {
	return params.source.slice(0, params.offset).split('\n').length
}

/** The nodes from `root` down to the smallest one holding the span, `root` first. */
function ancestorsOf(params: { root: SyntaxNode; span: Span }): SyntaxNode[] {
	const { span } = params
	const chain = [params.root]
	for (;;) {
		const child = childrenOf(chain[chain.length - 1]).find((node) => holds({ node, span }))
		if (child === undefined) return chain
		chain.push(child)
	}
}

function holds(params: { node: SyntaxNode; span: Span }): boolean {
	const { node, span } = params
	return (node.start ?? 0) <= span.start && span.end <= (node.end ?? 0)
}

/** The child nodes of a node, whatever their key. */
function childrenOf(node: SyntaxNode): SyntaxNode[] {
	return Object.entries(node)
		.filter(([key]) => !NON_CHILD_KEYS.has(key))
		.flatMap(([, value]: [string, unknown]) => (Array.isArray(value) ? value : [value]))
		.filter(isSyntaxNode)
}

function isSyntaxNode(value: unknown): value is SyntaxNode {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { type?: unknown }).type === 'string'
	)
}

function textOf(params: { source: string; node: SyntaxNode }): string {
	const { source, node } = params
	return source.slice(node.start ?? 0, node.end ?? 0)
}

/** The name of an object property: its identifier or string key, else its key's text. */
function propertyNameOf(params: {
	source: string
	property: Extract<SyntaxNode, { type: 'ObjectProperty' }>
}): string {
	const { source, property } = params
	const { key } = property
	if (key.type === 'Identifier') return key.name
	if (key.type === 'StringLiteral') return key.value
	return textOf({ source, node: key })
}
