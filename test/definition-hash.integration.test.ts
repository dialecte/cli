import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { definitionHash } from '../src/lib/schema/definition-hash.ts'
import { loadDialectes } from '../src/lib/schema/load-dialectes.ts'
import { installTestDialecte } from './installed-test-dialecte.ts'
import { loadMultiDeclaredDialecte } from './multi-declared-dialecte.ts'
import { loadCoreTestDialecte } from './real-core.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../src/lib/schema/schema.types.ts'
import type { AnyDialecteConfig, DeclarationDefinition } from '@dialecte/core'

const HASH_FORMAT = /^sha256:[0-9a-f]{64}$/u
/** A type of core's test dialecte whose attributes the type cases change. */
const CHANGED_TYPE = '{http://dialecte.dev/XML/DEFAULT}tDD_1A'

let dialecte: LoadedDialecte
let multiDeclared: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadCoreTestDialecte()
	multiDeclared = await loadMultiDeclaredDialecte()
})

/** The same value with the keys of every object in reverse order. */
function withReversedKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withReversedKeys)
	if (typeof value !== 'object' || value === null) return value
	return Object.fromEntries(
		Object.entries(value)
			.reverse()
			.map(([name, each]) => [name, withReversedKeys(each)]),
	)
}

function isConfig(value: unknown): value is AnyDialecteConfig {
	return typeof value === 'object' && value !== null && 'definition' in value
}

function reversed(config: AnyDialecteConfig): AnyDialecteConfig {
	const rebuilt = withReversedKeys(config)
	if (!isConfig(rebuilt)) throw new Error('the rebuilt config lost its definition')
	return rebuilt
}

describe('definitionHash (core test dialecte)', () => {
	it('is sha256: and 64 lowercase hex characters', () => {
		expect(definitionHash({ config: dialecte.config })).toMatch(HASH_FORMAT)
	})

	it('hashes the stable JSON of definition, types and namespaces', () => {
		const emptyDefinition = {
			...dialecte.config,
			definition: {},
			types: {},
			namespaces: { default: dialecte.config.namespaces.default },
		}
		const expected = createHash('sha256')
			.update(
				'{"definition":{},"namespaces":{"default":{"prefix":"","uri":"http://dialecte.dev/XML/DEFAULT"}},"types":{}}',
			)
			.digest('hex')

		expect(definitionHash({ config: emptyDefinition })).toBe(`sha256:${expected}`)
	})

	it('the same config rebuilt with every object’s keys in reverse order → the same hash', () => {
		expect(definitionHash({ config: reversed(dialecte.config) })).toBe(
			definitionHash({ config: dialecte.config }),
		)
	})

	it('two different dialectes → two hashes', () => {
		expect(definitionHash({ config: multiDeclared.config })).not.toBe(
			definitionHash({ config: dialecte.config }),
		)
	})

	it('the installed test dialecte, loaded as an app loads it → the hash of core’s own', async () => {
		const cwd = mkdtempSync(join(tmpdir(), 'dialecte-cli-definition-hash-'))
		try {
			writeFileSync(join(cwd, 'package.json'), '{}')
			installTestDialecte({ cwd })
			const { dialectes } = await loadDialectes({ cwd })

			expect(dialectes.map((installed) => definitionHash({ config: installed.config }))).toEqual([
				definitionHash({ config: dialecte.config }),
			])
		} finally {
			rmSync(cwd, { recursive: true, force: true })
		}
	})
})

/** The config with the first declaration of `AAA_1` (declared several ways in the fixture) patched. */
function withFirstDeclaration(params: {
	config: AnyDialecteConfig
	patch: Partial<DeclarationDefinition>
}): AnyDialecteConfig {
	const { config, patch } = params
	const tagLevel = config.definition.AAA_1
	const first = tagLevel.declarations?.['1']
	if (first === undefined) throw new Error('the fixture declares no first way of AAA_1')
	return {
		...config,
		definition: {
			...config.definition,
			AAA_1: {
				...tagLevel,
				declarations: { ...tagLevel.declarations, '1': { ...first, ...patch } },
			},
		},
	}
}

function withNewDocumentation(config: AnyDialecteConfig): AnyDialecteConfig {
	return withFirstDeclaration({ config, patch: { documentation: 'another documentation' } })
}

function withAnotherType(config: AnyDialecteConfig): AnyDialecteConfig {
	return withFirstDeclaration({
		config,
		patch: { type: '{http://dialecte.dev/XML/DEFAULT}tOther' },
	})
}

function withAnotherNamespaceUri(config: AnyDialecteConfig): AnyDialecteConfig {
	return {
		...config,
		namespaces: {
			...config.namespaces,
			ext: { ...config.namespaces.ext, uri: 'http://dialecte.dev/XML/OTHER' },
		},
	}
}

function withReversedAttributeSequence(config: AnyDialecteConfig): AnyDialecteConfig {
	const tagLevel = config.definition.AAA_1
	return {
		...config,
		definition: {
			...config.definition,
			AAA_1: {
				...tagLevel,
				attributes: {
					...tagLevel.attributes,
					sequence: [...tagLevel.attributes.sequence].reverse(),
				},
			},
		},
	}
}

function withChangedTypeAttribute(config: AnyDialecteConfig): AnyDialecteConfig {
	const type = config.types[CHANGED_TYPE]
	return {
		...config,
		types: {
			...config.types,
			[CHANGED_TYPE]: {
				...type,
				attributes: {
					...type.attributes,
					details: { ...type.attributes.details, bDD_1: { required: true } },
				},
			},
		},
	}
}

function withAnotherRootElementName(config: AnyDialecteConfig): AnyDialecteConfig {
	return { ...config, rootElementName: 'Other' }
}

type ChangeCase = {
	description: string
	change: (config: AnyDialecteConfig) => AnyDialecteConfig
}

const CHANGES_THAT_MOVE_THE_HASH: ChangeCase[] = [
	{ description: 'a documentation string of a declaration', change: withNewDocumentation },
	{ description: 'the type a declaration names', change: withAnotherType },
	{ description: 'a namespace uri', change: withAnotherNamespaceUri },
	{ description: 'the order of an attribute sequence', change: withReversedAttributeSequence },
	{ description: 'an attribute of a types entry', change: withChangedTypeAttribute },
]

const CHANGES_THAT_LEAVE_THE_HASH: ChangeCase[] = [
	{
		description: 'rootElementName, outside definition/types/namespaces',
		change: withAnotherRootElementName,
	},
]

describe('definitionHash (one value changed)', () => {
	it.each(CHANGES_THAT_MOVE_THE_HASH)('$description → another hash', ({ change }) => {
		expect(definitionHash({ config: change(multiDeclared.config) })).not.toBe(
			definitionHash({ config: multiDeclared.config }),
		)
	})

	it.each(CHANGES_THAT_LEAVE_THE_HASH)('$description → the same hash', ({ change }) => {
		expect(definitionHash({ config: change(multiDeclared.config) })).toBe(
			definitionHash({ config: multiDeclared.config }),
		)
	})
})
