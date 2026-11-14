/**
 * Run as a child process by the ask id cases: claims the number of asks in its second argument in the `asks`
 * folder of its first, and prints each id on a line of its own. Two of them run at once.
 */
import { claimAskId } from '../src/lib/knowledge/ask/claim-ask-id.ts'

const [asksFolder, count] = process.argv.slice(2)
for (let claimed = 0; claimed < Number(count); claimed += 1)
	process.stdout.write(`${claimAskId({ asksFolder })}\n`)
