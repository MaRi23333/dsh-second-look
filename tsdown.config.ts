/**
 * Build faces for `dsh-second-look`: the Host node half and the Client
 * settings-panel half (部署后补 — in-client `settings.section`, fork
 * `dsh-heavy-approval` tsdown pattern; see THIRD-PARTY-SOURCES.md).
 */
import { defineConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-second-look'

export default defineConfig([
  {
    name: PLUGIN_ID,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    // ESM output under a "type": "module" package must land on .js, not .mjs.
    fixedExtension: false,
    deps: {
      // Every @deepseek-ai peer resolves at runtime from the host profile.
      neverBundle: [/^node:/, /^@deepseek-ai\//],
      // zod is a non-peer dependency: bundle it so the node face
      // stays self-contained when a profile resolves the package outside
      // pnpm's tree.
      alwaysBundle: ['zod'],
      onlyBundle: ['zod'],
    },
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'neutral',
    inputOptions: { platform: 'browser' },
    target: 'es2023',
    dts: false,
    clean: false,
    sourcemap: true,
    deps: {
      // React and the loader's platform modules come from the browser module
      // table (packages/client/web/src/platform.ts) — never bundle a copy.
      neverBundle: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-client-ui-slots',
        '@deepseek-ai/dsh-client-web-react',
        '@deepseek-ai/dsh-client-ui-primitives',
        '@deepseek-ai/dsh-client-ui-attachment',
        '@deepseek-ai/dsh-client-schema-form',
      ],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
