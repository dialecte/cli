/** The branches and files of the scratch lots whose tdd base follows the lot's base branch. */

/** The branch the lot was cut from (one commit ahead of `main`, the base file). */
export const BASE_BRANCH = 'feat/x'

/** Another branch of the repository, for a `from` the store's base ref must win over. */
export const OTHER_BRANCH = 'feat/y'

/** The lot's own branch. */
export const LOT_BRANCH = 'feat/lot'

/** The file the cut commit adds, and the one the lot's own commit adds. */
export const BASE_FILE = 'src/base.ts'
export const OWN_FILE = 'src/own.ts'

/** The date a baseline written by a scenario carries. */
export const SCENARIO_NOW = new Date('2026-11-12T12:00:00.000Z')

/** The package.json of the scratch package the gate's tdd step reads: it tests with vitest. */
export const VITEST_PACKAGE_JSON = { devDependencies: { vitest: '^4.1.8' } }

/** A tag the lot's base branch carries. */
export const BASE_TAG = 'release-1'

/** The lot the store scenarios link. */
export const SCENARIO_LOT_NAME = '0001-repo-lot'

/** The reason the lot file of the gate cases gives for its exemption. */
export const EXEMPT_REASON = 'the base is what is measured'

/** The lot file of the gate cases: exempt, so the step reports what the change touches since its base. */
export const EXEMPT_LOT_FILE = `${JSON.stringify({ tdd: `exempt: ${EXEMPT_REASON}` })}\n`
