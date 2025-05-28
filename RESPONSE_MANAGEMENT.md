# Response Management for Playwright MCP

This document explains the response management system that prevents large scraped data from overwhelming Claude Desktop conversations and causing early conversation length limits.

## The Problem

When using Playwright MCP tools like `browser_snapshot` or similar, the server can return enormous amounts of data (50,000+ tokens for complex pages like Amazon). This causes:

1. **Massive Token Consumption**: Single responses consuming tens of thousands of tokens
2. **Canvas Overload**: Claude Desktop trying to display all scraped data in the canvas
3. **Hidden Token Stats**: Token tracking information gets buried under massive responses
4. **Early Conversation Limits**: Hitting max conversation length much faster than necessary

## The Solution

The response management system automatically:

1. **Detects Large Responses**: Monitors response size before sending to Claude Desktop
2. **Saves to Files**: Automatically saves large content to files in the output directory
3. **Truncates Responses**: Shows only a preview in the conversation with a clear truncation notice
4. **Preserves Token Tracking**: Keeps token usage information visible and accessible

## Configuration Options

### CLI Flags

```bash
# Enable automatic file saving for large responses
npx @playwright/mcp --save-responses

# Set custom size limit (default: 10,000 characters)
npx @playwright/mcp --max-response-size 5000

# Enable truncation in conversation
npx @playwright/mcp --truncate-responses

# Combine with token tracking
npx @playwright/mcp --show-tokens --save-responses --truncate-responses
```

### Configuration File

```json
{
  "responseManagement": {
    "maxResponseSize": 10000,
    "saveToFiles": true,
    "truncateLargeResponses": true
  },
  "tokenTracking": {
    "enabled": true,
    "showDetails": true
  }
}
```

## How It Works

### 1. Size Detection
The system monitors all tool responses and detects when content exceeds the configured size limit.

### 2. File Saving
Large responses are automatically saved to timestamped files in the output directory:
- `response-2025-05-28T14-30-45-123Z.txt`

### 3. Response Truncation
When truncation is enabled, the conversation shows:
- First 80% of the size limit as preview content
- Clear truncation notice with statistics
- File reference for full content

### 4. Management Information
The system adds helpful information to responses:

```
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

## Example Usage

### For Claude Desktop

Update your Claude Desktop configuration:

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

### What You'll See

Instead of overwhelming responses, you'll get manageable output like:

```
- Ran Playwright code:
```js
await page.goto('https://amazon.com');
await page.getByRole('searchbox').fill('robot');
```

- Page URL: https://amazon.com/s?k=robot
- Page Title: Amazon.com : robot
- Page Snapshot

[First 6,400 characters of page content...]

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

## Benefits

### 1. **Conversation Length Management**
- Prevents early conversation termination due to large responses
- Keeps conversations focused and readable

### 2. **Token Visibility**
- Token tracking information remains visible and accessible
- Clear understanding of actual token costs

### 3. **Data Preservation**
- Full scraped data is preserved in files
- Easy access to complete information when needed

### 4. **Flexible Configuration**
- Customizable size limits based on your needs
- Optional features can be enabled/disabled independently

## Best Practices

### 1. **Use with Token Tracking**
Always combine response management with token tracking:
```bash
npx @playwright/mcp --show-tokens --save-responses --truncate-responses
```

### 2. **Adjust Size Limits**
Set appropriate limits based on your use case:
- **Conservative**: 5,000 characters for very clean conversations
- **Balanced**: 10,000 characters (default) for most use cases
- **Permissive**: 20,000 characters for detailed analysis

### 3. **Monitor Output Directory**
Regularly check the output directory for saved files:
```bash
ls -la /tmp/playwright-mcp-output/*/
```

### 4. **Use Targeted Extraction**
Prefer `browser_extract_data` over `browser_snapshot` when possible:
- More efficient token usage
- Structured data output
- Reduced need for response management

## Troubleshooting

### Files Not Being Saved
- Ensure `--save-responses` flag is enabled
- Check output directory permissions
- Verify disk space availability

### Truncation Not Working
- Confirm `--truncate-responses` flag is enabled
- Check that `maxResponseSize` is set appropriately
- Ensure both flags are used together

### Token Tracking Missing
- Add `--show-tokens` flag
- Verify configuration is correct
- Restart Claude Desktop after configuration changes

## Integration with Existing Tools

The response management system works seamlessly with all existing Playwright MCP tools:

- `browser_navigate`
- `browser_screenshot`
- `browser_snapshot`
- `browser_extract_data`
- `browser_click`
- And all other tools

No changes to existing workflows are required - the system automatically manages large responses while preserving all functionality.
