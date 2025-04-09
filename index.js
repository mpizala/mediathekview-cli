#!/usr/bin/env node

import { io } from 'socket.io-client';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { spawn } from 'child_process';
import os from 'os';
import { parse } from 'ini';

// Configuration
const DEFAULT_SERVER = 'https://mediathekviewweb.de';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(os.homedir(), '.mediathekviewrc');

// Default config content
const DEFAULT_CONFIG = `# MediathekView CLI configuration
# Created: ${new Date().toISOString()}

# Server URL
server = https://mediathekviewweb.de

# Default channel (comment out for no default)
# channel = ARD

# Video quality (hd, medium, low)
quality = hd

# Default limit for search results (comment out for no limit)
# limit = 50

# Channels to exclude (comma-separated)
# exclude = ZDF,NDR

# Default output file path (comment out for interactive prompt)
# output = ~/Videos/mediathek.mp4
`;

// Create default config file if it doesn't exist
function createDefaultConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, DEFAULT_CONFIG, 'utf8');
      console.log(chalk.green(`Created default configuration file: ${CONFIG_FILE}`));
      return true;
    }
  } catch (err) {
    console.error(chalk.yellow(`Warning: Could not create config file ${CONFIG_FILE}`));
    console.error(err.message);
  }
  return false;
}

// Load configuration file if it exists, or create it
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = parse(configContent);
      
      // Expand any tildes in paths
      if (config.output) {
        config.output = expandTildePath(config.output);
      }
      
      return config;
    } else {
      // Create default config file
      createDefaultConfig();
      // Return default empty object this time - next run will use the file
      return {};
    }
  } catch (err) {
    console.error(chalk.yellow(`Warning: Could not parse config file ${CONFIG_FILE}`));
    console.error(err.message);
  }
  return {};
}

// Get default settings from config file
const configDefaults = loadConfig();
const hasConfigFile = Object.keys(configDefaults).length > 0;

// Debug logger function
function debug(message, data) {
  if (!global.debugMode) return;
  
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] ${message}`;
  
  if (data !== undefined) {
    if (typeof data === 'object') {
      logMessage += `\n${JSON.stringify(data, null, 2)}`;
    } else {
      logMessage += ` ${data}`;
    }
  }
  
  // Log to console in debug mode only
  console.debug(chalk.gray(logMessage));
}

// Command line arguments setup
const program = new Command();
program
  .name('mediathekview')
  .description('CLI for searching and downloading from MediathekViewWeb')
  .version('1.0.0')
  .option('-s, --server <url>', 'Server URL', configDefaults.server || DEFAULT_SERVER)
  .option('--channels', 'List available channels')
  .option('-q, --query <query>', 'Search query')
  .option('-d, --download <id>', 'Download video by ID')
  .option('-o, --output <path>', 'Output file path for download', configDefaults.output)
  .option('-i, --interactive', 'Interactive mode')
  .option('-l, --limit <limit>', 'Limit search results', configDefaults.limit)
  .option('-c, --channel [channel]', 'Filter results by channel', configDefaults.channel)
  .option('-e, --exclude <channels>', 'Exclude channels (comma-separated list)', configDefaults.exclude)
  .option('--quality <quality>', 'Video quality (hd, medium, low)', configDefaults.quality || 'hd')
  .option('--debug', 'Enable debug mode (verbose console output)')
  .addHelpText('after', `
