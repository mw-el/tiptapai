# Development Guidelines

**For humans:** Coding standards and best practices for this project. Ask AI to explain specific rules.

**For AI:** Follow these principles when writing or modifying code.

---

## CORE PRINCIPLES

1. **KISS** - Simplest solution that works
2. **Separation of Concerns** - One responsibility per module
3. **DRY** - Don't Repeat Yourself
4. **YAGNI** - You Aren't Gonna Need It
5. **Quality > Speed** - Working code beats fast code

---

## CODE RULES

### Simplicity

**DO:**
- Choose simplest solution
- Direct implementation
- Add features only when needed

**DON'T:**
- Clever abstractions without need
- Premature optimization
- Speculative features

```python
# GOOD
def get_user(user_id):
    return db.query(User).filter(User.id == user_id).first()

# BAD - unnecessary complexity
def get_user(user_id):
    cache = Cache()
    if cache.has(user_id):
        return cache.get(user_id)
    # ... caching not needed yet!
```

### Separation of Concerns

**DO:**
- One module = one responsibility
- Separate business logic from presentation
- Separate data access from business logic

**DON'T:**
- Mix database queries with UI code
- Mix business logic with data models
- Mix concerns in single function

```python
# GOOD
class User:
    def save(self):
        db.session.add(self)
        db.session.commit()

class UserService:
    def register(self, user_data):
        user = User(**user_data)
        user.save()
        EmailService.send_welcome(user.email)
        Analytics.track_registration(user.id)

# BAD - mixed concerns
class User:
    def save(self):
        db.session.add(self)
        db.session.commit()
        send_email(self.email)  # Wrong place!
        track_analytics(self.id)  # Wrong place!
```

### DRY (Don't Repeat Yourself)

**DO:**
- Extract repeated code to functions
- Use configuration for repeated values
- Reuse existing utilities

**DON'T:**
- Copy-paste code blocks
- Duplicate logic
- Hardcode same values multiple times

```python
# GOOD
def validate_email(email):
    return re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email)

def register_user(email):
    if not validate_email(email):
        raise ValueError("Invalid email")

def update_email(email):
    if not validate_email(email):
        raise ValueError("Invalid email")

# BAD - duplicated validation
def register_user(email):
    if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
        raise ValueError("Invalid email")

def update_email(email):
    if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
        raise ValueError("Invalid email")
```

### Error Handling

**DO:**
- Handle expected errors explicitly
- Provide helpful error messages
- Log errors with context
- Fail gracefully

**DON'T:**
- Bare except clauses
- Silent failures
- Generic error messages
- Swallow exceptions

```python
# GOOD
try:
    user = get_user(user_id)
except DatabaseError as e:
    logger.error(f"Failed to get user {user_id}: {e}")
    return None

# BAD
try:
    user = get_user(user_id)
except:  # Don't catch everything!
    pass  # Don't swallow errors!
```

---

## NAMING CONVENTIONS

### Variables & Functions

```python
# Use descriptive names
user_count = get_active_users()  # GOOD
n = get_usr()  # BAD

# Functions are verbs
def calculate_total(items):  # GOOD
def total(items):  # Less clear

# Booleans are questions
is_valid = check_email(email)  # GOOD
valid = check_email(email)  # Less clear
```

### Classes

```python
# Nouns, PascalCase
class UserManager:  # GOOD
class user_manager:  # BAD

# Descriptive purpose
class EmailValidator:  # GOOD
class EV:  # BAD
```

### Constants

```python
# UPPER_CASE
MAX_RETRIES = 3  # GOOD
max_retries = 3  # BAD
```

---

## COMMENTS

**When to comment:**
- Why something is done (not what)
- Non-obvious workarounds
- Important assumptions
- TODOs with context

**When NOT to comment:**
- Obvious code
- Repeating function name
- Outdated information

```python
# GOOD - explains WHY
# Use explicit path to avoid conda env issues
python_path = "/home/user/miniconda3/envs/myenv/bin/python"

# BAD - states the obvious
# Set python_path variable
python_path = "/path/to/python"

# GOOD - documents workaround
# Withdrawn window causes 5s delay without this check
if app.state() != 'withdrawn':
    app.update()

# BAD - repeats code
# Check if app state is not withdrawn
if app.state() != 'withdrawn':
    app.update()
```

---

## TESTING

**Required tests:**
- Core functionality
- Error cases
- Edge cases
- Integration points

**Test structure:**
```python
def test_user_registration():
    # Arrange
    user_data = {"email": "test@example.com", "name": "Test"}

    # Act
    user = UserService.register(user_data)

    # Assert
    assert user.email == "test@example.com"
    assert user.is_active
```

**Don't test:**
- Third-party libraries
- Trivial getters/setters
- Framework internals

---

## GIT COMMITS

**Format:**
```
Type: Brief summary (50 chars)

Detailed explanation if needed.
- Why change was made
- What problem it solves
- Any side effects

Fixes #123
```

**Types:**
- `Fix:` Bug fixes
- `Add:` New features
- `Update:` Modify existing features
- `Refactor:` Code restructuring
- `Docs:` Documentation only
- `Test:` Test additions/changes

**Examples:**
```
GOOD:
Fix: Prevent 5s delay in hotkey mode when window withdrawn

Added state check before app.update() to avoid blocking.
Affects initialize_model() and toggle_recording().

Fixes #42

BAD:
Fixed bug
```

---

## CODE REVIEW CHECKLIST

Before committing:
- [ ] Code follows KISS principle
- [ ] No duplicated logic (DRY)
- [ ] Clear variable/function names
- [ ] Error handling present
- [ ] Comments explain WHY, not WHAT
- [ ] Tests pass
- [ ] No debugging code (print statements, etc.)
- [ ] Commit message is clear

---

## PROJECT-SPECIFIC RULES

### Dictate App

**Critical patterns:**
```python
# ALWAYS check withdrawn state before app.update()
if app.state() != 'withdrawn':
    app.update()

# Use exact package versions in environment.yml
av==16.0.1  # Not av>=16.0.0

# Use tk.Tk(), not tb.Window()
app = tk.Tk(className='dictate')
style = tb.Style(theme='sandstone')
```

**File structure:**
```
Core logic: dictate.py
Config: config.py
Hotkeys: hotkey_manager.py
Tray: tray_icon_appindicator.py
Utils: window_manager.py
```

**Dependencies:**
- PyAV==16.0.1 (CRITICAL for audio)
- PyTorch==2.5.1
- faster-whisper==1.2.0

---

## WHEN TO REFACTOR

**DO refactor when:**
- Function > 50 lines
- Duplicated code blocks
- Unclear naming
- Complex conditionals (> 3 levels deep)
- Adding third occurrence of same pattern

**DON'T refactor when:**
- Code works and is clear
- No duplication
- No planned changes
- "Just because"

---

## COMMON MISTAKES

| Mistake | Why Bad | Fix |
|---------|---------|-----|
| Bare `except:` | Catches everything | Use specific exceptions |
| Hardcoded paths | Breaks on other systems | Use $HOME, config |
| No error messages | Hard to debug | Log with context |
| Premature optimization | Wastes time | Optimize when needed |
| God classes | Hard to maintain | Split responsibilities |
| Deep nesting | Hard to read | Early returns, extract functions |

---

## RESOURCES

**Internal docs:**
- ARCHITECTURE.md - Code structure
- REPRODUCIBLE_INSTALLATION.md - Setup system
- MAINTENANCE_CHECKLIST.md - Regular tasks

**External:**
- PEP 8 (Python style guide)
- Clean Code (Robert C. Martin)
- The Pragmatic Programmer
