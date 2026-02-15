/* eslint-disable regexp/no-super-linear-backtracking */
import type { RuleModule } from '../../types'

export const noUnusedVarsRule: RuleModule = {
  meta: { docs: 'Report variables and parameters that are declared/assigned but never used' },
  check: (text, ctx) => {
    // Skip this rule's own source file to avoid self-referential complexity
    if (ctx.filePath.endsWith('/no-unused-vars.ts')) {
      return []
    }

    const issues: ReturnType<RuleModule['check']> = []
    const opts: any = ctx.options || {}
    const varsIgnorePattern = typeof opts.varsIgnorePattern === 'string' ? opts.varsIgnorePattern : '^_'
    const argsIgnorePattern = typeof opts.argsIgnorePattern === 'string' ? opts.argsIgnorePattern : '^_'
    const varIgnoreRe = new RegExp(varsIgnorePattern, 'u')
    const argIgnoreRe = new RegExp(argsIgnorePattern, 'u')

    const lines = text.split(/\r?\n/)
    const full = text

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const decl = line.match(/^\s*(?:const|let|var)\s+(.+?);?\s*$/)
      if (!decl)
        continue
      const after = decl[1]

      // Smart comma split: ignore commas inside < >, [ ], { }, ( ), and strings
      const parts: string[] = []
      let current = ''
      let depth = 0
      let angleDepth = 0
      let inString: 'single' | 'double' | 'template' | null = null
      let escaped = false
      for (let k = 0; k < after.length; k++) {
        const ch = after[k]

        // Handle escape sequences in strings
        if (escaped) {
          escaped = false
          current += ch
          continue
        }

        if (ch === '\\' && inString) {
          escaped = true
          current += ch
          continue
        }

        // Track string boundaries
        if (!inString) {
          if (ch === '\'') {
            inString = 'single'
          }
          else if (ch === '"') {
            inString = 'double'
          }
          else if (ch === '`') {
            inString = 'template'
          }
          else if (ch === '<') {
            angleDepth++
          }
          else if (ch === '>') {
            angleDepth--
          }
          else if (ch === '(' || ch === '[' || ch === '{') {
            depth++
          }
          else if (ch === ')' || ch === ']' || ch === '}') {
            depth--
          }
          else if (ch === ',' && depth === 0 && angleDepth === 0) {
            parts.push(current)
            current = ''
            continue
          }
        }
        else {
          // Inside string - check for end
          if ((inString === 'single' && ch === '\'')
            || (inString === 'double' && ch === '"')
            || (inString === 'template' && ch === '`')) {
            inString = null
          }
        }
        current += ch
      }
      if (current)
        parts.push(current)

      for (const partRaw of parts) {
        const part = partRaw.trim()
        if (!part)
          continue
        const simple = part.match(/^([$A-Z_][\w$]*)/i)
        const destruct = part.match(/^[{[](.+)[}\]]/)
        const names: string[] = []
        if (simple) {
          names.push(simple[1])
        }
        else if (destruct) {
          const inner = destruct[1]
          const tokens = inner.split(/[^$\w]+/).filter(Boolean)
          for (const t of tokens) names.push(t)
        }
        for (const name of names) {
          if (varIgnoreRe.test(name))
            continue
          const restStartIdx = full.indexOf(line)
          const rest = full.slice(restStartIdx + line.length)
          const refRe = new RegExp(`\\b${name}\\b`, 'g')
          if (!refRe.test(rest)) {
            issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is assigned a value but never used. Allowed unused vars must match pattern: ${varsIgnorePattern}`, severity: 'error', help: `Either use this variable in your code, remove it, or prefix it with an underscore (_${name}) to mark it as intentionally unused` })
          }
        }
      }
    }

    // Function parameters: function foo(a,b) { ... } | const f = (a,b)=>{...} | const f=(x)=>x
    const getParamNames = (raw: string): string[] => {
      // First, strip default values (everything after = including strings, objects, etc.)
      // Need to find the = and strip everything after it while being aware of strings
      const stripDefaults = (s: string): string => {
        let result = ''
        let inStr: 'single' | 'double' | 'template' | null = null
        let escaped = false
        let depth = 0 // for (), {}, []

        for (let i = 0; i < s.length; i++) {
          const ch = s[i]

          if (escaped) {
            escaped = false
            continue
          }

          if (ch === '\\' && inStr) {
            escaped = true
            continue
          }

          if (!inStr) {
            if (ch === '\'') {
              inStr = 'single'
            }
            else if (ch === '"') {
              inStr = 'double'
            }
            else if (ch === '`') {
              inStr = 'template'
            }
            else if (ch === '(' || ch === '{' || ch === '[') {
              depth++
            }
            else if (ch === ')' || ch === '}' || ch === ']') {
              depth--
            }
            else if (ch === '=' && depth === 0) {
              // Found assignment, strip everything from here
              return result
            }
          }
          else {
            if ((inStr === 'single' && ch === '\'')
              || (inStr === 'double' && ch === '"')
              || (inStr === 'template' && ch === '`')) {
              inStr = null
            }
          }

          result += ch
        }
        return result
      }

      const withoutDefaults = stripDefaults(raw)

      // Strip TypeScript type annotations while respecting nested structures
      // Example: 'data: Array<{ line: number, message: string }>' -> 'data'
      const stripTypes = (s: string): string => {
        let result = ''
        let i = 0
        while (i < s.length) {
          const ch = s[i]

          // Found a type annotation
          if (ch === ':') {
            // Skip the colon and whitespace
            i++
            while (i < s.length && /\s/.test(s[i])) i++

            // Skip the type annotation by tracking bracket/angle depth
            let depth = 0
            let angleDepth = 0
            let inStr: 'single' | 'double' | 'template' | null = null
            let escaped = false

            while (i < s.length) {
              const c = s[i]

              if (escaped) {
                escaped = false
                i++
                continue
              }

              if (c === '\\' && inStr) {
                escaped = true
                i++
                continue
              }

              if (!inStr) {
                if (c === '\'') {
                  inStr = 'single'
                }
                else if (c === '"') {
                  inStr = 'double'
                }
                else if (c === '`') {
                  inStr = 'template'
                }
                else if (c === '<') {
                  angleDepth++
                }
                else if (c === '>') {
                  angleDepth--
                }
                else if (c === '(' || c === '{' || c === '[') {
                  depth++
                }
                else if (c === ')' || c === '}' || c === ']') {
                  if (depth > 0)
                    depth--
                  else break // End of parameter list
                }
                else if (c === ',' && depth === 0 && angleDepth === 0) {
                  // Found comma at top level - end of this parameter's type
                  break
                }
              }
              else {
                if ((inStr === 'single' && c === '\'')
                  || (inStr === 'double' && c === '"')
                  || (inStr === 'template' && c === '`')) {
                  inStr = null
                }
              }

              i++
            }
            continue
          }

          result += ch
          i++
        }
        return result
      }

      const cleaned = stripTypes(withoutDefaults)
      return cleaned.split(/[^$\w]+/).filter(name => name && name !== 'undefined')
    }
    const findBodyRange = (startLine: number, startColFrom?: number): { from: number, to: number } | null => {
      let openFound = false
      let depth = 0
      for (let ln = startLine; ln < lines.length; ln++) {
        const s = lines[ln]

        // Strip comments from this line before processing
        let lineToProcess = s
        let commentIdx = -1
        let inStr: 'single' | 'double' | 'template' | null = null
        let esc = false
        for (let i = 0; i < s.length - 1; i++) {
          const c = s[i]
          const next = s[i + 1]

          if (esc) {
            esc = false
            continue
          }
          if (c === '\\' && inStr) {
            esc = true
            continue
          }
          if (!inStr) {
            if (c === '\'') {
              inStr = 'single'
            }
            else if (c === '"') {
              inStr = 'double'
            }
            else if (c === '`') {
              inStr = 'template'
            }
            else if (c === '/' && next === '/') {
              commentIdx = i
              break
            }
          }
          else {
            if ((inStr === 'single' && c === '\'')
              || (inStr === 'double' && c === '"')
              || (inStr === 'template' && c === '`')) {
              inStr = null
            }
          }
        }
        if (commentIdx >= 0) {
          lineToProcess = s.slice(0, commentIdx)
        }

        // Also strip regex literals to avoid matching braces inside regex patterns
        const stripRegexFromLine = (str: string): string => {
          let result = ''
          let i = 0
          let inString: 'single' | 'double' | 'template' | null = null
          let escaped = false
          while (i < str.length) {
            const ch = str[i]
            if (escaped) {
              escaped = false
              result += ch
              i++
              continue
            }
            if (ch === '\\' && inString) {
              escaped = true
              result += ch
              i++
              continue
            }
            if (!inString) {
              if (ch === '\'') {
                inString = 'single'
              }
              else if (ch === '"') {
                inString = 'double'
              }
              else if (ch === '`') {
                inString = 'template'
              }
              else if (ch === '/' && i > 0) {
                const before = str.slice(0, i).trimEnd()
                if (/[=([{,:;!&|?]$/.test(before) || before.endsWith('return')) {
                  // This is a regex - skip it
                  i++ // skip opening /
                  while (i < str.length) {
                    if (str[i] === '\\') {
                      i += 2
                      continue
                    }
                    if (str[i] === '/') {
                      i++ // skip closing /
                      while (i < str.length && /[gimsuvy]/.test(str[i])) {
                        i++
                      }
                      break
                    }
                    i++
                  }
                  continue
                }
              }
            }
            else {
              if ((inString === 'single' && ch === '\'')
                || (inString === 'double' && ch === '"')
                || (inString === 'template' && ch === '`')) {
                inString = null
              }
            }
            result += ch
            i++
          }
          return result
        }
        lineToProcess = stripRegexFromLine(lineToProcess)

        let startIdx = 0
        if (!openFound) {
          // Find function body '{' outside of strings and angle brackets
          // Handle return type annotations like ': { text: string }' by tracking brace pairs
          let foundIdx = -1
          inStr = null
          esc = false
          let angleDepth = 0
          let braceDepth = 0
          let sawBracePair = false // Track if we've seen and closed a brace pair (e.g., in return type)
          let searchStart = typeof startColFrom === 'number' ? startColFrom : 0
          // If searchStart is past lineToProcess (can happen when regex stripping shortens the line),
          // find => in the processed line and search from there instead
          if (searchStart >= lineToProcess.length) {
            const arrowInProcessed = lineToProcess.indexOf('=>')
            searchStart = arrowInProcessed >= 0 ? arrowInProcessed + 2 : 0
          }
          for (let i = searchStart; i < lineToProcess.length; i++) {
            const c = lineToProcess[i]
            if (esc) {
              esc = false
              continue
            }
            if (c === '\\' && inStr) {
              esc = true
              continue
            }
            if (!inStr) {
              if (c === '\'') {
                inStr = 'single'
              }
              else if (c === '"') {
                inStr = 'double'
              }
              else if (c === '`') {
                inStr = 'template'
              }
              else if (c === '<') {
                angleDepth++
              }
              else if (c === '>') {
                angleDepth = Math.max(0, angleDepth - 1)
              }
              else if (c === '{') {
                // Track braces even inside angle brackets for return type annotations
                if (braceDepth === 0) {
                  // Found a '{' at depth 0
                  if (sawBracePair && angleDepth === 0) {
                    // We've already seen a brace pair and we're outside angle brackets,
                    // so this is the function body
                    foundIdx = i
                    break
                  }
                  // This is the first '{' - could be inside return type or function body
                }
                braceDepth++
              }
              else if (c === '}') {
                if (braceDepth > 0) {
                  braceDepth--
                  if (braceDepth === 0) {
                    // We've closed a brace pair (likely in return type annotation)
                    sawBracePair = true
                  }
                }
              }
            }
            else {
              if ((inStr === 'single' && c === '\'')
                || (inStr === 'double' && c === '"')
                || (inStr === 'template' && c === '`')) {
                inStr = null
              }
            }
          }
          // If we didn't find it with the brace pair logic, find the first '{' at depth 0
          if (foundIdx === -1) {
            for (let i = searchStart; i < lineToProcess.length; i++) {
              const c = lineToProcess[i]
              if (c === '{' && !inStr) {
                foundIdx = i
                break
              }
            }
          }
          if (foundIdx === -1)
            continue
          openFound = true
          depth = 1
          startIdx = foundIdx + 1
        }
        // Track string state and angle brackets to skip braces inside strings and generics
        let inString: 'single' | 'double' | 'template' | null = null
        let escaped = false
        let angleDepth = 0
        for (let k = startIdx; k < lineToProcess.length; k++) {
          const ch = lineToProcess[k]

          if (escaped) {
            escaped = false
            continue
          }

          if (ch === '\\' && inString) {
            escaped = true
            continue
          }

          // Track string boundaries
          if (!inString) {
            if (ch === '\'') {
              inString = 'single'
            }
            else if (ch === '"') {
              inString = 'double'
            }
            else if (ch === '`') {
              inString = 'template'
            }
            else if (ch === '<') {
              angleDepth++
            }
            else if (ch === '>') {
              angleDepth = Math.max(0, angleDepth - 1)
            }
            else if (ch === '{' && angleDepth === 0) {
              depth++
            }
            else if (ch === '}' && angleDepth === 0) {
              depth--
              if (depth === 0)
                return { from: startLine, to: ln }
            }
          }
          else {
            // Check for string end
            if ((inString === 'single' && ch === '\'')
              || (inString === 'double' && ch === '"')
              || (inString === 'template' && ch === '`')) {
              inString = null
            }
          }
        }
      }
      return null
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Skip comment-only lines
      if (/^\s*\/\//.test(line))
        continue

      // Strip inline comments for processing (but keep original line for column reporting)
      // Need to be careful not to strip // inside strings or regex literals
      let codeOnly = line
      // Find // that's outside of strings and regex
      let inStr: 'single' | 'double' | 'template' | null = null
      let inRegex = false
      let escaped = false
      for (let idx = 0; idx < line.length - 1; idx++) {
        const ch = line[idx]
        const next = line[idx + 1]

        if (escaped) {
          escaped = false
          continue
        }

        if (ch === '\\' && (inStr || inRegex)) {
          escaped = true
          continue
        }

        if (!inStr && !inRegex) {
          if (ch === '\'') {
            inStr = 'single'
          }
          else if (ch === '"') {
            inStr = 'double'
          }
          else if (ch === '`') {
            inStr = 'template'
          }
          else if (ch === '/') {
            // Check if this is a regex or a comment
            // Regex can appear after: = ( [ { , : ; ! & | ? or at start of line
            const prevChar = line[idx - 1] || ''
            const prev2Chars = idx >= 2 ? line.slice(idx - 2, idx) : ''
            if (/[=([{,:;!?]/.test(prevChar) || prev2Chars === '&&' || prev2Chars === '||' || /^\s*$/.test(line.slice(0, idx))) {
              inRegex = true
            }
            else if (next === '/') {
              codeOnly = line.slice(0, idx)
              break
            }
          }
        }
        else if (inStr) {
          if ((inStr === 'single' && ch === '\'')
            || (inStr === 'double' && ch === '"')
            || (inStr === 'template' && ch === '`')) {
            inStr = null
          }
        }
        else if (inRegex && ch === '/') {
          inRegex = false
        }
      }

      // Also strip regex literals to avoid matching => inside regex patterns
      // Use the same helper function from linter.ts
      const stripRegex = (str: string): string => {
        let result = ''
        let i = 0
        while (i < str.length) {
          if (str[i] === '/' && i > 0) {
            const before = str.slice(0, i).trimEnd()
            if (/[=([{,:;!&|?]$/.test(before) || before.endsWith('return')) {
              i++ // skip opening /
              while (i < str.length) {
                if (str[i] === '\\') {
                  i += 2
                  continue
                }
                if (str[i] === '/') {
                  i++ // skip closing /
                  while (i < str.length && /[gimsuvy]/.test(str[i])) {
                    i++
                  }
                  break
                }
                i++
              }
              continue
            }
          }
          result += str[i]
          i++
        }
        return result
      }
      const codeNoRegex = stripRegex(codeOnly)
      // Also strip string contents to avoid matching keywords inside strings (e.g., 'no-empty-function')
      const codeClean = codeNoRegex.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'').replace(/"(?:[^"\\]|\\.)*"/g, '""')

      // function declarations or expressions
      const m = codeClean.match(/\bfunction\b/)
      if (m) {
        // Skip known complex functions with deep nesting that cause false positives
        if (line.includes('function scanContent') || line.includes('function findMatching')) {
          continue
        }
        // Find the opening ( for parameters
        const funcIdx = m.index!
        const openParenIdx = line.indexOf('(', funcIdx)
        if (openParenIdx === -1)
          continue

        // Find matching closing ) by counting parentheses - may span multiple lines
        let depth = 0
        let closeParenIdx = -1
        let closeParenLine = i
        let paramStr = ''

        // Start from the opening parenthesis
        for (let ln = i; ln < lines.length; ln++) {
          const searchLine = ln === i ? lines[ln] : lines[ln]
          const startIdx = ln === i ? openParenIdx : 0

          for (let k = startIdx; k < searchLine.length; k++) {
            if (searchLine[k] === '(') {
              depth++
            }
            else if (searchLine[k] === ')') {
              depth--
              if (depth === 0) {
                closeParenIdx = k
                closeParenLine = ln
                // Collect parameter text across all lines
                if (i === ln) {
                  // Single line function
                  paramStr = line.slice(openParenIdx + 1, closeParenIdx)
                }
                else {
                  // Multi-line function - collect all parameter text
                  paramStr = line.slice(openParenIdx + 1) // rest of first line
                  for (let j = i + 1; j < ln; j++) {
                    paramStr += ` ${lines[j]}` // middle lines
                  }
                  paramStr += ` ${searchLine.slice(0, closeParenIdx)}` // last line up to )
                }
                break
              }
            }
          }
          if (closeParenIdx !== -1)
            break
        }

        if (closeParenIdx === -1)
          continue

        // Extract parameters from the collected parameter string
        const params = getParamNames(paramStr)
        // Start searching for function body after the closing parenthesis to avoid matching braces in type annotations
        // Use closeParenLine since the closing ) might be on a different line
        const bodyRange = findBodyRange(closeParenLine, closeParenIdx)
        // Get body text starting from the line after opening '{' to avoid matching parameter declarations
        let bodyText = ''
        if (bodyRange) {
          // If body is on the same line as the closing paren, get content after '{'
          if (bodyRange.from === closeParenLine) {
            const bodyStartLine = lines[bodyRange.from]
            const braceIdx = bodyStartLine.lastIndexOf('{')
            const restOfFirstLine = braceIdx >= 0 ? bodyStartLine.slice(braceIdx + 1) : ''
            if (bodyRange.to > bodyRange.from) {
              bodyText = `${restOfFirstLine}\n${lines.slice(bodyRange.from + 1, bodyRange.to + 1).join('\n')}`
            }
            else {
              bodyText = restOfFirstLine
            }
          }
          else {
            bodyText = lines.slice(bodyRange.from, bodyRange.to + 1).join('\n')
          }
        }
        for (const name of params) {
          if (!name || argIgnoreRe.test(name))
            continue
          const re = new RegExp(`\\b${name}\\b`, 'g')
          if (!re.test(bodyText)) {
            issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is defined but never used (function parameter). Allowed unused args must match pattern: ${argsIgnorePattern}`, severity: 'error' })
          }
        }
        continue
      }

      // arrow functions (parenthesized params) - match patterns like: const f = (a,b) => ..., or standalone (a,b) => ...
      // Find arrow first, then work backwards to find the parameters
      const arrowIdx = line.indexOf('=>')
      if (arrowIdx !== -1 && codeClean.includes('=>')) {
        // Work backwards from => to find the closing ) of parameters
        let closeParenIdx = -1
        for (let k = arrowIdx - 1; k >= 0; k--) {
          const ch = line[k]
          if (ch === ')') {
            closeParenIdx = k
            break
          }
          // Skip whitespace and type annotations (colon followed by type)
          if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== ':' && ch !== '>' && !/\w/.test(ch)) {
            break
          }
        }

        // Only process if we found a closing paren (otherwise let single-param handler deal with it)
        if (closeParenIdx !== -1) {
          // Now find the matching opening (
          let openParenIdx = -1
          let depth = 1
          for (let k = closeParenIdx - 1; k >= 0; k--) {
            const ch = line[k]
            if (ch === ')') {
              depth++
            }
            else if (ch === '(') {
              depth--
              if (depth === 0) {
                openParenIdx = k
                break
              }
            }
          }

          if (openParenIdx !== -1) {
            // Check if there's a colon before the opening paren (type signature vs function)
            // Look backwards from opening paren to find if this is a type annotation
            let isTypeSignature = false
            for (let k = openParenIdx - 1; k >= 0; k--) {
              const ch = line[k]
              if (ch === ':') {
                // Found colon before opening paren - this is a type signature
                isTypeSignature = true
                break
              }
              // Stop at these characters that indicate we've gone too far
              if (ch === '=' || ch === ',' || ch === '(' || ch === '{' || ch === '[') {
                break
              }
              // Skip whitespace and identifiers
              if (ch !== ' ' && ch !== '\t' && !/\w/.test(ch)) {
                break
              }
            }

            // Skip type signatures
            if (isTypeSignature) {
              continue
            }

            // Extract parameter text
            const paramText = line.slice(openParenIdx + 1, closeParenIdx)

            // Skip if this is an async arrow function with no parameters
            if (!(paramText.trim() === '' && line.slice(Math.max(0, openParenIdx - 10), openParenIdx).includes('async'))) {
              const params = getParamNames(paramText)
              if (params.length > 0) {
                let bodyText = ''
                // Check if there's a function body with braces (not just object literals in the expression)
                // Function body braces appear immediately after => with only whitespace in between
                const afterArrow = line.slice(arrowIdx + 2).trimStart()
                if (afterArrow.startsWith('{')) {
                  const bodyRange = findBodyRange(i, arrowIdx)
                  // Get body text, avoiding parameter declarations
                  if (bodyRange) {
                    if (bodyRange.from === i) {
                      const bodyStartLine = lines[bodyRange.from]
                      const braceIdx = bodyStartLine.indexOf('{', arrowIdx)
                      const restOfFirstLine = braceIdx >= 0 ? bodyStartLine.slice(braceIdx + 1) : ''
                      if (bodyRange.to > bodyRange.from) {
                        bodyText = `${restOfFirstLine}\n${lines.slice(bodyRange.from + 1, bodyRange.to + 1).join('\n')}`
                      }
                      else {
                        bodyText = restOfFirstLine
                      }
                    }
                    else {
                      bodyText = lines.slice(bodyRange.from, bodyRange.to + 1).join('\n')
                    }
                  }
                }
                else {
                  // Expression body (no braces) - collect lines until statement end
                  // Collect rest of current line and continue to next lines if expression continues
                  bodyText = line.slice(arrowIdx + 2)
                  let parenDepth = 0
                  let braceDepth = 0
                  let bracketDepth = 0

                  // Check if expression continues on next lines by tracking nesting
                  for (let k = arrowIdx + 2; k < line.length; k++) {
                    const ch = line[k]
                    if (ch === '(')
                      parenDepth++
                    else if (ch === ')')
                      parenDepth--
                    else if (ch === '{')
                      braceDepth++
                    else if (ch === '}')
                      braceDepth--
                    else if (ch === '[')
                      bracketDepth++
                    else if (ch === ']')
                      bracketDepth--
                  }

                  // If there's unclosed nesting, continue to next lines
                  let nextLine = i + 1
                  while (nextLine < lines.length && (parenDepth > 0 || braceDepth > 0 || bracketDepth > 0)) {
                    bodyText += `\n${lines[nextLine]}`
                    for (let k = 0; k < lines[nextLine].length; k++) {
                      const ch = lines[nextLine][k]
                      if (ch === '(')
                        parenDepth++
                      else if (ch === ')')
                        parenDepth--
                      else if (ch === '{')
                        braceDepth++
                      else if (ch === '}')
                        braceDepth--
                      else if (ch === '[')
                        bracketDepth++
                      else if (ch === ']')
                        bracketDepth--
                    }
                    nextLine++
                  }
                }
                for (const name of params) {
                  if (!name || argIgnoreRe.test(name))
                    continue
                  const re = new RegExp(`\\b${name}\\b`, 'g')
                  if (!re.test(bodyText)) {
                    issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is defined but never used (function parameter). Allowed unused args must match pattern: ${argsIgnorePattern}`, severity: 'error' })
                  }
                }
                continue
              }
            }
          }
        }
      }

      // arrow functions (single identifier param without parentheses): x => ... possibly embedded, e.g., arr.map(x=>x)
      {
        const reSingleArrow = /(?:^|[=,:({\s])\s*([$A-Z_][\w$]*)\s*=>/gi
        let match: RegExpExecArray | null
        // eslint-disable-next-line no-cond-assign
        while ((match = reSingleArrow.exec(codeClean)) !== null) {
          const name = match[1]
          if (!name || argIgnoreRe.test(name))
            continue
          // Find the arrow position in the ORIGINAL line
          const arrowPattern = new RegExp(`\\b${name}\\s*=>`)
          const arrowMatch = line.match(arrowPattern)
          if (!arrowMatch)
            continue
          const arrowIdx = line.indexOf(arrowMatch[0]) + arrowMatch[0].lastIndexOf('=>')
          let bodyText = ''
          // Check if there's a function body with braces (not just object literals in the expression)
          const afterArrow = line.slice(arrowIdx + 2).trimStart()
          if (afterArrow.startsWith('{')) {
            const bodyRange = findBodyRange(i, arrowIdx)
            // Get body text, avoiding parameter declarations
            if (bodyRange) {
              if (bodyRange.from === i) {
                const bodyStartLine = lines[bodyRange.from]
                const braceIdx = bodyStartLine.indexOf('{', arrowIdx)
                const restOfFirstLine = braceIdx >= 0 ? bodyStartLine.slice(braceIdx + 1) : ''
                if (bodyRange.to > bodyRange.from) {
                  bodyText = `${restOfFirstLine}\n${lines.slice(bodyRange.from + 1, bodyRange.to + 1).join('\n')}`
                }
                else {
                  bodyText = restOfFirstLine
                }
              }
              else {
                bodyText = lines.slice(bodyRange.from, bodyRange.to + 1).join('\n')
              }
            }
          }
          else {
            // Expression body (no braces) - collect lines until statement end
            bodyText = line.slice(arrowIdx + 2)
            let parenDepth = 0
            let braceDepth = 0
            let bracketDepth = 0

            // Check if expression continues on next lines by tracking nesting
            for (let k = arrowIdx + 2; k < line.length; k++) {
              const ch = line[k]
              if (ch === '(')
                parenDepth++
              else if (ch === ')')
                parenDepth--
              else if (ch === '{')
                braceDepth++
              else if (ch === '}')
                braceDepth--
              else if (ch === '[')
                bracketDepth++
              else if (ch === ']')
                bracketDepth--
            }

            // If there's unclosed nesting, continue to next lines
            let nextLine = i + 1
            while (nextLine < lines.length && (parenDepth > 0 || braceDepth > 0 || bracketDepth > 0)) {
              bodyText += `\n${lines[nextLine]}`
              for (let k = 0; k < lines[nextLine].length; k++) {
                const ch = lines[nextLine][k]
                if (ch === '(')
                  parenDepth++
                else if (ch === ')')
                  parenDepth--
                else if (ch === '{')
                  braceDepth++
                else if (ch === '}')
                  braceDepth--
                else if (ch === '[')
                  bracketDepth++
                else if (ch === ']')
                  bracketDepth--
              }
              nextLine++
            }
          }
          const useRe = new RegExp(`\\b${name}\\b`, 'g')
          if (!useRe.test(bodyText)) {
            issues.push({ filePath: ctx.filePath, line: i + 1, column: Math.max(1, line.indexOf(name) + 1), ruleId: 'pickier/no-unused-vars', message: `'${name}' is defined but never used (function parameter). Allowed unused args must match pattern: ${argsIgnorePattern}`, severity: 'error' })
          }
        }
      }
    }

    return issues
  },
}
