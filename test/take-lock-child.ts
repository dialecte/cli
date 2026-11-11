/**
 * Run as a child process by the hand-over lock cases: takes the hand-over lock at the path in its first argument
 * for the script in its second, then exits at once, so the lock names a writer that is gone. Exit 3 when the lock
 * is held by another.
 */
import { takeHandoverLock } from '../src/lib/handover/handover-lock.ts'

const [lockPath, scriptPath] = process.argv.slice(2)
const taken = takeHandoverLock({ lockPath, scriptPath })
process.exit('heldBy' in taken ? 3 : 0)
