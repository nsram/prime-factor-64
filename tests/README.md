# Prime Factor 64 and Fog Sweep 64 tests

Use Node 24 LTS. The browser suite runs the real static games on loopback under
the same path prefix used by GitHub Pages.

```sh
npm ci
npx playwright install chromium
npm test
```

Once the browser and dependencies are installed, the suite runs offline.
`npm run test:unit` runs the Node contracts. `npm run test:browser -- --grep P05`
runs the two navigation-during-save checks. Browser failures retain traces.
Use `PF64_CHROMIUM_PATH` only when selecting a separately installed Chromium.
`PF64_TEST_PORT` overrides the loopback port.

## What is checked

- A01–A07 exercise the independent deck and actual browser dealers. The fact
  fixture was enumerated by factoring each candidate product within the
  allowed range, adding the eight square cards and 17 × 21, and cross-checking
  the result table and alternate pairs in the published Prime Factor history.
  The Easy fixture transcribes the approved board table. Strategy predicates
  validate the assignments in one direction because they overlap.
- G01–G13 and L01–L07 cover gameplay, timing, controls, practice and learning.
  Full-run helpers use DOM click events to keep the cases fast. Dedicated
  interaction checks use real pointer, keyboard and touch actions.
- P01–P11 cover browser storage, the shared store contract, native-lock
  contention and failure injection. Store tests use a small isolated VM.
  The multi-tab tests hold a real Chromium lock and synchronize on observable
  outbox keys or lock requests.
- H01 compares the latest recorded game-source line counts and SHA-256 values,
  including the shared script checksums. Earlier snapshots remain historical
  records.

The approved behavioral baseline is
[`f14a00c758c8fed76100d1f309e8a2f6814bb34e`](https://github.com/nsram/prime-factor-64/commit/f14a00c758c8fed76100d1f309e8a2f6814bb34e).
Test names include the [Stage 1 matrix IDs](../docs/test-suite-spec.md). P10 and the raw snapshot case in L07
are opt-in diagnostics. To observe the open cases, run the following.

```sh
PF64_DIAGNOSTICS=1 node --test --test-name-pattern=P10 tests/unit/diagnostics.test.mjs
PF64_DIAGNOSTICS=1 npm run test:browser -- --grep 'P10|Q04'
```

Use manual checks for audible output, real screen readers, and mobile Safari.
Browser eviction, crash recovery beyond successful staging, and support for
parallel writers without Web Locks are outside the CI guarantees.

## Targeted mutations

```sh
npm run test:mutations
npm run test:mutations -- M16 M17 M18
```

Each recipe applies one defect in a disposable copy. The runner requires the
assigned detector to fail at its expected assertion. Startup errors and
unrelated failures do not count. The app sources in the checkout must match
its commit. Recipes use a separate loopback port, configurable through
`PF64_MUTATION_PORT`. The browser tests in this exercise use one worker.

The [initial validation record](validation.md) lists the mutation outcomes and
observed policy boundaries.

The CI workflow runs Node and Chromium on pull requests and pushes to main.
You can also start the Tests workflow manually from GitHub Actions.
Mutations and diagnostics remain separate commands. Prioritize correctness
of the arithmetic, learner progress, and meaningful defect detection over
a percentage coverage target.
