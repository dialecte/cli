/** The `dialecte` commands: each name with its run function. The help reads the command map. */
import { run as api } from './commands/api.ts'
import { run as ask } from './commands/ask.ts'
import { run as audit } from './commands/audit.ts'
import { run as bench } from './commands/bench.ts'
import { run as contrib } from './commands/contrib.ts'
import { run as coverage } from './commands/coverage.ts'
import { run as doctor } from './commands/doctor.ts'
import { explain } from './commands/explain.ts'
import { run as facts } from './commands/facts.ts'
import { run as fixture } from './commands/fixture.ts'
import { run as gate } from './commands/gate.ts'
import { run as handover } from './commands/handover.ts'
import { run as inbox } from './commands/inbox.ts'
import { run as lot } from './commands/lot.ts'
import { run as members } from './commands/members.ts'
import { run as models } from './commands/models.ts'
import { run as mutants } from './commands/mutants.ts'
import { run as narrowing } from './commands/narrowing.ts'
import { run as newVerb } from './commands/new-verb.ts'
import { run as plan } from './commands/plan.ts'
import { renamedCommand } from './commands/renamed.ts'
import { run as rules } from './commands/rules.ts'
import { run as runScript } from './commands/run.ts'
import { run as schema } from './commands/schema.ts'
import { run as skills } from './commands/skills.ts'
import { run as standard } from './commands/standard.ts'
import { run as tdd } from './commands/tdd.ts'
import { run as text } from './commands/text.ts'
import { run as worktree } from './commands/worktree.ts'

/** Literal keys (`satisfies`, no annotation): the command map's names are derived from them. */
export const COMMANDS = {
	coverage,
	bench,
	narrowing,
	audit,
	skills,
	api,
	schema,
	members,
	models,
	doctor,
	run: runScript,
	fixture,
	explain,
	standard,
	facts,
	ask,
	rules,
	gate,
	contrib,
	tdd,
	new: newVerb,
	handover,
	lot,
	inbox,
	plan,
	mutants,
	worktree,
	record: renamedCommand('record'),
	review: renamedCommand('review'),
	recap: renamedCommand('recap'),
	text,
} satisfies Record<string, (argv: string[]) => Promise<void>>

/** The registered commands by any name: `COMMANDS` keeps literal keys for the command map, a word read is a string. */
export const COMMANDS_BY_NAME: Readonly<Record<string, (argv: string[]) => Promise<void>>> =
	COMMANDS
