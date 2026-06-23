import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

import { resolveTargets, tsconfigOf } from '../lib/config.ts'
import { formatFiles, formatOptsFromArgv } from '../lib/format.ts'

/**
 * `dialecte audit` — render the public type surface (NoTruncation, editor-hover fidelity) and
 * classify each render by the C1–C6 readability taxonomy, PER discovered version. Covers EVERY
 * method of Query/Transaction/Document/Project (discovered dynamically, incl. extension groups) +
 * every namespace type alias. Writes benchmarks/types/<version>/readability-audit.md.
 */
import ts from 'typescript'

type Row = { name: string; len: number; members: number | string; flags: string[] }

/** Bucket a rendered type string into the C1–C6 readability root causes (pure; the audit's verdict). */
export function classify(s: string): string[] {
	const f: string[] = []
	if (s.includes('import(')) f.push('C1 module-noise')
	const tn = (s.match(/tagName/g) || []).length
	if (tn > 8) f.push(`C2/C4 element-union×${tn}`)
	if ((s.match(/\|\s*\{/g) || []).length > 6) f.push('C3 wide-input-union')
	if (s.includes('status:') && s.includes('attributes:')) f.push('C5 record-seam')
	if (s.includes('TreeRecord<') || s.includes('TreeSelect<')) f.push('C6 recursive')
	return f
}

function auditTarget(NS: string, ENTRY: string, tsconfig: string, outMd: string): void {
	const ROOT = process.cwd()
	const ENTRY_FILE = join(ROOT, 'benchmarks/types/.audit-entry.ts')
	const parsed = ts.parseJsonConfigFileContent(
		ts.readConfigFile(join(ROOT, tsconfig), ts.sys.readFile).config,
		ts.sys,
		ROOT,
	)
	const compilerOptions: ts.CompilerOptions = { ...parsed.options, noEmit: true, rootDir: ROOT }
	const FLAGS =
		ts.TypeFormatFlags.NoTruncation |
		ts.TypeFormatFlags.WriteArrowStyleSignature |
		ts.TypeFormatFlags.MultilineObjectLiterals
	const PRIMITIVEISH =
		ts.TypeFlags.StringLike |
		ts.TypeFlags.NumberLike |
		ts.TypeFlags.BooleanLike |
		ts.TypeFlags.ESSymbolLike |
		ts.TypeFlags.VoidLike |
		ts.TypeFlags.Null |
		ts.TypeFlags.BigIntLike
	const declOf = (p: ts.Symbol) => p.valueDeclaration ?? p.declarations?.[0]

	// Pass 1: discover method paths + namespace members.
	writeFileSync(
		ENTRY_FILE,
		[
			`import type { ${NS} } from '${ENTRY}'`,
			`declare const q: ${NS}.Query`,
			`declare const tx: ${NS}.Transaction`,
			`declare const doc: ${NS}.Document`,
			`declare const project: ${NS}.Project`,
			`export { q, tx, doc, project }`,
			'',
		].join('\n'),
	)
	const d1 = ts.createProgram([ENTRY_FILE], compilerOptions)
	const c1 = d1.getTypeChecker()
	const sf1 = d1.getSourceFile(ENTRY_FILE)!
	const isPublic1 = (p: ts.Symbol) => {
		const d = declOf(p)
		return (
			!d ||
			!(ts.getCombinedModifierFlags(d) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))
		)
	}
	const inRepo1 = (p: ts.Symbol) =>
		!(declOf(p)?.getSourceFile()?.fileName ?? '').includes('/node_modules/typescript/')
	const callable1 = (p: ts.Symbol) =>
		c1.getTypeOfSymbolAtLocation(p, declOf(p) ?? sf1).getCallSignatures().length > 0
	const walk = (type: ts.Type, path: string, depth: number, acc: string[]) => {
		for (const prop of type.getProperties()) {
			if (!isPublic1(prop)) continue
			const pt = c1.getTypeOfSymbolAtLocation(prop, declOf(prop) ?? sf1)
			if (pt.getCallSignatures().length > 0) acc.push(`${path}.${prop.getName()}`)
			else if (
				depth < 1 &&
				!(pt.flags & PRIMITIVEISH) &&
				pt.getProperties().some((p) => isPublic1(p) && inRepo1(p) && callable1(p))
			)
				walk(pt, `${path}.${prop.getName()}`, depth + 1, acc)
		}
	}
	const ex1 = Object.fromEntries(
		c1.getExportsOfModule(c1.getSymbolAtLocation(sf1)!).map((s) => [s.getName(), s]),
	)
	const methodPaths: string[] = []
	for (const v of ['q', 'tx', 'doc', 'project'])
		if (ex1[v]) walk(c1.getTypeOfSymbolAtLocation(ex1[v], sf1), v, 0, methodPaths)
	const imp = sf1.statements.find(ts.isImportDeclaration)?.importClause?.namedBindings as
		| ts.NamedImports
		| undefined
	let nsSym = imp ? c1.getSymbolAtLocation(imp.elements[0].name) : undefined
	if (nsSym && nsSym.flags & ts.SymbolFlags.Alias) nsSym = c1.getAliasedSymbol(nsSym)
	const nsMembers: { name: string; arity: number }[] = []
	nsSym?.exports?.forEach((m, name) => {
		const decl = m.declarations?.[0]
		const tp = decl && ts.isTypeAliasDeclaration(decl) ? (decl.typeParameters ?? []) : []
		nsMembers.push({ name: String(name), arity: tp.filter((t) => !t.default).length })
	})
	nsMembers.sort((a, b) => a.name.localeCompare(b.name))

	// Pass 2: probe entry — resolved param+return per method + every type alias.
	const lines = [
		`import type { ${NS} } from '${ENTRY}'`,
		`declare const q: ${NS}.Query`,
		`declare const tx: ${NS}.Transaction`,
		`declare const doc: ${NS}.Document`,
		`declare const project: ${NS}.Project`,
		`export { q, tx, doc, project }`,
	]
	methodPaths.forEach((p, i) => {
		lines.push(
			`export type MP_${i} = Parameters<typeof ${p}>[0]`,
			`export type MR_${i} = Awaited<ReturnType<typeof ${p}>>`,
		)
	})
	for (const m of nsMembers) {
		lines.push(
			`export type NS_${m.name} = ${NS}.${m.name}${m.arity ? `<${Array(m.arity).fill(`'LNode'`).join(', ')}>` : ''}`,
		)
		if (m.arity >= 1)
			lines.push(
				`export type NSW_${m.name} = ${NS}.${m.name}<${[`${NS}.ElementsOf`, ...Array(m.arity - 1).fill(`'LNode'`)].join(', ')}>`,
			)
	}
	writeFileSync(ENTRY_FILE, `${lines.join('\n')}\n`)
	const program = ts.createProgram([ENTRY_FILE], compilerOptions)
	const checker = program.getTypeChecker()
	const sf = program.getSourceFile(ENTRY_FILE)!
	const render = (type: ts.Type, node: ts.Node) => {
		try {
			return checker.typeToString(type, node, FLAGS)
		} catch {
			return '<render-error>'
		}
	}
	const tagCount = (s: string) => (s.match(/readonly tagName|tagName:/g) || []).length
	const sym2 = Object.fromEntries(
		checker.getExportsOfModule(checker.getSymbolAtLocation(sf)!).map((s) => [s.getName(), s]),
	)
	const renderExport = (name: string) => {
		const s = sym2[name]
		return s ? render(checker.getDeclaredTypeOfSymbol(s), s.declarations?.[0] ?? sf) : ''
	}

	const methodRows: Row[] = []
	const typeRows: Row[] = []
	for (const [label, v] of [
		[`${NS}.Query`, 'q'],
		[`${NS}.Transaction`, 'tx'],
		[`${NS}.Document`, 'doc'],
		[`${NS}.Project`, 'project'],
	] as const) {
		if (!sym2[v]) continue
		const str = render(checker.getTypeOfSymbolAtLocation(sym2[v], sf), sf)
		methodRows.push({
			name: `${label} (container)`,
			len: str.length,
			members: '-',
			flags: classify(str),
		})
	}
	methodPaths.forEach((p, i) => {
		const param = renderExport(`MP_${i}`)
		const ret = renderExport(`MR_${i}`)
		methodRows.push({
			name: `${p}(…) param`,
			len: param.length,
			members: tagCount(param),
			flags: classify(param),
		})
		methodRows.push({
			name: `${p}(…) → return`,
			len: ret.length,
			members: tagCount(ret),
			flags: classify(ret),
		})
	})
	for (const m of nsMembers) {
		const concrete = renderExport(`NS_${m.name}`)
		typeRows.push({
			name: `${NS}.${m.name}`,
			len: concrete.length,
			members: tagCount(concrete),
			flags: classify(concrete),
		})
		if (m.arity >= 1) {
			const wide = renderExport(`NSW_${m.name}`)
			typeRows.push({
				name: `${NS}.${m.name}<ElementsOf>`,
				len: wide.length,
				members: tagCount(wide),
				flags: classify(wide),
			})
		}
	}
	methodRows.sort((a, b) => b.len - a.len)
	typeRows.sort((a, b) => b.len - a.len)

	const md = [
		`# ${NS} public-type readability audit`,
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
	const table = (rows: Row[], head: string) => {
		md.push(
			`## ${head}`,
			'',
			'| Member | len | members | causes |',
			'|--------|-----|---------|--------|',
		)
		for (const r of rows)
			md.push(
				`| ${r.name} | ${r.len.toLocaleString('en-US')} | ${r.members} | ${r.flags.join(', ') || '—'} |`,
			)
		md.push('')
	}
	table(methodRows, `Methods — resolved param/return (${methodPaths.length} methods discovered)`)
	table(typeRows, 'Namespace type aliases (concrete `LNode` + wide `ElementsOf`)')
	const all = [...methodRows, ...typeRows]
	md.push(
		`**Summary:** ${methodPaths.length} methods, ${nsMembers.length} namespace types, ${all.filter((r) => r.flags.length).length}/${all.length} rows flagged. Total ${all.reduce((a, r) => a + r.len, 0).toLocaleString('en-US')} chars.`,
	)

	mkdirSync(dirname(join(ROOT, outMd)), { recursive: true })
	writeFileSync(join(ROOT, outMd), `${md.join('\n')}\n`)
	rmSync(ENTRY_FILE, { force: true })
	console.log(
		`  [${NS}] ${methodPaths.length} methods, ${nsMembers.length} types, ${all.filter((r) => r.flags.length).length} flagged → ${outMd}`,
	)
}

export async function run(argv: string[]): Promise<void> {
	const tsconfig = tsconfigOf(argv)
	const targets = resolveTargets(argv).filter((t) => t.binding.kind === 'namespace')
	if (!targets.length)
		throw new Error(
			'audit: no namespace-binding versions discovered (the audit needs a hydrated namespace).',
		)
	const fmt = formatOptsFromArgv(argv)
	for (const t of targets) {
		if (t.binding.kind !== 'namespace') continue
		const outMd = `${dirname(t.outDir)}/readability-audit.md`
		auditTarget(t.binding.name, t.binding.import, tsconfig, outMd)
		formatFiles(process.cwd(), [join(process.cwd(), outMd)], fmt)
	}
}
