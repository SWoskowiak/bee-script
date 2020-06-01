const db = require('./db')
const { cancel } = require('./utils')
const { table, getBorderCharacters } = require('table')
const { green, red, yellow, cyan, magenta } = require('kleur')
const moment = require('moment')
const _ = require('lodash')
const prompts = require('prompts')

class History {
  // Delete history entries
  async delete (args, argv) {
    const validArgs = args.every(_.isInteger)

    if (!validArgs || !args.length) {
      console.error(red('Must provide a valid integers for deletion. EX: '), yellow('bee history:delete 11 12 13'))
      cancel()
    }

    const results = await db.knex('bee_script_runs').select('id').whereIn('id', args)
    if (results.length !== args.length) {
      const invalid = _.difference(args, results.map(r => r.id))
      console.error(`${invalid.join(', ')} ${invalid.length > 1 ? 'are not' : 'is not an'} existing history ${invalid.length > 1 ? 'IDs!' : 'ID'}`)
      console.log(red('aborted delete'))
      cancel()
    }

    const confirmation = await prompts({
      type: 'confirm',
      name: 'value',
      message: `Delete ${args.length} ${args.length > 1 ? 'entries' : 'entry'} from run history?`,
      initial: true
    }, { onCancel: cancel })

    if (confirmation.value) {
      const deleted = await db.knex('bee_script_runs').del().whereIn('id', args)
      console.log(`${deleted.length} ${deleted.length > 1 ? 'entries' : 'entry'} deleted`)
    } else {
      console.log(red('aborted delete'))
    }
  }

  // Print history of script runs
  async print (args, argv) {
    const options = {
      limit: argv.limit || 10,
      name: args[0]
    }

    let runs
    if (options.name) {
      runs = await db.knex('bee_script_runs').select().limit(options.limit).orderBy('created_at', 'desc').where('name', 'ilike', options.name)
    } else {
      runs = await db.knex('bee_script_runs').select().limit(options.limit).orderBy('created_at', 'desc')
    }

    const data = [
      [cyan('id'), cyan('name'), cyan('note'), cyan('runtime'), cyan('status'), cyan('output id'), cyan('args'), cyan('date')]
    ]

    for (const run of runs) {
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

  // List unique name entries on the run table
  async unique () {
    const results = await db.knex('bee_script_runs').select('name').distinct()
    console.log(`${yellow('bee')} has history entries for the following:`)
    for (const script of results) {
      console.log(cyan(script.name))
    }
  }
}

const history = new History()

module.exports = history
