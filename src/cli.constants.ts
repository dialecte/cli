/** The `dialecte` commands and the help text the cli prints. */
import { run as api } from './commands/api.ts'
import { run as audit } from './commands/audit.ts'
import { run as bench } from './commands/bench.ts'
import { run as coverage } from './commands/coverage.ts'
import { run as doctor } from './commands/doctor.ts'
import { run as gate } from './commands/gate.ts'
import { run as handover } from './commands/handover.ts'
import { run as members } from './commands/members.ts'
import { run as narrowing } from './commands/narrowing.ts'
import { run as newVerb } from './commands/new-verb.ts'
import { run as rules } from './commands/rules.ts'
import { run as schema } from './commands/schema.ts'
import { run as skills } from './commands/skills.ts'

export const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
	coverage,
	bench,
	narrowing,
	audit,
	skills,
	api,
	schema,
	members,
	doctor,
	rules,
	gate,
	new: newVerb,
	handover,
}

export const HELP = `
dialecte — TypeScript type-performance & readability tooling for Dialecte dialects

Usage:
  dialecte <command> [options]

Commands:
  coverage   Generate type-coverage probes (surface + valid calls + deep + full method surface incl. extensions)
  bench      Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI
  narrowing  Gate: assert schema-derived type narrowing still holds (IntelliSense safety net)
  audit      Render the public type surface and flag readability issues (C1–C6)
  skills     Agent skills shipped in skills/<name>/: sync | generate | check
  api        Find a method by what you need (find), read its contract (show)
  members    The members of an expression of the live types (doc.query, tx.lifecycle)
  schema     What an element may hold and where: parents, children, attributes
  doctor     Installed versions, core API generation, skills in sync, local checkouts
  rules      Code-rules self-check of the changed files (syntax tree, not greps)
  gate       The package's Definition of Done with the real counts: --fast (default) | --full
  new        Scaffold in the house style: new verb <namespace> <query|transaction> <name>
  handover   Write the guarded commit-by-lots script a human runs, from a lots file

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

Lookups (the same with or without the repositories; --json on each):
  dialecte api find "<need>" [--package <name>] [--limit 5]
                             # methods whose intents, summary or name match the need, best first
  dialecte api show <path>   # signature, summary, intents, routes, declaration, example (info.of, tx.addChild)
  dialecte members <expression>
                             # one line per member of doc.query, doc.query.reference, tx.lifecycle.extract...
  dialecte schema <Tag> [--package <name>]
                             # parents, children with how often, attributes; an unknown tag answers the closest
  dialecte doctor            # what to fix before trusting what you read; exit 1 on a warning

Contributing (inside a dialecte repository):
  dialecte rules [<files...>] [--json]
                             # types / constants in their files, named functions, no await in an argument,
                             # object parameters, full words, no plan tag or standard citation
  dialecte gate [--fast | --full] [--json]
                             # steps from package.json "dialecte": { "gate", "generatedDocs" } or the defaults;
                             # refuses while a hand-over script holds the repository
  dialecte new verb <namespace> <query|transaction> <name> [--version <v>]
                             # verb, types, red test (only: true), barrel export, namespace registration
  dialecte handover <lots.json> [--out <dir>] [--rehash]
                             # commit.sh + snapshot hashes; refuses files in no lot, tags, citations

Env: RUNS=5 dialecte bench   (repetitions for the min); COVERAGE_CHILD_CAP=N (cap edges)
`
