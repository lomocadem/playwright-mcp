# Claude Desktop Configuration Examples

## Your Current Config
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["/Users/calvin/Documents/playwright-mcp/cli.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Enhanced Configurations with New Features

### 1. Quiet Mode (Minimal Output)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--quiet"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 2. Verbose Mode (Detailed Output)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--verbose"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 3. Custom Output Directory
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--output-dir", "/Users/calvin/Downloads/playwright-exports"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 4. Quiet Mode + Custom Output Directory
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--quiet",
        "--output-dir", "/Users/calvin/Downloads/playwright-exports"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 5. Legacy Behavior (Use Tmp Directory)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--use-tmp"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 6. Full Configuration with All Options
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--verbose",
        "--output-dir", "/Users/calvin/Downloads/playwright-exports",
        "--verbosity-level", "3",
        "--show-tokens"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Available CLI Options

### Verbosity Options
- `--quiet` - Minimal output (20 elements max)
- `--verbose` - Detailed output (150 elements max)
- `--verbosity-level <1-5>` - Numeric verbosity level

### Output Options
- `--output-dir <path>` - Custom output directory
- `--use-tmp` - Use temporary directory (legacy behavior)

### Other Useful Options
- `--show-tokens` - Display token usage information
- `--headless` - Run browser in headless mode
- `--save-responses` - Save large responses to files
- `--truncate-responses` - Truncate large responses

## Recommended Configurations

### For Development/Testing
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--verbose",
        "--show-tokens",
        "--output-dir", "/Users/calvin/Downloads/playwright-dev"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### For Production Use
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--quiet",
        "--output-dir", "/Users/calvin/Documents/playwright-exports"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### For Data Extraction Projects
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--output-dir", "/Users/calvin/Documents/data-extraction",
        "--save-responses",
        "--show-tokens"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## How to Update Your Config

1. **Open Claude Desktop Settings**
2. **Navigate to the MCP configuration**
3. **Replace your current config with one of the examples above**
4. **Restart Claude Desktop** for changes to take effect

## Testing Your Configuration

After updating your config, you can test the new features:

1. **Navigate to a website** - Notice the reduced verbosity
2. **Export crawl data** - Check that files go to your specified directory
3. **Use different verbosity levels** - Compare output sizes

The new smart summarization will automatically reduce verbose navigation output while preserving all interactive elements you need for automation tasks.
