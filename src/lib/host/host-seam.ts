/**
 * The host seam scan: each vendor's tool literal stays in its own folder, imports stay across the seam, and a vendor's
 * change-request noun stays in the vendor's folders.
 */
import { existsSync } from 'node:fs'
import { join, posix } from 'node:path'

import { SOURCE_FOLDER } from '../api/source-functions.constants.ts'
import { listSourceFiles } from '../api/source-functions.ts'
import { createImportReading } from '../rules/import-reading.ts'
import { positionOf } from '../rules/syntax-nodes.ts'
import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { listPackageFiles } from '../tdd/package-files.ts'
import {
	CONFIG_FOLDER,
	CONTRACT_FIXTURES_FOLDER,
	HOST_CONSTANTS_FILE,
	HOST_FOLDER,
	IDENTIFIER_WORD_BOUNDARY,
	NOUN_FILE_PATTERN,
	NOUN_FOLDERS,
	VENDOR_IMPORTERS,
} from './host-seam.constants.ts'

import ts from 'typescript'

import type { HostSeamFinding, HostSeamVendor, PlacedHostSeamFinding } from './host-seam.types.ts'

/**
 * The breaches of the host seam in `root`, read from the syntax tree so no comment or text counts: in `src/` (tests
 * excluded), a vendor's tool literal outside `src/lib/host/<name>/`, a file importing a vendor's folder (but the
 * vendor's own files and `VENDOR_IMPORTERS`), and a file of `src/lib/config/` importing anything of `src/lib/host/` but
 * `host.constants.ts`, and a string literal or template part printing a vendor's change-request noun outside its folder;
 * in `src/` and `test/` (tests included), a vendor's change-request noun in an identifier or a file name outside the
 * vendor's folders (`src/lib/host/<name>/`, `test/fixtures/host-contract/<name>/`).
 */
export function scanHostSeam(params: {
	root: string
	vendors: readonly HostSeamVendor[]
}): HostSeamFinding[] {
	const { root, vendors } = params
	const reading = createImportReading({ root })
	const sources = new Set(existsSync(join(root, SOURCE_FOLDER)) ? listSourceFiles(root) : [])
	const files = [...new Set([...sources, ...nounFilesOf(root)])].sort(TEXT_COLLATOR.compare)
	return files.flatMap(function findingsOfFile(file) {
		const sourceFile = reading.sourceOf(file)
		if (sourceFile === undefined) return []
		return fileFindingsOf({
			file,
			sourceFile,
			vendors,
			seam: sources.has(file),
			noun: !isVendorOwned({ file, vendors }),
		})
	})
}

/** The TypeScript files of `src/` and `test/`, tests included, as `/` paths from the root. */
function nounFilesOf(root: string): string[] {
	return listPackageFiles(root).filter(function isNounFile(file) {
		return (
			NOUN_FOLDERS.some(function holds(folder) {
				return isInside({ file, folder })
			}) &&
			NOUN_FILE_PATTERN.test(file) &&
			existsSync(join(root, file))
		)
	})
}

/** Whether the file lies in one of a vendor's own folders: its host folder or its contract fixtures. */
function isVendorOwned(params: { file: string; vendors: readonly HostSeamVendor[] }): boolean {
	const { file } = params
	return params.vendors.some(function owns(vendor) {
		return (
			isInside({ file, folder: vendorFolderOf(vendor) }) ||
			isInside({ file, folder: `${CONTRACT_FIXTURES_FOLDER}/${vendor.name}` })
		)
	})
}

/**
 * The findings of one file, by position: the seam's (tool literals and imports) when `seam`, the noun's (identifiers
 * and the file's name) when `noun`.
 */
