/**
 * The machine's load reading (33N section 7, case 17): `vm_stat` and `/proc/meminfo` parsed from captured text,
 * the load against twice the cores and the memory against 2 GB. No test spawns `vm_stat`.
 */
import { parseMeminfo, parseVmStat, readMachineLoad, shortnessOf } from './machine-load.ts'

import { describe, expect, it } from 'vitest'

import type { MachineLoad, MachineSeams, Shortness } from './machine-load.types.ts'

const GIGABYTE = 1024 ** 3

/** Captured `vm_stat` output of a macOS machine with 16 KiB pages: speculative pages are not counted. */
const VM_STAT_16K = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               10000.
Pages active:                            200000.
Pages inactive:                           50000.
Pages speculative:                         5000.
Pages throttled:                              0.
Pages wired down:                         90000.
Pages purgeable:                           3000.
"Translation faults":                 123456789.
Pages copy-on-write:                     654321.
`

/** The same with 4 KiB pages. */
const VM_STAT_4K = `Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                                1000.
Pages active:                             20000.
Pages inactive:                            2000.
Pages speculative:                          500.
`

const MEMINFO = `MemTotal:       16384000 kB
MemFree:         1000000 kB
MemAvailable:    8123456 kB
Buffers:          200000 kB
Cached:          3000000 kB
`

describe('parseVmStat: free plus inactive pages times the page size of the header', () => {
	it.each([
		{
			name: '16 KiB pages, speculative excluded',
			text: VM_STAT_16K,
			bytes: (10000 + 50000) * 16384,
		},
		{ name: '4 KiB pages', text: VM_STAT_4K, bytes: (1000 + 2000) * 4096 },
		{ name: 'an empty text', text: '', bytes: undefined },
		{
			name: 'a shell error instead of vm_stat',
			text: 'zsh: command not found: vm_stat\n',
			bytes: undefined,
		},
		{
			name: 'no page size in the header',
			text: 'Mach Virtual Memory Statistics:\nPages free: 10000.\nPages inactive: 50000.\n',
			bytes: undefined,
		},
		{
			name: 'a header and no free line',
			text: 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages inactive: 50000.\n',
			bytes: undefined,
		},
		{
			name: 'a free line that is not a number',
			text: 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: lots.\nPages inactive: 5.\n',
			bytes: undefined,
		},
	])('$name -> $bytes', ({ text, bytes }) => {
		expect(parseVmStat({ text })).toBe(bytes)
	})
})

describe('parseMeminfo: MemAvailable in kB', () => {
	it.each([
		{ name: 'a /proc/meminfo', text: MEMINFO, bytes: 8123456 * 1024 },
		{ name: 'an empty text', text: '', bytes: undefined },
		{
			name: 'no MemAvailable line (an old kernel)',
			text: 'MemTotal: 16384000 kB\nMemFree: 1 kB\n',
			bytes: undefined,
		},
		{
			name: 'a MemAvailable that is not a number',
			text: 'MemAvailable: lots kB\n',
			bytes: undefined,
		},
	])('$name -> $bytes', ({ text, bytes }) => {
		expect(parseMeminfo({ text })).toBe(bytes)
	})
})

function machineOf(overrides: Partial<MachineLoad>): MachineLoad {
	return { load: 9.1, cores: 12, available: 6 * GIGABYTE, source: 'vm_stat', ...overrides }
}

describe('shortnessOf: load above twice the cores, memory under 2 GB, unknown memory judged on the load', () => {
	it.each<{ name: string; machine: MachineLoad; expected: Shortness }>([
		{
			name: 'load 31.2 on 12 cores',
			machine: machineOf({ load: 31.2 }),
			expected: { short: true, reasons: ['load 31.2 > 24'], memoryKnown: true },
		},
		{
			name: 'memory 1.6 GB',
			machine: machineOf({ available: Math.round(1.6 * GIGABYTE) }),
			expected: { short: true, reasons: ['memory 1.6 GB < 2 GB'], memoryKnown: true },
		},
		{
			name: 'both: the load first',
			machine: machineOf({ load: 31.2, available: Math.round(1.6 * GIGABYTE) }),
			expected: {
				short: true,
				reasons: ['load 31.2 > 24', 'memory 1.6 GB < 2 GB'],
				memoryKnown: true,
			},
		},
		{
			name: 'the load exactly twice the cores and the memory exactly 2 GB: not short',
			machine: machineOf({ load: 24, available: 2 * GIGABYTE }),
			expected: { short: false, reasons: [], memoryKnown: true },
		},
		{
			name: '2.05e9 bytes is under 2 GB (2 GB is 2 * 1024^3): short',
			machine: machineOf({ available: 2.05e9 }),
			expected: { short: true, reasons: ['memory 1.9 GB < 2 GB'], memoryKnown: true },
		},
		{
			name: 'a quiet machine',
			machine: machineOf({}),
			expected: { short: false, reasons: [], memoryKnown: true },
		},
		{
			name: 'a whole load is written with one decimal, the limit as a whole number',
			machine: machineOf({ load: 25, cores: 12 }),
			expected: { short: true, reasons: ['load 25.0 > 24'], memoryKnown: true },
		},
		{
			name: 'four cores: the limit is 8',
			machine: machineOf({ load: 9, cores: 4 }),
			expected: { short: true, reasons: ['load 9.0 > 8'], memoryKnown: true },
		},
		{
			name: 'memory unknown and a quiet load: not short, never invented, said unknown',
			machine: machineOf({ available: undefined, source: 'unknown' }),
			expected: { short: false, reasons: [], memoryKnown: false },
		},
		{
			name: 'memory unknown and a high load: short on the load alone',
			machine: machineOf({ load: 31.2, available: undefined, source: 'unknown' }),
			expected: { short: true, reasons: ['load 31.2 > 24'], memoryKnown: false },
		},
	])('$name', ({ machine, expected }) => {
		expect(shortnessOf({ machine })).toEqual(expected)
	})
})

type ReadRow = { name: string; seams: MachineSeams; expected: MachineLoad }

const READ_ROWS: ReadRow[] = [
	{
		name: 'macOS: the load, the cores and vm_stat',
		seams: { loadAverage: 3.5, cores: 8, platform: 'darwin', vmStat: () => VM_STAT_16K },
		expected: { load: 3.5, cores: 8, available: 60000 * 16384, source: 'vm_stat' },
	},
	{
		name: 'macOS with no vm_stat: memory unknown, not os.freemem()',
		seams: {
			loadAverage: 3.5,
			cores: 8,
			platform: 'darwin',
			vmStat: () => undefined,
			freeMemory: () => 5 * GIGABYTE,
		},
		expected: { load: 3.5, cores: 8, available: undefined, source: 'unknown' },
	},
	{
		name: 'macOS with a vm_stat that does not parse: memory unknown',
		seams: {
			loadAverage: 3.5,
			cores: 8,
			platform: 'darwin',
			vmStat: () => 'garbage',
			freeMemory: () => 5 * GIGABYTE,
		},
		expected: { load: 3.5, cores: 8, available: undefined, source: 'unknown' },
	},
	{
		name: 'Linux: MemAvailable of /proc/meminfo',
		seams: { loadAverage: 1, cores: 4, platform: 'linux', meminfo: () => MEMINFO },
		expected: { load: 1, cores: 4, available: 8123456 * 1024, source: 'meminfo' },
	},
	{
		name: 'Linux with no readable /proc/meminfo: memory unknown',
		seams: {
			loadAverage: 1,
			cores: 4,
			platform: 'linux',
			meminfo: () => undefined,
			freeMemory: () => 5 * GIGABYTE,
		},
		expected: { load: 1, cores: 4, available: undefined, source: 'unknown' },
	},
	{
		name: 'another platform: os.freemem()',
		seams: { loadAverage: 0.5, cores: 2, platform: 'win32', freeMemory: () => 3 * GIGABYTE },
		expected: { load: 0.5, cores: 2, available: 3 * GIGABYTE, source: 'freemem' },
	},
]

describe('readMachineLoad: the readings through the seams', () => {
	it.each(READ_ROWS)('$name', ({ seams, expected }) => {
		expect(readMachineLoad({ seams })).toEqual(expected)
	})
})
