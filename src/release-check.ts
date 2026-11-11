/** Run before `npm publish` (`prepublishOnly`): refuses a package.json naming a dependency by a local folder. */
import { printLines } from './lib/print/print.ts'
import { checkPublishable } from './lib/release/local-dependencies.ts'

const result = checkPublishable({ root: process.cwd() })
if (result.lines.length > 0) printLines({ stream: 'stderr', lines: result.lines })
process.exitCode = result.exitCode
