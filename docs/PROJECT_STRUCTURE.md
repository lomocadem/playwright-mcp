# Project Structure

## 📁 Directory Organization

```
playwright-mcp/
├── 📁 src/                    # Source code
│   ├── 📁 tools/              # MCP tools implementation
│   ├── 📁 resources/          # MCP resources
│   ├── config.ts              # Configuration management
│   ├── program.ts             # CLI program definition
│   ├── pageSummarizer.ts      # Smart page summarization
│   ├── contentAnalyzer.ts     # Advanced content analysis
│   └── ...                    # Other core modules
│
├── 📁 docs/                   # Documentation
│   ├── README.md              # Main project documentation
│   ├── CLAUDE_DESKTOP_FIXED_CONFIG.md # Working config guide
│   ├── PHASE_1_2_COMPLETE.md  # Implementation summary
│   ├── INTELLIGENT_CRAWLER.md # Crawler documentation
│   ├── DATABASE_FIRST_APPROACH.md # Database guide
│   └── ...                    # Other documentation
│
├── 📁 examples/               # Usage examples
│   ├── data-extraction-examples.md
│   ├── pagination-extraction-guide.md
│   └── intelligent-crawler-example.md
│
├── 📁 tests/                  # All test files (official + development)
│   ├── capabilities.spec.ts   # Official Playwright tests
│   ├── core.spec.ts          # Official Playwright tests
│   ├── test-extraction.js     # Development tests
│   ├── test-pagination-demo.js # Pagination testing
│   ├── test-phase1-improvements.cjs # Phase 1 feature tests
│   ├── test-amazon-extraction.html # Amazon test page
│   └── ...                    # Other test files
│
├── 📁 lib/                    # Compiled JavaScript
├── 📁 utils/                  # Utility scripts
├── 📁 init-db/                # Database initialization
│
├── cli.js                     # CLI entry point
├── package.json               # Project configuration
├── tsconfig.json              # TypeScript configuration
├── docker-compose.yml         # Docker setup
└── .env                       # Environment variables
```

## 🎯 Key Directories

### `/src` - Source Code
- **Core modules**: Configuration, program setup, database management
- **Tools**: MCP tool implementations for browser automation
- **Smart features**: Page summarization and content analysis
- **Resources**: MCP resource providers

### `/docs` - Documentation
- **Setup guides**: Claude Desktop configuration and installation
- **Feature documentation**: Detailed explanations of capabilities
- **Implementation notes**: Technical details and architecture
- **User guides**: How-to documentation for various features

### `/examples` - Usage Examples
- **Code samples**: Practical examples of using the MCP server
- **Guides**: Step-by-step tutorials for common tasks
- **Best practices**: Recommended patterns and approaches

### `/tests` - All Test Files
- **Official tests**: Playwright test suite (*.spec.ts files)
- **Development tests**: Feature testing and demos (test-*.js files)
- **Test pages**: HTML files for testing specific scenarios
- **Test utilities**: Helper functions and fixtures

## 🚀 Recent Improvements

### Phase 1 & 2 Implementation
- **Smart page summarization**: Reduces verbose output by 80%
- **Configurable output directories**: No more tmp file confusion
- **Enhanced CLI options**: `--quiet`, `--verbose`, `--output-dir`
- **Better file naming**: Meaningful names with site information

### File Organization
- **Cleaner structure**: Consolidated all tests into `/tests` directory
- **Better navigation**: Logical grouping of related files
- **Improved maintainability**: Easier to find and update files

## 📋 Quick Navigation

### For Users
- **Setup**: `docs/CLAUDE_DESKTOP_FIXED_CONFIG.md`
- **Features**: `docs/PHASE_1_2_COMPLETE.md`
- **Examples**: `examples/` directory

### For Developers
- **Source code**: `src/` directory
- **All tests**: `tests/` directory
- **Build output**: `lib/` directory

### For Documentation
- **All docs**: `docs/` directory
- **Project structure**: This file
- **README**: `docs/README.md`

## 🔧 Development Workflow

1. **Source changes**: Edit files in `src/`
2. **Build**: Run `npm run build` to compile TypeScript
3. **Test**: Run tests from `tests/` directory
   - Official tests: `npm test` (runs *.spec.ts files)
   - Development tests: `node tests/test-*.js` or `node tests/test-*.cjs`
4. **Document**: Update relevant files in `docs/`
5. **Examples**: Add usage examples to `examples/`

## 🧪 Testing

### Official Test Suite
```bash
npm test                    # Run all official Playwright tests
npm run test:headed         # Run tests in headed mode
```

### Development Tests
```bash
node tests/test-phase1-improvements.cjs    # Test Phase 1 features
node tests/test-extraction.js              # Test data extraction
node tests/test-pagination-demo.js         # Test pagination
```

This organized structure makes the project much easier to navigate and maintain, with all tests consolidated in the `/tests` directory!
