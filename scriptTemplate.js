// template to form scripts with
const _ = require('lodash')

module.exports = ({ scriptName } = {}) => {
  // Build out the script with what we got in the CLI
  const cameledName = _.camelCase(scriptName)
  const className = _.upperFirst(cameledName)
  const instanceName = cameledName
  // may not need
  // if (className === instanceName) throw new Error('Please use camelCase style for script name')
  return `
/* Bee script generated template
Some tips to follow:
  1) Make your script idempotent!
  2) Use console.log() (or any stdout printer) to capture important info
  3) Use some form of a "run" flag do actually do work (support dryruns)
  4) Fill out the description and arguments list so people know what this script does and how to use it!
*/

class ${className} {
  static get descriptors () {
    this.description = ''
    this.args = {
      // Describe arguments here like "--run: 'commits work as finalized
    }
  }

  async run () {

  }
}

const ${cameledName} = new ${className}();

(async function () {
  // If run from the command line/externally then just run it
  if (require.main === module) {
    await ${instanceName}.run()
    process.exit(0) // Success
  // Otherwise export it (helps with testing)
  } else {
    module.exports = ${className}
  }
})()
`
}
