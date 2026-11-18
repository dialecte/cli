/**
 * `npm run host:refresh [-- --vendor <name>]` asks each vendor's real tool again and writes its record and fixtures;
 * `npm run host:drift` (`--drift`) asks and writes nothing, failing when the tool lacks something a table uses. A
 * contributor action (the tool, its login and the network), never the suite; no build entry, so never shipped.
 */
import { getArg, hasFlag } from '../config.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { printLines } from '../print/print.ts'
import { HOST_CONTRACTS } from './host-contracts.constants.ts'
import { HOST_REFRESH_FLAGS, HOST_REFRESH_LINES } from './refresh-host-contract.constants.ts'
import { driftHostContract, refreshHostContract } from './refresh-host-contract.ts'

const argv = process.argv.slice(2)
const params = {
	root: process.cwd(),
	records: HOST_CONTRACTS,
	vendor: getArg(argv, HOST_REFRESH_FLAGS.vendor),
}
if (hasFlag(argv, HOST_REFRESH_FLAGS.drift)) {
	const drift = driftHostContract(params)
	printLines({ stream: drift.exit ? 'stderr' : 'stdout', lines: drift.lines })
	process.exitCode = drift.exit
} else {
	const outcome = refreshHostContract(params)
	if ('refusal' in outcome) {
		printLines({ stream: 'stderr', lines: [outcome.refusal] })
		process.exitCode = 1
	} else {
		printLines({
			stream: 'stdout',
			lines: outcome.changed.length
				? outcome.changed.map(function lineOfChanged(path) {
						return fillMessage({ template: HOST_REFRESH_LINES.changed, values: { path } })
					})
				: [HOST_REFRESH_LINES.unchanged],
		})
	}
}
