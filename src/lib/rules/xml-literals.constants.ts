/** A text span that starts XML once its leading whitespace is skipped: `<` and a letter, or `<?xml`. */
export const XML_LITERAL_START_PATTERN = /^\s*<([A-Za-z]|\?xml)/

/** The specifier of an import that reads an XML file as its text: `./fixtures/x.xml?raw`. */
export const RAW_XML_IMPORT_PATTERN = /\.xml\?raw$/

/** The properties whose value is a case document. */
export const CASE_DOCUMENT_PROPERTIES: readonly string[] = ['sourceXml', 'targetXml']

/** A call whose object argument holds case documents: `createTestProject`, a package wrapper, a runner. */
export const PROJECT_CALL_PATTERN = /^(create\w*TestProject|run\w*TestCases)$/

/** In content position, the markup sections whose text is content, by how they open and close. */
export const CONTENT_SECTIONS: readonly { open: string; close: string }[] = [
	{ open: '<!--', close: '-->' },
	{ open: '<![CDATA[', close: ']]>' },
]

/** The query that makes an import read a file as its text. */
export const RAW_QUERY_PATTERN = /\?raw$/

/** The `./` a relative specifier starts with. */
export const CURRENT_FOLDER_PATTERN = /^\.\//
