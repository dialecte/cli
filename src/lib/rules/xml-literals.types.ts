import type ts from 'typescript'

/** A case document: the value of a `sourceXml` / `targetXml` property, and what it is bound to. */
export type CaseDocument = {
	node: ts.Expression
	/** The XML literal the document is, directly or through a const of the file. */
	literal: ts.Expression | undefined
	/** The const of the file the document names, when it goes through an identifier. */
	constant: ts.VariableDeclaration | undefined
	/** The `.xml?raw` import the document names. */
	rawImport: ts.ImportDeclaration | undefined
	/** The table case or object that holds the document. */
	caseNode: ts.Node | undefined
}

/** Where a scan of an XML literal stands: in content, in a tag, in a quoted value of a tag, in a comment or CDATA. */
export type TemplateScanState =
	| { kind: 'content' }
	| { kind: 'tag' }
	| { kind: 'quote'; quote: string }
	| { kind: 'section'; close: string }
