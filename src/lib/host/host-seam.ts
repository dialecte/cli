/** The host seam scan: each vendor's tool literal stays in its own folder, and imports stay across the seam. */
import { posix } from 'node:path'

import { listSourceFiles } from '../api/source-functions.ts'
import { createImportReading } from '../rules/import-reading.ts'
import { positionOf } from '../rules/syntax-nodes.ts'
import { CONFIG_FOLDER, HOST_CONSTANTS_FILE, HOST_FOLDER } from './host-seam.constants.ts'

import ts from 'typescript'

import type { HostSeamFinding, HostSeamVendor, PlacedHostSeamFinding } from './host-seam.types.ts'

/**
 * The breaches of the host seam in `root/src` (tests excluded), read from the tokens so no comment counts: a vendor's
 * tool literal outside `src/lib/host/<name>/`, a file outside `src/lib/host/` importing a vendor's
 * folder, and a file of `src/lib/config/` importing anything of `src/lib/host/` but `host.constants.ts`.
 */
export function scanHostSeam(params: {
	root: string
	vendors: readonly HostSeamVendor[]
}): HostSeamFinding[] {
	const reading = createImportReading({ root: params.root })
	return listSourceFiles(params.root).flatMap(function findingsOfFile(file) {
		const sourceFile = reading.sourceOf(file)
		if (sourceFile === undefined) return []
		return fileFindingsOf({ file, sourceFile, vendors: params.vendors })
	})
}

/** The findings of one file, by position. */
function fileFindingsOf(params: {
	file: string
	sourceFile: ts.SourceFile
	vendors: readonly HostSeamVendor[]
}): HostSeamFinding[] {
	const { file, sourceFile, vendors } = params
	const found: PlacedHostSeamFinding[] = []
	const specifiers = new Set<ts.Node>()
	visit(sourceFile)
	return found
		.sort(function byPosition(left, right) {
			return left.line - right.line || left.column - right.column
		})
		.map(function withoutColumn({ column: _column, ...finding }) {
			return finding
		})

	function visit(node: ts.Node): void {
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
		ts.forEachChild(node, visit)
	}

	function findingOf(finding: {
		node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
		kind: HostSeamFinding['kind']
	}): PlacedHostSeamFinding {
		const { line, column } = positionOf({ node: finding.node, sourceFile })
		return { file, line, kind: finding.kind, text: finding.node.text, column }
	}
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
 * folder but its constants (first), or a file outside the host folder reaching a vendor's; undefined when neither.
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
		!isInside({ file, folder: HOST_FOLDER }) &&
		vendors.some(function isVendorTarget(vendor) {
			return isInside({ file: target, folder: vendorFolderOf(vendor) })
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
