/** The CI template shipped in the package: where it lives, its slots, and the paths it manages. */
import type { CiFacts, CliInvocation } from './ci-template.types.ts'

/** The template's folder, relative to the cli's package root (shipped through package.json `files`). */
export const CI_TEMPLATE_FOLDER = 'templates/ci'

/** The slot a workflow runs the cli through: a plain YAML word, so the template stays YAML a formatter reads. */
export const CLI_SLOT = '__dialecte_cli__'

/** How a workflow runs the cli: the cli's own package from its sources, any other the installed devDependency. */
export const CLI_INVOCATIONS: Readonly<Record<CliInvocation, string>> = {
	source: 'node src/cli.ts',
	installed: 'npx dialecte',
}

/** A line opening a block kept only when the fact it names holds: `#{{if docs}}`, indented as the formatter puts it. */
export const CONDITION_START_PATTERN = /^\s*#\{\{if (\w+)\}\}$/

/** The line closing a conditional block, indented as the formatter puts it. */
export const CONDITION_END_PATTERN = /^\s*#\{\{end\}\}$/

/** The template files a fact selects: absent from the package when the fact does not hold. */
export const SELECTED_FILES: Readonly<Record<string, keyof CiFacts>> = {
	'.github/workflows/_type-perf.yml': 'typePerf',
	'.github/workflows/_docs.yml': 'docs',
}

/** Files of the flow before the template: sync deletes them. */
export const RETIRED_PATHS: readonly string[] = [
	'.github/workflows/_lint.yml',
	'.github/workflows/pr.yml',
]

/** Where the workflow files live: a file there the template does not manage is the repository's own. */
export const WORKFLOWS_FOLDER = '.github/workflows'

/** The repository's own test workflow, which ci.yml calls. */
export const OWN_TEST_PATH = '.github/workflows/_test.yml'

/** The input of the own test workflow that ci.yml passes `pr` or `full` to, when the workflow takes it. */
export const TEST_MODE_INPUT = 'mode'

/** The package.json facts the template reads. */
export const PACKAGE_FACTS = {
	buildScript: 'build',
	typePerfScript: 'type-bench:check',
	docsScript: 'doc:build',
	playwrightDependency: 'playwright',
} as const

/** What the own test workflow can lack. */
export const TEST_CONTRACT_FINDINGS = {
	missing: 'is missing: the repository owns its tests, ci.yml calls it',
	unreadable: 'is no readable YAML',
	noWorkflowCall: 'has no workflow_call trigger: ci.yml calls it',
	modeType: 'its mode input takes {type}: ci.yml passes the string pr or full',
} as const

/** Why the template cannot be rendered for a package. */
export const CI_FACTS_REFUSALS = {
	noPackage: 'no package.json here: run it in a package root',
	noName: 'package.json has no name',
	noBuild: 'package.json has no build script: publish.yml builds the package',
} as const

/** Lines of context around each change of a unified diff. */
export const DIFF_CONTEXT = 2
