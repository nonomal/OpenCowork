import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const projectPath = join(
  repoRoot,
  'sidecars',
  'OpenCowork.Native.Worker',
  'OpenCowork.Native.Worker.csproj'
)
const outputDir = join(repoRoot, 'resources', 'native-worker')
const tempOutputDir = mkdtempSync(join(tmpdir(), 'open-cowork-native-worker-'))
const nugetSource = process.env.OPEN_COWORK_NUGET_SOURCE || 'https://nuget.azure.cn/v3/index.json'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function currentRid() {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'darwin') return arch === 'arm64' ? 'osx-arm64' : 'osx-x64'
  if (platform === 'win32') return arch === 'arm64' ? 'win-arm64' : 'win-x64'
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64'
  throw new Error(`Unsupported native worker platform: ${platform}/${arch}`)
}

mkdirSync(tempOutputDir, { recursive: true })

const result = spawnSync(
  'dotnet',
  [
    'publish',
    projectPath,
    '-c',
    'Release',
    '-r',
    process.env.OPEN_COWORK_NATIVE_WORKER_RID || currentRid(),
    '--source',
    nugetSource,
    '-o',
    tempOutputDir,
    '/p:PublishAot=true',
    '/p:StripSymbols=true'
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit'
  }
)

if (result.status !== 0) {
  rmSync(tempOutputDir, { recursive: true, force: true })
  process.exit(result.status ?? 1)
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })
cpSync(tempOutputDir, outputDir, { recursive: true })

// The .dSYM bundle is crash-symbolication debug info (StripSymbols moves DWARF
// there) — never loaded at runtime, and resources/** ships into the installer, so
// leaving it here bloats the package by the dSYM's full size. Keep it only when
// archiving symbols for a release (OPEN_COWORK_KEEP_DSYM=1).
if (process.env.OPEN_COWORK_KEEP_DSYM !== '1') {
  for (const entry of ['OpenCowork.Native.Worker.dSYM', 'OpenCowork.Native.Worker.dbg', 'OpenCowork.Native.Worker.pdb']) {
    rmSync(join(outputDir, entry), { recursive: true, force: true })
  }
}

// Bundle CodeGraph tree-sitter grammars beside the worker (<out>/grammars): the
// source-merged CodeGraph engine loads them via OPEN_COWORK_CODEGRAPH_GRAMMARS_DIR
// or the beside-binary fallback. Source: the TreeSitter.DotNet NuGet native dir
// (WS-A CI replaces this per-RID once the full matrix ships).
try {
  const os = await import('node:os')
  const grammarsSrc = join(
    os.homedir(),
    '.nuget/packages/treesitter.dotnet/1.3.0/runtimes',
    process.env.OPEN_COWORK_NATIVE_WORKER_RID || currentRid(),
    'native'
  )
  const grammarsOut = join(outputDir, 'grammars')
  // Copy ONLY the grammars our registry actually binds (the NuGet dir also ships
  // agda/ql/verilog/html/css/json/... — ~25 MB of dead weight otherwise).
  const SUPPORTED = new Set([
    'libtree-sitter', 'libtree-sitter-typescript', 'libtree-sitter-tsx',
    'libtree-sitter-javascript', 'libtree-sitter-python', 'libtree-sitter-go',
    'libtree-sitter-java', 'libtree-sitter-c-sharp', 'libtree-sitter-rust',
    'libtree-sitter-c', 'libtree-sitter-cpp', 'libtree-sitter-php',
    'libtree-sitter-ruby', 'libtree-sitter-scala', 'libtree-sitter-bash',
    'libtree-sitter-haskell', 'libtree-sitter-julia', 'libtree-sitter-razor',
    'libtree-sitter-lua'
  ])
  const { readdirSync: rdir } = await import('node:fs')
  mkdirSync(grammarsOut, { recursive: true })
  let copied = 0
  for (const f of rdir(grammarsSrc)) {
    const base = f.replace(/\.(dylib|so|dll)$/i, '')
    if (!SUPPORTED.has(base)) continue
    cpSync(join(grammarsSrc, f), join(grammarsOut, f))
    copied++
  }
  console.log(`[publish-native-worker] bundled ${copied} grammars -> ${grammarsOut}`)
} catch (err) {
  console.warn('[publish-native-worker] grammar bundling skipped:', err?.message ?? err)
}
rmSync(tempOutputDir, { recursive: true, force: true })
