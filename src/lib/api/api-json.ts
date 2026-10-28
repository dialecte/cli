/**
 * `api.json`, written by `dialecte skills generate` next to the skill's `api.md`: the same index as a
 * data file, with each method's signature and a one-call example, so `dialecte api find` and `api show`
 * answer from the installed package alone.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROOTS } from '../discover.constants.ts'
import { displayPath, indexedMethods } from '../skills/api-index.ts'
import { EXAMPLE_MAX_LENGTH } from './api-json.constants.ts'
import { findTestExample, splitDeclaredAt } from './find-example.ts'

import type { MethodEntry } from '../discover.types.ts'
import type { IndexedMethod } from '../skills/api-index.types.ts'
import type { ApiJson, ApiMethod, MethodRoot } from './api-json.types.ts'

export function buildApiJson(params: {
	packageName: string
	methods: readonly MethodEntry[]
	/** The package folder: declarations and their tests are read from it. */
	root: string
}): ApiJson {
	return {
		package: params.packageName,
		methods: indexedMethods(params.methods).map((method) =>
			apiMethodOf({ method, root: params.root }),
		),
	}
}

function apiMethodOf(params: { method: IndexedMethod; root: string }): ApiMethod {
	const { entry, otherRoutes } = params.method
	const path = displayPath(entry.path)
	return {
		path,
		root: rootOf(entry.path),
		otherRoutes: otherRoutes.map(displayPath),
		signature: entry.signature,
		summary: entry.summary,
		intents: entry.intents,
		declaredAt: entry.declaredAt && lineOf({ declaredAt: entry.declaredAt, root: params.root }),
		example:
			(entry.example && isUsableExample({ example: entry.example, path })
				? entry.example
				: undefined) ??
			(entry.declaredAt
				? findTestExample({ root: params.root, declaredAt: entry.declaredAt, route: path })
				: undefined),
	}
}

/** A JSDoc example worth shipping: it calls the method on a route or a query (`query.getTree(`), and it is short. */
function isUsableExample(params: { example: string; path: string }): boolean {
	const name = params.path.slice(params.path.lastIndexOf('.') + 1)
	return (
		params.example.length <= EXAMPLE_MAX_LENGTH &&
		new RegExp(`\\.${name}\\s*\\(`).test(params.example)
	)
}

/** The root discover walked the method from: the first segment of its path. */
function rootOf(path: string): MethodRoot {
	const root = ROOTS.find((candidate) => path.startsWith(`${candidate}.`))
	if (root === undefined) throw new Error(`method path "${path}" starts with no known root`)
	return root
}

/** `file:position` → `file:line`, the line a reader opens. */
function lineOf(params: { declaredAt: string; root: string }): string {
	const { file, position } = splitDeclaredAt(params.declaredAt)
	const path = join(params.root, file)
	if (!existsSync(path)) return file
	const line = readFileSync(path, 'utf8').slice(0, position).split('\n').length
	return `${file}:${line}`
}

export function renderApiJson(apiJson: ApiJson): string {
	return `${JSON.stringify(apiJson, null, '\t')}\n`
}
