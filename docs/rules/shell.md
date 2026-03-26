# shell

The `shell` plugin provides linting and formatting rules for shell scripts, helping catch common bugs, enforce consistent style, and promote best practices.

- Category: Plugin
- Rules: 21 total
- Auto-fixable: 8 rules
- Default: Most rules enabled (warn/error)
- File types: `.sh`, `.bash`, `.zsh` (also detected by shebang)

## Overview

The shell plugin covers three categories:

- **Error Prevention** (8 rules) - Catch dangerous patterns like unquoted variables, eval, and broken redirects
- **Style** (7 rules) - Enforce consistent indentation, function declarations, spacing, and whitespace
- **Best Practices** (6 rules) - Promote modern shell idioms like `[[ ]]`, `printf`, and `set -euo pipefail`

Shell files are detected by extension (`.sh`, `.bash`, `.zsh`, `.ksh`, `.dash`) or by shebang (`#!/bin/bash`, `#!/usr/bin/env zsh`, etc.).

## Configuration

Enable shell linting by adding rules to your `pluginRules`:

```ts
export default {
  pluginRules: {
    // Error prevention
    'shell/command-substitution': 'error',
    'shell/quote-variables': 'warn',
    'shell/no-cd-without-check': 'warn',
    'shell/no-eval': 'error',
    'shell/no-useless-cat': 'warn',
    'shell/no-ls-parsing': 'warn',
    'shell/no-variable-in-single-quotes': 'warn',
    'shell/no-exit-in-subshell': 'warn',

    // Style
    'shell/shebang': 'warn',
    'shell/indent': 'warn',
    'shell/function-style': 'warn',
    'shell/operator-spacing': 'warn',
    'shell/keyword-spacing': 'warn',
    'shell/no-trailing-semicolons': 'warn',
    'shell/no-trailing-whitespace': 'error',

    // Best practices
    'shell/prefer-double-brackets': 'warn',
    'shell/set-options': 'off', // opt-in
    'shell/prefer-printf': 'warn',
    'shell/consistent-case-terminators': 'warn',
    'shell/no-broken-redirect': 'error',
    'shell/heredoc-indent': 'warn',
  }
}
```

## Shell Formatting

When running `pickier format` or `pickier run --mode format`, shell scripts receive automatic indentation normalization for:

- `if`/`then`/`elif`/`else`/`fi` blocks
- `while`/`for`/`until`/`do`/`done` loops
- `case`/`esac` statements (including pattern bodies)
- Function bodies `name() { ... }`
- Nested combinations of all the above

Heredoc content is always preserved verbatim. Trailing whitespace is trimmed, blank lines are collapsed, and a final newline is ensured.

## Error Prevention Rules

### command-substitution

- **Default:** `error`
- **Auto-fix:** Yes

Use `$(...)` instead of backticks for command substitution. Backticks are harder to nest and read.

```bash
# Bad
result=`date`
nested=`echo \`whoami\``

# Good
result=$(date)
nested=$(echo $(whoami))
```

### quote-variables

- **Default:** `warn`
- **Auto-fix:** No

Quote variable expansions to prevent word splitting and pathname expansion.

```bash
# Bad
echo $name
rm $file

# Good
echo "$name"
rm "$file"
```

Safe contexts that don't require quoting: `[[ ]]` tests, `(( ))` arithmetic, `local`/`export`/`declare`/`readonly`/`typeset` declarations.

### no-cd-without-check

- **Default:** `warn`
- **Auto-fix:** No

Require error handling after `cd`. If `cd` fails silently, subsequent commands run in the wrong directory.

```bash
# Bad
cd /some/dir
rm -rf build/

# Good
cd /some/dir || exit 1
cd /some/dir || return 1
cd /some/dir && make build
```

### no-eval

- **Default:** `error`
- **Auto-fix:** No

Disallow `eval`. It re-parses arguments and can lead to code injection vulnerabilities.

```bash
# Bad
eval "$user_input"
eval "echo $cmd"

# Good — use arrays for dynamic commands
cmd_args=("echo" "hello")
"${cmd_args[@]}"
```

### no-useless-cat

- **Default:** `warn`
- **Auto-fix:** No

Detect useless use of `cat` (UUOC). Piping a single file through `cat` spawns an unnecessary process.

```bash
# Bad
cat file.txt | grep "pattern"

# Good
grep "pattern" file.txt
grep "pattern" < file.txt
```

### no-ls-parsing

- **Default:** `warn`
- **Auto-fix:** No

Don't parse `ls` output. Filenames can contain newlines, spaces, and special characters that break `ls` parsing.

```bash
# Bad
for f in $(ls *.txt); do echo "$f"; done
ls -la | grep ".txt"

