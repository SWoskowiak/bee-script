#!/usr/bin/env node
const prompts = require('prompts')
const moment = require('moment')
const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const argv = require('yargs').argv
const { green, red, underline, bold, yellow, grey, cyan, magenta, white } = require('kleur')
const { fork } = require('child_process')
const { table, getBorderCharacters } = require('table')
const scriptGenerator = require('../scriptTemplate')

const outputLimit = 255
const noteLimit = 50
const version = require('../package.json').version

// 🐝 script
class Beescript {
  // Initialize beescript
  async init () {
    // Ensure we have initilized our connection
    await this.initKnex()
    await this.initTables()
  }

  async initKnex () {
    if (!this.knex) {
      const creds = require(path.join(process.cwd(), 'knexFile'))
      const knex = require('knex')(creds)
      await knex.select(1)
      this.knex = knex
    }
  }

  async initTables () {
    const created = []

    if (!await this.knex.schema.hasTable('bee_script_runs')) {
      // Create table to track script runs/history
      await this.knex.schema.createTable('bee_script_runs', t => {
        t.increments('id').primary()
        t.text('name') // Name of the script that was ran (in case we delete parent w/o deleting history )
        t.text('note') // Some notes we can specify on run
        t.text('execution_time_seconds') // How long it took to run
        t.text('status')
        t.integer('output_id')
        t.text('execution_args') // What was it ran with
        t.timestamp('created_at').defaultTo(this.knex.fn.now())
      })
      created.push('bee_script_runs')
    }

    if (!await this.knex.schema.hasTable('bee_script_output')) {
      // Create a table to track backups
      await this.knex.schema.createTable('bee_script_output', t => {
        t.increments('id').primary()
        t.text('name') // Name of the script that we captured output for
        t.text('output') // Captured output
        t.text('backup')
        t.timestamp('created_at').defaultTo(this.knex.fn.now())
      })
      created.push('bee_script_output')
    }

    if (created.length) {
      created.forEach(table => {
        console.log(cyan(table), 'table created')
      })
    } else {
      console.log(`${yellow('bee script')} tables already initialized!`)
    }
  }

  printHistory (runs) {
    let data = [
      [cyan('id'), cyan('name'), cyan('note'), cyan('runtime'), cyan('status'), cyan('output id'), cyan('args'), cyan('date')]
    ]

    for (let run of runs) {
      data.push([
        yellow(run.id),
        green(run.name),
        green(run.note),
        yellow(Number(run.execution_time_seconds).toFixed(3)),
        run.status !== '0' ? red(run.status) : green(run.status),
        yellow(run.output_id || ''),
        green(run.execution_args),
        magenta(moment(run.created_at).format('MMM Do YYYY, h:mm:ss a'))
      ])
    }

    console.log(table(data, { border: getBorderCharacters('norc') }))
  }

  async history (args, argv) {
    const options = {
      limit: argv.limit || 10,
      name: args[0]
    }

    let runs
    if (options.name) {
      runs = await this.knex('bee_script_runs').select().limit(options.limit).orderBy('created_at', 'desc').where('name', 'ilike', options.name)
    } else {
      runs = await this.knex('bee_script_runs').select().limit(options.limit).orderBy('created_at', 'desc')
    }

    this.printHistory(runs)
  }

  printOutput (runs) {
    let data = [
      [cyan('id'), cyan('name'), cyan('output')]
    ]
    for (let run of runs) {
      data.push([ yellow(run.id), green(run.name), _.truncate(run.output, { length: outputLimit, omission: `... \n${yellow('bee output')} result truncated\nUse ${cyan(`bee output --id=${run.id}`)} to print full output` }) ])
    }

    let output = table(data, { border: getBorderCharacters('norc') })
    console.log(output)
  }

  async output (args, argv) {
    const options = {
      name: args[0],
      limit: argv.limit || 5,
      id: argv.id || null
    }

    let runs
    let query = this.knex('bee_script_output').select().limit(options.limit).orderBy('created_at', 'desc')
    if (options.name) query.where('name', 'ilike', options.name)
    if (options.id) query.where('id', '=', options.id)
    runs = await query

    if (options.id) {
      if (runs[0]) {
        console.log(runs[0].output)
        return
      } else {
        console.log(red(`No output entry found with id ${options.id}`))
        return
      }
    }

    this.printOutput(runs)
  }

  // Handle cancel events from prompts lib
  cancel () {
    process.exit(1)
  }

  // Select unique names
  async list () {
    let results = await this.knex('bee_script_runs').select('name').distinct()
    console.log(`${yellow('bee')} has history entries for the following:`)
    for (let script of results) {
      console.log(cyan(script.name))
    }
  }

