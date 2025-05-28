# Token Tracking Example

This example demonstrates how to use the token tracking feature with the Playwright MCP server.

## Setup

1. Start the MCP server with token tracking enabled:

```bash
npx @playwright/mcp --show-tokens
```

2. Connect your Claude Desktop or other MCP client to the server.

## Example Session

Here's what a typical session with token tracking looks like:

### 1. Navigate to a Website

**Input:**
```json
{
  "tool": "browser_navigate",
  "arguments": {
    "url": "https://example.com"
  }
}
```

**Output:**
```
- Ran Playwright code:
```js
await page.goto('https://example.com');
```

- Page URL: https://example.com
- Page Title: Example Domain

### Token Usage
- Input tokens (this action): 15
- Output tokens (this action): 67
- Total tokens (this action): 82

- Session input tokens: 15
- Session output tokens: 67
- Session total tokens: 82
```

### 2. Take a Screenshot

**Input:**
```json
{
  "tool": "browser_screenshot",
  "arguments": {}
}
```

**Output:**
```
- Ran Playwright code:
```js
await page.screenshot({ fullPage: false });
```

[Screenshot image would be displayed here]

- Page URL: https://example.com
- Page Title: Example Domain

### Token Usage
- Input tokens (this action): 8
- Output tokens (this action): 45
- Total tokens (this action): 53

- Session input tokens: 23
- Session output tokens: 112
- Session total tokens: 135
```

### 3. Extract Text Content

**Input:**
```json
{
  "tool": "browser_extract",
  "arguments": {
    "selector": "h1"
  }
}
```

**Output:**
```
- Ran Playwright code:
```js
const elements = await page.locator('h1').all();
const results = [];
for (const element of elements) {
  results.push({
    text: await element.textContent(),
    html: await element.innerHTML()
  });
}
```

Extracted 1 element(s):
- Element 1: "Example Domain"

- Page URL: https://example.com
- Page Title: Example Domain

### Token Usage
- Input tokens (this action): 12
- Output tokens (this action): 89
- Total tokens (this action): 101

- Session input tokens: 35
- Session output tokens: 201
- Session total tokens: 236
```

## High Usage Warning Example

After many operations, you might see a warning:

```
### Token Usage
- Input tokens (this action): 45
- Output tokens (this action): 123
- Total tokens (this action): 168

- Session input tokens: 98,234
- Session output tokens: 55,678
- Session total tokens: 153,912

📊 **Info**: Session has used a significant number of tokens. Monitor usage to avoid hitting limits.
```

Or for very high usage:

```
### Token Usage
- Input tokens (this action): 45
- Output tokens (this action): 123
- Total tokens (this action): 168

- Session input tokens: 145,234
- Session output tokens: 65,678
- Session total tokens: 210,912

⚠️  **Warning**: Session token count is getting high. Consider starting a new conversation to avoid hitting limits.
```

## Benefits in Practice

1. **Conversation Length Awareness**: You can see exactly how many tokens you've used
2. **Action Cost Understanding**: Different operations have different token costs
3. **Optimization Opportunities**: Identify which actions are most expensive
4. **Proactive Management**: Get warnings before hitting limits

## Tips for Token Management

1. **Monitor Session Totals**: Keep an eye on the cumulative token count
2. **Start Fresh When Needed**: Begin new conversations when approaching limits
3. **Optimize Queries**: Use specific selectors and targeted operations
4. **Batch Operations**: Combine multiple actions when possible

## Configuration Options

You can also enable token tracking via configuration file:

```json
{
  "tokenTracking": {
    "enabled": true,
    "showDetails": true
  },
  "browser": {
    "headless": false
  }
}
```

Then start the server:

```bash
npx @playwright/mcp --config config.json
