/**
 * The program behind a fake `gh`: `fake-gh-router.ts <answers folder> <absent first words, comma-separated> <gh's argv…>`
 * answers from the files `host:refresh` saves (one per describe call):
 * - `<words>.help.txt` for `gh <words> --help`, on stdout;
 * - `<words>.fields.txt` for `gh <words> --json`, on stderr, exit 1 (as gh lists its fields);
 * - `graphql.<Type>.txt` for `gh api graphql -f query=…__type(name:"<Type>")…`, on stdout;
 * - `versions.cli.txt` for `gh --version`, and `versions.<part>.txt` for `gh <part> --version`, on stdout.
 * `<words>` are joined by `-`. An absent first word answers as gh does for an extension that is not installed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [answers = '', absent = '', ...argv] = process.argv.slice(2)

/** The file that answers `argv`, and the stream and exit code it answers with. */
function routeOf(): { file: string; stream: 'stdout' | 'stderr'; code: number } | undefined {
	const last = argv.at(-1)
	const words = argv.filter((word) => !word.startsWith('-'))
	const introspected = /__type\(name:\s*"(\w+)"\)/.exec(argv.join(' '))
	if (argv[0] === 'api' && argv[1] === 'graphql' && introspected) {
		return { file: `graphql.${introspected[1]}.txt`, stream: 'stdout', code: 0 }
	}
	if (last === '--version') {
		return { file: `versions.${words[0] ?? 'cli'}.txt`, stream: 'stdout', code: 0 }
	}
	if (last === '--help') return { file: `${words.join('-')}.help.txt`, stream: 'stdout', code: 0 }
	if (last === '--json') return { file: `${words.join('-')}.fields.txt`, stream: 'stderr', code: 1 }
	return undefined
}

const first = argv.find((word) => !word.startsWith('-'))
if (first !== undefined && absent.split(',').includes(first)) {
	process.stderr.write(`unknown command "${first}" for "gh"\n`)
	process.exit(1)
}
const route = routeOf()
if (!route) {
	process.stderr.write(`fake gh: no answer for: ${argv.join(' ')}\n`)
	process.exit(2)
}
const file = join(answers, route.file)
if (!existsSync(file)) {
	process.stderr.write(`fake gh: no fixture ${route.file}\n`)
	process.exit(3)
}
process[route.stream].write(readFileSync(file, 'utf8'))
process.exit(route.code)
