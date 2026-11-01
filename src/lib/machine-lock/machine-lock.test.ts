import { spawn } from 'node:child_process'
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { createFakeClock } from '../../../test/fake-clock.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { acquireMachineLock, machineLockPath } from './machine-lock.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

function lockIn(folder: string): string {
	return join(folder, 'heavy-run.lock')
}

function holdBy(params: { path: string; pid: number }): void {
	writeFileSync(
		params.path,
		JSON.stringify({
			pid: params.pid,
			command: 'dialecte gate --full',
			startedAt: '2026-10-29T10:00:00.000Z',
		}),
	)
}

/** When the holder of the nesting cases started, as `ps -o lstart=` prints it. */
const HOLDER_START = 'Sat Nov  1 09:00:00 2026'

/** A lock held by `pid`, its process start recorded. */
function holdByStarted(params: { path: string; pid: number; processStart: string }): void {
	writeFileSync(
		params.path,
		JSON.stringify({
			pid: params.pid,
			command: 'dialecte lock run -- npx vitest run',
			startedAt: '2026-11-01T09:00:00.000Z',
			processStart: params.processStart,
		}),
	)
}

/** DIALECTE_MACHINE_LOCK_HOLDER set for the current test, put back when it ends. */
function setHolderVariable(value: string): void {
	const before = process.env.DIALECTE_MACHINE_LOCK_HOLDER
	process.env.DIALECTE_MACHINE_LOCK_HOLDER = value
	onTestFinished(function restore() {
		if (before === undefined) delete process.env.DIALECTE_MACHINE_LOCK_HOLDER
		else process.env.DIALECTE_MACHINE_LOCK_HOLDER = before
	})
}

