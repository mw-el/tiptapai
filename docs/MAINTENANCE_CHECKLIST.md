# Project Maintenance Checklist

**For humans:** This is an AI prompt for maintaining codebases. Use it every 5-10 changes or before releases to keep documentation synchronized with code.

**For AI:** Execute this checklist to update all project documentation and ensure production-readiness.


## REQUIRED FILES

### Root Directory

```
README.md           - Project overview, features, quick start
INSTALL.md          - Installation guide with troubleshooting
CHANGELOG.md        - Version history
LICENSE             - Legal terms
VERSION             - Current version (e.g., "1.2.0")
requirements.txt    - Python packages (pinned versions)
environment.yml     - Conda environment (exact versions)
.gitignore          - Files to exclude from git
install.sh          - Automated installation
smoke_test.py       - Basic functionality tests
```

### docs/ Directory

```
ARCHITECTURE.md     - Code organization
DEVELOPMENT.md      - Developer setup
UPGRADING.md        - Migration between versions (if breaking changes)
```


## MAINTENANCE TASKS

### 1. Code Inventory

**Scan codebase:**
```bash
find . -name "*.py" -o -name "*.js" -o -name "*.ts"
wc -l $(find . -name "*.py")
```

**Extract:**
- Entry points (files with `if __name__ == "__main__"`)
- Main classes/functions
- Dependencies (imports)
- Configuration files used
- External services/APIs called

### 2. Dependency Check

**Python:**
```bash
pip list --format=freeze > requirements-actual.txt
conda env export > environment-actual.yml
```

**Compare with documented versions:**
- Are versions in requirements.txt current?
- Are environment.yml versions exact (`==`)?
- Any new dependencies missing from docs?

**Update if needed.**

### 3. Documentation Sync

**For each file, verify:**

| File | Must Match | Check |
|------|-----------|-------|
| README.md | Current features | Does example code work? |
| INSTALL.md | install.sh steps | Does it match actual script? |
| ARCHITECTURE.md | Code structure | Are module names current? |
| CHANGELOG.md | Git history | Last 5-10 commits documented? |
| VERSION | Latest tag/release | Matches CHANGELOG? |

**Update any outdated content.**

### 4. Testing

**Run:**
```bash
./install.sh        # On fresh virtualenv
python smoke_test.py
```

**Verify:**
- Installation succeeds
- Smoke tests pass
- No errors in logs

**Fix any failures before proceeding.**

### 5. Git Hygiene

**Check:**
```bash
git status
git log --oneline -10
git tag
```

**Ensure:**
- No uncommitted changes in tracked files
- .gitignore covers secrets (*.env, config.yml, *.key)
- Latest changes have meaningful commit messages
- Version tag exists if releasing

### 6. Release Checklist (if applicable)

**Before release:**
- [ ] Update VERSION file
- [ ] Update CHANGELOG.md with changes since last release
- [ ] Update README.md if features changed
- [ ] Run full test suite
- [ ] Tag commit: `git tag vX.Y.Z`
- [ ] Build distribution (if applicable)


## AUTOMATED CHECKS

### Quick Validation Script

```bash
#!/bin/bash
# maintenance-check.sh

errors=0

# Check required files exist
for file in README.md INSTALL.md LICENSE .gitignore; do
    [ -f "$file" ] || { echo "✗ Missing: $file"; errors=$((errors+1)); }
done

# Check dependencies documented
if [ -f requirements.txt ]; then
    echo "✓ requirements.txt exists"
else
    echo "✗ No requirements.txt"
    errors=$((errors+1))
fi

# Check version consistency
if [ -f VERSION ]; then
    version=$(cat VERSION)
    if grep -q "$version" CHANGELOG.md; then
        echo "✓ VERSION matches CHANGELOG"
    else
        echo "✗ VERSION not in CHANGELOG"
        errors=$((errors+1))
    fi
fi

# Summary
echo ""
echo "Errors: $errors"
[ $errors -eq 0 ] && echo "✓ All checks passed" || echo "✗ Fix errors above"
exit $errors
```


## TEMPLATE: README.md

```markdown
# Project Name

Brief description (1-2 sentences).

## Features

- Feature 1
- Feature 2
- Feature 3

## Quick Start

\`\`\`bash
git clone REPO
cd REPO
./install.sh
./start_app.sh
\`\`\`

## Documentation

- [Installation](INSTALL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](CHANGELOG.md)

## Requirements

- OS: Ubuntu/Debian
- Python 3.10+ or Node.js 18+
- (Optional) GPU with CUDA 12.x

## License

[LICENSE](LICENSE)
```


## TEMPLATE: CHANGELOG.md

```markdown
# Changelog

## [Unreleased]
### Added
- New feature X

### Changed
- Updated dependency Y to version Z

### Fixed
- Bug in module A

## [1.0.0] - 2025-01-15
### Added
- Initial release
- Core functionality

[Unreleased]: https://github.com/user/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/user/repo/releases/tag/v1.0.0
```


## TEMPLATE: docs/ARCHITECTURE.md

```markdown
# Architecture

**For humans:** This explains how the code is organized.

## Structure

\`\`\`
project/
├── main.py           - Entry point
├── core/             - Core functionality
│   ├── module1.py
│   └── module2.py
├── utils/            - Helper functions
├── config/           - Configuration
└── tests/            - Tests
\`\`\`

## Key Components

### Module1 (core/module1.py)
- Purpose: Does X
- Key functions: func1(), func2()
- Dependencies: module2

### Module2 (core/module2.py)
- Purpose: Does Y
- Key functions: func3(), func4()
- Dependencies: None

## Data Flow

\`\`\`
User Input → main.py → module1 → module2 → Output
\`\`\`

## Configuration

Reads from: config.yml (created from config.example.yml)

## External Dependencies

- API X: Used for Y
- Service Z: Used for W
```


## COMMON ISSUES

| Issue | Cause | Fix |
|-------|-------|-----|
| Dependencies mismatch | requirements.txt outdated | Run `pip freeze > requirements.txt` |
| Install fails | Script doesn't match docs | Update INSTALL.md or install.sh |
| Tests fail | Code changed, tests didn't | Update tests or fix code |
| README examples broken | Features changed | Update examples |
| Missing files | Not in .gitignore | Add to .gitignore or commit |


## EXECUTION STEPS

1. **Scan:** Inventory code and dependencies
2. **Compare:** Check docs match reality
3. **Update:** Fix any mismatches
4. **Test:** Run install.sh + smoke tests
5. **Verify:** Run validation script
6. **Commit:** If releasing, tag version

**Frequency:** Every 5-10 commits, before releases, before deploying to new machines.


