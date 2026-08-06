import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'

const workspaceRoot = resolve(import.meta.dirname, '../..')
const outputRoot = resolve(workspaceRoot, 'test-results/autofit-production')
const slidevCli = resolve(workspaceRoot, 'node_modules/@slidev/cli/bin/slidev.mjs')
const fixture = resolve(workspaceRoot, 'tests/fixtures/autofit.md')
const port = Number(process.env.AUTOFIT_PRODUCTION_PORT ?? 4174)

rmSync(outputRoot, { force: true, recursive: true })

const build = spawnSync(
  process.execPath,
  [slidevCli, 'build', fixture, '--base', '/', '--out', outputRoot],
  {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  },
)
if (build.error)
  throw build.error
if (build.status !== 0)
  process.exit(build.status ?? 1)

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  const relativePath = requestPath.replace(/^[/\\]+/, '')
  const candidate = normalize(join(outputRoot, relativePath))
  const insideOutput = candidate === outputRoot || candidate.startsWith(`${outputRoot}${sep}`)
  const file = insideOutput && existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(outputRoot, 'index.html')

  response.setHeader('Content-Type', mimeTypes.get(extname(file)) ?? 'application/octet-stream')
  createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1', () => {
  console.log(`Production autofit fixture listening on http://127.0.0.1:${port}`)
})
