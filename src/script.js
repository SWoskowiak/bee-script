const db = require('./db')
const { cancel } = require('./utils')
const { green, red, cyan } = require('kleur')
const _ = require('lodash')
const prompts = require('prompts')
const path = require('path')
const fs = require('fs')
const { fork } = require('child_process')
const scriptGenerator = require('../src/scriptTemplate')

class Script {
  constructor () {
    this.noteLimit = 50
  }

  trimExtension (fileName) {
    const fName = fileName.split('.')
    if (fName.length > 1) fName.pop() // Remove extension
    return fName.join('.')
  }

  async make (args) {
    const name = args[0]
    if (!name) throw new Error('Must provide a script name! EX: bee script:make myNewScript')
    const scriptPath = path.join(process.cwd(), `${this.trimExtension(name)}.js`)
    const scriptName = path.basename(scriptPath)
    const newScript = scriptGenerator({ scriptName: this.trimExtension(scriptName) })
    fs.writeFileSync(scriptPath, newScript)
    console.log(`${cyan(scriptName)} was created!`)
  }

  async run (args, argv) {
    const scriptPath = args[0]
    if (!scriptPath || scriptPath === '') {
      console.error(red('Specify a script to run EX: bee run ./app/scripts/doWork.js'))
      cancel()
    }
    const fullPath = path.join(process.cwd(), scriptPath)
    if (!fs.existsSync(fullPath)) {
      console.error(red(fullPath), 'not found or improper permissions')
      cancel()
    }
    const fileName = path.basename(fullPath) // Grab the file name for storing

    // Run notes (optional)
    const runNote = await prompts({
      type: 'text',
      name: 'value',
      message: 'Notes about this run(optional)',
      validate: value => value.length > this.noteLimit ? `Note limit is ${this.noteLimit} characters (entered ${value.length})` : true
    }, { onCancel: cancel })

    const rawArgs = _.clone(process.argv)
    rawArgs.splice(0, 4)

    const [runID] = await db.knex('bee_script_runs').insert({ name: fileName, note: runNote.value, execution_args: rawArgs.join(' ') }).returning('id')
    const scriptProcess = fork(fullPath, [...rawArgs], { silent: true })

    const startTime = process.hrtime()

    let outputID = null
    let output = null
    // Await script completion
    return new Promise((resolve, reject) => {
      // listen for errors as they may prevent the exit event from firing
      scriptProcess.on('error', async err => {
        console.log(`Error! Spawn failed: ${err}`)
        reject(err)
      })

      scriptProcess.stdout.on('data', data => {
        output = `${output ? output + '\n' : ''}${data.toString()}`
        console.log(data.toString('utf-8'))
      })

      // execute the callback once the process has finished running
      scriptProcess.on('exit', async code => {
        const [seconds, nanoseconds] = process.hrtime(startTime)
        const executionTime = `${seconds}.${nanoseconds}`
        if (output) {
          [outputID] = await db.knex('bee_script_output').insert({ name: fileName, output }).returning('id')
        }
        // Update the run entry
        await db.knex('bee_script_runs').update({ status: code, execution_time_seconds: executionTime, output_id: outputID }).where({ id: runID })
        console.log(`${green(fileName)} run finished. Exit Code: ${Number(code) !== 0 ? red(code) : green(code)}
Elapsed time: ${executionTime} second(s)`)
        if (outputID) console.log(`Output entry created with id: ${green(outputID)}`)
        resolve(code)
      })

      scriptProcess.unref()
    })
  }
}

const script = new Script()

module.exports = script
