/**
 * Compiler-API discovery of a dialect's public method surface — every method of
 * Query/Transaction/Document/Project, INCLUDING one level into the extension/domain groups
 * (history, reference, dataModel, template, cleanUp, presentation, …). Returns dotted paths like
 * `q.history.getSortedHitems`. Binding-agnostic: the caller passes a self-contained entry source
 * (`declare const q/tx/doc/project` + imports), so this stays decoupled from `refsOf`.
 *
 * Same walk the `audit` command uses; factored here so the `coverage` api-probe can reuse it to emit a
 * file that instantiates Parameters/ReturnType of every method (a pure mapped-type fan-out does NOT
 * force instantiation — measured +131 only — hence this explicit per-method approach).
 */
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'

export function discoverMethodPaths(entrySource: string, tsconfig: string, root: string): string[] {
	const ENTRY = join(root, 'benchmarks/types/.discover-entry.ts')
	writeFileSync(ENTRY, entrySource)
	try {
		const parsed = ts.parseJsonConfigFileContent(
			ts.readConfigFile(join(root, tsconfig), ts.sys.readFile).config,
			ts.sys,
			root,
		)
		const program = ts.createProgram([ENTRY], { ...parsed.options, noEmit: true, rootDir: root })
		const checker = program.getTypeChecker()
		const sf = program.getSourceFile(ENTRY)
		if (!sf) return []

		const PRIMITIVEISH =
			ts.TypeFlags.StringLike |
			ts.TypeFlags.NumberLike |
			ts.TypeFlags.BooleanLike |
			ts.TypeFlags.ESSymbolLike |
			ts.TypeFlags.VoidLike |
			ts.TypeFlags.Null |
			ts.TypeFlags.BigIntLike
		const declOf = (p: ts.Symbol) => p.valueDeclaration ?? p.declarations?.[0]
		const isPublic = (p: ts.Symbol) => {
			const d = declOf(p)
			return (
				!d ||
				!(ts.getCombinedModifierFlags(d) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))
			)
		}
		const inRepo = (p: ts.Symbol) =>
			!(declOf(p)?.getSourceFile()?.fileName ?? '').includes('/node_modules/typescript/')
		const callable = (p: ts.Symbol) =>
			checker.getTypeOfSymbolAtLocation(p, declOf(p) ?? sf).getCallSignatures().length > 0

		const paths: string[] = []
		const walk = (type: ts.Type, path: string, depth: number) => {
			for (const prop of type.getProperties()) {
				if (!isPublic(prop)) continue
				const pt = checker.getTypeOfSymbolAtLocation(prop, declOf(prop) ?? sf)
				if (pt.getCallSignatures().length > 0) paths.push(`${path}.${prop.getName()}`)
				else if (
					depth < 1 &&
					!(pt.flags & PRIMITIVEISH) &&
					pt.getProperties().some((p) => isPublic(p) && inRepo(p) && callable(p))
				)
					walk(pt, `${path}.${prop.getName()}`, depth + 1)
			}
		}
		const ex = Object.fromEntries(
			checker.getExportsOfModule(checker.getSymbolAtLocation(sf)!).map((s) => [s.getName(), s]),
		)
		for (const v of ['q', 'tx', 'doc', 'project'])
			if (ex[v]) walk(checker.getTypeOfSymbolAtLocation(ex[v], sf), v, 0)
		return paths
	} finally {
		rmSync(ENTRY, { force: true })
	}
}
