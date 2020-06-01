const db = require('./db')
const { cancel } = require('./utils')
const { table, getBorderCharacters } = require('table')
const { green, red, yellow, cyan } = require('kleur')
const _ = require('lodash')
const prompts = require('prompts')

class Output {
  constructor () {
    this.outputLimit = 255
  }

  // Delete output entries
  async delete (args, argv) {
    const validArgs = args.every(_.isInteger)

    if (!validArgs || !args.length) {
      console.error(red('Must provide valid integers for deletion. EX: '), yellow('bee output:delete 10 11 12'))
      cancel()
    }

    const results = await db.knex('bee_script_output').select('id').whereIn('id', args)
    if (results.length !== args.length) {
      const invalid = _.difference(args, results.map(r => r.id))
      console.error(`${invalid.join(', ')} ${invalid.length > 1 ? 'are not' : 'is not an'} existing output ${invalid.length > 1 ? 'IDs!' : 'ID'}`)
      console.log(red('aborted delete'))
      cancel()
    }

    const confirmation = await prompts({
      type: 'confirm',
      name: 'value',
      message: `Delete ${args.length} ${args.length > 1 ? 'entries' : 'entry'} from output?`,
      initial: true
    }, { onCancel: cancel })

    if (confirmation.value) {
      const deleted = await db.knex('bee_script_output').del().whereIn('id', args).returning('id')
      console.log(`${deleted.length} ${deleted.length > 1 ? 'entries' : 'entry'} deleted`)
    } else {
      console.log(red('aborted delete'))
    }
  }

  async print (args, argv) {
    const options = {
      name: args[0],
      limit: argv.limit || 5,
      id: argv.id || null
    }

    // Support simple calls like bee output <id>
    if (_.isInteger(args[0])) {
      options.id = args[0]
      options.name = null
    }

    const query = db.knex('bee_script_output').select().limit(options.limit).orderBy('created_at', 'desc')
    if (options.name) query.where('name', 'ilike', options.name)
    if (options.id) query.where('id', '=', options.id)
    const runs = await query

    if (options.id) {
      if (runs[0]) {
        console.log(runs[0].output)
        return
      } else {
        console.log(red(`No output entry found with id ${options.id}`))
        return
      }
    }

    const data = [
      [cyan('id'), cyan('name'), cyan('output')]
    ]
    for (const run of runs) {
      data.push([yellow(run.id), green(run.name), _.truncate(run.output, { length: this.outputLimit, omission: `... \n${yellow('bee output')} result truncated\nUse ${cyan(`bee output --id=${run.id}`)} to print full output` })])
    }

    const output = table(data, { border: getBorderCharacters('norc') })
    console.log(output)
  }
}

const output = new Output()

module.exports = output
