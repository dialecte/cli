/** What a package already says about its CI: read from its package.json and its own `_test.yml`. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readPackageJson } from '../package-json.ts'
import { CLI_PACKAGE } from '../skills/cli-invocations.constants.ts'
import { CI_FACTS_REFUSALS, OWN_TEST_PATH, PACKAGE_FACTS } from './ci-template.constants.ts'
import { testContractOf } from './ci-template.ts'

import type { CiFactsRead } from './ci-template.types.ts'

/** The package's CI facts and its own test workflow's contract, or why the template cannot be rendered for it. */
export function readCiFacts(root: string): CiFactsRead {
	if (!existsSync(join(root, 'package.json'))) return { refusal: CI_FACTS_REFUSALS.noPackage }
	const packageJson = readPackageJson(root)
	if (typeof packageJson.name !== 'string' || packageJson.name === '')
		return { refusal: CI_FACTS_REFUSALS.noName }
	const scripts = packageJson.scripts ?? {}
	if (typeof scripts[PACKAGE_FACTS.buildScript] !== 'string')
		return { refusal: CI_FACTS_REFUSALS.noBuild }
	const testFile = join(root, OWN_TEST_PATH)
	const contract = testContractOf(existsSync(testFile) ? readFileSync(testFile, 'utf8') : undefined)
	const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
	return {
		facts: {
			cli: packageJson.name === CLI_PACKAGE ? 'source' : 'installed',
			typePerf: typeof scripts[PACKAGE_FACTS.typePerfScript] === 'string',
			docs: typeof scripts[PACKAGE_FACTS.docsScript] === 'string',
			playwright: PACKAGE_FACTS.playwrightDependency in dependencies,
			testMode: contract.mode,
			skillsCheck: typeof scripts[PACKAGE_FACTS.skillsCheckScript] === 'string',
		},
		contract,
	}
}
