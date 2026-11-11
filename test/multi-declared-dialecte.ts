/**
 * Core's test dialecte declares no tag several ways: this extends it, the way core's own definition tests do,
 * with `AAA_1` declared two ways.
 *
 * - declaration '1': the default namespace, a named type, documentation, only `aAAA_1` (required);
 * - declaration '2': the extension namespace, global, another type and documentation, `bAAA_1` and `ext:cAAA_1`;
 * - `AA_1` holds { default: ['1'] }, `AA_2` holds { extension: ['2'] }, `AA_3` holds ['1', '2'] in one namespace,
 *   `AA_4` (added, under `A`) holds '1' in the default namespace and '2' in the extension one;
 * - `AA_5` (added, under `A`) is a wildcard parent: a tag-level parent of `AAA_1` that names no declaration of it.
 *
 * The namespaces are the config's own (`namespaces.default`, `namespaces.ext`).
 */
import { installTestDialecte } from './installed-test-dialecte.ts'
import {
	FIRST_DECLARATION_DOCUMENTATION,
	FIRST_DECLARATION_TYPE_NAME,
	MULTI_DECLARED_TAG,
	SECOND_DECLARATION_DOCUMENTATION,
	SECOND_DECLARATION_ENUMERATION,
	SECOND_DECLARATION_TYPE_NAME,
	TWO_NAMESPACES_PARENT,
	TWO_NAMESPACES_PARENT_MODEL,
	TWO_NAMESPACES_PARENT_PARENT,
	WILDCARD_PARENT,
} from './multi-declared-dialecte.constants.ts'
import { loadCoreTestDialecte } from './real-core.ts'

import type { LoadedDialecte } from '../src/lib/schema/schema.types.ts'
import type { MultiDeclaredPatch } from './multi-declared-dialecte.types.ts'
import type { AnyDialecteConfig, DeclarationDefinition, ElementDefinition } from '@dialecte/core'

