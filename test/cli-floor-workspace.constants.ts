import { join } from 'node:path'

import { readCliVersion } from '../src/lib/read-cli-version.ts'

/** The running cli's own version: the sources' package.json. */
export const OWN_VERSION = readCliVersion()

/** The major of the running cli's version. */
const OWN_MAJOR = Number(OWN_VERSION.split('.')[0])

/** A version above the running cli's, and one above that. */
export const ABOVE_VERSION = `${OWN_MAJOR + 1}.0.0`
export const FAR_ABOVE_VERSION = `${OWN_MAJOR + 2}.0.0`

/** A version below the running cli's. */
export const BELOW_VERSION = '0.0.1'

/** The cli's entry in the sources: Node runs it with its type stripping. */
export const CLI_SOURCE = join(import.meta.dirname, '..', 'src', 'cli.ts')

/** The name the manifest of a package that is not the cli carries. */
export const PACKAGE_NAME = 'scratch-package'

/** The branch a case works on, over `main`. */
export const WORK_BRANCH = 'work'

/** The words a refusal of the floor holds that no other answer of a lot verb holds. */
export const REFUSAL_WORD = 'older than'

/** The state folder's name inside a case's own folder. */
export const STATE_FOLDER = 'state'

/** The scratch lot a case names by its index. */
export const LOT_INDEX = '0001'
export const LOT_FULL_NAME = '0001-repo-floor'