Configuration file:
  A default configuration file is auto-created at ~/.mediathekviewrc on first run.
  Edit this file to set your preferred defaults.`)
  .parse(process.argv);

const options = program.opts();

// Enable debug mode if flag is present
global.debugMode = options.debug === true;

if (global.debugMode) {
  console.log(chalk.yellow('Debug mode enabled. Verbose output will be shown in the console.'));
  debug('CLI started with options', options);
  
  if (hasConfigFile) {
    debug('Loaded configuration from ~/.mediathekviewrc', configDefaults);
  } else {
    debug('No configuration file found');
  }
}

// We no longer need to create a directory here since output is now a file path

// Setup socket.io connection
const socket = io(options.server, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// Handle socket connection
socket.on('connect', async () => {
  console.log(chalk.green('Connected to server:', options.server));
  debug('Socket connected', { server: options.server, socketId: socket.id });
  
  // If --channel is specified without a value, prompt for channel
  if (options.channel === true) {
    debug('Channel flag set without value, fetching available channels');
    try {
      const response = await fetch(`${options.server}/api/channels`);
      const data = await response.json();
      const channels = data.channels || [];
      
      if (channels.length > 0) {
        // Add ALL option at the top of the list
        const channelChoices = [
          { name: 'ALL - No channel filter', value: null }
        ].concat(
          channels.map(channel => ({ name: channel, value: channel }))
        );
        
        const { selectedChannel } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedChannel',
            message: 'Select channel:',
            choices: channelChoices
          }
        ]);
        options.channel = selectedChannel;
        debug('User selected channel', { channel: options.channel || 'ALL' });
      } else {
        console.log(chalk.yellow('No channels available. Searching in all channels.'));
        options.channel = null;
      }
    } catch (error) {
      console.error(chalk.red('Failed to fetch channels:'), error.message);
      debug('Failed to fetch channels', { error: error.message });
      options.channel = null;
    }
  }
  
  // Process command line options
  if (options.channels) {
    debug('Command: List channels');
    listChannels();
  } else if (options.query) {
    debug('Command: Search movies', { query: options.query, channel: options.channel || 'ALL' });
    if (options.channel) {
      console.log(chalk.cyan(`Searching in channel: ${options.channel}`));
    } else {
      console.log(chalk.cyan('Searching in ALL channels'));
    }
    
    if (options.exclude) {
      console.log(chalk.cyan(`Excluding channels: ${options.exclude}`));
    }
    
    searchMovies(options.query, options.channel, options.limit, options.exclude);
  } else if (options.download) {
    debug('Command: Download video', { id: options.download });
    getAndDownloadVideo(options.download);
  } else if (options.interactive) {
    debug('Command: Interactive mode');
    startInteractiveMode();
  } else {
    debug('Command: Default to interactive mode');
    startInteractiveMode();
  }
});

socket.on('disconnect', () => {
  console.log(chalk.yellow('Disconnected from server'));
  debug('Socket disconnected');
});

socket.on('error', (error) => {
  console.error(chalk.red('Connection error:'), error);
  debug('Socket error', error);
  process.exit(1);
});

// List available channels
async function listChannels() {
  const spinner = ora('Loading channels...').start();
  debug('Loading channels from API');
  
  try {
    const response = await fetch(`${options.server}/api/channels`);
    const data = await response.json();
    
    spinner.succeed(chalk.green('Channels loaded'));
    debug('Channels loaded successfully', { count: data.channels?.length });
    
    if (data.error) {
      console.error(chalk.red('Error loading channels:'), data.error);
      debug('Error loading channels', data.error);
    } else {
      console.log(chalk.cyan('Available channels:'));
      data.channels.sort().forEach(channel => {
        console.log(`- ${channel}`);
      });
      debug('Displayed channel list', { channels: data.channels });
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to load channels'));
    console.error(error);
    debug('Exception loading channels', { error: error.message, stack: error.stack });
  }
  
  process.exit(0);
}

// Search for movies
async function searchMovies(query, channel = null, limit = null, excludeChannels = null) {
  const spinner = ora('Searching...').start();
  debug('Starting search', { query, channel, limit, excludeChannels });
  
  try {
    // Prepare search query
    const searchQuery = {
      queries: [
        {
          fields: ['title', 'topic'],
          query: query
        }
      ],
      sortBy: 'timestamp',
      sortOrder: 'desc',
      future: false,
      offset: 0
    };
    
    // Add size limit if specified
    if (limit) {
      searchQuery.size = parseInt(limit, 10);
    }
    
    // Add channel filter if provided
    if (channel) {
      searchQuery.queries.push({
        fields: ['channel'],
        query: channel
      });
      debug('Added channel filter', { channel });
    }
    
    debug('Prepared search query', searchQuery);
    
    // Process excluded channels - we'll filter the results after searching
    let excludedChannelsList = [];
    if (excludeChannels) {
      excludedChannelsList = excludeChannels.split(',').map(ch => ch.trim());
      debug('Will exclude channels', { excludedChannels: excludedChannelsList });
    }
    
    return new Promise((resolve, reject) => {
      socket.emit('queryEntries', searchQuery, (response) => {
        spinner.stop();
        
        if (response.err) {
          console.error(chalk.red('Error searching:'), response.err);
          debug('Search error response', response.err);
          reject(response.err);
          return;
        }
        
        let results = response.result.results;
        
        // Filter out excluded channels if any were specified
        if (excludedChannelsList.length > 0) {
          const originalCount = results.length;
          results = results.filter(item => !excludedChannelsList.includes(item.channel));
          
          const excludedCount = originalCount - results.length;
          if (excludedCount > 0) {
            console.log(chalk.yellow(`Excluded ${excludedCount} results from channels: ${excludedChannelsList.join(', ')}`));
          }
          
          debug('Filtered excluded channels', { 
            originalCount,
            filteredCount: results.length,
            excludedCount
          });
        }
        
        debug('Search results received', { 
          count: results.length,
          queryInfo: response.result.queryInfo
        });
        resolve(results);
      });
    });
  } catch (error) {
    spinner.fail(chalk.red('Search failed'));
    console.error(error);
    debug('Exception during search', { error: error.message, stack: error.stack });
    return [];
  }
}

// Get video details by ID
function getVideoDetails(id) {
  debug('Getting video description', { id });
  
  return new Promise((resolve, reject) => {
    socket.emit('getDescription', id, (description) => {
      if (description.startsWith('error:') || description === 'document not found') {
        debug('Video description error', { id, error: description });
        reject(new Error(description));
        return;
      }
      
      debug('Video description received', { id, descriptionLength: description.length });
      resolve(description);
    });
  });
}

// Expand tilde in file paths (e.g., ~/Downloads -> /home/user/Downloads)
function expandTildePath(pathWithTilde) {
  if (typeof pathWithTilde !== 'string') return pathWithTilde;
  
  // Replace leading ~/ or ~ with home directory
  if (pathWithTilde.startsWith('~/') || pathWithTilde === '~') {
    return pathWithTilde.replace(/^~(?=$|\/|\\)/, os.homedir());
  }
  
  return pathWithTilde;
}

// Download a video
async function downloadVideo(url, filename, video) {
  // If -o/--output is explicitly provided by user, use that directly
  const outputArg = options.output;
  
  if (outputArg) {
    // Use specified output path directly
    debug('Using specified output path', { outputPath: outputArg });
    
    // Expand tilde if present
    const expandedPath = expandTildePath(outputArg);
    debug('Expanded path', { original: outputArg, expanded: expandedPath });
    
    // If it's an absolute path, use it as is
    if (path.isAbsolute(expandedPath)) {
      filename = expandedPath;
    } else {
      // Otherwise treat as relative to current directory
      filename = path.join(process.cwd(), expandedPath);
    }
  } else {
    // No output path specified, ask for filename
    const sanitizedTitle = video.title.replace(/[\\/:*?"<>|]/g, '_');
    const defaultFilename = `${sanitizedTitle}-${video.channel}.mp4`;
    
    debug('Prompting for filename', { defaultFilename });
    
    // Ask user for filename
    const { customFilename } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customFilename',
        message: 'Enter filename (or press Enter for default):',
        default: defaultFilename
      }
    ]);
    
    // Use custom filename (might be relative or absolute)
    if (customFilename !== defaultFilename) {
      // Expand tilde if present
      const expandedPath = expandTildePath(customFilename);
      debug('Expanded custom path', { original: customFilename, expanded: expandedPath });
      
      if (path.isAbsolute(expandedPath)) {
        // Use absolute path as is
        filename = expandedPath;
      } else {
        // Use relative path from current directory
        filename = path.join(process.cwd(), expandedPath);
      }
    } else {
      // Use default filename in current directory
      filename = path.join(process.cwd(), defaultFilename);
    }
  }
  
  console.log(chalk.green(`Downloading to: ${filename}`));
  debug('Starting download', { url, filename });
  
  const spinner = ora('Starting download...').start();
  
  try {
    // First, check if mpv is available for direct playback
    debug('Checking for mpv availability');
    const mpvProcess = spawn('which', ['mpv']);
    let mpvAvailable = false;
    
    await new Promise((resolve) => {
      mpvProcess.on('close', (code) => {
        mpvAvailable = code === 0;
        debug('mpv availability check', { available: mpvAvailable });
        resolve();
      });
    });
    
    // If mpv is available, ask if user wants to play or download
    if (mpvAvailable) {
      spinner.stop();
      debug('mpv is available, prompting for action');
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Would you like to play or download?',
          choices: ['Play', 'Download', 'Cancel']
        }
      ]);
      
      debug('User selected action', { action });
      
      if (action === 'Play') {
        console.log(chalk.green('Playing video...'));
        debug('Starting mpv player', { url });
        const player = spawn('mpv', [url], { stdio: 'inherit' });
        
        return new Promise((resolve) => {
          player.on('close', (code) => {
            console.log(chalk.green(`Player exited with code ${code}`));
            debug('mpv player closed', { exitCode: code });
            resolve();
          });
        });
      } else if (action === 'Cancel') {
        console.log(chalk.yellow('Download cancelled'));
        debug('Download cancelled by user');
        return;
      }
      
      spinner.start('Downloading...');
    }
    
    // Perform the download
    debug('Initiating fetch request', { url });
    const response = await fetch(url);
    const contentLength = response.headers.get('content-length');
    const totalSize = parseInt(contentLength, 10);
    
    debug('Fetch response received', { 
      status: response.status, 
      contentType: response.headers.get('content-type'),
      contentLength
    });
    
    if (!response.ok) {
      spinner.fail(chalk.red(`Failed to download: ${response.statusText}`));
      debug('Download failed', { status: response.status, statusText: response.statusText });
      return;
    }
    
    const fileStream = createWriteStream(filename);
    let downloadedBytes = 0;
    let lastLoggedPercent = 0;
    
    response.body.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      
      if (totalSize) {
        const progress = Math.round((downloadedBytes / totalSize) * 100);
        spinner.text = `Downloading... ${progress}% (${(downloadedBytes / 1048576).toFixed(2)} MB of ${(totalSize / 1048576).toFixed(2)} MB)`;
        
        // Log progress every 10%
        if (progress >= lastLoggedPercent + 10) {
          debug('Download progress', { 
            progress: `${progress}%`, 
            downloaded: `${(downloadedBytes / 1048576).toFixed(2)} MB`, 
            total: `${(totalSize / 1048576).toFixed(2)} MB` 
          });
          lastLoggedPercent = progress;
        }
      } else {
        spinner.text = `Downloading... ${(downloadedBytes / 1048576).toFixed(2)} MB`;
        
        // Log progress every 10 MB
        if (downloadedBytes / 1048576 >= lastLoggedPercent + 10) {
          debug('Download progress (unknown total size)', { 
            downloaded: `${(downloadedBytes / 1048576).toFixed(2)} MB` 
          });
          lastLoggedPercent = Math.floor(downloadedBytes / 1048576);
        }
      }
    });
    
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', (err) => {
        debug('Download stream error', { error: err.message });
        reject(err);
      });
      fileStream.on('finish', () => {
        debug('Download completed', { 
          filename, 
          fileSize: `${(downloadedBytes / 1048576).toFixed(2)} MB` 
        });
        resolve();
      });
    });
    
    spinner.succeed(chalk.green('Download complete!'));
  } catch (error) {
    spinner.fail(chalk.red('Download failed'));
    console.error(error);
    debug('Download exception', { error: error.message, stack: error.stack });
  }
}

// Get and download a video by ID
async function getAndDownloadVideo(id) {
  const spinner = ora(`Fetching video details for ID: ${id}`).start();
  debug('Fetching video details', { id });
  
  try {
    // Fetch video entry
    debug('Making API request to /api/entries', { id });
    const response = await fetch(`${options.server}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify([id])
    });
    
    const data = await response.json();
    debug('API response received', { 
      status: response.status,
      hasError: !!data.err,
      resultCount: data.result?.results?.length
    });
    
    if (data.err) {
      spinner.fail(chalk.red('Error fetching video details'));
      console.error(data.err);
      debug('API error response', data.err);
      process.exit(1);
    }
    
    if (!data.result.results || data.result.results.length === 0) {
      spinner.fail(chalk.red(`No video found with ID: ${id}`));
      debug('No video found for ID', { id });
      process.exit(1);
    }
    
    const video = data.result.results[0];
    spinner.succeed(chalk.green('Video details fetched'));
    debug('Video details retrieved', { 
      id,
      title: video.title,
      channel: video.channel,
      duration: video.duration,
      timestamp: video.timestamp,
      hasHD: !!video.url_video_hd,
      hasMedium: !!video.url_video,
      hasLow: !!video.url_video_low
    });
    
    // Initialize filename - will be determined in downloadVideo
    const filename = "";
    debug('Filename will be determined during download');
    
    // Show video details
    console.log('\n' + chalk.bold(video.title));
    console.log(chalk.cyan(`Channel: ${video.channel}`));
    console.log(chalk.cyan(`Duration: ${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}`));
    
    // Define quality mapping
    const qualityMap = {
      'hd': 'url_video_hd',
      'medium': 'url_video',
      'low': 'url_video_low'
    };
    
    // Get available qualities
    const availableQualities = [
      { name: 'High (HD)', value: 'url_video_hd' },
      { name: 'Medium', value: 'url_video' },
      { name: 'Low', value: 'url_video_low' }
    ].filter(q => video[q.value]);
    
    debug('Available video qualities', { 
      qualities: availableQualities.map(q => q.name)
    });
    
    // Automatically select quality based on command line preference or select highest available
    let quality;
    
    // Try to use command line preference if it's available
    if (options.quality && qualityMap[options.quality.toLowerCase()]) {
      const preferredQuality = qualityMap[options.quality.toLowerCase()];
      if (video[preferredQuality]) {
        quality = preferredQuality;
        console.log(chalk.cyan(`Selected quality: ${options.quality}`));
      }
    }
    
    // If no quality selected yet, select highest available quality
    if (!quality) {
      if (video.url_video_hd) {
        quality = 'url_video_hd';
        console.log(chalk.cyan('Selected quality: High (HD)'));
      } else if (video.url_video) {
        quality = 'url_video';
        console.log(chalk.cyan('Selected quality: Medium'));
      } else if (video.url_video_low) {
        quality = 'url_video_low';
        console.log(chalk.cyan('Selected quality: Low'));
      }
    }
    
    debug('User selected quality', { 
      selectedQuality: quality,
      url: video[quality]
    });
    
    await downloadVideo(video[quality], filename, video);
  } catch (error) {
    spinner.fail(chalk.red('Failed to process video'));
    console.error(error);
    debug('Exception processing video', { error: error.message, stack: error.stack });
  }
  
  process.exit(0);
}

