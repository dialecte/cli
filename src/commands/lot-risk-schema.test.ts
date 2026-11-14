/**
 * `lot risk --json` against its versioned schema (`lot-risk.schema.json`, LOT-RULES Contracts): real outputs of a read
 * validate, and a hand check of the keywords the schema uses (required, additionalProperties, type, enum, items,
 * minimum, $ref, oneOf) refuses a broken object, so a drift of either side fails here.
 */
import { readFileSync } from 'node:fs'

import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotRisk } from './lot-risk.ts'

import { describe, expect, it } from 'vitest'

type Schema = Record<string, unknown>

const SCHEMA_URL = new URL('./lot-risk.schema.json', import.meta.url)
const ROOT_SCHEMA = JSON.parse(readFileSync(SCHEMA_URL, 'utf8')) as Schema

const PACKAGE_JSON =
	'{\n\t"name": "scratch",\n\t"version": "1.0.0",\n\t"bin": { "scratch": "scratch.js" },\n\t"dialecte": { "risk": { "high": ["src/lib/store/**"] } }\n}\n'

/** The effort line of a person, as `risk.jsonl` holds it. */
const EFFORT_MEDIUM =
	'{"schema":1,"kind":"effort","at":"2026-11-13T08:00:00.000Z","effort":"medium","by":"person-a"}\n'

/** The faults of `value` against `schema` (the keywords above only); empty when it validates. */
function faultsOf(params: { value: unknown; schema: Schema; path: string }): string[] {
	const { value, path } = params
	const schema = resolved(params.schema)
	const faults: string[] = []
	if (Array.isArray(schema.oneOf)) {
		const options = schema.oneOf as Schema[]
		const holds = options.some(function validates(option) {
			return faultsOf({ value, schema: option, path }).length === 0
		})
		return holds ? [] : [`${path}: matches none of oneOf`]
	}
	if (schema.type !== undefined && !hasType({ value, type: schema.type as string }))
		return [`${path}: not a ${String(schema.type)}`]
	if (Array.isArray(schema.enum) && !schema.enum.includes(value))
		faults.push(`${path}: not in enum`)
	if (typeof schema.minimum === 'number' && typeof value === 'number' && value < schema.minimum)
		faults.push(`${path}: below minimum`)
	if (Array.isArray(value) && schema.items !== undefined)
		faults.push(
			...value.flatMap(function itemFaults(item, index) {
				return faultsOf({ value: item, schema: schema.items as Schema, path: `${path}[${index}]` })
			}),
		)
	if (schema.type === 'object') faults.push(...objectFaultsOf({ value, schema, path }))
	return faults
}

/** The faults of an object: a missing required key, an unknown key when none is allowed, each property. */
function objectFaultsOf(params: { value: unknown; schema: Schema; path: string }): string[] {
	const record = params.value as Record<string, unknown>
	const properties = (params.schema.properties ?? {}) as Record<string, Schema>
	const required = (params.schema.required ?? []) as string[]
	const missing = required
		.filter(function isMissing(key) {
			return !(key in record)
		})
		.map(function missingFault(key) {
			return `${params.path}.${key}: missing`
		})
	const unknown =
		params.schema.additionalProperties === false
			? Object.keys(record)
					.filter(function isUnknown(key) {
						return !(key in properties)
					})
					.map(function unknownFault(key) {
						return `${params.path}.${key}: unknown key`
					})
			: []
	const inner = Object.keys(properties).flatMap(function propertyFaults(key) {
		return key in record
			? faultsOf({ value: record[key], schema: properties[key], path: `${params.path}.${key}` })
			: []
	})
	return [...missing, ...unknown, ...inner]
}

/** The schema a `$ref` of the root points at (`#/$defs/<name>`); the schema itself otherwise. */
function resolved(schema: Schema): Schema {
	if (typeof schema.$ref !== 'string') return schema
	const name = schema.$ref.replace('#/$defs/', '')
	return (ROOT_SCHEMA.$defs as Record<string, Schema>)[name]
}

