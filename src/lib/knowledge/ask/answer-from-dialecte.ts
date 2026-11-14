import { findMethods, wordsOf } from '../../api/find-methods.ts'
import { explainCode } from '../../run/explain-code.ts'
import { CORE_CATALOGUE_NAME } from '../../run/run.constants.ts'
import { CORE_PACKAGE } from '../../schema/schema.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	DIALECTE_SOURCE_KIND,
	METHOD_ANSWER_TEMPLATE,
	METHOD_LIMIT,
	VERDICT_VALUE,
} from './ask.constants.ts'

import type { AnswerFromDialecteParams, AskSetup, RungAnswer } from './ask.types.ts'

/**
 * Rung 2: a code the catalogues explain once, or an api method whose intents hold every content word of the
 * need; the top paths when no method answers; undefined when the rung has nothing for the kind.
 */
export function answerFromDialecte(
	params: AnswerFromDialecteParams,
): RungAnswer | { methods: string[] } | undefined {
	const { kind, slots, request, setup } = params
	if (kind === 'code')
		return slots.code === undefined
			? undefined
			: codeAnswer({ code: slots.code, setup, packageName: dialectePackageOf({ request, setup }) })
	if (kind === 'method') return methodAnswer({ need: slots.rest ?? request.question, setup })
	return undefined
}

/**
 * The dialecte whose own catalogue a code's entry comes from: the one the request names, else the only one
 * loaded, else the folder's own package when it is one of them; null when none decides.
 */
function dialectePackageOf(params: {
	request: AnswerFromDialecteParams['request']
	setup: AskSetup
}): string | null {
	const { request, setup } = params
	if (request.packageName !== undefined) return request.packageName
	const [only, ...others] = setup.dialectes
	if (only !== undefined && others.length === 0) return only.packageName
	const own = setup.dialectes.find((dialecte) => dialecte.packageName === setup.ownPackage)
	return own?.packageName ?? null
}

/**
 * The one catalogue entry of a code: its message, its fix line, the package shipping its catalogue; undefined
 * when no entry or several name it.
 */
function codeAnswer(params: {
	code: string
	setup: AskSetup
	packageName: string | null
}): RungAnswer | undefined {
	const { setup } = params
	const explained = explainCode({ code: params.code, catalogues: setup.catalogues })
	const [entry, ...others] = explained
	if (entry === undefined || others.length > 0) return undefined
	// the package that ships the catalogue holding the entry (D10b): core's own, else the dialecte's
	const packageName = entry.catalogue === CORE_CATALOGUE_NAME ? CORE_PACKAGE : params.packageName
	return {
		answer: {
			verdict: VERDICT_VALUE,
			value: entry.message,
			text: entry.explanation?.fix ?? entry.message,
		},
		sources: [{ kind: DIALECTE_SOURCE_KIND, package: packageName, catalogue: setup.catalogueHash }],
	}
}

/**
 * The top method of the api indexes when its intents hold every content word of the need, with the hash of the
 * index holding it; else the top paths found (none when no method shares a word with the need).
 */
function methodAnswer(params: {
	need: string
	setup: AskSetup
}): RungAnswer | { methods: string[] } {
	const { need, setup } = params
	const found = findMethods({
		indexes: setup.apiIndexes.map((entry) => entry.index),
		need,
		limit: METHOD_LIMIT,
	})
	const [top] = found
	const paths = found.map((method) => method.method.path)
	if (top === undefined || top.hits.intent < new Set(wordsOf(need)).size) return { methods: paths }
	const holder = setup.apiIndexes.find((entry) => entry.index.methods.includes(top.method))
	if (holder === undefined) return { methods: paths }
	return {
		answer: {
			verdict: VERDICT_VALUE,
			value: top.method.path,
			text: fillMessage({ template: METHOD_ANSWER_TEMPLATE, values: { path: top.method.path } }),
		},
		// the package of the api index that holds the method (D10b), never the dialecte the ask ran in
		sources: [{ kind: DIALECTE_SOURCE_KIND, package: top.packageName, apiJson: holder.hash }],
	}
}
