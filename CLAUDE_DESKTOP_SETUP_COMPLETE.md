# Complete Claude Desktop Setup Guide

This guide will help you configure Claude Desktop to use the Playwright MCP server with token tracking and response management features.

## 🚀 **SOLUTION FOR LARGE RESPONSE PROBLEM**

If you're experiencing issues with Claude writing everything it scraped into canvas and reaching conversation length limits early, use this configuration:

### **Recommended Configuration (Solves Large Response Issue)**

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--show-tokens",
        "--save-responses",
        "--truncate-responses",
        "--max-response-size", "8000"
      ]
    }
  }
}
```

### **What This Configuration Does:**

1. **`--show-tokens`**: Shows token usage after each action
2. **`--save-responses`**: Automatically saves large responses to files
3. **`--truncate-responses`**: Shows only a preview in conversation
4. **`--max-response-size 8000`**: Sets the size limit (8,000 characters)

### **Before vs After:**

**❌ Before (Problem):**
```
- Page Snapshot
[45,000+ characters of Amazon search results dumped into conversation]
[Token tracking buried and invisible]
[Conversation hits length limit quickly]
```

**✅ After (Solution):**
```
- Page Snapshot
[First 6,400 characters of content...]

--- RESPONSE TRUNCATED ---
Original size: 45,234 characters
Showing: 6,400 characters
Truncated: 38,834 characters
Full response saved to: response-2025-05-28T14-30-45-123Z.txt
--- END TRUNCATION ---

📄 **Response Management**: Large response (45,234 chars) was processed
💾 **Files Saved**: 1 file(s) saved to output directory
   - response-2025-05-28T14-30-45-123Z.txt

### Token Usage
- Input tokens (this action): 45
- Output tokens (this action): 2,123
- Total tokens (this action): 2,168

- Session input tokens: 1,234
- Session output tokens: 8,901
- Session total tokens: 10,135
```

## Configuration Options

### **Basic Setup (No Special Features)**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js"
      ]
    }
  }
}
```

### **Token Tracking Only**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--show-tokens"
      ]
    }
  }
}
```

### **Response Management Only**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--save-responses",
        "--truncate-responses"
      ]
    }
  }
}
```

### **Full Featured (Recommended)**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--show-tokens",
        "--save-responses",
        "--truncate-responses",
        "--max-response-size", "8000",
        "--headless"
      ]
    }
  }
}
```

### **Conservative (Very Clean Conversations)**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": [
        "/Users/calvin/Documents/playwright-mcp/cli.js",
        "--show-tokens",
        "--save-responses",
        "--truncate-responses",
        "--max-response-size", "5000"
      ]
    }
  }
}
```

## Available CLI Options

### **Response Management**
- `--save-responses`: Save large responses to files
- `--truncate-responses`: Show only preview in conversation
- `--max-response-size <size>`: Set size limit (default: 10000)

### **Token Tracking**
- `--show-tokens`: Display token usage after each action

### **Browser Options**
- `--headless`: Run browser in headless mode
- `--browser <browser>`: Choose browser (chrome, firefox, webkit)
- `--device <device>`: Emulate device (e.g., "iPhone 15")

### **Output Options**
- `--output-dir <path>`: Set output directory for files
- `--vision`: Use screenshots instead of snapshots

## Setup Steps

1. **Update Configuration**: Replace your current Playwright MCP configuration in Claude Desktop
2. **Restart Claude Desktop**: Close and reopen Claude Desktop
3. **Test Connection**: Ask Claude to list available tools
4. **Verify Features**: Check that token tracking and response management work

## Benefits

### **🎯 Solves Large Response Problem**
- ✅ No more overwhelming canvas dumps
- ✅ Token tracking always visible
- ✅ Longer conversations possible
- ✅ Full data preserved in files

### **📊 Token Awareness**
- ✅ Real-time token usage tracking
- ✅ Session totals and warnings
- ✅ Cost optimization insights

### **🔧 Flexible Configuration**
- ✅ Customizable size limits
- ✅ Optional features
- ✅ Multiple output formats

## Troubleshooting

### **Server Won't Start**
- Check the path: `/Users/calvin/Documents/playwright-mcp/cli.js`
- Ensure Node.js is installed
- Run `npm install` in the project directory

### **Unknown Option Errors**
- Make sure you've built the project: `npm run build`
- Verify all CLI options are available: `node cli.js --help`

### **Features Not Working**
- Restart Claude Desktop after configuration changes
- Check Claude Desktop logs for errors
- Verify JSON syntax in configuration

### **Files Not Being Saved**
- Check output directory permissions
- Ensure `--save-responses` flag is enabled
- Verify disk space availability

## Advanced Usage

### **Custom Size Limits**
```bash
# Very conservative (clean conversations)
--max-response-size 3000

# Balanced (default)
--max-response-size 10000

# Permissive (detailed analysis)
--max-response-size 20000
```

### **Output Directory**
```bash
# Custom output location
--output-dir "/Users/calvin/playwright-outputs"
```

### **Browser Configuration**
```bash
# Use Firefox instead of Chrome
--browser firefox

# Emulate mobile device
--device "iPhone 15"

# Run in headed mode (see browser)
# (omit --headless flag)
```

## File Locations

### **Saved Responses**
Large responses are saved to timestamped files:
- `response-2025-05-28T14-30-45-123Z.txt`

### **Default Output Directory**
- macOS: `/tmp/playwright-mcp-output/[timestamp]/`
- Linux: `/tmp/playwright-mcp-output/[timestamp]/`
- Windows: `%TEMP%\playwright-mcp-output\[timestamp]\`

## What's New

### **🎯 browser_extract_data Tool**
- 85-95% token reduction for data extraction
- Multiple output formats (JSON, CSV, Text)
- CSS selector and JavaScript support

### **📊 Token Tracking**
- Real-time input/output token monitoring
- Session totals and warnings
- Cost optimization insights

### **🚀 Response Management**
- Automatic large response detection
- File saving with truncation
- Conversation length preservation

## Example Workflows

### **Web Scraping with Management**
1. Navigate to a complex page (e.g., Amazon search)
2. Use browser tools to interact with the page
3. Large responses automatically saved to files
4. Token usage clearly displayed
5. Conversation remains manageable

### **Data Extraction**
1. Use `browser_extract_data` for targeted extraction
2. Get structured data without overwhelming responses
3. Monitor token costs in real-time
4. Optimize extraction strategies

The enhanced Playwright MCP server provides powerful web automation capabilities while maintaining clean, manageable conversations and full visibility into token usage.
