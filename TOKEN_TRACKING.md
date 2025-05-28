# Token Tracking Feature

This document describes the token tracking functionality added to the Playwright MCP server to help monitor input and output token usage during conversations.

## Overview

The token tracking feature provides real-time monitoring of token usage for each action performed through the MCP server. This helps users understand when conversations might be approaching token limits and provides insights into the cost of different operations.

## Features

- **Real-time Token Tracking**: Displays input and output tokens for each action
- **Session Totals**: Maintains running totals for the entire session
- **Automatic Warnings**: Shows warnings when token usage gets high
- **Configurable**: Can be enabled/disabled via CLI or configuration

## Usage

### CLI Option

Enable token tracking using the `--show-tokens` flag:

```bash
npx @playwright/mcp --show-tokens
```

### Configuration File

Add token tracking to your configuration file:

```json
{
  "tokenTracking": {
    "enabled": true,
    "showDetails": true
  }
}
```

### Programmatic Configuration

```javascript
import { createConnection } from '@playwright/mcp';

const connection = await createConnection({
  tokenTracking: {
    enabled: true,
    showDetails: true
  }
});
```

## Output Format

When token tracking is enabled, each tool response will include a token usage section:

```
### Token Usage
- Input tokens (this action): 45
- Output tokens (this action): 123
- Total tokens (this action): 168

- Session input tokens: 1,234
- Session output tokens: 5,678
- Session total tokens: 6,912
```

### Warnings

The system provides automatic warnings when token usage gets high:

- **Info Warning** (100K+ tokens): Notifies that significant tokens have been used
- **High Usage Warning** (150K+ tokens): Warns that the session is approaching limits

## Token Estimation

Since the MCP server doesn't have direct access to the LLM's token counting, it uses estimation:

- **Character-based Estimation**: Approximately 4 characters per token
- **Structured Data**: JSON serialization for objects and arrays
- **Conservative Approach**: Tends to slightly overestimate to be safe

## Implementation Details

### Core Components

1. **TokenTracker Class** (`src/tokenTracker.ts`): Handles token estimation and tracking
2. **Configuration Integration**: Added to config types and CLI options
3. **Context Integration**: Integrated into the main execution flow

### Token Estimation Algorithm

```typescript
// Basic text estimation
const estimatedTokens = Math.ceil(normalizedText.length / 4);

// Structured data estimation
const jsonString = JSON.stringify(data);
return this.estimateTokens(jsonString);
```

### Integration Points

- **Tool Execution**: Tracks tokens for every tool call
- **Response Generation**: Appends token usage to responses
- **Error Handling**: Includes token tracking even for error responses

## Benefits

1. **Conversation Management**: Know when to start a new conversation
2. **Cost Awareness**: Understand the token cost of different operations
3. **Optimization**: Identify opportunities to reduce token usage
4. **Debugging**: Track token consumption patterns

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | false | Enable/disable token tracking |
| `showDetails` | boolean | true | Show detailed breakdown in responses |

## Examples

### Basic Usage

```bash
# Start server with token tracking
npx @playwright/mcp --show-tokens

# Navigate to a page (example output)
### Token Usage
- Input tokens (this action): 12
- Output tokens (this action): 89
- Total tokens (this action): 101

- Session input tokens: 12
- Session output tokens: 89
- Session total tokens: 101
```

### High Usage Warning

```
### Token Usage
- Input tokens (this action): 45
- Output tokens (this action): 123
- Total tokens (this action): 168

- Session input tokens: 98,234
- Session output tokens: 55,678
- Session total tokens: 153,912

⚠️  **Warning**: Session token count is getting high. Consider starting a new conversation to avoid hitting limits.
```

## Troubleshooting

### Token Tracking Not Showing

1. Ensure `--show-tokens` flag is used or config has `tokenTracking.enabled: true`
2. Check that the server is using the latest version with token tracking support

### Inaccurate Token Counts

- Token estimation is approximate and may not match exact LLM token counts
- The estimation errs on the side of being slightly higher for safety
- Different LLMs may have different tokenization approaches

## Future Enhancements

Potential improvements for future versions:

1. **LLM-specific Tokenizers**: Use actual tokenizers for more accurate counts
2. **Token Budget Management**: Set limits and warnings
3. **Historical Tracking**: Save token usage across sessions
4. **Performance Metrics**: Track tokens per operation type
