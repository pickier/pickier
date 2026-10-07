# Pickier VS Code Extension - Example Files

This folder contains comprehensive example files to test all features of the Pickier VS Code extension.

## How to Test

### Step 1: Launch Extension Development Host

1. Open this workspace in VS Code
2. Go to Run and Debug (Cmd+Shift+D)
3. Select "Run Extension" from the dropdown
4. Click the green play button (or press F5)
5. A new VS Code window will open with "[Extension Development Host]" in the title

### Step 2: Open Example Files

In the Extension Development Host window:

1. Open the examples folder: `/packages/vscode/examples/`
2. Open any example file (`.ts` files numbered 01-10)
3. Each file is self-contained and demonstrates specific features

### Step 3: Test Features

Each example file contains detailed instructions at the top. Follow the "HOW TO TEST" section in each file.

## Example Files Overview

### 01-hover-help-text.ts
**Tests:** Rich hover tooltips with help text

**Features:**
- Hover over any underlined issue
- See rule ID with severity icon
- Read descriptive help text
- See auto-fix indicator (✨) when available
- Links to disable options

**What to look for:**
- Rich markdown-formatted hover tooltips
- Blue help text explaining how to fix
- Different icons for errors (🔴) vs warnings (🟡)

---

### 02-codelens-annotations.ts
**Tests:** CodeLens annotations and stats

**Features:**
- File-level issue summary at top of file
- "Fix all" button for auto-fixable issues
- "Organize Imports" button
- Real-time updates as you fix issues

**What to look for:**
- CodeLens appears above first line of code
- Shows count: "⚠️ Pickier: X errors, Y warnings (Z auto-fixable)"
- Clickable buttons that trigger actions

---

### 03-code-actions.ts
**Tests:** All 4 types of code actions

**Features:**
- Fix action (for auto-fixable issues)
- Disable for this line
- Disable for entire file
- View documentation

**What to look for:**
- Put cursor on any issue
- Press Cmd+. (or right-click → Quick Fix)
- See all available actions for that issue type
- Actions apply correctly

---

### 04-problems-panel.ts
**Tests:** Problems panel integration

**Features:**
- All issues appear in Problems panel
- Grouped by severity (Errors / Warnings)
- Click issue to navigate to code
- See full help text in problem details

**What to look for:**
- Open Problems panel (Cmd+Shift+M)
- See all 6+ issues listed
- Click on issue to jump to location
- Expand issue to see help text

---

### 05-import-issues.ts
**Tests:** Import organization features

**Features:**
- Detect unordered imports
- Detect duplicate imports
- "Organize Imports" CodeLens action
- Auto-fix import sorting

**What to look for:**
- CodeLens shows "📦 Organize Imports"
- Issues reported for unordered/duplicate imports
- Click "Organize Imports" to fix all import issues

---

### 06-all-severities.ts
**Tests:** Different severity levels

**Features:**
- Error severity (red squiggly lines)
- Warning severity (yellow squiggly lines)
- Different icons in hover tooltips
- Problems panel groups by severity

**What to look for:**
- Red underlines for errors (debugger, unused vars, prefer-const)
- Yellow underlines for warnings (console.log, quotes, prefer-template)
- CodeLens shows both: "3 errors, 3 warnings"

---

### 07-auto-fixable-vs-manual.ts
**Tests:** Auto-fix detection and behavior

**Features:**
- Auto-fixable issues show ✨ icon
- Manual issues don't show ✨
- "Fix all" only fixes auto-fixable issues
- Help text explains manual fix steps

**What to look for:**
- Hover on auto-fixable: see "✨ Auto-fix available"
- Hover on manual: no ✨ icon, detailed manual instructions
- Click "Fix all" in CodeLens: only auto-fixable issues are fixed
- Manual issues remain with helpful guidance

---

### 08-disable-comments.ts
**Tests:** Disable comment actions

**Features:**
- "Disable for this line" adds `// eslint-disable-next-line`
- "Disable for entire file" adds `/* eslint-disable */` at top
- Disabled issues disappear from diagnostics

**What to look for:**
- Use code action to disable a rule
- See disable comment added to file
- Issue disappears from Problems panel
- CodeLens updates to show fewer issues

---

### 09-clean-file.ts
**Tests:** "No issues" state

**Features:**
- CodeLens shows "✓ Pickier: No issues found"
- No squiggly underlines anywhere
- Empty Problems panel
- Demonstrates what a "perfect" file looks like

