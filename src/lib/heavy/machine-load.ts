/**
 * The machine's load and available memory, and whether it is short (33N section 7): `plan next` advises with it,
 * the adaptive wait of the heavy steps (33N section 8) will wait on it.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { availableParallelism, freemem, loadavg } from 'node:os'

import {
	GIGABYTE,
	LOAD_LIMIT_PER_CORE,
	MEMINFO_AVAILABLE_PATTERN,
	MEMINFO_PATH,
	MEMINFO_UNIT_BYTES,
	MEMORY_LIMIT_BYTES,
	MEMORY_LIMIT_GIGABYTES,
	READING_DECIMALS,
	VM_STAT_COMMAND,
	VM_STAT_FREE_PATTERN,
	VM_STAT_INACTIVE_PATTERN,
	VM_STAT_PAGE_SIZE_PATTERN,
	VM_STAT_TIMEOUT_MS,
} from './machine-load.constants.ts'

import type { MachineLoad, MachineSeams, MemorySource, Shortness } from './machine-load.types.ts'

/**
 * The load average against twice the cores, and the available memory: free plus inactive pages on macOS (one
 * `vm_stat`), `MemAvailable` on Linux, `os.freemem()` elsewhere; unknown when macOS or Linux gives nothing readable.
 */
export function readMachineLoad(params: { seams?: MachineSeams } = {}): MachineLoad {
	const seams = params.seams ?? {}
	const memory = availableMemoryOf({ seams })
	return {
		load: seams.loadAverage ?? loadavg()[0],
		cores: seams.cores ?? availableParallelism(),
		available: memory.available,
		source: memory.source,
	}
}

/** The bytes free plus inactive of `vm_stat`'s text (page size from its header, speculative excluded); undefined when unparsable. */
export function parseVmStat(params: { text: string }): number | undefined {
	const pageSize = countOf({ text: params.text, pattern: VM_STAT_PAGE_SIZE_PATTERN })
	const free = countOf({ text: params.text, pattern: VM_STAT_FREE_PATTERN })
	const inactive = countOf({ text: params.text, pattern: VM_STAT_INACTIVE_PATTERN })
	if (pageSize === undefined || free === undefined || inactive === undefined) return undefined
	return (free + inactive) * pageSize
}

/** The bytes of `MemAvailable` in `/proc/meminfo`'s text; undefined when it holds none. */
export function parseMeminfo(params: { text: string }): number | undefined {
	const kilobytes = countOf({ text: params.text, pattern: MEMINFO_AVAILABLE_PATTERN })
	return kilobytes === undefined ? undefined : kilobytes * MEMINFO_UNIT_BYTES
}

/** Short: the load above twice the cores, or the available memory under 2 GB; unknown memory is judged on the load alone. */
export function shortnessOf(params: { machine: MachineLoad }): Shortness {
	const { machine } = params
	const reasons: string[] = []
	const limit = loadLimitOf({ machine })
	if (machine.load > limit)
		reasons.push(`load ${machine.load.toFixed(READING_DECIMALS)} > ${String(limit)}`)
	if (machine.available !== undefined && machine.available < MEMORY_LIMIT_BYTES)
		reasons.push(
			`memory ${gigabytesOf({ bytes: machine.available })} GB < ${String(MEMORY_LIMIT_GIGABYTES)} GB`,
		)
	return { short: reasons.length > 0, reasons, memoryKnown: machine.available !== undefined }
}

/** The load the machine may carry: twice its cores. */
export function loadLimitOf(params: { machine: MachineLoad }): number {
	return LOAD_LIMIT_PER_CORE * params.machine.cores
}

/** An amount of bytes in gigabytes with one decimal (`1.6`). */
export function gigabytesOf(params: { bytes: number }): string {
	return (params.bytes / GIGABYTE).toFixed(READING_DECIMALS)
}

/** The available memory and where it was read from, by platform. */
function availableMemoryOf(params: { seams: MachineSeams }): {
	available: number | undefined
	source: MemorySource
} {
	const { seams } = params
	const platform = seams.platform ?? process.platform
	if (platform === 'darwin') {
		const text = (seams.vmStat ?? vmStatText)()
		const available = text === undefined ? undefined : parseVmStat({ text })
		return available === undefined
			? { available: undefined, source: 'unknown' }
			: { available, source: 'vm_stat' }
	}
	if (platform === 'linux') {
		const text = (seams.meminfo ?? meminfoText)()
		const available = text === undefined ? undefined : parseMeminfo({ text })
		return available === undefined
			? { available: undefined, source: 'unknown' }
			: { available, source: 'meminfo' }
	}
	return { available: (seams.freeMemory ?? freemem)(), source: 'freemem' }
}

/** The one `vm_stat` of a reading; undefined when it cannot be run. */
function vmStatText(): string | undefined {
	try {
		return execFileSync(VM_STAT_COMMAND, [], {
			encoding: 'utf8',
			timeout: VM_STAT_TIMEOUT_MS,
			stdio: ['ignore', 'pipe', 'ignore'],
		})
	} catch {
		return undefined
	}
}

/** The text of `/proc/meminfo`; undefined when it cannot be read. */
function meminfoText(): string | undefined {
	try {
		return readFileSync(MEMINFO_PATH, 'utf8')
	} catch {
		return undefined
	}
}

/** The whole number the pattern's first group holds in the text; undefined without one. */
function countOf(params: { text: string; pattern: RegExp }): number | undefined {
	const digits = params.pattern.exec(params.text)?.[1]
	return digits === undefined ? undefined : Number(digits)
}