/** Whether `value` is of the JSON type `type`. */
function hasType(params: { value: unknown; type: string }): boolean {
	const { value, type } = params
	if (type === 'array') return Array.isArray(value)
	if (type === 'null') return value === null
	if (type === 'integer') return Number.isInteger(value)
	if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
	return typeof value === type
}

/** The faults of a value against the schema of `lot risk --json`. */
function outputFaultsOf(value: unknown): string[] {
	return faultsOf({ value, schema: ROOT_SCHEMA, path: '$' })
}

/** The answer of `lot risk`; a throw is an answer too (exit -1, the message), so a case fails on its assertion. */
function answerOrThrow(params: { cwd: string; argv: string[] }): {
	exitCode: number
	output: string
} {
	try {
		return runLotRisk(params)
	} catch (error) {
		return { exitCode: -1, output: (error as Error).message }
	}
}

/** The text read as JSON; the text itself when it is not JSON. */
function jsonOrText(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}

/** A repository on `main` with the manifest and a change and no commit. */
function repositoryWithoutCommit(): string {
	const root = temporaryFolder('dialecte-risk-schema-')
	git({ root, args: ['init', '-q', '-b', 'main'] })
	writeFiles({
		root,
		files: { 'package.json': PACKAGE_JSON, 'src/small.ts': 'export const small = 1\n' },
	})
	return root
}

describe('lot risk --json - the schema', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a read with a declared reason and an effort below the class validates', () => {
		const root = createScratchRepository({ 'package.json': PACKAGE_JSON })
		writeFiles({ root, files: { 'src/lib/store/publish.ts': 'export const published = 1\n' } })
		const folder = temporaryFolder('dialecte-risk-schema-folder-')
		writeFiles({ root: folder, files: { 'risk.jsonl': EFFORT_MEDIUM } })

		const result = runLotRisk({ cwd: root, argv: [folder, '--json'] })

		expect({
			exitCode: result.exitCode,
			faults: outputFaultsOf(JSON.parse(result.output)),
		}).toEqual({
			exitCode: 0,
			faults: [],
		})
	})

	it('a read with no effort recorded validates', () => {
		const root = createScratchRepository({ 'package.json': PACKAGE_JSON })
		writeFiles({ root, files: { 'src/small.ts': 'export const small = 1\n' } })
		const folder = temporaryFolder('dialecte-risk-schema-folder-')

		const result = runLotRisk({ cwd: root, argv: [folder, '--json'] })

		expect({
			exitCode: result.exitCode,
			faults: outputFaultsOf(JSON.parse(result.output)),
		}).toEqual({
			exitCode: 0,
			faults: [],
		})
	})

	it('a read whose class cannot be derived validates, class null', () => {
		const root = repositoryWithoutCommit()
		const folder = temporaryFolder('dialecte-risk-schema-folder-')

		const result = answerOrThrow({ cwd: root, argv: [folder, '--json'] })

		expect({ exitCode: result.exitCode, json: jsonOrText(result.output) }).toEqual({
			exitCode: 0,
			json: { class: null, reasons: [], effort: null, below: false, cap: 1 },
		})
		expect(outputFaultsOf(JSON.parse(result.output))).toEqual([])
	})

	it('a missing key, a wrong type, a stranger key and a class out of the list are each a fault', () => {
		const whole = { class: 'high', reasons: [], effort: 'low', below: true, cap: 3 }

		expect({
			missing: outputFaultsOf({ class: 'high', reasons: [], effort: 'low' }),
			type: outputFaultsOf({ ...whole, below: 'yes' }),
			stranger: outputFaultsOf({ ...whole, extra: 1 }),
			klass: outputFaultsOf({ ...whole, class: 'urgent' }),
		}).toEqual({
			missing: ['$.below: missing', '$.cap: missing'],
			type: ['$.below: not a boolean'],
			stranger: ['$.extra: unknown key'],
			klass: ['$.class: matches none of oneOf'],
		})
	})
})