**What to look for:**
- Green checkmark (✓) in CodeLens
- "No issues found" message
- Clean, issue-free code
- This is the target state!

---

### 10-comprehensive-test.ts
**Tests:** All features combined

**Features:**
- Multiple issue types in one file
- Mix of errors and warnings
- Mix of auto-fixable and manual issues
- Nested issues
- Complex scenarios

**What to look for:**
- CodeLens: "⚠️ Pickier: ~15 errors, ~8 warnings (~12 auto-fixable)"
- Test all features: hover, code actions, problems panel
- Click "Fix all" and watch file transform
- See remaining manual issues with help text

---

## Testing Workflow

### Recommended Testing Order:

1. **Start with 09-clean-file.ts**
   - See what "perfect" looks like
   - Understand the baseline

2. **Test 01-hover-help-text.ts**
   - Get familiar with hover tooltips
   - See how help text appears

3. **Test 02-codelens-annotations.ts**
   - Understand CodeLens display
   - Try "Fix all" button

4. **Test 03-code-actions.ts**
   - Learn all 4 action types
   - Practice using Cmd+.

5. **Test remaining files (04-08)**
   - Explore specific features
   - Test edge cases

6. **Finish with 10-comprehensive-test.ts**
   - Complete integration test
   - See all features working together

### Common Testing Actions:

- **Trigger hover:** Move mouse over underlined code
- **Trigger code actions:** Put cursor on issue, press Cmd+. (or Ctrl+. on Windows/Linux)
- **View problems:** Press Cmd+Shift+M to open Problems panel
- **Test CodeLens:** Look at top of file, click buttons
- **Test fixes:** Click "Fix all" or use individual fix actions

## Expected Features

When testing, you should see these features working:

### ✅ Rich Hover Tooltips
- Shows rule ID with icon
- Displays descriptive message
- Includes help text (blue)
- Shows auto-fix indicator (✨)
- Links to disable options

### ✅ CodeLens Annotations
- File-level stats at top
- Issue count by severity
- Auto-fixable count
- Clickable "Fix all" button
- "Organize Imports" button

### ✅ Enhanced Code Actions
- Fix (for auto-fixable issues)
- Disable for this line
- Disable for entire file
- View documentation

### ✅ Problems Panel Integration
- All issues listed
- Grouped by severity
- Click to navigate
- Full help text in details

### ✅ Smart Diagnostics
- Red underlines for errors
- Yellow underlines for warnings
- Related information for help text
- Real-time updates

## Configuration Examples

This folder also contains configuration examples:

- **basic-config.ts** - Minimal setup for getting started
- **advanced-config.ts** - Comprehensive setup with advanced features
- **team-config.ts** - Strict configuration for team environments
- **vscode-settings.json** - Example VS Code workspace settings

See the individual files for details on each configuration option.

## Troubleshooting

### Extension not loading?
- Make sure you're in the Extension Development Host window
- Check the Debug Console for errors
- Try restarting the extension (Cmd+Shift+P → "Developer: Reload Window")

### No issues showing?
- Make sure Pickier is enabled in settings
- Check that the file is saved
- Verify the file is TypeScript/JavaScript

### CodeLens not appearing?
- Check setting: `pickier.codeLens.enable` should be `true`
- Try reloading the window
- Ensure file has issues or is clean (CodeLens shows in both cases)

### Hover not working?
- Hover directly over the underlined code
- Wait a moment for tooltip to appear
- Check that there are diagnostics for that line

## Configuration

You can customize extension behavior in VS Code settings:

```json
{
  "pickier.enable": true,
  "pickier.run": "onSave",
  "pickier.codeLens.enable": true,
  "pickier.packageManager": "auto"
}
```

See `package.json` in the extension root for all available settings.

## Feedback

After testing, consider:
- Which features are most useful?
- Are there any missing features?
- Is the help text clear and actionable?
- Are the code actions discoverable?
- Is the CodeLens helpful or distracting?

## Next Steps

After testing these examples:

1. Try the extension on your real codebase
2. Customize Pickier config (`pickier.config.ts`) for your needs
3. Report any issues or suggestions
4. Enjoy fast, helpful linting!

---

**Note:** These example files intentionally contain issues to demonstrate extension features. Don't be alarmed by the red and yellow squiggly lines - they're there for testing!
