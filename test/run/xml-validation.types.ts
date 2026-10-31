/** The parts of a parsed document and of core's test entry the test XML validator reads. */
export type ParsedNode = { nodeType: number }
export type ParsedDocument = { documentElement: ParsedNode & { childNodes: ArrayLike<ParsedNode> } }
export type XmlDomParser = new (options: {
	errorHandler: Record<'warning' | 'error' | 'fatalError', (message: string) => void>
}) => { parseFromString(xml: string, mimeType: string): ParsedDocument }
export type SchemaAssertions = {
	assertValidXml(params: { xml: string; label?: string; requireComplete?: boolean }): void
}
export type CoreTestModule = {
	TEST_DIALECTE_CONFIG: { definition: unknown; types: unknown; namespaces: unknown }
	createXmlSchemaAssertions(params: {
		definition: unknown
		types: unknown
		namespaces: unknown
		schemaName: string
	}): SchemaAssertions
}
