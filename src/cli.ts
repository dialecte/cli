import { run as audit } from './commands/audit.ts'
import { run as bench } from './commands/bench.ts'
/**
 * `dialecte` — the Dialecte dialect dev CLI (`@dialecte/cli`). Type-performance benchmarking,
 * coverage probes, and readability audits for any Dialecte dialect (and core itself).
 * Subcommands live in ./commands/*; shared zero-config discovery in ./lib/config.ts.
 * Bundled with tsup; the shebang is injected by the tsup banner.
 */
import { run as coverage } from './commands/coverage.ts'
import { run as narrowing } from './commands/narrowing.ts'
import { run as skills } from './commands/skills.ts'
import { parseInvocation } from './lib/parse-invocation.ts'

const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
	coverage,
	bench,
	narrowing,
	audit,
	skills,
}

const HELP = `
dialecte — TypeScript type-performance & readability tooling for Dialecte dialects

Usage:
  dialecte <command> [options]

Commands:
  coverage   Generate type-coverage probes (surface + valid calls + deep + full method surface incl. extensions)
  bench      Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI
  narrowing  Gate: assert schema-derived type narrowing still holds (IntelliSense safety net)
  audit      Render the public type surface and flag readability issues (C1–C6)
  skills     Agent skills shipped in skills/<name>/: sync | generate | check

Zero-config: namespace = capitalized package name, versions discovered from src/<version>/definition/.
Core is detected by package name and benched via a built-in test dialect. Override per package.json
"dialecte" field (odd layouts) or CLI flags:
  --namespace <Name>  --entry <import>  --constants-dir <dir>  --out <dir>  --version <v>  --tsconfig <f>

Emitted files are formatted with the consumer's oxfmt (matches that package's style):
  --format-config <path>   oxfmt config to use (default: auto-discover the nearest .oxfmtrc)
  --no-format              skip formatting the generated output

Examples:
  dialecte coverage            # regenerate the coverage probes
  dialecte bench               # measure + write benchmarks/types/baseline.json
  dialecte bench --check       # CI gate: fail on >5% instantiation regression
  dialecte audit               # write benchmarks/types/readability-audit.md

Skills:
  dialecte skills sync [--agent claude,copilot,agents] [--copy] [--from <workspace>]
                             # install the skills of your dependencies (or of local checkouts) for your agents
  dialecte skills generate   # rewrite the generated blocks (verb map, method index, hook files) from the source
  dialecte skills check [--workspace <dir>]
                             # fail on a cited API / path / npm script that does not exist, or a stale block

Env: RUNS=5 dialecte bench   (repetitions for the min); COVERAGE_CHILD_CAP=N (cap edges)
`

async function main(): Promise<void> {
	const invocation = parseInvocation({
		argv: process.argv.slice(2),
		commandNames: Object.keys(COMMANDS),
	})
	if (invocation.kind === 'help') {
		console.log(HELP.trim())
		return
	}
	if (invocation.kind === 'unknown') {
		console.error(`dialecte: unknown command "${invocation.command}"\n`)
		console.log(HELP.trim())
		process.exit(1)
	}
	await COMMANDS[invocation.command](invocation.argv)
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e)
	process.exit(1)
})
