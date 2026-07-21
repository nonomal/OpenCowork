/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const grammarManifestPath = fileURLToPath(
  new URL('../src/shared/codegraph-grammars.json', import.meta.url)
)

function requireObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be a non-empty string`)
  }
  return value
}

export function loadGrammarManifest(path = grammarManifestPath) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read grammar manifest ${path}: ${error?.message ?? error}`)
  }

  validateGrammarManifest(manifest)
  return manifest
}

export function validateGrammarManifest(value) {
  const manifest = requireObject(value, 'manifest')
  if (manifest.schemaVersion !== 1) {
    throw new Error(`manifest.schemaVersion must be 1, received ${manifest.schemaVersion}`)
  }

  const source = requireObject(manifest.source, 'manifest.source')
  requireString(source.package, 'manifest.source.package')
  requireString(source.version, 'manifest.source.version')

  const runtime = requireObject(manifest.runtime, 'manifest.runtime')
  const runtimeLibrary = validateLibraryName(runtime.library, 'manifest.runtime.library')

  if (!Array.isArray(manifest.grammars) || manifest.grammars.length === 0) {
    throw new Error('manifest.grammars must be a non-empty array')
  }

  const libraries = new Set([runtimeLibrary])
  const languageIds = new Set()
  for (const [grammarIndex, grammarValue] of manifest.grammars.entries()) {
    const path = `manifest.grammars[${grammarIndex}]`
    const grammar = requireObject(grammarValue, path)
    const library = validateLibraryName(grammar.library, `${path}.library`)
    if (libraries.has(library)) {
      throw new Error(`${path}.library duplicates ${library}`)
    }
    libraries.add(library)

    if (!Array.isArray(grammar.languages) || grammar.languages.length === 0) {
      throw new Error(`${path}.languages must be a non-empty array`)
    }
    for (const [languageIndex, languageValue] of grammar.languages.entries()) {
      const languagePath = `${path}.languages[${languageIndex}]`
      const language = requireObject(languageValue, languagePath)
      const id = requireString(language.id, `${languagePath}.id`)
      if (!/^[a-z][a-z0-9-]*$/.test(id)) {
        throw new Error(`${languagePath}.id is not a valid language id: ${id}`)
      }
      if (languageIds.has(id)) {
        throw new Error(`${languagePath}.id duplicates ${id}`)
      }
      languageIds.add(id)

      const entryPoint = requireString(language.entryPoint, `${languagePath}.entryPoint`)
      if (!/^tree_sitter_[a-z0-9_]+$/.test(entryPoint)) {
        throw new Error(`${languagePath}.entryPoint is invalid: ${entryPoint}`)
      }
    }
  }

  return manifest
}

function validateLibraryName(value, path) {
  const library = requireString(value, path)
  if (!/^tree-sitter(?:-[a-z0-9]+)*$/.test(library)) {
    throw new Error(`${path} is not a portable tree-sitter library base name: ${library}`)
  }
  return library
}

export function requiredGrammarLibraries(manifest) {
  return {
    runtime: manifest.runtime.library,
    grammars: manifest.grammars.map((grammar) => grammar.library)
  }
}

export function nativeLibraryFileName(library, rid) {
  if (/^win-(?:x64|arm64)$/.test(rid)) return `${library}.dll`
  if (/^osx-(?:x64|arm64)$/.test(rid)) return `lib${library}.dylib`
  if (/^linux-(?:x64|arm64)$/.test(rid)) return `lib${library}.so`
  throw new Error(`unsupported CodeGraph grammar RID: ${rid}`)
}

export function resolveGrammarFiles(sourceDir, rid, manifest) {
  const { runtime, grammars } = requiredGrammarLibraries(manifest)
  const expected = [runtime, ...grammars].map((library) => ({
    kind: library === runtime ? 'runtime' : 'grammar',
    library,
    file: nativeLibraryFileName(library, rid)
  }))
  const available = new Set(readdirSync(sourceDir))
  const missing = expected.filter(({ file }) => !available.has(file))
  if (missing.length > 0) {
    throw new Error(
      `missing required ${rid} native libraries: ${missing
        .map(({ kind, library, file }) => `${kind} ${library} (${file})`)
        .join(', ')}`
    )
  }
  return expected
}

