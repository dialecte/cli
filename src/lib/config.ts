/**
 * Zero-config discovery + arg helpers for the `dialecte` CLI.
 *
 * A dialect is built by convention: `src/<version>/definition/{constants,definition}.generated.ts`,
 * and its hydrated namespace is the Capitalized package name (`@dialecte/scl` → `Scl`). So the CLI
 * discovers every version + the namespace with NO config, and emits benchmarks per version under
 * `benchmarks/types/<version>/`. Everything is overridable via flags:
 *   --namespace <Name>  --entry <import>  --constants-dir <dir>  --out <dir>  --version <v>  --tsconfig <f>
 *
 * A package.json `"dialecte"` field is optional (overrides discovery for odd layouts). Core itself is
 * detected by package name and benched via a hard-coded generic *test* dialect (see CORE_TEST_DIALECT),
 * so core's package.json needs NO config — identical in shape to every dialect's.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { CORE_PACKAGE, CORE_TEST_DIALECT } from './config.constants.ts'

import type { Pkg, Target } from './config.types.ts'

export function getArg(argv: string[], name: string): string | undefined {
	const index = argv.indexOf(`--${name}`)
	return index >= 0 ? argv[index + 1] : undefined
}
export function hasFlag(argv: string[], name: string): boolean {
	return argv.includes(`--${name}`)
}

/** The words of a command line that are neither options nor the value of an option taking one. */
export function positionalArguments(params: {
	argv: readonly string[]
	/** Options followed by their value (`--limit 3`), without the dashes. */
	valueOptions: readonly string[]
}): string[] {
	const words: string[] = []
	for (let index = 0; index < params.argv.length; index++) {
		const argument = params.argv[index]
		if (!argument.startsWith('--')) words.push(argument)
		else if (params.valueOptions.includes(argument.slice(2))) index++
	}
	return words
}

export function tsconfigOf(argv: string[], cwd: string = process.cwd()): string {
	return getArg(argv, 'tsconfig') ?? pkgConfig(cwd).tsconfig ?? 'tsconfig.build.json'
}

function readPkg(cwd: string): Pkg {
	const packageJson = join(cwd, 'package.json')
	return existsSync(packageJson) ? JSON.parse(readFileSync(packageJson, 'utf8')) : {}
}
function pkgConfig(cwd: string): Record<string, string> {
	return readPkg(cwd).dialecte ?? {}
}

function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Namespace = Capitalized package name (`@dialecte/scl` → `Scl`). */
export function discoverNamespace(cwd: string): string {
	return capitalize(
		String(readPkg(cwd).name ?? 'dialecte')
			.split('/')
			.pop() ?? 'dialecte',
	)
}

/** Versions = `src/<v>/definition/` dirs that hold the generated constants. */
export function discoverVersions(cwd: string): string[] {
	const src = join(cwd, 'src')
	if (!existsSync(src)) return []
	return readdirSync(src)
		.filter((v) => statSync(join(src, v)).isDirectory())
		.filter(
			(v) =>
				existsSync(join(src, v, 'definition', 'constants.generated.ts')) &&
				existsSync(join(src, v, 'definition', 'definition.generated.ts')),
		)
		.sort()
}

/** Resolve every target to operate on — discovered by convention, overridable via flags/config. */
export function resolveTargets(argv: string[], cwd: string = process.cwd()): Target[] {
	// Core itself — detected by name, hard-coded (no package.json config needed).
	if (readPkg(cwd).name === CORE_PACKAGE)
		return [
			{
				...CORE_TEST_DIALECT,
				version: getArg(argv, 'version') ?? CORE_TEST_DIALECT.version,
				constantsDir: getArg(argv, 'constants-dir') ?? CORE_TEST_DIALECT.constantsDir,
				outDir: getArg(argv, 'out') ?? CORE_TEST_DIALECT.outDir,
			},
		]

	const cfg = pkgConfig(cwd)
	const namespace = getArg(argv, 'namespace') ?? cfg.namespace ?? discoverNamespace(cwd)
	const only = getArg(argv, 'version')
	let versions = discoverVersions(cwd)
	if (only) versions = versions.filter((v) => v === only)
	// Full manual override when discovery finds nothing (e.g. non-standard layout).
	if (!versions.length && (getArg(argv, 'constants-dir') || getArg(argv, 'entry')))
		versions = [only ?? 'default']

	return versions.map((version) => {
		const entry = getArg(argv, 'entry') ?? cfg.entry ?? `@/${version}`
		return {
			version,
			binding: { kind: 'namespace', name: namespace, import: entry },
			constantsDir:
				getArg(argv, 'constants-dir') ?? cfg.constantsDir ?? `./src/${version}/definition`,
			outDir: getArg(argv, 'out') ?? cfg.out ?? `./benchmarks/types/${version}/generated`,
		}
	})
}
