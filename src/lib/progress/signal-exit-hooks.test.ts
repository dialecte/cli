/** The hooks run before this process ends by a forwarded signal: each one runs, whatever an earlier one threw. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { signalChildScript } from '../../../test/signal-child.ts'

import { describe, expect, it } from 'vitest'

const FORWARDING_SOURCE = join(import.meta.dirname, 'interrupt-forwarding.ts')

describe('signal-exit hooks', { timeout: 30_000 }, () => {
	it('SIGTERM with a hook that throws before another → the other hook runs and the process ends by SIGTERM', async () => {
		const marker = join(temporaryFolder('dialecte-signal-hook-'), 'ran')

		const ended = await signalChildScript({
			script: `import { writeFileSync } from 'node:fs'
import { onSignalExit } from ${JSON.stringify(FORWARDING_SOURCE)}
onSignalExit(function throwing() {
	throw new Error('hook failed')
})
onSignalExit(function later() {
	writeFileSync(${JSON.stringify(marker)}, 'ran')
})
console.log('ready')
setInterval(function keepRunning() {}, 1000)
`,
			signal: 'SIGTERM',
			timeoutMs: 20_000,
		})

		expect({ signal: ended.signal, laterRan: existsSync(marker) }).toEqual({
			signal: 'SIGTERM',
			laterRan: true,
		})
	})
})
