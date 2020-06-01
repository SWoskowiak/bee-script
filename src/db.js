const path = require('path')
const { cancel } = require('./utils')
const resve = require('resolve')
const { red, cyan } = require('kleur')

class DB {
  constructor () {
    this.knex = null
  }

  async init () {
    if (!this.knex) {
      const creds = require(path.join(process.cwd(), 'knexfile.js'))
      if (!creds) {
        console.log(red('Unable to locate knexfile.js'))
        console.log(red('Bee script must be run from a folder containing knexfile.js'))
        cancel()
      }

      const knexModule = await new Promise((resolve, reject) => {
        resve('knex', { basedir: process.cwd() }, (err, pathToKnex) => {
          if (err) {
            console.log(red('Bee script requires knex be installed in your project, EX: npm install knex'))
            cancel()
          }
          resolve(pathToKnex)
        })
      })
      const knex = require(knexModule)(creds)
      await knex.select(1)
      this.knex = knex
      await this.initTables()
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
      // console.log(`${yellow('bee script')} tables already initialized!`)
    }
  }
}

const db = new DB()

module.exports = db
