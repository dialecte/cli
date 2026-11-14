import type { ScannerSample, WriterException } from './print-boundary-scan.types.ts'

/** The module that owns the escape and the writers: every other production file prints through it. */
export const PRINT_MODULE_PATH = 'src/lib/print/'

/** A line of a script's console being swapped: an assignment to a console method, never a call. */
const CONSOLE_SWAP_PATTERN = /^\s*console\.(?:log|info|warn|error|debug)\s*=[^=]/

/**
 * The places that may touch a stream or a console themselves, each with its reason. A file exception covers the whole
 * file; one with a line pattern covers only the lines that match it, so a write beside it still fails the guard.
 */
export const WRITER_EXCEPTIONS: readonly WriterException[] = [
	{
		path: PRINT_MODULE_PATH,
		reason:
			'the one writer: it escapes every text it prints and is the only code that writes the streams',
	},
	{
		path: 'src/lib/print/relayed.ts',
		reason:
			"a writer like the print module: it relays the cli's own child output, keeping its colour sequences and escaping every other control",
	},
	{
		path: 'src/commands/run.ts',
		linePattern: CONSOLE_SWAP_PATTERN,
		reason:
			"a script's own console is swapped and put back while it runs: the output is the person's script, not the cli's text (the outcome run.ts prints itself goes through the boundary)",
	},
	{
		path: 'src/lib/progress/process-live-output.ts',
		reason:
			'hands the live progress renderer the process stream: the renderer writes terminal control sequences on purpose and sanitises its values in terminal-text.ts',
	},
	{
		path: 'src/commands/standard.ts',
		linePattern: /createStreamLiveOutput\(process\.stderr\)/,
		reason: 'hands the live progress renderer the error stream, as above',
	},
	{
		path: 'src/commands/ask.ts',
		linePattern: /createStreamLiveOutput\(process\.stderr\)/,
		reason: 'hands the live progress renderer the error stream, as above',
	},
	{
		path: 'src/commands/worktree.ts',
		linePattern: /createInterface\(\{[^}]*output:\s*process\.stdout/,
		reason:
			'the confirmation prompt of `worktree prune --yes` is written by readline on the terminal, a question the person answers',
	},
	{
		path: 'src/commands/skills.ts',
		linePattern: /output:\s*process\.stdout/,
		reason:
			'the interactive prompt of `skills sync` is written by the prompt library on the terminal, a question the person answers',
	},
]

/** A console print or a console reached by bracket access. */
export const CONSOLE_PATTERN = /\bconsole\s*(?:\.\s*(?:log|info|warn|error|debug)\b|\[)/

/** A reference to `process.stdout` or `process.stderr`, dot or bracket access. */
export const STREAM_REFERENCE_PATTERN =
	/\bprocess\s*(?:\.\s*std(?:out|err)\b|\[\s*['"`]std(?:out|err)['"`]\s*\])/

/** What stays allowed of a stream reference: read-only terminal properties. */
export const READ_ONLY_STREAM_PATTERN = /\bprocess\.std(?:out|err)\.(?:isTTY|columns|rows)\b/g

/** The descriptor read, allowed unless the line passes it to a synchronous write. */
export const STREAM_DESCRIPTOR_PATTERN = /\bprocess\.std(?:out|err)\.fd\b/g

/** A synchronous write, which a descriptor must not be passed to. */
export const SYNCHRONOUS_WRITE_PATTERN = /\bwriteSync\b/

/** A stream taken out of `process` by destructuring or by an import. */
export const STREAM_TAKEN_PATTERN =
	/\b(?:const|let|var)\s*\{[^}]*\bstd(?:out|err)\b[^}]*\}\s*=\s*process\b|\bimport\s*\{[^}]*\bstd(?:out|err)\b[^}]*\}\s*from\s*['"](?:node:)?process['"]/

/** A line that holds only a comment (a line comment, a block's opening or inner line). */
export const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*)/

/** The file name suffix of a test: tests are not production code. */
export const TEST_FILE_SUFFIX = '.test.ts'

/** The lines the scanner is checked on: what it must flag and what it must leave alone, one per form. */
export const SCANNER_SAMPLES: readonly ScannerSample[] = [
	{ line: 'console.log(text)', flagged: true },
	{ line: '\tconsole.info(text)', flagged: true },
	{ line: 'if (failed) console.warn(message)', flagged: true },
	{ line: 'console.error(error instanceof Error ? error.message : error)', flagged: true },
	{ line: 'console.debug(value)', flagged: true },
	{ line: "console['log'](text)", flagged: true },
	{ line: 'process.stdout.write(`${text}\\n`)', flagged: true },
	{ line: 'process.stderr.write(chunk)', flagged: true },
	{ line: 'const live = createStreamLiveOutput(process.stdout)', flagged: true },
	{ line: 'createInterface({ input: process.stdin, output: process.stdout })', flagged: true },
	{ line: "const out = process['stdout']", flagged: true },
	{ line: 'const { stdout } = process', flagged: true },
	{ line: 'const { stdout: out, stderr } = process', flagged: true },
	{ line: "import { stdout } from 'node:process'", flagged: true },
	{ line: 'writeSync(process.stdout.fd, text)', flagged: true },
	{ line: 'const write = process.stderr.write.bind(process.stderr)', flagged: true },
	{ line: '// console.log(text) once printed here', flagged: false },
	{ line: ' * process.stdout.write is the only writer', flagged: false },
	{ line: 'const consoleLogged = true', flagged: false },
	{ line: 'console.table(rows)', flagged: false },
	{ line: 'printOut({ stream: "stdout", text })', flagged: false },
	{ line: 'const colour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR', flagged: false },
	{
		line: 'const width = process.stdout.isTTY ? process.stdout.columns : undefined',
		flagged: false,
	},
	{ line: 'const height = process.stdout.rows', flagged: false },
	{ line: 'const tty = isatty(process.stdout.fd)', flagged: false },
	{ line: 'const input = process.stdin.isTTY', flagged: false },
]