function symbolToolCandidates(rid, file) {
  if (rid.startsWith('osx-')) {
    return [
      { command: 'nm', args: ['-gU', file] },
      { command: 'llvm-nm', args: ['--extern-only', '--defined-only', file] },
      { command: 'objdump', args: ['--syms', file] }
    ]
  }
  if (rid.startsWith('linux-')) {
    return [
      { command: 'nm', args: ['-D', '--defined-only', file] },
      { command: 'llvm-nm', args: ['--dynamic', '--extern-only', '--defined-only', file] },
      { command: 'objdump', args: ['-T', file] }
    ]
  }
  if (rid.startsWith('win-')) {
    // Prefer dumpbin / objdump for PE export tables. Do not use llvm-nm here:
    // several CI images ship an llvm-nm that exits 0 on PE DLLs without listing
    // export names, which falsely fails grammar validation.
    return [
      { command: 'dumpbin', args: ['/nologo', '/exports', file] },
      { command: 'objdump', args: ['-p', file] }
    ]
  }
  throw new Error(`unsupported CodeGraph grammar RID: ${rid}`)
}

function readUInt16LE(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) {
    throw new Error(`PE read out of range at ${offset}`)
  }
  return buffer.readUInt16LE(offset)
}

function readUInt32LE(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new Error(`PE read out of range at ${offset}`)
  }
  return buffer.readUInt32LE(offset)
}

function readCString(buffer, offset) {
  if (offset < 0 || offset >= buffer.length) {
    throw new Error(`PE string out of range at ${offset}`)
  }
  let end = offset
  while (end < buffer.length && buffer[end] !== 0) end += 1
  return buffer.subarray(offset, end).toString('utf8')
}

/**
 * Parse PE/COFF export names without external tools.
 * TreeSitter.DotNet ships real PE DLLs; llvm-nm on some Windows runners
 * cannot list those exports even when the entry points are present.
 */
function readPeExportNames(file) {
  const buffer = readFileSync(file)
  if (buffer.length < 0x40 || buffer.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('not a PE image (missing MZ header)')
  }

  const eLfanew = readUInt32LE(buffer, 0x3c)
  if (buffer.toString('ascii', eLfanew, eLfanew + 4) !== 'PE\0\0') {
    throw new Error('not a PE image (missing PE signature)')
  }

  const coffHeader = eLfanew + 4
  const numberOfSections = readUInt16LE(buffer, coffHeader + 2)
  const sizeOfOptionalHeader = readUInt16LE(buffer, coffHeader + 16)
  const optionalHeader = coffHeader + 20
  if (sizeOfOptionalHeader < 96) {
    throw new Error('PE optional header too small for data directories')
  }

  const magic = readUInt16LE(buffer, optionalHeader)
  // PE32 = 0x10b, PE32+ = 0x20b. Export directory is data directory entry 0.
  const exportDirOffset = magic === 0x20b ? optionalHeader + 112 : optionalHeader + 96
  if (exportDirOffset + 8 > optionalHeader + sizeOfOptionalHeader) {
    throw new Error(`unsupported PE optional header magic: 0x${magic.toString(16)}`)
  }

  const exportRva = readUInt32LE(buffer, exportDirOffset)
  if (exportRva === 0) return []

  const sectionTable = optionalHeader + sizeOfOptionalHeader
  const sections = []
  for (let index = 0; index < numberOfSections; index += 1) {
    const offset = sectionTable + index * 40
    sections.push({
      virtualSize: readUInt32LE(buffer, offset + 8),
      virtualAddress: readUInt32LE(buffer, offset + 12),
      sizeOfRawData: readUInt32LE(buffer, offset + 16),
      pointerToRawData: readUInt32LE(buffer, offset + 20)
    })
  }

  const rvaToOffset = (rva) => {
    for (const section of sections) {
      const span = Math.max(section.virtualSize, section.sizeOfRawData)
      if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
        return section.pointerToRawData + (rva - section.virtualAddress)
      }
    }
    throw new Error(`PE RVA 0x${rva.toString(16)} is outside image sections`)
  }

  const exportDirectory = rvaToOffset(exportRva)
  const numberOfNames = readUInt32LE(buffer, exportDirectory + 24)
  const addressOfNames = readUInt32LE(buffer, exportDirectory + 32)
  const names = []
  for (let index = 0; index < numberOfNames; index += 1) {
    const nameRva = readUInt32LE(buffer, rvaToOffset(addressOfNames) + index * 4)
    names.push(readCString(buffer, rvaToOffset(nameRva)))
  }
  return names
}