// Interactive mode - fuzzy search for movies
async function startInteractiveMode() {
  debug('Starting interactive mode');
  
  try {
    // First, get channels
    debug('Fetching channel list for interactive mode');
    const response = await fetch(`${options.server}/api/channels`);
    const data = await response.json();
    const channels = data.channels || [];
    debug('Received channels for interactive mode', { channelCount: channels.length });
    
    // Prompt for search query only
    debug('Prompting user for search query');
    
    const { searchQuery } = await inquirer.prompt([
      {
        type: 'input',
        name: 'searchQuery',
        message: 'Enter search query:',
        validate: input => input.length > 0 ? true : 'Please enter a search query'
      }
    ]);
    
    // Use channel from command line if provided
    const selectedChannel = options.channel || null;
    // Only use limit if passed as command line argument
    const limit = options.limit || null;
    // Get excluded channels from command line if provided
    const excludeChannels = options.exclude || null;
    
    debug('User input received', { searchQuery, selectedChannel, limit, excludeChannels });
    
    if (excludeChannels) {
      console.log(chalk.cyan(`Excluding channels: ${excludeChannels}`));
    }
    
    // Search for movies
    const results = await searchMovies(searchQuery, selectedChannel, limit, excludeChannels);
    
    if (results.length === 0) {
      console.log(chalk.yellow('No results found.'));
      debug('No search results found');
      process.exit(0);
    }
    
    console.log(chalk.green(`Found ${results.length} results`));
    debug('Displaying search results to user', { resultCount: results.length });
    
    // Display results and let user select
    const { selectedVideo } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedVideo',
        message: 'Select a video:',
        pageSize: 20,
        choices: results.map(video => ({
          name: `${video.channel} - ${video.title} (${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')})`,
          value: video
        }))
      }
    ]);
    
    debug('User selected video', { 
      id: selectedVideo.id,
      title: selectedVideo.title, 
      channel: selectedVideo.channel 
    });
    
    // Initialize filename - will be determined in downloadVideo
    const filename = "";
    debug('Filename will be determined during download');
    
    // Show video details
    console.log('\n' + chalk.bold(selectedVideo.title));
    console.log(chalk.cyan(`Channel: ${selectedVideo.channel}`));
    console.log(chalk.cyan(`Duration: ${Math.floor(selectedVideo.duration / 60)}:${(selectedVideo.duration % 60).toString().padStart(2, '0')}`));
    
    // Try to get description
    try {
      debug('Fetching video description');
      const description = await getVideoDetails(selectedVideo.id);
      console.log(chalk.cyan('Description:'));
      console.log(description);
    } catch (error) {
      console.log(chalk.yellow('Description not available'));
      debug('Failed to get video description', { error: error.message });
    }
    
    // Define quality mapping
    const qualityMap = {
      'hd': 'url_video_hd',
      'medium': 'url_video',
      'low': 'url_video_low'
    };
    
    // Get available qualities
    const availableQualities = [
      { name: 'High (HD)', value: 'url_video_hd' },
      { name: 'Medium', value: 'url_video' },
      { name: 'Low', value: 'url_video_low' }
    ].filter(q => selectedVideo[q.value]);
    
    debug('Available quality options', { 
      qualities: availableQualities.map(q => q.name) 
    });
    
    // Automatically select quality based on command line preference or select highest available
    let quality;
    
    // Try to use command line preference if it's available
    if (options.quality && qualityMap[options.quality.toLowerCase()]) {
      const preferredQuality = qualityMap[options.quality.toLowerCase()];
      if (selectedVideo[preferredQuality]) {
        quality = preferredQuality;
        console.log(chalk.cyan(`Selected quality: ${options.quality}`));
      }
    }
    
    // If no quality selected yet, select highest available quality
    if (!quality) {
      if (selectedVideo.url_video_hd) {
        quality = 'url_video_hd';
        console.log(chalk.cyan('Selected quality: High (HD)'));
      } else if (selectedVideo.url_video) {
        quality = 'url_video';
        console.log(chalk.cyan('Selected quality: Medium'));
      } else if (selectedVideo.url_video_low) {
        quality = 'url_video_low';
        console.log(chalk.cyan('Selected quality: Low'));
      }
    }
    
    debug('User selected quality', { quality });
    
    await downloadVideo(selectedVideo[quality], filename, selectedVideo);
  } catch (error) {
    console.error(chalk.red('Interactive mode failed:'), error);
    debug('Interactive mode exception', { error: error.message, stack: error.stack });
  }
  
  process.exit(0);
}


// Handle errors and cleanup
process.on('SIGINT', () => {
  console.log(chalk.yellow('\nExiting...'));
  debug('User interrupted program with SIGINT');
  socket.disconnect();
  debug('Socket disconnected during cleanup');
  process.exit(0);
});

// Log unhandled errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Unhandled exception:'), error);
  debug('CRITICAL: Unhandled exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled promise rejection:'), reason);
  debug('CRITICAL: Unhandled promise rejection', { reason: reason?.message || reason, stack: reason?.stack });
  process.exit(1);
});