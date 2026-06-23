/**
 * `dialecte narrowing` — the IntelliSense / type-narrowing GATE.
 *
 * Generates an exhaustive, schema-derived `narrowing.generated.test-d.ts` (see `genNarrowing`) per
 * version, then type-checks ONLY that file with the project's tsc. A false assertion is a TS error
 * IN that file, so a non-zero exit (with `skipLibCheck` on, which strips pre-existing node_modules
 * .d.ts noise) means a narrowing/IntelliSense guarantee regressed. Self-contained: no prior `coverage`
 * run needed. Supports namespace + core bindings.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { resolveBin } from '../lib/bin.ts'
import { resolveTargets, tsconfigOf } from '../lib/config.ts'
import { genNarrowing, loadSchema } from './coverage.ts'

export async function run(argv: string[]): Promise<void> {
	const ROOT = process.cwd()
	const tsc = resolveBin('tsc', 'typescript', ROOT)
	if (!tsc) throw new Error('narrowing: no TypeScript compiler found (project nor @dialecte/cli).')
	const tsconfig = tsconfigOf(argv)
	const targets = resolveTargets(argv)
	if (!targets.length)
		throw new Error(
			'narrowing: no versions discovered. Pass --constants-dir, or add a "dialecte" config.',
		)

	let failed = false
	for (const t of targets) {
		const schema = await loadSchema(resolve(ROOT, t.constantsDir))
		mkdirSync(resolve(ROOT, t.outDir), { recursive: true })
		const relFile = `${t.outDir}/narrowing.generated.test-d.ts`
		writeFileSync(join(ROOT, relFile), genNarrowing(schema, t.binding))

		// Also type-check the full method-surface probe (core verbs + extension/domain groups) when
		// `coverage` has generated it — so a structurally-broken extension surface fails the gate too.
		const apiFile = `${t.outDir}/coverage.api.generated.ts`
		const include = existsSync(join(ROOT, apiFile)) ? [relFile, apiFile] : [relFile]

		// Isolated config: extend the project's tsconfig but force noEmit + skipLibCheck (so only a
		// failed assertion in our file — not pre-existing lib .d.ts errors — can fail the check).
		const tmp = `.narrow-${t.version}.tsconfig.json`
		writeFileSync(
			join(ROOT, tmp),
			JSON.stringify({
				extends: `./${tsconfig}`,
				compilerOptions: {
					noEmit: true,
					skipLibCheck: true,
					rootDir: '.',
					declaration: false,
					declarationMap: false,
					emitDeclarationOnly: false,
				},
				include,
			}),
		)
		const res = spawnSync(tsc.path, ['-p', tmp, '--noEmit'], {
			cwd: ROOT,
			encoding: 'utf8',
			maxBuffer: 1e8,
		})
		rmSync(join(ROOT, tmp), { force: true })

		if (res.status === 0) {
			console.log(`✅ [${t.version}] narrowing holds — ${schema.elements.length} elements asserted`)
		} else {
			failed = true
			console.error(
				`❌ [${t.version}] narrowing assertion(s) failed:\n${res.stdout || ''}${res.stderr || ''}`,
			)
		}
	}
	if (failed) process.exit(1)
}
