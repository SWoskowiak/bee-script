# 🐝bee-script🐝
A Knex.js powered script runner CLI tool

# installation
npm install bee-script -g

## description
bee script utilizes your local knex installation to intialize two tables
`bee_script_runs` and `bee_script_output`

When you run a script using `bee run` it will create an entry in bee_script_runs and execute it in a forked node process.
If there was any content written to stdout (console.log() etc.) by the script being run it captures that output
in a text field on an entry in `bee_script_output`

At any point you can type `bee history` to see the most recently ran scripts and how they were run and their execution time

You can also use `bee output` to see recent output of ran scripts with the ability to dump the entire output content

Use `bee` to see all commands and their options for better usage.

![bee options](https://i.imgur.com/8YvucgH.png)


## Running
bee-script (for now) must be run from the directory containing your knexFile.js file.
In addition to that you must also ensure knex (and the db drivers it needs) are installed in your project
It uses that file to establish a connection to your DB instance and initialize/query its tracking tables

Type `bee` to see a list of all commands available to you

## Roadmap
- automatic knexFile.js discovery so running bee commands is less tedius
- stats command to understand size and number of entries being used by bee-script
- better ways for the template generated scripts to describe themselves
- describe command to explain a given script and some details around it
- a startup task creator to define a set of scripts to run with a bee script:startup command
- a one time task creator (think knex migrations) to run scripts once and checks if they have been run already
- slim down table output on commands to fit smaller terminal sizes better
- configure the global install to have its own potential db credentials ("global" script run tracking support)
