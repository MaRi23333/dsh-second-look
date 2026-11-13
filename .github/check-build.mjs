import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const baseline = join(process.env.RUNNER_TEMP ?? tmpdir(), 'second-look-build-baseline.json')
async function files(dir, prefix = '') {
  const result = {}
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`
    if (entry.isDirectory()) Object.assign(result, await files(join(dir, entry.name), `${relative}/`))
    else result[relative] = (await readFile(join(dir, entry.name))).toString('base64')
  }
  return result
}
// Only bundled Zod source comments may contain a build-directory prefix.
function normalizeIndex(bytes) {
  return Buffer.from(bytes, 'base64').toString('utf8')
    .replace(/^\/\/ (?:\.\.\/)*plugins\/dsh-second-look\/(node_modules\/[^\r\n]*zod[^\r\n]*)$/gm, '// $1')
}
// Git checks source files out with LF, while a local build can embed CRLF in
// sourcesContent. Keep mappings and every other source-map field unchanged.
function normalizeClientMap(bytes) {
  const map = JSON.parse(Buffer.from(bytes, 'base64').toString('utf8'))
  return {
    ...map,
    sourcesContent: map.sourcesContent.map(source => source?.replaceAll('\r\n', '\n') ?? source),
  }
}
const actual = await files('lib')
if (process.argv[2] === 'save') {
  await mkdir(process.env.RUNNER_TEMP ?? tmpdir(), { recursive: true })
  await writeFile(baseline, JSON.stringify(actual))
} else if (process.argv[2] === 'verify') {
  const expected = JSON.parse(await readFile(baseline, 'utf8'))
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), 'lib file list changed')
  for (const name of Object.keys(expected)) {
    if (actual[name] === expected[name]) continue
    if (name === 'client.js.map') {
      assert.deepEqual(normalizeClientMap(actual[name]), normalizeClientMap(expected[name]), 'client.js.map differs beyond embedded-source line endings')
      continue
    }
    assert.equal(name, 'index.js', `Generated artifact differs: ${name}`)
    assert.equal(normalizeIndex(actual[name]), normalizeIndex(expected[name]), 'index.js differs beyond Zod path comments')
  }
  console.log(`Verified ${Object.keys(actual).length} build artifacts`)
} else throw new Error('Usage: node .github/check-build.mjs save|verify')
