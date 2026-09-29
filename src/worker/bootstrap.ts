/**
 * Worker entry point. Loads .env via @next/env (the same parser the Next.js
 * app uses) BEFORE index.ts's imports run, then hands off to index.ts.
 *
 * Why not load env directly inside index.ts? `import` statements are hoisted
 * above other top-level code by esbuild/tsx even when compiling to CommonJS,
 * so any loadEnvConfig() call inside index.ts would run AFTER its own
 * imports (including env.ts) had already executed and failed. The explicit
 * require() below is a real function call, not an import, so it isn't hoisted.
 *
 * Why @next/env and not Node's --env-file flag? The two parsers disagree on
 * values containing `$` — Next's parser performs shell-style ${VAR}
 * expansion, Node's does not. Using the same loader as the main app avoids
 * the two processes reading the same secret two different ways.
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

require("./index");
