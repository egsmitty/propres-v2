const { existsSync } = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

module.exports = async function afterPack(context) {
  if (process.platform !== 'darwin') {
    return
  }

  const appBundlePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  if (!existsSync(appBundlePath)) {
    return
  }

  const result = spawnSync('xattr', ['-cr', appBundlePath], {
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    throw new Error(`Failed to clear extended attributes for ${appBundlePath}`)
  }
}