# Good
for f in *.txt; do echo "$f"; done
find . -name "*.txt"
```

### no-variable-in-single-quotes

- **Default:** `warn`
- **Auto-fix:** No

Flag variables inside single quotes where they won't be expanded. This usually indicates the author intended double quotes.

```bash
# Bad — $HOME won't expand
echo 'Your home is $HOME'

# Good
echo "Your home is $HOME"

# OK — intentional literal dollar sign
grep '$pattern' file.txt
```

### no-exit-in-subshell

- **Default:** `warn`
- **Auto-fix:** No

Flag `exit` inside subshells where it only exits the subshell, not the parent script.

```bash
# Bad — exit only exits the subshell
(cd /dir && exit 1)
echo "This still runs!"

# Good
cd /dir || exit 1
```

## Style Rules

### shebang

- **Default:** `warn`
- **Auto-fix:** No

Ensure shell scripts have a proper shebang line with a recognized shell interpreter.

```bash
# Good
#!/bin/bash
#!/usr/bin/env bash
#!/bin/sh
#!/usr/bin/env zsh
```

### indent

- **Default:** `warn`
- **Auto-fix:** Yes

Enforce consistent indentation (2 spaces by default, matching `format.indent`). Tracks nesting for all shell control structures.

```bash
# Bad
if [[ -f file ]]; then
      echo "wrong"
fi

# Good
if [[ -f file ]]; then
  echo "correct"
fi
```

### function-style

- **Default:** `warn`
- **Auto-fix:** Yes

Prefer POSIX-compatible `name() {` over `function name {`.

```bash
# Bad
function my_func {
  echo "hello"
}

# Good
my_func() {
  echo "hello"
}
```

### operator-spacing

- **Default:** `warn`
- **Auto-fix:** Yes

Enforce spaces inside `[[ ]]` and `[ ]` test expressions.

```bash
# Bad
if [[-z "$var"]]; then

# Good
if [[ -z "$var" ]]; then
```

### keyword-spacing

- **Default:** `warn`
- **Auto-fix:** No

Enforce spacing around shell keywords — specifically after semicolons in control flow.

```bash
# Bad
if true;then echo ok; fi

# Good
if true; then echo ok; fi
```

### no-trailing-semicolons

- **Default:** `warn`
- **Auto-fix:** Yes

Remove unnecessary trailing semicolons. Semicolons are only needed to separate commands on the same line.

```bash
# Bad
echo "hello";

# Good
echo "hello"

# OK — separating commands
if true; then echo ok; fi
```

### no-trailing-whitespace

- **Default:** `error`
- **Auto-fix:** Yes

Disallow trailing whitespace on lines. Heredoc content is excluded.

## Best Practice Rules

### prefer-double-brackets

- **Default:** `warn`
- **Auto-fix:** Yes

Prefer `[[ ]]` over `[ ]` for test expressions in bash/zsh scripts. `[[ ]]` prevents word splitting, supports `&&`/`||`, and allows regex matching. Only applies when a bash/zsh shebang is detected — POSIX sh scripts are not flagged.

```bash
# Bad (in bash/zsh)
if [ -f "file" ]; then

# Good
if [[ -f "file" ]]; then
```

### set-options

- **Default:** `off` (opt-in)
- **Auto-fix:** No

Recommend `set -euo pipefail` for safer script execution:
- `-e`: Exit immediately on error
- `-u`: Error on undefined variables
- `-o pipefail`: Pipe failures propagate

```bash
#!/bin/bash
set -euo pipefail
```

### prefer-printf

- **Default:** `warn`
- **Auto-fix:** No

Prefer `printf` over `echo -e` and `echo -n`. `echo` behavior varies across shells and platforms; `printf` is portable and predictable.

```bash
# Bad
echo -e "hello\nworld"
echo -n "no newline"

# Good
printf "hello\nworld\n"
printf "no newline"
```

### consistent-case-terminators

- **Default:** `warn`
- **Auto-fix:** No

Ensure all case statement branches end with `;;` (except the last branch before `esac`).

```bash
case "$1" in
  start)
    echo "starting"
    ;;  # Required
  stop)
    echo "stopping"
    ;;
esac
```

### no-broken-redirect

- **Default:** `error`
- **Auto-fix:** No

Detect incorrect redirect ordering. `cmd 2>&1 > file` redirects stderr to the terminal, not the file.

```bash
# Bad — stderr goes to terminal, not the file
cmd 2>&1 > output.log

# Good
cmd > output.log 2>&1
cmd &> output.log
```

### heredoc-indent

- **Default:** `warn`
- **Auto-fix:** No

Recommend `<<-` instead of `<<` for heredocs inside indented blocks. With `<<`, the closing delimiter must be at column 0, which breaks indentation flow.

```bash
my_func() {
  # Bad — EOF must be at column 0
  cat <<EOF
hello
EOF

  # Good — <<- strips leading tabs
  cat <<-EOF
	hello
	EOF
}
```
