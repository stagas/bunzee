#!/usr/bin/env node

const rollup = require('rollup')
const nodeResolve = require('@rollup/plugin-node-resolve').default
const typescript = require('@rollup/plugin-typescript')
const cleanup = require('rollup-plugin-cleanup')
const terser = require('rollup-plugin-terser').terser
const brotliSize = require('brotli-size').default

const argv = process.argv.slice(2)
const compress =
  (argv.includes('--minify') && argv.splice(argv.indexOf('--minify'), 1))
  || (argv.includes('-m') && argv.splice(argv.indexOf('-m'), 1))

const [input, file] = argv
if (!input || !file) {
  console.error('Usage: bunzee <input> <output> [--minify|-m]')
  process.exit(1)
}
const format = 'es'

const inputOptions = {
  input,
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: false,
      include: ['**/*'],
      compilerOptions: {
        module: 'esnext',
        target: 'esnext',
        moduleResolution: 'node',
        sourceMap: true,
        jsx: 'react-jsx'
      }
    }),
    !compress && cleanup({
      comments: 'none'
    }),
    compress && terser({
      compress: {
        keep_infinity: true,
        pure_getters: true,
        passes: 10,
      },
      format: {
        wrap_func_args: false,
        comments: /^\s*([@#]__[A-Z]+__\s*$|@cc_on)/,
        preserve_annotations: true,
      },
      module: true,
      ecma: 2022,
      toplevel: true,
      mangle: true,
    }),
    ({
      name: 'postprocessing',
      writeBundle(_, bundle) {
        Object.values(bundle).map(({ code, fileName }) => {
          if (code) {
            brotliSize(code).then((size) => {
              console.log('actual:', code.length)
              console.log('brotli:', size)
            }).catch(() => null)
          }
        })
      },
    }),
  ]
}

const outputOptions = {
  file,
  format,
  sourcemap: true
}

async function build() {
  try {
    const bundle = await rollup.rollup(inputOptions)
    await bundle.write(outputOptions)
    console.log('Finished. Output file:', file)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

build()
