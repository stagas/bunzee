const rollup = require('rollup')
const commonjs = require('@rollup/plugin-commonjs')
const json = require('@rollup/plugin-json')
const nodeResolve = require('@rollup/plugin-node-resolve').default
const sourcemaps = require('rollup-plugin-sourcemaps')
const typescript = require('@rollup/plugin-typescript')
const terser = require('rollup-plugin-terser').terser
const { createFilter } = require('@rollup/pluginutils')
const bufferToDataUrl = require('buffer-to-data-url').default
const MagicString = require('magic-string')
const path = require('path')

const { getCode, terserOptions, tsOptions } = require('./')

module.exports = function({ include, exclude } = {}) {
  const filter = createFilter(include, exclude)

  return {
    async transform(code, id) {
      if (!filter(id))
        return

      const matches = [
        ...code.matchAll(/addModule\((new URL\((?:'|")([^'"]+)(?:'|"),\s*import\.meta\.url\)(\.href)?\))/g),
      ]

      if (matches.length) {
        const s = new MagicString(code)

        for (const match of matches) {
          const start = match.index
          const [str, , pathname] = match

          const bundle = await rollup.rollup({
            input: path.join(path.dirname(id), pathname),
            plugins: [
              json(),
              commonjs(),
              nodeResolve(),
              typescript(tsOptions),
              sourcemaps(),
              terser(terserOptions),
            ],
          })
          const chunks = await bundle.generate({
            format: 'es',
            sourcemap: 'inline',
          })
          const buffer = Buffer.from(getCode(chunks))
          const dataUrl = bufferToDataUrl('application/javascript', buffer)

          s.overwrite(
            start,
            start + str.length,
            `addModule("${dataUrl}")`
          )
        }

        return {
          code: s.toString(),
          map: s.generateMap({ source: id }),
        }
      }
    },
  }
}
