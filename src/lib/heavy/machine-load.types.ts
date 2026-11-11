/** Where the available memory was read from: `vm_stat` (macOS), `/proc/meminfo` (Linux), `os.freemem()`, or nowhere. */
export type MemorySource = 'vm_stat' | 'meminfo' | 'freemem' | 'unknown'

/** The machine's load now: the 1-minute load average, the core count, the available memory in bytes. */
export type MachineLoad = {
	/** `os.loadavg()[0]`. */
	load: number
	/** `os.availableParallelism()`. */
	cores: number
	/** Free plus inactive memory in bytes; undefined when it could not be read. */
	available: number | undefined
	source: MemorySource
}

/** Whether the machine is short, and why: `load 31.2 > 24`, `memory 1.6 GB < 2 GB`. */
export type Shortness = {
	short: boolean
	reasons: string[]
	/** False when the memory could not be read: the machine is then judged on its load alone. */
	memoryKnown: boolean
}

/** What `readMachineLoad` reads, each replaceable by the tests: no real `vm_stat` is spawned in a test. */
export type MachineSeams = {
	loadAverage?: number
	cores?: number
	platform?: NodeJS.Platform
	/** The text of `vm_stat`; undefined when it cannot be run. */
	vmStat?: () => string | undefined
	/** The text of `/proc/meminfo`; undefined when it cannot be read. */
	meminfo?: () => string | undefined
	/** `os.freemem()`. */
	freeMemory?: () => number
}