function fileFindingsOf(params: {
	file: string
	sourceFile: ts.SourceFile
	vendors: readonly HostSeamVendor[]
	seam: boolean
	noun: boolean
}): HostSeamFinding[] {
	const { file, sourceFile, vendors, seam, noun } = params
	const found: PlacedHostSeamFinding[] = []
	const specifiers = new Set<ts.Node>()
	if (
		noun &&
		vendors.some(function namesNoun(vendor) {
			return vendor.nounPathPattern.test(file)
		})
	)
		found.push({ file, line: 1, kind: 'noun-path', text: file, column: 0 })
	visit(sourceFile)
	return found
		.sort(function byPosition(left, right) {
			return left.line - right.line || left.column - right.column
		})
		.map(function withoutColumn({ column: _column, ...finding }) {
			return finding
		})

	function visit(node: ts.Node): void {
		if (
			noun &&
			(ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) &&
			spellsVendorNoun({ text: node.text, vendors })
		)
			found.push(findingOf({ node, kind: 'noun-identifier' }))
		if (seam && noun && isTextNode(node) && printsVendorNoun({ text: node.text, vendors }))
			found.push(findingOf({ node, kind: 'noun-text' }))
		if (seam) visitSeam(node)
		ts.forEachChild(node, visit)
	}

	function visitSeam(node: ts.Node): void {
		const specifier = moduleSpecifierOf(node)
		if (specifier !== undefined) {
			specifiers.add(specifier)
			const kind = importKindOf({ file, specifier: specifier.text, vendors })
			if (kind !== undefined) found.push(findingOf({ node: specifier, kind }))
		} else if (
			(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
			!specifiers.has(node) &&
			vendors.some(function isForeignTool(vendor) {
				return vendor.tool === node.text && !isInside({ file, folder: vendorFolderOf(vendor) })
			})
		)
			found.push(findingOf({ node, kind: 'tool-literal' }))
	}

	function findingOf(finding: {
		node: ts.StringLiteral | ts.TemplateLiteralLikeNode | ts.Identifier | ts.PrivateIdentifier
		kind: HostSeamFinding['kind']
	}): PlacedHostSeamFinding {
		const { line, column } = positionOf({ node: finding.node, sourceFile })
		return { file, line, kind: finding.kind, text: finding.node.text, column }
	}
}

/** Whether the node is printed text: a string literal, a no-substitution template or one part of a template. */
function isTextNode(node: ts.Node): node is ts.StringLiteral | ts.TemplateLiteralLikeNode {
	return (
		ts.isStringLiteral(node) ||
		ts.isNoSubstitutionTemplateLiteral(node) ||
		ts.isTemplateHead(node) ||
		ts.isTemplateMiddle(node) ||
		ts.isTemplateTail(node)
	)
}

// dialecte-allow duplicate-read: it matches printed nouns as whole phrases in text; spellsVendorNoun matches identifier words
/**
 * Whether a text prints a vendor's change-request noun (GitHub's `pull request`, `pull requests`) as whole words, in any case;
 * `pull_request` and a noun split across template parts do not.
 */
function printsVendorNoun(params: { text: string; vendors: readonly HostSeamVendor[] }): boolean {
	return params.vendors.some(function printsItsNoun(vendor) {
		return [vendor.nouns.changeRequestNoun, vendor.nouns.changeRequestNouns].some(
			function holdsNoun(noun) {
				return new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
					params.text,
				)
			},
		)
	})
}

/**
 * Whether an identifier's text spells a vendor's change-request noun: one of its words, or two adjacent words joined
 * (`merge` + `request`), is one of a vendor's noun words.
 */
function spellsVendorNoun(params: { text: string; vendors: readonly HostSeamVendor[] }): boolean {
	const words = params.text
		.split(IDENTIFIER_WORD_BOUNDARY)
		.filter(Boolean)
		.map((word) => word.toLowerCase())
	const pairs = words.slice(1).map(function joinedWithPrevious(word, index) {
		return `${words[index]}${word}`
	})
	return [...words, ...pairs].some(function isNounWord(word) {
		return params.vendors.some((vendor) => vendor.nounWords.includes(word))
	})
}

/**
 * The module specifier a node names: an import, an export from, an import-equals require, a dynamic `import()` or a
 * `typeof import()` type; undefined for any other node.
 */
function moduleSpecifierOf(node: ts.Node): ts.StringLiteral | undefined {
	if (
		(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
		node.moduleSpecifier !== undefined &&
		ts.isStringLiteral(node.moduleSpecifier)
	)
		return node.moduleSpecifier
	if (ts.isExternalModuleReference(node) && ts.isStringLiteral(node.expression))
		return node.expression
	if (
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword &&
		node.arguments[0] !== undefined &&
		ts.isStringLiteral(node.arguments[0])
	)
		return node.arguments[0]
	if (
		ts.isImportTypeNode(node) &&
		ts.isLiteralTypeNode(node.argument) &&
		ts.isStringLiteral(node.argument.literal)
	)
		return node.argument.literal
	return undefined
}

/**
 * What an import breaks, the specifier resolved against the importer's folder: a config file reaching the host
 * folder but its constants (first), or a file reaching a vendor's folder that is neither in that folder nor one of
 * `VENDOR_IMPORTERS`; undefined when neither.
 */
function importKindOf(params: {
	file: string
	specifier: string
	vendors: readonly HostSeamVendor[]
}): HostSeamFinding['kind'] | undefined {
	const { file, specifier, vendors } = params
	if (!specifier.startsWith('.')) return undefined
	const target = posix.join(posix.dirname(file), specifier)
	if (
		isInside({ file, folder: CONFIG_FOLDER }) &&
		isInside({ file: target, folder: HOST_FOLDER }) &&
		target !== HOST_CONSTANTS_FILE
	)
		return 'config-import'
	if (
		!VENDOR_IMPORTERS.includes(file) &&
		vendors.some(function isForeignVendorTarget(vendor) {
			const folder = vendorFolderOf(vendor)
			return isInside({ file: target, folder }) && !isInside({ file, folder })
		})
	)
		return 'vendor-import'
	return undefined
}

/** The vendor's own folder, from the scanned root. */
function vendorFolderOf(vendor: HostSeamVendor): string {
	return `${HOST_FOLDER}/${vendor.name}`
}

/** Whether a `/` path from the root lies under the folder. */
function isInside(params: { file: string; folder: string }): boolean {
	return params.file.startsWith(`${params.folder}/`)
}