describe('acquireMachineLock', () => {
	it('free → taken with the holder written; release → the file goes', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
		})

		expect(outcome.acquired).toBe(true)
		expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
			pid: 4242,
			command: 'dialecte gate --full',
		})
		if (outcome.acquired) outcome.release()
		expect(existsSync(path)).toBe(false)
	})

	it('held by a live process, --no-wait → refused with the holder, the lock kept', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		const clock = createFakeClock()
		clock.onSleep = () => {
			throw new Error('--no-wait waited')
		}

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock,
			write: () => undefined,
			pid: 4242,
			isAlive: () => true,
		})

		expect(outcome).toMatchObject({ acquired: false, holder: { pid: 1111 } })
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(1111)
	})

	it('held by a process that is gone → stale, taken over', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: () => false,
		})

		expect(outcome.acquired).toBe(true)
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(4242)
	})

	it('held for 65 s by a live process → a line at 0, 30 and 60 s naming it, then taken', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		const clock = createFakeClock()
		const lines: string[] = []

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: true,
			clock,
			write: (line) => lines.push(line),
			pid: 4242,
			isAlive: () => clock.now() < 65_000,
		})

		expect(outcome.acquired).toBe(true)
		expect(lines).toEqual([
			'… waiting 0.0 s for the machine lock: pid 1111 runs "dialecte gate --full" since 2026-10-29T10:00:00.000Z',
			'… waiting 30 s for the machine lock: pid 1111 runs "dialecte gate --full" since 2026-10-29T10:00:00.000Z',
			'… waiting 1 m 0 s for the machine lock: pid 1111 runs "dialecte gate --full" since 2026-10-29T10:00:00.000Z',
		])
	})

	it('two takers on a stale lock, the second one running while the first decides → exactly one holder', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		const outcomes: Record<string, boolean> = {}
		let secondRan = false
		function isAlive(pid: number): boolean {
			if (pid === 1111 && !secondRan) {
				secondRan = true
				outcomes.second = acquireMachineLock({
					path,
					command: 'second',
					wait: false,
					clock: createFakeClock(),
					write: () => undefined,
					pid: 5353,
					isAlive: (other) => other === 4242 || other === 5353,
				}).acquired
			}
			return pid !== 1111
		}

		outcomes.first = acquireMachineLock({
			path,
			command: 'first',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive,
		}).acquired

		expect(outcomes).toEqual({ second: true, first: false })
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(5353)
	})

	it('a lock file still being written (empty) → not taken over, left as it is', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		writeFileSync(path, '')

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: () => false,
		})

		expect(outcome.acquired).toBe(false)
		expect(readFileSync(path, 'utf8')).toBe('')
	})

	it('the holder pid alive but started after the lock was taken (pid reused) → stale, taken over', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		writeFileSync(
			path,
			JSON.stringify({
				pid: 1111,
				command: 'dialecte gate --full',
				startedAt: '2026-10-29T10:00:00.000Z',
				processStart: 'Wed Oct 29 10:00:00 2026',
			}),
		)

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: () => true,
			processStartOf: (pid) => (pid === 1111 ? 'Wed Oct 29 17:40:00 2026' : 'now'),
		})

		expect(outcome.acquired).toBe(true)
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(4242)
	})

	it('held by the live pid DIALECTE_MACHINE_LOCK_HOLDER names (a command run under lock run) → acquired at once; its release leaves the lock to that holder', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdByStarted({ path, pid: 1111, processStart: HOLDER_START })
		setHolderVariable(`1111:${HOLDER_START}`)

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: () => true,
			processStartOf: (pid) => (pid === 1111 ? HOLDER_START : 'Sat Nov  1 10:05:00 2026'),
		})

		expect(outcome.acquired).toBe(true)
		if (outcome.acquired) outcome.release()
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(1111)
	})

	it('DIALECTE_MACHINE_LOCK_HOLDER naming the holder pid with no start → not nested, refused', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdByStarted({ path, pid: 1111, processStart: HOLDER_START })
		setHolderVariable('1111')

		expect(
			acquireMachineLock({
				path,
				command: 'dialecte gate --full',
				wait: false,
				clock: createFakeClock(),
				write: () => undefined,
				pid: 4242,
				isAlive: () => true,
				processStartOf: (pid) => (pid === 1111 ? HOLDER_START : 'Sat Nov  1 10:05:00 2026'),
			}),
		).toMatchObject({ acquired: false, holder: { pid: 1111 } })
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(1111)
	})

	it('a live holder whose start was not recorded (ps missing) and DIALECTE_MACHINE_LOCK_HOLDER naming its pid with no start (<pid>:) → nested at once; its release leaves the lock to that holder', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		setHolderVariable('1111:')

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: () => true,
			processStartOf: () => undefined,
		})

		expect(outcome.acquired).toBe(true)
		if (outcome.acquired) outcome.release()
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(1111)
	})

	it('DIALECTE_MACHINE_LOCK_HOLDER naming the holder pid with another start (an inherited variable, the pid reused) → refused; with the holder start → nested', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdByStarted({ path, pid: 1111, processStart: HOLDER_START })
		setHolderVariable('')
		function acquireWith(variable: string) {
			process.env.DIALECTE_MACHINE_LOCK_HOLDER = variable
			return acquireMachineLock({
				path,
				command: 'dialecte gate --full',
				wait: false,
				clock: createFakeClock(),
				write: () => undefined,
				pid: 4242,
				isAlive: () => true,
				processStartOf: (pid) => (pid === 1111 ? HOLDER_START : 'Sat Nov  1 10:05:00 2026'),
			})
		}

		expect([
			acquireWith('1111:Fri Oct 31 08:00:00 2026').acquired,
			acquireWith(`1111:${HOLDER_START}`).acquired,
		]).toEqual([false, true])
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(1111)
	})

	it('DIALECTE_MACHINE_LOCK_HOLDER naming a pid other than the live holder → refused, the lock still names the holder', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		setHolderVariable('2222')

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: () => true,
		})

		expect(outcome).toMatchObject({ acquired: false, holder: { pid: 1111 } })
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(1111)
	})

	it('DIALECTE_MACHINE_LOCK_HOLDER naming a holder that is gone → stale, taken over; release removes the lock', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		setHolderVariable('1111')

		const outcome = acquireMachineLock({
			path,
			command: 'dialecte gate --full',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: (pid) => pid !== 1111,
		})

		expect(outcome.acquired).toBe(true)
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(4242)
		if (outcome.acquired) outcome.release()
		expect(existsSync(path)).toBe(false)
	})

	it('DIALECTE_CACHE_DIR set but empty → the platform cache folder, not a lock relative to the cwd', () => {
		const before = process.env.DIALECTE_CACHE_DIR
		process.env.DIALECTE_CACHE_DIR = ''
		onTestFinished(function restore() {
			if (before === undefined) delete process.env.DIALECTE_CACHE_DIR
			else process.env.DIALECTE_CACHE_DIR = before
		})

		expect(isAbsolute(machineLockPath())).toBe(true)
	})

	it('a live holder that took the lock under another locale and time zone → the same holder, refused', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		const holder = spawn('sleep', ['30'], { stdio: 'ignore' })
		onTestFinished(function stopHolder() {
			holder.kill()
		})
		const before = { LC_ALL: process.env.LC_ALL, LANG: process.env.LANG, TZ: process.env.TZ }
		onTestFinished(function restoreEnvironment() {
			for (const [key, value] of Object.entries(before))
				if (value === undefined) delete process.env[key]
				else process.env[key] = value
		})
		Object.assign(process.env, { LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8', TZ: 'Asia/Tokyo' })
		const taken = acquireMachineLock({
			path,
			command: 'holder',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: holder.pid,
		})
		Object.assign(process.env, { LC_ALL: 'C', LANG: 'C', TZ: 'America/Los_Angeles' })

		const outcome = acquireMachineLock({
			path,
			command: 'waiter',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
		})

		expect(taken.acquired).toBe(true)
		expect(outcome).toMatchObject({ acquired: false, holder: { pid: holder.pid } })
	})

	it('ps failing for a live holder (no start read) → never a reused pid, refused', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		writeFileSync(
			path,
			JSON.stringify({
				pid: 1111,
				command: 'holder',
				startedAt: '2026-10-29T10:00:00.000Z',
				processStart: 'Thu Oct 29 10:00:00 2026',
			}),
		)

		const outcome = acquireMachineLock({
			path,
			command: 'waiter',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
			isAlive: () => true,
			processStartOf: () => undefined,
		})

		expect(outcome).toMatchObject({ acquired: false, holder: { pid: 1111 } })
	})

	it('three takers on a stale lock, two arriving while the first holds the takeover → exactly one holder', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		const outcomes: Record<string, boolean> = {}
		function isAlive(pid: number): boolean {
			return pid !== 1111
		}
		function taker(params: {
			name: string
			pid: number
			onTakeoverStep?: (step: string) => void
		}): void {
			outcomes[params.name] = acquireMachineLock({
				path,
				command: params.name,
				wait: false,
				clock: createFakeClock(),
				write: () => undefined,
				pid: params.pid,
				isAlive,
				onTakeoverStep: params.onTakeoverStep,
			}).acquired
		}

		taker({
			name: 'first',
			pid: 4242,
			onTakeoverStep: function arrive(step) {
				if (step !== 'holding the takeover' || 'second' in outcomes) return
				taker({ name: 'second', pid: 5353 })
				taker({ name: 'third', pid: 6464 })
			},
		})

		expect(outcomes).toEqual({ second: false, third: false, first: true })
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(4242)
	})

	it('a taker creating the lock right after the stale one was removed → it holds; the remover and a third refused', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		holdBy({ path, pid: 1111 })
		const outcomes: Record<string, boolean> = {}
		function taker(params: {
			name: string
			pid: number
			onTakeoverStep?: (step: string) => void
		}): void {
			outcomes[params.name] = acquireMachineLock({
				path,
				command: params.name,
				wait: false,
				clock: createFakeClock(),
				write: () => undefined,
				pid: params.pid,
				isAlive: (pid) => pid !== 1111,
				onTakeoverStep: params.onTakeoverStep,
			}).acquired
		}

		taker({
			name: 'first',
			pid: 4242,
			onTakeoverStep: function arrive(step) {
				if (step !== 'stale lock removed' || 'second' in outcomes) return
				taker({ name: 'second', pid: 5353 })
				taker({ name: 'third', pid: 6464 })
			},
		})

		expect(outcomes).toEqual({ second: true, third: false, first: false })
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(5353)
	})

	it('a lock file unreadable for longer than a few seconds → stale, taken over; a takeover file that old → cleared', () => {
		const path = lockIn(temporaryFolder('dialecte-lock-'))
		writeFileSync(path, '{ half')
		writeFileSync(`${path}.takeover`, '')
		const longAgo = new Date(Date.now() - 60_000)
		utimesSync(path, longAgo, longAgo)
		utimesSync(`${path}.takeover`, longAgo, longAgo)

		const outcome = acquireMachineLock({
			path,
			command: 'waiter',
			wait: false,
			clock: createFakeClock(),
			write: () => undefined,
			pid: 4242,
		})

		expect(outcome.acquired).toBe(true)
		expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(4242)
		expect(existsSync(`${path}.takeover`)).toBe(false)
	})
})
