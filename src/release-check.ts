/** Run before `npm publish` (`prepublishOnly`): refuses a package.json naming a dependency by a local folder. */
import { checkPublishable } from './lib/release/local-dependencies.ts'

const result = checkPublishable({ root: process.cwd() })
for (const line of result.lines) console.error(line)
process.exitCode = result.exitCode
