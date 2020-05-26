# bee-script
A Knex.js powered script runner CLI tool

# installation
yarn add bee-script
npm install bee-script

feel free to use global install flags as wanted

# Running
bee-script (for now) must be run from the directory containing your knexFile.js file.
It uses that file to establish a connection to your DB instance and initialize its tracking tables

from there you can type `bee` to see a list of all commands available to you

# Roadmap
- automatic knexFile.js discovery so running bee commands is less tedius
- stats command to understand size and number of entries being used by bee-script
- cleanup/delete command to delete rows of output/history we don't want
- better ways for the template generated scripts to describe themselves
- describe command to explain a given script and some details around it
- a startup task creator to define a set of scripts to run with a bee script:startup command
- a one time task creator (think knex migrations) to run scripts once and checks if they have been run already
