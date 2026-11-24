// @ts-check
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const mainDir = path.resolve(import.meta.dirname, '..')
const pkgDir = path.join(mainDir, 'node_modules', 'electron-overlay-window')
if (!fs.existsSync(pkgDir)) {
  process.exit(0)
}

const nodeInclude = path.resolve(path.dirname(process.execPath), '..', 'include', 'node')
if (!fs.existsSync(path.join(nodeInclude, 'node_api.h'))) {
  console.warn(`[rebuild-overlay-mac] Node headers not found at ${nodeInclude}, skipping native rebuild.`)
  process.exit(0)
}

const archTargets = [
  { arch: 'arm64', dir: 'darwin-arm64' },
  { arch: 'x86_64', dir: 'darwin-x64' }
]

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-window-mac-'))
try {
  for (const target of archTargets) {
    const outDir = path.join(pkgDir, 'prebuilds', target.dir)
    if (!fs.existsSync(outDir)) continue

    const outFile = path.join(outDir, 'electron-overlay-window.node')
    const buildDir = path.join(tmpRoot, target.arch)
    fs.mkdirSync(buildDir, { recursive: true })

    const includeArgs = [`-I${nodeInclude}`, `-I${path.join(pkgDir, 'src', 'lib')}`]
    const cSources = ['addon.c', 'napi_helpers.c']
    const mmSources = ['mac.mm', path.join('mac', 'OWFullscreenObserver.mm')]
    const objects = []

    for (const src of cSources) {
      const obj = path.join(buildDir, `${path.basename(src, '.c')}.o`)
      execFileSync('clang', [
        '-arch', target.arch, '-O2', '-std=c99', '-Wall', '-fPIC',
        ...includeArgs,
        '-c', path.join(pkgDir, 'src', 'lib', src),
        '-o', obj
      ], { stdio: 'inherit' })
      objects.push(obj)
    }

    for (const src of mmSources) {
      const obj = path.join(buildDir, `${path.basename(src, '.mm')}.o`)
      execFileSync('clang++', [
        '-arch', target.arch, '-O2', '-std=c++17', '-fobjc-arc', '-Wall', '-fPIC',
        ...includeArgs,
        '-c', path.join(pkgDir, 'src', 'lib', src),
        '-o', obj
      ], { stdio: 'inherit' })
      objects.push(obj)
    }

    execFileSync('clang++', [
      '-arch', target.arch, '-bundle', '-undefined', 'dynamic_lookup',
      ...objects,
      '-lpthread', '-framework', 'AppKit', '-framework', 'ApplicationServices',
      '-o', outFile
    ], { stdio: 'inherit' })
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}
