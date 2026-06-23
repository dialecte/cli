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

export type Binding =
	| { kind: 'namespace'; name: string; import: string }
	| {
			kind: 'core'
			coreAlias: string
			coreImport: string
			configType: string
			configImport: string
	  }

/** One thing to bench/cover/audit — a dialect version (or the single core test dialect). */
export type Target = {
	version: string
	binding: Binding
	constantsDir: string
	outDir: string
}

export const getArg = (argv: string[], name: string): string | undefined => {
	const i = argv.indexOf(`--${name}`)
	return i >= 0 ? argv[i + 1] : undefined
}
export const hasFlag = (argv: string[], name: string): boolean => argv.includes(`--${name}`)

export const tsconfigOf = (argv: string[], cwd: string = process.cwd()): string =>
	getArg(argv, 'tsconfig') ?? pkgConfig(cwd).tsconfig ?? 'tsconfig.build.json'

type Pkg = { name?: string; dialecte?: Record<string, string> }
const readPkg = (cwd: string): Pkg => {
	const p = join(cwd, 'package.json')
	return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}
}
const pkgConfig = (cwd: string): Record<string, string> => readPkg(cwd).dialecte ?? {}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

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

/**
 * Core benches its own engine through a generic *test* dialect (it has no `src/<v>/definition` layout).
 * Hard-coded and matched by package name, so core's package.json needs NO "dialecte" config — identical
 * in shape to every dialect's. CLI flags (--version/--constants-dir/--out) still override.
 */
const CORE_PACKAGE = '@dialecte/core'
const CORE_TEST_DIALECT: Target = {
	version: 'core',
	binding: {
		kind: 'core',
		coreAlias: 'Core',
		coreImport: '@/index',
		configType: 'TestDialecteConfig',
		configImport: '@/test/config',
	},
	constantsDir: './src/test/generated',
	outDir: './benchmarks/types/generated',
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
