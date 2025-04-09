# mediathekview-cli

A command-line interface for searching and downloading videos from MediathekViewWeb.

## Features

- Interactive search with filtering
- Channel filtering with optional interactive selection
- Automatic video quality selection
- Custom filename prompt when downloading
- Direct playback using mpv (if available)
- Download progress tracking

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mediathekviewweb-cli.git

# Navigate to the directory
cd mediathekviewweb-cli

# Install dependencies
npm install

# Link the CLI globally (optional)
npm link
```

## Usage

### Interactive Mode

```bash
# Start in interactive mode (default)
mediathekview

# Interactive mode with channel filtering
mediathekview -i -c "ARD"

# Interactive mode with specified server
mediathekview -s https://mediathekviewweb.de
```

### Direct Commands

```bash
# List all available channels
mediathekview --channels

# Search for videos (all channels, no limit)
mediathekview -q "Tatort"

# Search in a specific channel
mediathekview -q "Tatort" -c "ARD"

# Search with channel selection prompt
mediathekview -q "Tatort" -c

# Search with result limit
mediathekview -q "Tatort" -l 10

# Search with both channel filter and limit
mediathekview -q "Tatort" -c "ZDF" -l 5

# Specify a preferred video quality
mediathekview -q "Tatort" --quality medium

# Download a specific video by ID
mediathekview -d "some-video-id"

# Specify output file (skips filename prompt)
mediathekview -q "Tatort" -o ~/Downloads/tatort.mp4
```

### Options

```
Options:
  -V, --version          output the version number
  -s, --server <url>     Server URL (default: "https://mediathekviewweb.de")
  --channels             List available channels
  -q, --query <query>    Search query
  -d, --download <id>    Download video by ID
  -o, --output <path>    Output file path for download
  -i, --interactive      Interactive mode
  -l, --limit <limit>    Limit search results (default: no limit)
  -c, --channel [channel] Filter results by channel (prompts if no value provided)
  --quality <quality>    Video quality (hd, medium, low) (default: hd)
  --debug                Enable debug mode (verbose console output)
  -h, --help             display help for command
```

## Requirements

- Node.js 14 or later
- mpv player (optional, for direct playback)

## Configuration File

The CLI automatically creates a configuration file at `~/.mediathekviewrc` on first run. This file uses INI format and allows you to set default values for various options:

```ini
# Server URL
server = https://mediathekviewweb.de

# Default channel (comment out for no default)
# channel = ARD

# Video quality (hd, medium, low)
quality = hd

# Default limit for search results (comment out for no limit)
# limit = 50

# Default output file path (comment out for interactive prompt)
# output = ~/Videos/mediathek.mp4
```

Command-line arguments will override these defaults when provided.

## Debug Mode

The CLI includes a debug mode that outputs detailed information about its operations to the console. This is helpful for troubleshooting issues or understanding the application flow.

To enable debug mode, use the `--debug` flag with any command:

```bash
mediathek --debug
mediathek --debug -q "Tatort"
mediathek --debug -c
```

When debug mode is enabled:
- Verbose output is printed to the console
- Output includes timestamps and structured JSON data
- Detailed information about API requests, responses, and user interactions is displayed
- Download progress and any errors are logged

Example debug output:
```
[2023-04-09T14:30:21.123Z] CLI started with options {"server":"https://mediathekviewweb.de","debug":true}
[2023-04-09T14:30:22.456Z] Socket connected {"server":"https://mediathekviewweb.de","socketId":"abcd1234"}
[2023-04-09T14:30:25.789Z] Search results received {"count":15,"queryInfo":{"filmlisteTimestamp":1234567890,"searchEngineTime":"123.45","resultCount":15,"totalResults":256}}
```

## License

MIT