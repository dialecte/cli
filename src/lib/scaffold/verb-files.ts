/**
 * The three files of a new verb, in the house style of a generated dialecte: the function (named, the
 * query or transaction first, one params object, a JSDoc summary and `@intent` left to fill), its types,
 * and its table-driven test with one red case (no `only`: `dialecte tdd red` refuses a focus marker).
 */
import { PLACEHOLDER_MARKER } from '../skills/api-index.constants.ts'
import { KIND_SHAPES } from './new-verb.constants.ts'

import type { VerbNames } from './new-verb.types.ts'

export function renderVerbFile(names: VerbNames): string {
	const typeName = capitalize(names.name)
	return [
		`import type { ${typeName}Params, ${typeName}Result } from './${names.file}.types'`,
		`import type { Config } from '@/${names.version}/config'`,
		"import type * as Core from '@dialecte/core'",
		'',
		'/**',
		` * ${PLACEHOLDER_MARKER} what it answers, in one sentence.`,
		' *',
		` * @intent ${PLACEHOLDER_MARKER} what a caller is trying to do when this is the method to reach for`,
		' */',
		`export async function ${names.name}(`,
		`\t${KIND_SHAPES[names.kind].firstParameter},`,
		`\tparams: ${typeName}Params,`,
		`): Promise<${typeName}Result> {`,
		`\tthrow new Error('${names.namespace}.${names.name}: ${PLACEHOLDER_MARKER} the implementation, red test first')`,
		'}',
		'',
	].join('\n')
}

export function renderTypesFile(names: VerbNames): string {
	const typeName = capitalize(names.name)
	return [
		`/** ${PLACEHOLDER_MARKER} what the caller passes, one named field each. */`,
		`export type ${typeName}Params = Record<string, never>`,
		'',
		`/** ${PLACEHOLDER_MARKER} what the caller gets back. */`,
		`export type ${typeName}Result = ${names.kind === 'query' ? 'unknown' : 'void'}`,
		'',
	].join('\n')
}

export function renderTestFile(names: VerbNames): string {
	const { dialecteName, version, namespace, name, rootElement } = names
	const typeName = capitalize(name)
	const testNamespace = `${dialecteName}Test`
	const isQuery = names.kind === 'query'
	const caseShape = isQuery
		? [`\t\t\texpected: undefined, // ${PLACEHOLDER_MARKER} what the query answers`]
		: [`\t\t\texpectedQueries: ['${PLACEHOLDER_MARKER} an XPath of what the transaction writes'],`]
	const act = isQuery
		? [
				`\tasync function act({ testCase, source }: ${testNamespace}.ActParams<TestCase>) {`,
				`\t\tconst result = await source.query.${namespace}.${name}({})`,
				'',
				'\t\texpect(result).toEqual(testCase.expected)',
				'\t}',
				'',
				`\trun${dialecteName}TestCases.withoutExport({ testCases, act })`,
			]
		: [
				'\tasync function act({',
				'\t\tsource,',
				`\t}: ${testNamespace}.ActParams<TestCase>): Promise<${testNamespace}.ActResult> {`,
				'\t\tawait source.transaction(async (tx) => {',
				`\t\t\tawait tx.${namespace}.${name}({})`,
				'\t\t})',
				'',
				"\t\treturn { assertOn: 'source' }",
				'\t}',
				'',
				`\trun${dialecteName}TestCases.withExport({ testCases, act })`,
			]
	return [
		`import { describe${isQuery ? ', expect' : ''} } from 'vitest'`,
		'',
		'import {',
		'\tALL_XMLNS_NAMESPACES,',
		'\tCUSTOM_RECORD_ID_ATTRIBUTE,',
		`\trun${dialecteName}TestCases,`,
		`} from '@/${version}/test'`,
		'',
		...(isQuery ? [`import type { ${typeName}Result } from './${names.file}.types'`] : []),
		`import type { ${testNamespace} } from '@/${version}/test'`,
		'',
		isQuery
			? `type TestCase = ${testNamespace}.BaseXmlTestCase & { expected: ${typeName}Result }`
			: `type TestCase = ${testNamespace}.BaseXmlTestCase`,
		'',
		`describe('${namespace}.${name}', () => {`,
		'\tconst ns = ALL_XMLNS_NAMESPACES',
		'\tconst id = CUSTOM_RECORD_ID_ATTRIBUTE',
		'',
		`\tconst testCases: ${testNamespace}.TestCases<TestCase> = {`,
		`\t\t'${PLACEHOLDER_MARKER} the situation → what ${isQuery ? 'it answers' : 'it writes'}': {`,
		'\t\t\tsourceXml: /* xml */ `',
		`\t\t\t\t<${rootElement} \${ns} \${id}="root">`,
		`\t\t\t\t\t<!-- ${PLACEHOLDER_MARKER} the elements the case needs -->`,
		`\t\t\t\t</${rootElement}>`,
		'\t\t\t`,',
		...caseShape,
		'\t\t},',
		'\t}',
		'',
		...act,
		'})',
		'',
	].join('\n')
}

function capitalize(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1)
}
