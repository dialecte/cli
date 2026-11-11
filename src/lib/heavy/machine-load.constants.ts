/** The thresholds and the sources of the machine's load reading (33N sections 7 and 8): shared by `plan next` and the adaptive wait. */

/** Bytes in one gigabyte as the reasons write it (1024^3). */
export const GIGABYTE = 1024 ** 3

/** The machine is short when the 1-minute load is above this many times its cores (`LOT-RULES.md`, Q2). */
export const LOAD_LIMIT_PER_CORE = 2

/** The machine is short when less memory than this, in gigabytes, is available. */
export const MEMORY_LIMIT_GIGABYTES = 2

/** The same limit in bytes. */
export const MEMORY_LIMIT_BYTES = MEMORY_LIMIT_GIGABYTES * GIGABYTE

/** The decimals of a load and of a memory amount in a reason (`load 31.2 > 24`, `memory 1.6 GB < 2 GB`). */
export const READING_DECIMALS = 1

/** macOS's memory statistics command: run once, its text parsed. */
export const VM_STAT_COMMAND = 'vm_stat'

/** How long `vm_stat` may take before the memory counts as unknown. */
export const VM_STAT_TIMEOUT_MS = 2000

/** `vm_stat`'s header: the page size its counts are in. */
export const VM_STAT_PAGE_SIZE_PATTERN = /page size of (\d+) bytes/

/** `vm_stat`'s free and inactive page lines (speculative pages are not counted, as `LOT-RULES.md` counts). */
export const VM_STAT_FREE_PATTERN = /^Pages free:\s+(\d+)\.?\s*$/m
export const VM_STAT_INACTIVE_PATTERN = /^Pages inactive:\s+(\d+)\.?\s*$/m

/** Linux's memory file and its available line, in kB. */
export const MEMINFO_PATH = '/proc/meminfo'
export const MEMINFO_AVAILABLE_PATTERN = /^MemAvailable:\s+(\d+)\s*kB\s*$/m

/** Bytes in one kB of `/proc/meminfo`. */
export const MEMINFO_UNIT_BYTES = 1024
