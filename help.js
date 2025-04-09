#!/usr/bin/env node

import chalk from 'chalk';

console.log(chalk.bold.cyan('MediathekViewWeb CLI - Help'));
console.log(chalk.cyan('============================\n'));

console.log(chalk.bold('Interactive Usage:'));
console.log('  mediathekview');
console.log('  mediathekview -i\n');

console.log(chalk.bold('Common Commands:'));
console.log('  mediathekview --channels                     List all available channels');
console.log('  mediathekview -q "Tatort"                   Search for videos (all channels, no limit)');
console.log('  mediathekview -q "Tatort" -c "ARD"          Search in specific channel');
console.log('  mediathekview -q "Tatort" -c                Channel selection prompt (includes ALL)');
console.log('  mediathekview -q "Tatort" -l 10             Limit search results to 10');
console.log('  mediathekview -q "Tatort" --quality medium  Specify video quality (hd, medium, low)');
console.log('  mediathekview -d "video-id"                 Download a specific video by ID');
console.log('  mediathekview -q "Tatort" -o video.mp4      Specify output file path\n');

console.log(chalk.bold('Tips:'));
console.log('- Interactive mode makes it easy to search and select videos');
console.log('- You can customize filenames when downloading (unless -o is specified)');
console.log('- If mpv is installed, you can play videos directly');
console.log('- Use the -s option if you\'re using a different server');
console.log('  For example: mediathekview -s http://localhost:3000');
console.log('- Use --debug flag to enable verbose console output for troubleshooting');
console.log('  For example: mediathekview --debug -q "Tatort"\n');

console.log(chalk.bold('For more information, run:'));
console.log('  mediathekview --help');