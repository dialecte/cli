/**
 * `npm run doc:generate` writes the command reference pages of the package in the working folder from the command
 * map; `npm run doc:check` (`--check`) writes nothing and fails naming each page that does not match it.
 */
import { printLines } from '../print/print.ts'
import { CHECK_FLAG, REFERENCE_LINES } from './command-reference.constants.ts'
import { checkReferencePages, writeReferencePages } from './command-reference.ts'

const root = process.cwd()
const checking = process.argv.slice(2).includes(CHECK_FLAG)
const result = checking ? checkReferencePages({ root }) : writeReferencePages({ root })
if (result.faults.length) {
	printLines({
		stream: 'stderr',
		lines: result.faults.map((fault) => REFERENCE_LINES[fault.kind].replace('{path}', fault.path)),
	})
	process.exitCode = 1
} else {
	const line = checking ? REFERENCE_LINES.fresh : REFERENCE_LINES.written
	printLines({ stream: 'stdout', lines: [line.replace('{count}', String(result.pages))] })
}