/** The parts of core's test config the fixture changes: its elements, parent and child lists, definition. */
export function multiDeclaredPatch(params: { config: AnyDialecteConfig }): MultiDeclaredPatch {
	const { config } = params
	const { definition } = config
	const defaultNamespace = config.namespaces.default
	const extensionNamespace = config.namespaces.ext
	const tagLevel = definition[MULTI_DECLARED_TAG]
	const model = definition[TWO_NAMESPACES_PARENT_MODEL]
	const grandParent = definition[TWO_NAMESPACES_PARENT_PARENT]

	const first: DeclarationDefinition = {
		namespace: defaultNamespace,
		documentation: FIRST_DECLARATION_DOCUMENTATION,
		type: `{${defaultNamespace.uri}}${FIRST_DECLARATION_TYPE_NAME}`,
		attributes: { sequence: ['aAAA_1'], details: { aAAA_1: { required: true } } },
		children: { sequence: ['AAAA_1'], details: {} },
	}
	const second: DeclarationDefinition = {
		namespace: extensionNamespace,
		global: true,
		documentation: SECOND_DECLARATION_DOCUMENTATION,
		type: `{${extensionNamespace.uri}}${SECOND_DECLARATION_TYPE_NAME}`,
		attributes: {
			sequence: ['bAAA_1', 'ext:cAAA_1'],
			details: {
				bAAA_1: {
					type: {
						builtin: 'string',
						facets: { enumeration: [...SECOND_DECLARATION_ENUMERATION] },
					},
				},
				'ext:cAAA_1': { namespace: extensionNamespace },
			},
		},
		children: { sequence: ['AAAA_2'], details: {} },
	}
	const bothNamespaces = {
		[defaultNamespace.uri]: ['1'],
		[extensionNamespace.uri]: ['2'],
	}

	return {
		elements: [...config.elements, TWO_NAMESPACES_PARENT, WILDCARD_PARENT],
		parents: {
			[MULTI_DECLARED_TAG]: [...tagLevel.parents, TWO_NAMESPACES_PARENT, WILDCARD_PARENT],
			[TWO_NAMESPACES_PARENT]: [TWO_NAMESPACES_PARENT_PARENT],
			[WILDCARD_PARENT]: [TWO_NAMESPACES_PARENT_PARENT],
		},
		children: {
			[TWO_NAMESPACES_PARENT_PARENT]: [
				...config.children[TWO_NAMESPACES_PARENT_PARENT],
				TWO_NAMESPACES_PARENT,
				WILDCARD_PARENT,
			],
			[TWO_NAMESPACES_PARENT]: config.children[TWO_NAMESPACES_PARENT_MODEL],
			[WILDCARD_PARENT]: [],
		},
		definition: {
			[MULTI_DECLARED_TAG]: {
				...tagLevel,
				parents: [...tagLevel.parents, TWO_NAMESPACES_PARENT, WILDCARD_PARENT],
				declarations: { '1': first, '2': second },
			},
			AA_1: holding({ element: definition.AA_1, held: { [defaultNamespace.uri]: ['1'] } }),
			AA_2: holding({ element: definition.AA_2, held: { [extensionNamespace.uri]: ['2'] } }),
			AA_3: holding({ element: definition.AA_3, held: { [defaultNamespace.uri]: ['1', '2'] } }),
			[TWO_NAMESPACES_PARENT]: {
				...holding({ element: model, held: bothNamespaces }),
				tag: TWO_NAMESPACES_PARENT,
				parents: [TWO_NAMESPACES_PARENT_PARENT],
			},
			// a wildcard parent: any child element, so no `details` entry names AAA_1
			[WILDCARD_PARENT]: {
				...model,
				tag: WILDCARD_PARENT,
				parents: [TWO_NAMESPACES_PARENT_PARENT],
				children: { sequence: [], details: {}, any: true },
				contentModel: undefined,
			},
			[TWO_NAMESPACES_PARENT_PARENT]: {
				...grandParent,
				children: {
					...grandParent.children,
					sequence: [...grandParent.children.sequence, TWO_NAMESPACES_PARENT, WILDCARD_PARENT],
					// `details` holds only the children declared several ways: AA_4 is declared once
				},
				contentModel:
					grandParent.contentModel?.kind === 'sequence'
						? {
								...grandParent.contentModel,
								particles: [
									...grandParent.contentModel.particles,
									{ kind: 'element', name: TWO_NAMESPACES_PARENT },
									{ kind: 'element', name: WILDCARD_PARENT },
								],
							}
						: grandParent.contentModel,
			},
		},
	}
}

function holding(params: {
	element: ElementDefinition
	held: Record<string, readonly string[]>
}): ElementDefinition {
	return {
		...params.element,
		children: {
			...params.element.children,
			details: {
				...params.element.children.details,
				[MULTI_DECLARED_TAG]: { declarations: params.held },
			},
		},
	}
}

/** Core's test dialecte with `AAA_1` declared two ways. */
export async function loadMultiDeclaredDialecte(): Promise<LoadedDialecte> {
	const dialecte = await loadCoreTestDialecte()
	const patch = multiDeclaredPatch({ config: dialecte.config })
	const config: AnyDialecteConfig = {
		...dialecte.config,
		elements: patch.elements,
		parents: { ...dialecte.config.parents, ...patch.parents },
		children: { ...dialecte.config.children, ...patch.children },
		definition: { ...dialecte.config.definition, ...patch.definition },
	}
	return { ...dialecte, config }
}

/** Installs that dialecte in a package folder, as `installTestDialecte` installs core's own. */
export async function installMultiDeclaredDialecte(params: {
	cwd: string
	packageName?: string
}): Promise<void> {
	const { config } = await loadCoreTestDialecte()
	installTestDialecte({ ...params, configPatch: multiDeclaredPatch({ config }) })
}
