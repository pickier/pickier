# sort-classes

Enforce sorted class members.

Organizing class members in a consistent order improves readability and maintainability. This rule helps developers quickly locate class members and understand the overall structure of the class.

## Config

```ts
pluginRules: {
  sort-classes: [warn, { type: alphabetical, order: asc, ignoreCase: true }],
}
```

Options:

- `type`: alphabetical | natural | line-length | custom | unsorted (default: alphabetical)
- `order`: asc | desc (default: asc)
- `ignoreCase`: boolean (default: true)
- `specialCharacters`: keep | trim | remove (default: keep)
- `alphabet`: string (default: ) — only when type=custom
- `partitionByNewLine`: boolean (default: false) — respect blank-line groups and do not sort across them

Note: This is a heuristic rule; it does not parse full TypeScript syntax trees.

## Example

Before:

```ts
class User {
  constructor(username: string, email: string, isActive: boolean) {
    this.username = username
    this.email = email
    this.isActive = isActive
    this.roles = []
  }

  addRole(role: string) {
    this.roles.push(role)
  }

  deactivate() {
    this.isActive = false
  }

  setEmail(newEmail: string) {
    this.email = newEmail
  }

  activate() {
    this.isActive = true
  }

  removeRole(role: string) {
    this.roles = this.roles.filter(r => r !== role)
  }

  getProfile() {
    return {
      username: this.username,
      email: this.email,
      isActive: this.isActive,
      roles: this.roles,
    }
  }
}
```

After (alphabetical asc):

```ts
class User {
  activate() { this.isActive = true }
  addRole(role: string) { this.roles.push(role) }
  constructor(username: string, email: string, isActive: boolean) { /* ... */ }
  deactivate() { this.isActive = false }
  getProfile() { /* ... */ }
  removeRole(role: string) { /* ... */ }
  setEmail(newEmail: string) { /* ... */ }
}
```

## Best practices

- Choose `natural` when member names include numeric suffixes (e.g., `step2`, `step10`)
- Use `partitionByNewLine: true` to preserve intentional manual grouping
- Keep the rule at `warn` initially to catch problematic cases without blocking
- Combine with code review guidelines for constructor-first or accessors-first conventions as needed
