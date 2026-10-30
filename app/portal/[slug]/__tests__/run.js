/* eslint-disable @typescript-eslint/no-require-imports */
// Plain-node test runner for the portal metrics module. No test framework is
// installed, so this registers a tiny TypeScript require hook (using the
// project's own `typescript` package) and runs every *.test.ts in this folder
// with node:test.
//
//   node "app/portal/[slug]/__tests__/run.js"

const fs = require('fs')
const path = require('path')
const Module = require('module')
const ts = require('typescript')

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React }
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (mod, filename) => {
    const src = fs.readFileSync(filename, 'utf8')
    const { outputText } = ts.transpileModule(src, { compilerOptions, fileName: filename })
    mod._compile(outputText, filename)
  }
}

for (const f of fs.readdirSync(__dirname)) {
  if (f.endsWith('.test.ts')) require(path.join(__dirname, f))
}