function inspectNativeSymbols(file, rid) {
  const attempts = []

  // Windows PE: parse the export directory in-process first. This is the only
  // reliable path on GitHub windows-11-arm runners where dumpbin is absent and
  // llvm-nm returns an empty symbol table for TreeSitter.DotNet DLLs.
  if (rid.startsWith('win-')) {
    try {
      const exports = readPeExportNames(file)
      return {
        tool: 'pe-export-table',
        output: exports.join('\n'),
        symbols: new Set(exports)
      }
    } catch (error) {
      attempts.push(`pe-export-table: ${error?.message ?? error}`)
    }
  }

  for (const candidate of symbolToolCandidates(rid, file)) {
    const result = spawnSync(candidate.command, candidate.args, {
      encoding: 'utf8',
      windowsHide: true
    })
    if (result.error?.code === 'ENOENT') {
      attempts.push(`${candidate.command}: not found`)
      continue
    }
    if (result.error) {
      attempts.push(`${candidate.command}: ${result.error.message}`)
      continue
    }
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim()
      attempts.push(`${candidate.command}: ${detail}`)
      continue
    }
    return { tool: candidate.command, output: `${result.stdout}\n${result.stderr}` }
  }

  const tools = [
    ...(rid.startsWith('win-') ? ['pe-export-table'] : []),
    ...symbolToolCandidates(rid, file).map(({ command }) => command)
  ].join(', ')
  throw new Error(
    `cannot inspect exports for ${file} (${rid}); install one of: ${tools}. ` +
      `Attempts: ${attempts.join('; ')}`
  )
}

function hasExportedSymbol(symbols, entryPoint) {
  if (symbols.symbols instanceof Set) {
    return symbols.symbols.has(entryPoint) || symbols.symbols.has(`_${entryPoint}`)
  }
  const escaped = entryPoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^A-Za-z0-9_])_?${escaped}(?:$|[^A-Za-z0-9_])`, 'm').test(
    symbols.output
  )
}

export function validateGrammarEntryPoints(sourceDir, rid, manifest) {
  const files = resolveGrammarFiles(sourceDir, rid, manifest)
  const filesByLibrary = new Map(files.map((file) => [file.library, file]))
  const inspected = []

  for (const grammar of manifest.grammars) {
    const nativeLibrary = filesByLibrary.get(grammar.library)
    const file = join(sourceDir, nativeLibrary.file)
    const symbols = inspectNativeSymbols(file, rid)
    const entryPoints = [...new Set(grammar.languages.map((language) => language.entryPoint))]
    const missing = entryPoints.filter((entryPoint) => !hasExportedSymbol(symbols, entryPoint))
    if (missing.length > 0) {
      throw new Error(
        `grammar ${grammar.library} (${nativeLibrary.file}) does not export ` +
          `${missing.join(', ')}; inspected with ${symbols.tool}`
      )
    }
    inspected.push({
      library: grammar.library,
      file: nativeLibrary.file,
      entryPoints,
      tool: symbols.tool
    })
  }

  return inspected
}
