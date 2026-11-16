### Fixed

- The test suite's git starts no background maintenance (a commit, fetch, pull or push started a detached `git maintenance` that could write into a test's folder after the test removed it), and the suite's temporary-folder guard names, for each leftover, the test that made it, the first paths it holds and the processes still holding it.
