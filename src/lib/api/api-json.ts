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
import type { ApiJson, ApiMethod, ApiMethodFields, MethodRoot } from './api-json.types.ts'

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

/** The row of a root method, or of a function an entry exports (`root: 'export'` and its `entry`). */
function apiMethodOf(params: { method: IndexedMethod; root: string }): ApiMethod {
	const { entry, otherRoutes } = params.method
	const path = displayPath(entry.path)
	const fields: Omit<ApiMethodFields, 'path'> = {
		otherRoutes: otherRoutes.map(displayPath),
		signature: entry.signature,
		summary: entry.summary,
		intents: entry.intents,
		declaredAt: entry.declaredAt && lineOf({ declaredAt: entry.declaredAt, root: params.root }),
		example:
			(entry.example &&
			isUsableExample({ example: entry.example, path, exported: entry.entry !== undefined })
				? entry.example
				: undefined) ??
			// a test calls the function with its query or transaction first, which the route binds: an export
			// binds nothing, so a test call is not written on its route
			(entry.declaredAt && entry.entry === undefined
				? findTestExample({ root: params.root, declaredAt: entry.declaredAt, route: path })
				: undefined),
	}
	// the keys in the same order for both: path, root, entry, then the fields
	if (entry.entry === undefined) return { path, root: rootOf(entry.path), ...fields }
	return { path, root: 'export', entry: entry.entry, ...fields }
}

/**
 * A JSDoc example worth shipping: it calls the method on a route or a query (`query.getTree(`), or calls the
 * exported function by its name (`connectHub(`), and it is short.
 */
function isUsableExample(params: { example: string; path: string; exported: boolean }): boolean {
	const name = params.path.slice(params.path.lastIndexOf('.') + 1)
	const call = params.exported ? `\\b${name}\\s*\\(` : `\\.${name}\\s*\\(`
	return params.example.length <= EXAMPLE_MAX_LENGTH && new RegExp(call).test(params.example)
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