  async run (args, argv) {
    const scriptPath = args[0]
    if (!scriptPath || scriptPath === '') {
      console.error(red('Specify a script to run EX: bee run ./app/scripts/doWork.js'))
      this.cancel()
    }
    const fullPath = path.join(process.cwd(), scriptPath)
    if (!fs.existsSync(fullPath)) {
      console.error(red(fullPath), 'not found or improper permissions')
      this.cancel()
    }
    const fileName = path.basename(fullPath) // Grab the file name for storing

    // Run notes (optional)
    let runNote = await prompts({
      type: 'text',
      name: 'value',
      message: 'Notes about this run(optional)',
      validate: value => value.length > noteLimit ? `Note limit is ${noteLimit} characters (entered ${value.length})` : true
    }, { onCancel: this.cancel })

    let rawArgs = _.clone(process.argv)
    rawArgs.splice(0, 4)

    let [ runID ] = await this.knex('bee_script_runs').insert({ name: fileName, note: runNote.value, execution_args: rawArgs.join(' ') }).returning('id')
    let scriptProcess = fork(fullPath, [ runID, ...rawArgs ], { silent: true })

    let startTime = process.hrtime()

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
        output = `${ output ? output + '\n' : '' }${data.toString()}`
        console.log(data.toString('utf-8'))
      })

      // execute the callback once the process has finished running
      scriptProcess.on('exit', async code => {
        let [seconds, nanoseconds] = process.hrtime(startTime)
        let executionTime = `${seconds}.${nanoseconds}`
        if (output) {
          [ outputID ] = await this.knex('bee_script_output').insert({ name: fileName, output }).returning('id')
        }
        // Update the run entry
        await this.knex('bee_script_runs').update({ status: code, execution_time_seconds: executionTime, output_id: outputID }).where({ id: runID })
        console.log(`${green(fileName)} run finished. Exit Code: ${Number(code) !== 0 ? red(code) : green(code) }
Elapsed time: ${executionTime} second(s)`)
        resolve(code)
      })

      scriptProcess.unref()
    })
  }

  async getConfigProperty (propertyName) {
    let [ config ] = await this.knex('bee_script_config').select().where({ id: 1 })
    // console.log(config, config.script_folder_path)
    if (config[propertyName] !== undefined) return config[propertyName]
    console.error(red(`Property "${propertyName}" not defined/exists, use ${yellow('bee config')} to see config variables`))
    await this.cancel()
  }

  // ********************************************************************************************************
  // BEGIN: Script CLI functions ****************************************************************************
  // ********************************************************************************************************
  trimExtension (fileName) {
    let fName = fileName.split('.')
    if (fName.length > 1) fName.pop() // Remove extension
    return fName.join('.')
  }
  async makeScript (args) {
    const name = args[0]
    if (!name) throw new Error('Must provide a script name! EX: bee script:make myNewScript')
    const scriptPath = path.join(process.cwd(), `${this.trimExtension(name)}.js`)
    const scriptName = path.basename(scriptPath)
    let newScript = scriptGenerator({ scriptName: this.trimExtension(scriptName) })
    fs.writeFileSync(scriptPath, newScript)
    console.log(`${cyan(scriptName)} was created!`)
  }

  // Script commands
  async script (command, args) {
    if (/^script:make$/.test(command)) {
      await this.makeScript(args)
    } else if ( /^script$/.test(command)) {
      console.log('help')
    }
    console.log(command, args)
  }
  // ********************************************************************************************************
  // END: Script CLI functions ******************************************************************************
  // ********************************************************************************************************

  async getScriptPath () {
    let [ result ] = await this.knex('bee_script_config').select('script_folder_path').where({ id: 1 })
    return path.join(process.cwd(), result.script_folder_path)
  }

  // Configure variables
  async config (args) {
    const target = args[0] || ''
    if (/^scriptFolder$/.test(target)) {
      let configEntry = await prompts({
        type: 'text',
        name: 'value',
        message: 'Enter scripts folder location (relative to app root)'
      }, { onCancel: this.cancel })

      //
      if (configEntry.value) {
        let scriptPath = path.join(process.cwd(), configEntry.value)
        if (!fs.existsSync(scriptPath)) {
          console.error(red(scriptPath), 'not found or improper permissions')
          this.cancel()
        }
        let configExists = await this.knex('bee_script_config').select()
        if (!configExists.length) {
          await this.knex('bee_script_config').insert({ id: 1, script_folder_path: configEntry.value })
        } else {
          await this.knex('bee_script_config').update({ script_folder_path: configEntry.value }).where({ id: 1 })
        }
      }
    } else {
      const message =
`${this.beeAscii('Config')}
${underline('Config Variables:')}
${bold().green('scriptFolder')}            ${await this.getConfigProperty('script_folder_path')}`
      console.log(message)
    }
  }

  // Print out a colorized bee ascii mascot
  beeAscii (title) {
    const bee =
`     _
    / \\      ${bold().underline().yellow('Bee Script')}: ${yellow(title)}
    \\|/ ${grey('//')}   ${bold().underline().yellow('Version')}:    ${green(version)}
  ${grey('-')}${yellow('(||)')}(${grey("'")})   ${bold().underline().yellow('Author')}:     ${green('Stefan Woskowiak')}
    ${grey("'''")}`

    return bee
  }

  // Display all commands
  help () {
    const data = [
      [ yellow('command'), yellow('description') ]
    ]

    // Run
    let runCommand = [
      green('bee run <script>'),
      `Run a script at the given path.
All scripts are ran as a forked node process.
This will create an entry in ${yellow('bee history')}
All ${cyan('stdout')} content is captured in an output entry (see ${yellow('bee output')})
${grey(`EXAMPLE:`)}${white('')}
  ${magenta(`bee run ./src/scripts/doWork.js argOne --argTwo=true`)}
`
    ]
    data.push(runCommand)
    // History
    let historyCommand = [
      green('bee history'),
      `See the run history of scripts ran with ${yellow('bee run')}.
${grey('OPTIONS:')}
  ${cyan('--limit')} : how many history rows to display(10 by default)
  ${cyan('<scriptName>')} : name of a script to filter history on
${grey('EXAMPLES:')}
  ${magenta('bee history doWork.js --limit 50')}
  ${magenta('bee history %work% --limit 5')} (supports iLike style selection)
`]
    data.push(historyCommand)
    // Output
    let outputCommand = [
      green(`bee output`),
      `See the output history of scripts ran with ${yellow('bee run')}.
${cyan('stdout')} data is captured automatically (${cyan('console.log()')} etc.)

${grey('OPTIONS:')}
  ${cyan('--limit')} : how many output rows to display (5 by default)
  ${cyan('--id')} : id of the output entry.
    If specified it dumps the entire output raw to stdout
  ${cyan('<scriptName>')} : name of script to filter output on
${grey('EXAMPLES:')}
  ${magenta('bee output doWork.js')}
  ${magenta('bee output %work% --limit 10')} (supports iLike style selection)
  ${magenta('bee output --id=123')} (dumps entire output of entry with id 123)
  ${magenta('bee output --id=123 >> logOutput.txt')} (dump output to a file)
  ${magenta('bee output --id=123 | grep lookup')} (search output for content)
      `
    ]
    data.push(outputCommand)

    // List
    let listCommand = [
      green(`bee list`),
      `Print unique names of scripts that have entries in ${yellow('bee history')}`
    ]
    data.push(listCommand)

    // Script:make
    let scriptMakeCommand = [
      green(`bee script:make <path>`),
      `Creates a script using a provided boilerplate function
${grey('EXAMPLES:')}
  ${magenta('bee script:make app/scripts/newScript')}
    (will automatically add .js extension if ommitted)
  ${magenta('bee script:make newScript.js')}
    (will default to making it in the current directory)
`
    ]
    data.push(scriptMakeCommand)


    console.log(this.beeAscii('The Bee-autiful Knex.js powered Script Runner'))
    console.log(table(data, { border: getBorderCharacters('norc') }))


//     const message =
//  `
// ${this.beeAscii('Commands')}
//   ${bold().green('run <script>')}        Run the script at the given path EX: bee run ./app/scripts/doWork.js --args=supported
//   ${bold().green('history')}             See the run history of scripts ran (options: --limit )
//   ${bold().green('script')}              See all the options for script creation/execution etc.
//   ${bold().green('script:make <name>')}  Create a new script with the given name
//     `

//     console.log(message)
  }

  async rollback (rollback) {
    // See what rollbacks are available
    let selection = await prompts({
      type: 'select',
      name: 'value',
      message: 'Which backup do you want to run?',
      choices: [
        { title: today, value: 'today' },
        { title: yesterday, value: 'yesterday', disabled: true, description: 'ran already' },
        { title: lastWeek, value: 'lastWeek' }
      ],
      initial: 0
    })

    // Do you want to backup the existing target data?
    console.log(selection)
    process.exit()
  }

  async main () {
    const { _: [ command, ...args ] } = argv

    // We need to ensure out db handle exists
    try {
      await this.initKnex()
    } catch (e) {
      console.log(e)
      console.error(red('Could not establish DB connection! Ensure knexFile.js is defined and DB exists.'))
      console.error(red(`Also ensure you are running ${yellow('bee')} from the directory the knexFile is in `))
      process.exit(1)
    }
    // Check if we are intialized
    if (command !== 'init') {
      const configExists = await this.knex.schema.hasTable('bee_script_runs')
      if (!configExists) {
        console.log(`Initializing tables (first time run detected)...`)
        await this.initTables()
      }
    }

    // Could make this simpler but I like seeing all the commands here for my own reference
    switch (command) {
      case 'config':
        await this.config(args, argv)
        break
      case 'list':
        await this.list()
        break
      case 'history':
        await this.history(args, argv)
        break
      case 'run':
        await this.run(args, argv)
        break
      case 'output':
        await this.output(args, argv)
        break
      case 'script:make':
        await this.script(command, args)
        break
      default:
        if (command === undefined) {
          this.help()
        } else {
          console.log(`${bold().red(command)}${red(' is an unknown command.')}
Use ${yellow('bee')} to see all commands
          `)
        }
    }
    process.exit(0)
  }
}

const beeScript = new Beescript();

(async function () {
  // If run from the command line
  if (require.main === module) {
    await beeScript.main()
  // Otherwise export it
  } else {
    module.exports = beeScript
  }
})()
