/** The scratch packages of the type bench's command tests: a dialecte with one version, a fake compiler. */

/** The file each tree commits its fake instantiation count in: the fake compiler prints it for every scenario. */
export const BENCH_COUNT_FILE = 'bench-count.txt'

/** The branch a head commit is made on, off `main`. */
export const HEAD_BRANCH = 'feat/change'

/** The lot of the store-lot cases, and the parent a stacked one names that the store does not hold. */
export const BENCH_LOT_NAME = '0091-demo-bench'
export const MISSING_PARENT_LOT_NAME = '0090-demo-bench-parent'

/** The version a dialecte's definition is generated for: `src/<version>/definition/`. */
export const VERSION = 'v1'

/** The leaf generated constants of a version, as `dialecte coverage` loads them. */
export const CONSTANTS_GENERATED_TEXT = [
	"export const ELEMENT_NAMES = ['Root', 'Item'] as const",
	"export const CHILDREN = { Root: ['Item'], Item: [] } as const",
	"export const SINGLETON_ELEMENTS = ['Root'] as const",
	'',
].join('\n')

/** The leaf generated definition of a version. */
export const DEFINITION_GENERATED_TEXT =
	'export const DEFINITION = { Root: {}, Item: { attributes: { details: { name: { required: true } } } } } as const\n'

/** A constants file the import of fails: its version cannot be loaded. */
export const BROKEN_CONSTANTS_TEXT = 'export const ELEMENT_NAMES = [\n'

/** The committed files of the package, but its count and its generated definition. */
export const PACKAGE_FILES: Readonly<Record<string, string>> = {
	'package.json': `${JSON.stringify({ name: '@dialecte/demo' })}\n`,
	'tsconfig.build.json': '{}\n',
	'.gitignore': ['node_modules', 'benchmarks/types/*/generated', '.bench-*', '.bench-dts', ''].join(
		'\n',
	),
}

/** The arguments of the default install of a base tree whose lock the head's `node_modules` does not install. */
export const INSTALL_ARGS = ['ci', '--ignore-scripts', '--no-audit', '--no-fund']

/** The output of `tsc --version` the fake compiler answers. */
export const COMPILER_VERSION_LINE = 'Version 7.0.2'

/** The mark the compiler an installer puts in a base tree writes in the log, so a run of it is told apart. */
export const OTHER_COMPILER_MARK = 'other-compiler'

/** The folder discovery writes its entry in, under `node_modules`: a file there makes discovery fail. */
export const DISCOVERY_CACHE = 'node_modules/.cache'
