/**
 * Core's structural XML validator (`createXmlSchemaAssertions`) in the cli's Node tests. It parses with the
 * browser's `DOMParser`, which Node lacks: the tests lend it the `@xmldom/xmldom` parser (a development dependency
 * of the cli), given the two members the validator reads that xmldom does not have (`querySelector` for the
 * parse error, `children`). A malformed document throws while it is parsed. The tests check that an invalid
 * document still fails through it, so a gap in this stand-in cannot pass a fixture by accident.
 */
import { pathToFileURL } from 'node:url'

import { coreEntries } from '../real-core.ts'
import { ELEMENT_NODE } from './xml-validation.constants.ts'

import { DOMParser as XmlDomParserClass } from '@xmldom/xmldom'

import type {
	CoreTestModule,
	ParsedDocument,
	ParsedNode,
	XmlDomParser,
} from './xml-validation.types.ts'

/** Give Node a `DOMParser`: the cli's own `@xmldom/xmldom` development dependency, with the members it lacks. */
export async function installNodeDomParser(): Promise<void> {
	if ('DOMParser' in globalThis) return
	const XmlDomDomParser = XmlDomParserClass as unknown as XmlDomParser

	function rejectMalformed(message: string): never {
		throw new Error(`malformed XML - ${message}`)
	}

	class NodeDomParser {
		parseFromString(xml: string, mimeType: string): ParsedDocument {
			const parsed = new XmlDomDomParser({
				errorHandler: { warning() {}, error: rejectMalformed, fatalError: rejectMalformed },
			}).parseFromString(xml, mimeType)
			lendMissingMembers({ document: parsed })
			return parsed
		}
	}
	Object.assign(globalThis, { DOMParser: NodeDomParser })
}

/** `querySelector('parsererror')` answers none (a malformed document threw), `children` the child elements. */
function lendMissingMembers(params: { document: ParsedDocument }): void {
	const { document } = params
	const documentPrototype = Object.getPrototypeOf(document) as object
	if (!('querySelector' in documentPrototype))
		Object.defineProperty(documentPrototype, 'querySelector', {
			value: function querySelector(selector: string): null {
				if (selector !== 'parsererror')
					throw new Error(
						`the test DOMParser answers only querySelector('parsererror'), not ${selector}`,
					)
				return null
			},
		})
	const elementPrototype = Object.getPrototypeOf(document.documentElement) as object
	if (!('children' in elementPrototype))
		Object.defineProperty(elementPrototype, 'children', {
			get: function children(this: { childNodes: ArrayLike<ParsedNode> }): ParsedNode[] {
				return Array.from(this.childNodes).filter((node) => node.nodeType === ELEMENT_NODE)
			},
		})
}

/** Core's `assertValidXml` bound to its test dialecte, every required attribute required. */
export async function loadTestDialecteValidator(): Promise<(xml: string) => void> {
	const { testEntry } = coreEntries()
	await installNodeDomParser()
	const testModule = (await import(pathToFileURL(testEntry).href)) as CoreTestModule
	const { definition, types, namespaces } = testModule.TEST_DIALECTE_CONFIG
	const { assertValidXml } = testModule.createXmlSchemaAssertions({
		definition,
		types,
		namespaces,
		schemaName: 'core test dialecte',
	})
	return function assertValidTestXml(xml: string): void {
		assertValidXml({ xml, label: 'fixture', requireComplete: true })
	}
}
