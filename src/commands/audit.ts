import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

import { resolveTargets, tsconfigOf } from '../lib/config.ts'
import { formatFiles, formatOptsFromArgv } from '../lib/format.ts'
import { printLines } from '../lib/print/print.ts'

/**
 * `dialecte audit` — render the public type surface (NoTruncation, editor-hover fidelity) and
 * classify each render by the C1–C6 readability taxonomy, PER discovered version. Covers EVERY
 * method of Query/Transaction/Document/Project (discovered dynamically, incl. extension groups) +
 * every namespace type alias. Writes benchmarks/types/<version>/readability-audit.md.
 */
import ts from 'typescript'

import type { Row } from './audit.types.ts'

/** Bucket a rendered type string into the C1–C6 readability root causes (pure; the audit's verdict). */
export function classify(rendered: string): string[] {
	const causes: string[] = []
	if (rendered.includes('import(')) causes.push('C1 module-noise')
	const tagNameCount = (rendered.match(/tagName/g) || []).length
	if (tagNameCount > 8) causes.push(`C2/C4 element-union×${tagNameCount}`)
	if ((rendered.match(/\|\s*\{/g) || []).length > 6) causes.push('C3 wide-input-union')
	if (rendered.includes('status:') && rendered.includes('attributes:'))
		causes.push('C5 record-seam')
	if (rendered.includes('TreeRecord<') || rendered.includes('TreeSelect<'))
		causes.push('C6 recursive')
	return causes
}

function auditTarget(params: {
	namespace: string
	entry: string
	tsconfig: string
	outputPath: string
}): void {
	const { namespace, entry, tsconfig, outputPath } = params
	const root = process.cwd()
	const entryFile = join(root, 'benchmarks/types/.audit-entry.ts')
	const parsed = ts.parseJsonConfigFileContent(
		ts.readConfigFile(join(root, tsconfig), ts.sys.readFile).config,
		ts.sys,
		root,
	)
	const compilerOptions: ts.CompilerOptions = { ...parsed.options, noEmit: true, rootDir: root }
	const formatFlags =
		ts.TypeFormatFlags.NoTruncation |
		ts.TypeFormatFlags.WriteArrowStyleSignature |
		ts.TypeFormatFlags.MultilineObjectLiterals
	const primitiveFlags =
		ts.TypeFlags.StringLike |
		ts.TypeFlags.NumberLike |
		ts.TypeFlags.BooleanLike |
		ts.TypeFlags.ESSymbolLike |
		ts.TypeFlags.VoidLike |
		ts.TypeFlags.Null |
		ts.TypeFlags.BigIntLike
	function declOf(symbol: ts.Symbol) {
		return symbol.valueDeclaration ?? symbol.declarations?.[0]
	}

	// Pass 1: discover method paths + namespace members.
	writeFileSync(
		entryFile,
		[
			`import type { ${namespace} } from '${entry}'`,
			`declare const q: ${namespace}.Query`,
			`declare const tx: ${namespace}.Transaction`,
			`declare const doc: ${namespace}.Document`,
			`declare const project: ${namespace}.Project`,
			`export { q, tx, doc, project }`,
			'',
		].join('\n'),
	)
	const firstProgram = ts.createProgram([entryFile], compilerOptions)
	const firstChecker = firstProgram.getTypeChecker()
	const firstSourceFile = firstProgram.getSourceFile(entryFile)!
	function isPublic(symbol: ts.Symbol) {
		const declaration = declOf(symbol)
		return (
			!declaration ||
			!(
				ts.getCombinedModifierFlags(declaration) &
				(ts.ModifierFlags.Private | ts.ModifierFlags.Protected)
			)
		)
	}
	function isInRepo(symbol: ts.Symbol) {
		return !(declOf(symbol)?.getSourceFile()?.fileName ?? '').includes('/node_modules/typescript/')
	}
	function isCallable(symbol: ts.Symbol) {
		return (
			firstChecker
				.getTypeOfSymbolAtLocation(symbol, declOf(symbol) ?? firstSourceFile)
				.getCallSignatures().length > 0
		)
	}
	function walk(params: { type: ts.Type; path: string; depth: number; acc: string[] }) {
		const { type, path, depth, acc } = params
		for (const prop of type.getProperties()) {
			if (!isPublic(prop)) continue
			const propertyType = firstChecker.getTypeOfSymbolAtLocation(
				prop,
				declOf(prop) ?? firstSourceFile,
			)
			if (propertyType.getCallSignatures().length > 0) acc.push(`${path}.${prop.getName()}`)
			else if (
				depth < 1 &&
				!(propertyType.flags & primitiveFlags) &&
				propertyType
					.getProperties()
					.some((member) => isPublic(member) && isInRepo(member) && isCallable(member))
			)
				walk({ type: propertyType, path: `${path}.${prop.getName()}`, depth: depth + 1, acc })
		}
	}
	const firstExports = Object.fromEntries(
		firstChecker
			.getExportsOfModule(firstChecker.getSymbolAtLocation(firstSourceFile)!)
			.map((exported) => [exported.getName(), exported]),
	)
	const methodPaths: string[] = []
	for (const variable of ['q', 'tx', 'doc', 'project'])
		if (firstExports[variable])
			walk({
				type: firstChecker.getTypeOfSymbolAtLocation(firstExports[variable], firstSourceFile),
				path: variable,
				depth: 0,
				acc: methodPaths,
			})
	const namedImports = firstSourceFile.statements.find(ts.isImportDeclaration)?.importClause
		?.namedBindings as ts.NamedImports | undefined
	let namespaceSymbol = namedImports
		? firstChecker.getSymbolAtLocation(namedImports.elements[0].name)
		: undefined
	if (namespaceSymbol && namespaceSymbol.flags & ts.SymbolFlags.Alias)
		namespaceSymbol = firstChecker.getAliasedSymbol(namespaceSymbol)
	const namespaceMembers: { name: string; arity: number }[] = []
	namespaceSymbol?.exports?.forEach((member, name) => {
		const declaration = member.declarations?.[0]
		const typeParameters =
			declaration && ts.isTypeAliasDeclaration(declaration)
				? (declaration.typeParameters ?? [])
				: []
		namespaceMembers.push({
			name: String(name),
			arity: typeParameters.filter((typeParameter) => !typeParameter.default).length,
		})
	})
	namespaceMembers.sort((left, right) => left.name.localeCompare(right.name))

	// Pass 2: probe entry — resolved param+return per method + every type alias.
	const lines = [
		`import type { ${namespace} } from '${entry}'`,
		`declare const q: ${namespace}.Query`,
		`declare const tx: ${namespace}.Transaction`,
		`declare const doc: ${namespace}.Document`,
		`declare const project: ${namespace}.Project`,
		`export { q, tx, doc, project }`,
	]
	methodPaths.forEach((methodPath, index) => {
		lines.push(
			`export type MP_${index} = Parameters<typeof ${methodPath}>[0]`,
			`export type MR_${index} = Awaited<ReturnType<typeof ${methodPath}>>`,
		)
	})
	for (const member of namespaceMembers) {
		lines.push(
			`export type NS_${member.name} = ${namespace}.${member.name}${member.arity ? `<${Array(member.arity).fill(`'LNode'`).join(', ')}>` : ''}`,
		)
		if (member.arity >= 1)
			lines.push(
				`export type NSW_${member.name} = ${namespace}.${member.name}<${[`${namespace}.ElementsOf`, ...Array(member.arity - 1).fill(`'LNode'`)].join(', ')}>`,
			)
	}
	writeFileSync(entryFile, `${lines.join('\n')}\n`)
	const program = ts.createProgram([entryFile], compilerOptions)
	const checker = program.getTypeChecker()
	const sourceFile = program.getSourceFile(entryFile)!
	function render(params: { type: ts.Type; node: ts.Node }) {
		const { type, node } = params
		try {
			return checker.typeToString(type, node, formatFlags)
		} catch {
			return '<render-error>'
		}
	}
	function tagCount(rendered: string) {
		return (rendered.match(/readonly tagName|tagName:/g) || []).length
	}
	const exportsByName = Object.fromEntries(
		checker
			.getExportsOfModule(checker.getSymbolAtLocation(sourceFile)!)
			.map((exported) => [exported.getName(), exported]),
	)
	function renderExport(name: string) {
		const symbol = exportsByName[name]
		return symbol
			? render({
					type: checker.getDeclaredTypeOfSymbol(symbol),
					node: symbol.declarations?.[0] ?? sourceFile,
				})
			: ''
	}

	const methodRows: Row[] = []
	const typeRows: Row[] = []
	for (const [label, variable] of [
		[`${namespace}.Query`, 'q'],
		[`${namespace}.Transaction`, 'tx'],
		[`${namespace}.Document`, 'doc'],
		[`${namespace}.Project`, 'project'],
	] as const) {
		if (!exportsByName[variable]) continue
		const renderedContainer = render({
			type: checker.getTypeOfSymbolAtLocation(exportsByName[variable], sourceFile),
			node: sourceFile,
		})
		methodRows.push({
			name: `${label} (container)`,
			len: renderedContainer.length,
			members: '-',
			flags: classify(renderedContainer),
		})
	}
	methodPaths.forEach((methodPath, index) => {
		const param = renderExport(`MP_${index}`)
		const ret = renderExport(`MR_${index}`)
		methodRows.push({
			name: `${methodPath}(…) param`,
			len: param.length,
			members: tagCount(param),
			flags: classify(param),
		})
		methodRows.push({
			name: `${methodPath}(…) → return`,
			len: ret.length,
			members: tagCount(ret),
			flags: classify(ret),
		})
	})
	for (const member of namespaceMembers) {
		const concrete = renderExport(`NS_${member.name}`)
		typeRows.push({
			name: `${namespace}.${member.name}`,
			len: concrete.length,
			members: tagCount(concrete),
			flags: classify(concrete),
		})
		if (member.arity >= 1) {
			const wide = renderExport(`NSW_${member.name}`)
			typeRows.push({
				name: `${namespace}.${member.name}<ElementsOf>`,
				len: wide.length,
				members: tagCount(wide),
				flags: classify(wide),
			})
		}
	}
	methodRows.sort((left, right) => right.len - left.len)
	typeRows.sort((left, right) => right.len - left.len)

	const markdownLines = [
		`# ${namespace} public-type readability audit`,
		'',
		`Every public method (resolved param + return — the form an editor shows when you hover a call)`,
		`and every namespace type is rendered with NoTruncation, then measured. Methods are discovered`,
		`dynamically (Query/Transaction/Document/Project incl. extension groups), so this covers core's`,
		`classes AND the dialect's extensions. Rows sorted worst-first.`,
		'',
		'**Columns** — `len`: characters in the render (proxy for hover size; bigger = noisier).',
		'`members`: element-union members surfaced. `causes`: matched root cause(s) (legend below).',
		'',
		'**Root-cause legend**',
		'- **C1 module-noise** — `import("…/extensions/…")` refs inflate the render. Fix: name containers / annotate returns.',
		'- **C2/C4 element-union** — the full element-name union appears. Largely inherent to a config-driven DSL.',
		'- **C3 wide-input-union** — a wide multi-member input union, each member expanded.',
		'- **C5 record-seam** — a record renders as `RawRecord<…> & { status }` instead of one clean object.',
		'- **C6 recursive** — self-referential `TreeRecord`/`TreeSelect`.',
		'',
	]
	function table(params: { rows: Row[]; head: string }) {
		const { rows, head } = params
		markdownLines.push(
			`## ${head}`,
			'',
			'| Member | len | members | causes |',
			'|--------|-----|---------|--------|',
		)
		for (const row of rows)
			markdownLines.push(
				`| ${row.name} | ${row.len.toLocaleString('en-US')} | ${row.members} | ${row.flags.join(', ') || '—'} |`,
			)
		markdownLines.push('')
	}
	table({
		rows: methodRows,
		head: `Methods — resolved param/return (${methodPaths.length} methods discovered)`,
	})
	table({
		rows: typeRows,
		head: 'Namespace type aliases (concrete `LNode` + wide `ElementsOf`)',
	})
	const all = [...methodRows, ...typeRows]
	markdownLines.push(
		`**Summary:** ${methodPaths.length} methods, ${namespaceMembers.length} namespace types, ${all.filter((row) => row.flags.length).length}/${all.length} rows flagged. Total ${all.reduce((total, row) => total + row.len, 0).toLocaleString('en-US')} chars.`,
	)

	mkdirSync(dirname(outputPath), { recursive: true })
	writeFileSync(outputPath, `${markdownLines.join('\n')}\n`)
	rmSync(entryFile, { force: true })
	printLines({
		stream: 'stdout',
		lines: [
			`  [${namespace}] ${methodPaths.length} methods, ${namespaceMembers.length} types, ${all.filter((row) => row.flags.length).length} flagged → ${outputPath}`,
		],
	})
}

/** Where a target's audit is written: next to its version directory; an absolute `--out` is used as is. */
export function auditOutputPath(params: { root: string; outDir: string }): string {
	return resolve(params.root, dirname(params.outDir), 'readability-audit.md')
}

export async function run(argv: string[]): Promise<void> {
	const tsconfig = tsconfigOf(argv)
	const targets = resolveTargets(argv).filter((target) => target.binding.kind === 'namespace')
	if (!targets.length)
		throw new Error(
			'audit: no namespace-binding versions discovered (the audit needs a hydrated namespace).',
		)
	const formatOptions = formatOptsFromArgv(argv)
	for (const target of targets) {
		if (target.binding.kind !== 'namespace') continue
		const outputPath = auditOutputPath({ root: process.cwd(), outDir: target.outDir })
		auditTarget({
			namespace: target.binding.name,
			entry: target.binding.import,
			tsconfig,
			outputPath,
		})
		formatFiles({ root: process.cwd(), files: [outputPath], options: formatOptions })
	}
}
