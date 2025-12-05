# Contributing to Terminal Invoicing

Thank you for your interest in contributing to Terminal Invoicing! This document provides guidelines and information for contributors.

## 🐛 Reporting Bugs

If you find a bug, please open an issue on GitHub with:

- **Clear description** of the problem
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details**: OS, Node.js version, shell (bash/PowerShell/cmd)
- **Error messages** and logs (from `~/.terminal-invoicing/logs/`)

## 💡 Suggesting Features

Feature requests are welcome! Please open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternative approaches you've considered
- How this fits with the project's goals (simple, maintainable, file-based invoicing)

## 🔧 Development Setup

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/yourusername/terminal-invoicing.git
   cd terminal-invoicing
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up data directory** (separate from source):
   ```bash
   export TERMINAL_INVOICING_ROOT="/path/to/test-data"
   node bin/terminv.js init
   ```

4. **Test your changes**:
   ```bash
   node bin/terminv.js --help
   ```

## 📝 Code Style Guidelines

- **JavaScript**: Clean, readable ES6+ code with clear variable names
- **Comments**: JSDoc for all public functions and classes
- **Line length**: Keep lines under 100 characters where reasonable
- **Formatting**: 4-space indentation (or 2-space, be consistent)
- **Error handling**: Always use try/catch, provide helpful error messages

## 🎯 Known Issues & High-Priority Fixes

### Critical Bug: Path Handling (Windows + Git Bash)

**Issue**: Environment variable paths with backslashes cause tab character interpretation (`\t` = tab).

**Current workaround**: Users must use `D:/path` format instead of `/d/path` in Git Bash.

**Needs fixing in**: `src/utils/file-utils.js` - the `getProjectRoot()` function needs proper path normalization.

**Proposed solution**:
```javascript
function getProjectRoot() {
  if (process.env.TERMINAL_INVOICING_ROOT) {
    const root = process.env.TERMINAL_INVOICING_ROOT;
    // Normalize path for cross-platform compatibility
    return path.normalize(root).replace(/\\/g, '/');
  }
  // ... rest of function
}
```

**Help wanted**: Testing across Windows (Git Bash, PowerShell, CMD), Mac, and Linux.

### Medium Priority: ESM Module Support

**Issue**: Using older `inquirer` v8.2.6 for CommonJS compatibility. Version 9+ is ESM-only.

**Options**:
1. Keep v8 (stable, works fine)
2. Convert to ESM (modern, but breaking change)
3. Use dynamic imports (hybrid approach)

**Help wanted**: Opinions and testing on ESM migration.

## 🧪 Testing

Currently, the project lacks automated tests. **This is a great area to contribute!**

**High-value tests needed**:
- PDF generation (layout rendering)
- Invoice calculation (totals, line items)
- YAML validation
- Archive creation/extraction
- Email template rendering
- Path utilities (especially cross-platform)

**Suggested framework**: Jest or Mocha

## 🔌 Creating Plugins

### Custom Layouts

Layouts define how invoices render to PDF. See `layouts/README.md` for the complete guide.

**Required structure**:
```javascript
module.exports = {
  name: 'my-layout',
  description: 'Layout description',
  author: 'Your Name',
  version: '1.0.0',
  render(doc, data, config) {
    // PDFKit rendering code
  }
};
```

### Email Providers

Add support for new email services. See `email-providers/README.md` for the complete guide.

**Required structure**:
```javascript
module.exports = {
  name: 'my-provider',
  description: 'Provider description',
  async send(options, config) {
    // Send email and return delivery info
  }
};
```

## 📦 Pull Request Process

1. **Create a feature branch**: `git checkout -b feature/my-feature`

2. **Make your changes**:
   - Write clean, documented code
   - Follow existing code style
   - Add JSDoc comments for new functions
   - Test thoroughly

3. **Update documentation**:
   - Update README.md if adding features
   - Update relevant plugin READMEs
   - Add examples if applicable

4. **Commit with clear messages**:
   ```bash
   git commit -m "Add feature: description of what was added"
   ```

5. **Push and create PR**:
   ```bash
   git push origin feature/my-feature
   ```
   - Describe what your PR does
   - Reference any related issues
   - Include testing steps

6. **Code review**:
   - Address feedback promptly
   - Keep discussion focused and respectful
   - Be patient - this is maintained by volunteers

## 🎨 Areas Where Help Is Needed

### High Priority
- [ ] Fix Windows path handling bug (see above)
- [ ] Add automated tests
- [ ] Test on Linux and Mac
- [ ] Improve error messages

### Medium Priority
- [ ] Additional layout templates
- [ ] More email provider plugins (SendGrid, SMTP, etc.)
- [ ] Better CLI help text and examples
- [ ] Invoice templates (different styles)

### Nice to Have
- [ ] Tax calculation support
- [ ] Multi-currency support
- [ ] Discount/coupon codes
- [ ] Recurring invoice templates
- [ ] Web UI (separate project?)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 💬 Questions?

- Open an issue for technical questions
- Email: admin@jaypeesoftworks.com
- Be respectful and patient - we're all volunteers!

## 🙏 Thank You!

Every contribution, no matter how small, helps make Terminal Invoicing better for everyone. We appreciate your time and effort!

---

**Remember**: Perfect is the enemy of good. Don't be afraid to submit a PR even if it's not perfect - we can iterate together!
