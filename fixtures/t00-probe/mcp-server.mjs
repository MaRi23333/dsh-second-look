// Minimal MCP stdio server (no dependencies) — T00 test fixture.
// Speaks newline-delimited JSON-RPC 2.0 over stdio with one tool `echo`
// that appends one line to the fixture log so executions can be counted.
import { createInterface } from 'node:readline'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOG = fileURLToPath(new URL('../../.t00/markers/mcp-echo.log', import.meta.url))

function log (line) {
  try {
    mkdirSync(dirname(LOG), { recursive: true })
    appendFileSync(LOG, line + '\n')
  } catch { /* fixture logging is best-effort */ }
}

function send (payload) {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

const rl = createInterface({ input: process.stdin })

rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const { id, method, params } = msg
  if (id === undefined) return // notification (e.g. notifications/initialized)
  switch (method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: (params && params.protocolVersion) || '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 't00-mcp', version: '0.0.0' }
        }
      })
      return
    case 'ping':
      send({ jsonrpc: '2.0', id, result: {} })
      return
    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [{
            name: 'echo',
            description: 'Echo a message and append one log line (T00 fixture).',
            inputSchema: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message']
            }
          }]
        }
      })
      return
    case 'tools/call': {
      const message = String((params && params.arguments && params.arguments.message) != null ? params.arguments.message : '')
      log(`${new Date().toISOString()} echo ${message}`)
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `echo: ${message}` }] }
      })
      return
    }
    default:
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${String(method)}` } })
  }
})

log(`${new Date().toISOString()} server-start pid=${process.pid}`)
