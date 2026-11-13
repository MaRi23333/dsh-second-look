import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const [pack] = JSON.parse(await readFile(process.argv[2], 'utf8'))
assert.equal(pack.name, manifest.name)
assert.equal(pack.version, manifest.version)
const paths = new Set(pack.files.map(file => file.path))
for (const file of paths) {
  assert(file === 'package.json' || manifest.files.some(root => file === root || file.startsWith(`${root}/`)), `Unexpected packed file: ${file}`)
  assert(!/(^|\/)(?:node_modules|\.git|HANDOFF\.md|\.env(?:\.|$))/.test(file), `Internal file in package: ${file}`)
}
for (const required of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'cordis.patch.yml', 'README.md', 'README.en.md', 'assets/brand/logo.png', 'assets/readme/hero.png', 'LICENSE', 'THIRD-PARTY-SOURCES.md']) {
  assert(paths.has(required), `Missing packed file: ${required}`)
}
console.log(`Verified ${pack.name}@${pack.version}: ${paths.size} files`)
