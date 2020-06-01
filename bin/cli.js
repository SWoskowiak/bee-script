#!/usr/bin/env node

const argv = require('yargs').argv
const { green, red, bold, yellow, grey, cyan, magenta, white } = require('kleur')
const { table, getBorderCharacters } = require('table')

const db = require('../src/db')
const history = require('../src/history')
const output = require('../src/output')
const script = require('../src/script')

const version = require('../package.json').version

// 🐝 script
class Beescript {
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
      [yellow('command'), yellow('description')]
    ]

    // Run
    const runCommand = [
      green('bee run <script>'),
      `Run a script at the given path.
All scripts are ran as a forked node process.
This will create an entry in ${yellow('bee history')}
All ${cyan('stdout')} content is captured in an output entry (see ${yellow('bee output')})
${grey('EXAMPLE:')}${white('')}
  ${magenta('bee run ./src/scripts/doWork.js argOne --argTwo=true')}
`
    ]
    data.push(runCommand)
    // History
    const historyCommand = [
      `${green('bee history')}
${green('bee history:delete')}`,
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
    const outputCommand = [
      `${green('bee output')}
${green('bee output:delete')}`,
      `See/Delete the output history of scripts ran with ${yellow('bee run')}.
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
    const listCommand = [
      green('bee list'),
      `Print unique names of scripts that have entries in ${yellow('bee history')}`
    ]
    data.push(listCommand)

    // Script:make
    const scriptMakeCommand = [
      green('bee script:make <path>'),
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
  }

  async main () {
    const { _: [command, ...args] } = argv

    // We need to ensure out db handle exists
    try {
      await db.init()
      // await initKnex()
    } catch (e) {
      console.log(e)
      console.error(red('Could not establish DB connection! Ensure knexFile.js is defined and DB exists.'))
      console.error(red(`Also ensure you are running ${yellow('bee')} from the directory the knexfile is in `))
      console.error(red('You might also need to install the appropriate db driver for knex'))
      process.exit(1)
    }

    // Could make this simpler but I like seeing all the commands here for my own reference
    switch (command) {
      case 'list':
        await history.unique()
        break
      case 'history:delete':
        await history.delete(args, argv)
        break
      case 'history':
        await history.print(args, argv)
        break
      case 'script:run':
      case 'run':
        await script.run(args, argv)
        break
      case 'output':
        await output.print(args, argv)
        break
      case 'output:delete':
        await output.delete(args, argv)
        break
      case 'script:make':
        await script.make(args)
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
