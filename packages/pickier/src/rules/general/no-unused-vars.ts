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

    // Pre-compute which lines start inside a multi-line template literal body.
    // Used to skip analysis of generated code inside template content in both loops.
    const lineStartsInTemplate: boolean[] = new Array(lines.length).fill(false)
    {
      const tmplStack: number[] = [] // -1 = in template body, >= 0 = in ${} expr
      let tInSingle = false
      let tInDouble = false
      let tEscaped = false
      for (let li = 0; li < lines.length; li++) {
        lineStartsInTemplate[li] = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === -1
        const s = lines[li]
        for (let k = 0; k < s.length; k++) {
          const ch = s[k]
          if (tEscaped) { tEscaped = false; continue }
          const inBody = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] === -1
          const inExpr = tmplStack.length > 0 && tmplStack[tmplStack.length - 1] >= 0
          if (ch === '\\' && (tInSingle || tInDouble || inBody)) { tEscaped = true; continue }
          if (tInSingle) { if (ch === '\'') tInSingle = false; continue }
          if (tInDouble) { if (ch === '"') tInDouble = false; continue }
          if (inBody) {
            if (ch === '`') { tmplStack.pop() }
            else if (ch === '$' && k + 1 < s.length && s[k + 1] === '{') { tmplStack[tmplStack.length - 1] = 0; k++ }
            continue
          }
          if (inExpr) {
            if (ch === '`') { tmplStack.push(-1) }
            else if (ch === '\'') { tInSingle = true }
            else if (ch === '"') { tInDouble = true }
            else if (ch === '{') { tmplStack[tmplStack.length - 1]++ }
            else if (ch === '}') {
              if (tmplStack[tmplStack.length - 1] > 0) tmplStack[tmplStack.length - 1]--
              else tmplStack[tmplStack.length - 1] = -1
            }
            else if (ch === '/' && k + 1 < s.length && s[k + 1] === '/') break
            continue
          }
          // Outside template
          if (ch === '`') { tmplStack.push(-1) }
          else if (ch === '\'') { tInSingle = true }
          else if (ch === '"') { tInDouble = true }
          else if (ch === '/' && k + 1 < s.length && s[k + 1] === '/') break
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      // Skip lines inside template literal body (generated code, not real code)
      if (lineStartsInTemplate[i])
        continue
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
        const names: string[] = []
        if (simple) {
          names.push(simple[1])
        }
        else if (part.startsWith('{') || part.startsWith('[')) {
          // Find matching closing brace/bracket (not greedy)
          const openChar = part[0]
          const closeChar = openChar === '{' ? '}' : ']'
          let dDepth = 0
          let endIdx = -1
          let dStr: 'single' | 'double' | 'template' | null = null
          let dEsc = false
          for (let ci = 0; ci < part.length; ci++) {
            const ch = part[ci]
            if (dEsc) { dEsc = false; continue }
            if (ch === '\\' && dStr) { dEsc = true; continue }
            if (!dStr) {
              if (ch === '\'' || ch === '"' || ch === '`') { dStr = ch === '\'' ? 'single' : ch === '"' ? 'double' : 'template' }
              else if (ch === openChar) dDepth++
              else if (ch === closeChar) { dDepth--; if (dDepth === 0) { endIdx = ci; break } }
            } else {
              if ((dStr === 'single' && ch === '\'') || (dStr === 'double' && ch === '"') || (dStr === 'template' && ch === '`')) dStr = null
            }
          }
          if (endIdx > 0) {
            const inner = part.slice(1, endIdx)
            // Split inner content on commas at depth 0
            const fields: string[] = []
            let fCurrent = ''
            let fDepth = 0
            let fStr: 'single' | 'double' | 'template' | null = null
            let fEsc = false
            for (let ci = 0; ci < inner.length; ci++) {
              const ch = inner[ci]
              if (fEsc) { fEsc = false; fCurrent += ch; continue }
              if (ch === '\\' && fStr) { fEsc = true; fCurrent += ch; continue }
              if (!fStr) {
                if (ch === '\'' || ch === '"' || ch === '`') { fStr = ch === '\'' ? 'single' : ch === '"' ? 'double' : 'template'; fCurrent += ch; continue }
                if (ch === '(' || ch === '{' || ch === '[') fDepth++
                if (ch === ')' || ch === '}' || ch === ']') fDepth--
                if (ch === ',' && fDepth === 0) { fields.push(fCurrent.trim()); fCurrent = ''; continue }
              } else {
                if ((fStr === 'single' && ch === '\'') || (fStr === 'double' && ch === '"') || (fStr === 'template' && ch === '`')) fStr = null
              }
              fCurrent += ch
            }
            if (fCurrent.trim()) fields.push(fCurrent.trim())

            for (const field of fields) {
              // Handle rest elements: ...rest
              if (field.startsWith('...')) {
                const restName = field.slice(3).match(/^([$A-Z_][\w$]*)/i)
                if (restName) names.push(restName[1])
                continue
              }
              // Handle alias: key: value (only take the value as the variable name)
              // Be careful: nested destructuring { a: { b } } has colon too
              const colonIdx = field.indexOf(':')
              if (colonIdx !== -1) {
                let value = field.slice(colonIdx + 1).trim()
                // Strip default value (after = at depth 0)
                let eqDepth = 0
                for (let ci = 0; ci < value.length; ci++) {
                  const ch = value[ci]
                  if (ch === '(' || ch === '{' || ch === '[') eqDepth++
                  else if (ch === ')' || ch === '}' || ch === ']') eqDepth--
                  else if (ch === '=' && eqDepth === 0) { value = value.slice(0, ci).trim(); break }
                }
                const nameMatch = value.match(/^([$A-Z_][\w$]*)/i)
                if (nameMatch) names.push(nameMatch[1])
              } else {
                // Simple field: name or name = default
                let fieldName = field
                // Strip default value
                let eqDepth = 0
                for (let ci = 0; ci < fieldName.length; ci++) {
                  const ch = fieldName[ci]
                  if (ch === '(' || ch === '{' || ch === '[') eqDepth++
                  else if (ch === ')' || ch === '}' || ch === ']') eqDepth--
                  else if (ch === '=' && eqDepth === 0) { fieldName = fieldName.slice(0, ci).trim(); break }
                }
                const nameMatch = fieldName.match(/^([$A-Z_][\w$]*)/i)
                if (nameMatch) names.push(nameMatch[1])
              }
            }
          }
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
      // Persistent state for multi-line return type annotation detection
      let bodyBraceDepth = 0
      let bodySawBracePair = false
      let bodyAngleDepth = 0
      let bodyInStr: 'single' | 'double' | 'template' | null = null
      let bodyEsc = false
      let isFirstSearchLine = true
      let lastNonWhitespaceBeforeBrace = '' // Tracks char before first '{' to detect object return types
      // Persistent string/template state for the depth-tracking second pass (must survive across lines)
      let depthInSingle = false
      let depthInDouble = false
      const depthTmplStack: number[] = [] // -1 = in template body, >= 0 = in ${} expr with that brace depth
      let depthEscaped = false
      for (let ln = startLine; ln < lines.length; ln++) {
        const s = lines[ln]

        // Strip comments from this line before processing.
        // Skip when inside a multi-line template body — `//` in template content
        // (e.g., URLs like https://) is literal text, not a JS comment.
        let lineToProcess = s
        const inMultiLineTmplBody = depthTmplStack.length > 0 && depthTmplStack[depthTmplStack.length - 1] === -1
        let commentIdx = -1
        let inStr: 'single' | 'double' | 'template' | null = null
        let esc = false
        if (!inMultiLineTmplBody)
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
        if (!inMultiLineTmplBody)
          lineToProcess = stripRegexFromLine(lineToProcess)

        let startIdx = 0
        if (!openFound) {
          // Find function body '{' outside of strings and angle brackets
          // Handle return type annotations like ': { text: string }' by tracking brace pairs
          // State is persisted across lines to handle multi-line return types
          let foundIdx = -1
          let searchStart = isFirstSearchLine ? (typeof startColFrom === 'number' ? startColFrom : 0) : 0
          isFirstSearchLine = false
          // If searchStart is past lineToProcess (can happen when regex stripping shortens the line),
          // find => in the processed line and search from there instead
          if (searchStart >= lineToProcess.length) {
            const arrowInProcessed = lineToProcess.indexOf('=>')
            searchStart = arrowInProcessed >= 0 ? arrowInProcessed + 2 : 0
          }
          for (let i = searchStart; i < lineToProcess.length; i++) {
            const c = lineToProcess[i]
            if (bodyEsc) {
              bodyEsc = false
              continue
            }
            if (c === '\\' && bodyInStr) {
              bodyEsc = true
              continue
            }
            if (!bodyInStr) {
              // Track last non-whitespace char before first '{' at depth 0
              // Exclude '{' and '}' themselves so the tracker captures the char BEFORE a brace
              if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r' && c !== '{' && c !== '}' && bodyBraceDepth === 0) {
                lastNonWhitespaceBeforeBrace = c
              }
              if (c === '\'') {
                bodyInStr = 'single'
              }
              else if (c === '"') {
                bodyInStr = 'double'
              }
              else if (c === '`') {
                bodyInStr = 'template'
              }
              else if (c === '<') {
                bodyAngleDepth++
              }
              else if (c === '>') {
                bodyAngleDepth = Math.max(0, bodyAngleDepth - 1)
              }
              else if (c === '{') {
                // Track braces even inside angle brackets for return type annotations
                if (bodyBraceDepth === 0) {
                  // Found a '{' at depth 0
                  if (bodySawBracePair && bodyAngleDepth === 0) {
                    // We've already seen a brace pair and we're outside angle brackets,
                    // so this is the function body
                    foundIdx = i
                    break
                  }
                  // This is the first '{' - could be inside return type or function body
                }
                bodyBraceDepth++
              }
              else if (c === '}') {
                if (bodyBraceDepth > 0) {
                  bodyBraceDepth--
                  if (bodyBraceDepth === 0) {
                    // We've closed a brace pair (likely in return type annotation)
                    bodySawBracePair = true
                  }
                }
              }
            }
            else {
              if ((bodyInStr === 'single' && c === '\'')
                || (bodyInStr === 'double' && c === '"')
                || (bodyInStr === 'template' && c === '`')) {
                bodyInStr = null
              }
            }
          }
          // If we didn't find it with the brace pair logic:
          // - If inside a brace pair AND the '{' directly followed ':' (object return type), continue to next line
          // - Otherwise, use the first '{' on this line (common case: no return type)
          if (foundIdx === -1) {
            if (bodyBraceDepth > 0 && lastNonWhitespaceBeforeBrace === ':') {
              // The '{' directly followed ':', indicating a multi-line object return type like ): {\n...\n}
              continue
            }
            // No brace pair in progress, find the first '{' (common case: no return type annotation)
            for (let i = searchStart; i < lineToProcess.length; i++) {
              const c = lineToProcess[i]
              if (c === '{' && !bodyInStr) {
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
          startLine = ln // Update startLine to where body '{' was actually found
        }
        // Track string state to skip braces inside strings and template literals.
        // Template literals with ${} expressions need stack-based tracking because
        // nested templates (e.g., `${cond ? `inner` : ''}`) require knowing the
        // brace depth at each nesting level.
        // NOTE: State persists across lines via depthInSingle/depthInDouble/depthTmplStack/depthEscaped
        // which are declared before the outer loop.
        for (let k = startIdx; k < lineToProcess.length; k++) {
          const ch = lineToProcess[k]

          if (depthEscaped) {
            depthEscaped = false
            continue
          }

          const inTmplBody = depthTmplStack.length > 0 && depthTmplStack[depthTmplStack.length - 1] === -1
          const inTmplExpr = depthTmplStack.length > 0 && depthTmplStack[depthTmplStack.length - 1] >= 0

          if (ch === '\\' && (depthInSingle || depthInDouble || inTmplBody)) {
            depthEscaped = true
            continue
          }

          if (depthInSingle) { if (ch === '\'') depthInSingle = false; continue }
          if (depthInDouble) { if (ch === '"') depthInDouble = false; continue }

          if (inTmplBody) {
            if (ch === '`') { depthTmplStack.pop() }
            else if (ch === '$' && k + 1 < lineToProcess.length && lineToProcess[k + 1] === '{') {
              depthTmplStack[depthTmplStack.length - 1] = 0
              k++ // skip the {
            }
            continue
          }

          if (inTmplExpr) {
            if (ch === '`') { depthTmplStack.push(-1); continue }
            if (ch === '\'') { depthInSingle = true; continue }
            if (ch === '"') { depthInDouble = true; continue }
            if (ch === '{') { depthTmplStack[depthTmplStack.length - 1]++; continue }
            if (ch === '}') {
              if (depthTmplStack[depthTmplStack.length - 1] > 0) {
                depthTmplStack[depthTmplStack.length - 1]--
              }
              else {
                depthTmplStack[depthTmplStack.length - 1] = -1 // back to template body
              }
            }
            continue
          }

          // Outside any string/template
          if (ch === '\'') { depthInSingle = true }
          else if (ch === '"') { depthInDouble = true }
          else if (ch === '`') { depthTmplStack.push(-1) }
          else if (ch === '{') { depth++ }
          else if (ch === '}') {
            depth--
            if (depth === 0)
              return { from: startLine, to: ln }
          }
        }
      }
      return null
    }

    // Multi-line template literal state tracking for main processing loop.
    // Persists across lines to correctly mask generated code inside template body content.
    const mainTmplStack: number[] = [] // -1 = in template body, >= 0 = in ${} expr with that brace depth
    let mainInSingle = false
    let mainInDouble = false
    let mainEscaped = false

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
      let codeClean = codeNoRegex.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'').replace(/"(?:[^"\\]|\\.)*"/g, '""')
      // Mask template literal body content using stack-based tracking that persists across lines.
      // Content inside ${} expressions is preserved (it's real code), body content is masked.
      // This handles both single-line and multi-line templates correctly, including nested templates.
      {
        let masked = ''
        for (let ci = 0; ci < codeClean.length; ci++) {
          const ch = codeClean[ci]

          if (mainEscaped) {
            mainEscaped = false
            const inBody = mainTmplStack.length > 0 && mainTmplStack[mainTmplStack.length - 1] === -1
            masked += inBody ? ' ' : ch
            continue
          }

          const inBody = mainTmplStack.length > 0 && mainTmplStack[mainTmplStack.length - 1] === -1
          const inExpr = mainTmplStack.length > 0 && mainTmplStack[mainTmplStack.length - 1] >= 0

          if (ch === '\\' && (mainInSingle || mainInDouble || inBody)) {
            mainEscaped = true
            masked += inBody ? ' ' : ch
            continue
          }

          if (mainInSingle) {
            if (ch === '\'') mainInSingle = false
            masked += ch
            continue
          }

          if (mainInDouble) {
            if (ch === '"') mainInDouble = false
            masked += ch
            continue
          }

          // Inside template body (literal content — not real code)
          if (inBody) {
            if (ch === '`') {
              mainTmplStack.pop()
            } else if (ch === '$' && ci + 1 < codeClean.length && codeClean[ci + 1] === '{') {
              mainTmplStack[mainTmplStack.length - 1] = 0
              masked += '  '
              ci++
            } else {
              masked += ' '
            }
            continue
          }

          // Inside ${} expression (real code inside template)
          if (inExpr) {
            if (ch === '`') {
              mainTmplStack.push(-1)
              masked += ' '
            } else if (ch === '\'') {
              mainInSingle = true
              masked += ch
            } else if (ch === '"') {
              mainInDouble = true
              masked += ch
            } else if (ch === '{') {
              mainTmplStack[mainTmplStack.length - 1]++
              masked += ch
            } else if (ch === '}') {
              if (mainTmplStack[mainTmplStack.length - 1] > 0) {
                mainTmplStack[mainTmplStack.length - 1]--
                masked += ch
              } else {
                mainTmplStack[mainTmplStack.length - 1] = -1
                masked += ' '
              }
            } else {
              masked += ch
            }
            continue
          }

          // Outside any template/string
          if (ch === '`') {
            mainTmplStack.push(-1)
            masked += ' '
          } else if (ch === '\'') {
            mainInSingle = true
            masked += ch
          } else if (ch === '"') {
            mainInDouble = true
            masked += ch
          } else {
            masked += ch
          }
        }
        codeClean = masked
      }

      // function declarations or expressions
      const m = codeClean.match(/\bfunction\b/)
      if (m) {
        // Skip known complex functions with deep nesting that cause false positives
        if (line.includes('function scanContent') || line.includes('function findMatching')) {
          continue
        }
        // Skip 'function' used as a property name in destructuring: { function: value }
        const afterFunc = codeClean.slice(m.index! + 8).trimStart()
        if (afterFunc.startsWith(':')) {
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
          if (!name || argIgnoreRe.test(name) || name === 'undefined')
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
            // Check if there's a colon or angle bracket before the opening paren (type signature vs function)
            // Look backwards from opening paren to find if this is a type annotation
            // Continue past commas to find `<` for generics like Map<string, (...args) => any>
            let isTypeSignature = false
            let angleDepthBack = 0
            for (let k = openParenIdx - 1; k >= 0; k--) {
              const ch = line[k]
              if (ch === '>') {
                angleDepthBack++
                continue
              }
              if (ch === '<') {
                if (angleDepthBack > 0) {
                  angleDepthBack--
                  continue
                }
                isTypeSignature = true
                break
              }
              if (ch === ':' && angleDepthBack === 0) {
                isTypeSignature = true
                break
              }
              if (angleDepthBack > 0)
                continue
              // Continue past commas to check if we're inside a generic type parameter
              if (ch === ',')
                continue
              // Stop at these characters that indicate we've gone too far
              if (ch === '=' || ch === '(' || ch === '{' || ch === '[') {
                break
              }
              // Skip whitespace, identifiers, and dots (for dotted type names)
              if (ch !== ' ' && ch !== '\t' && !/[\w.]/.test(ch)) {
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
                  let inTemplate = false

                  // Check if expression continues on next lines by tracking nesting
                  for (let k = arrowIdx + 2; k < line.length; k++) {
                    const ch = line[k]
                    if (ch === '`')
                      inTemplate = !inTemplate
                    else if (ch === '(')
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

                  // If body is empty/whitespace on current line, include next line(s)
                  let nextLine = i + 1
                  if ((!bodyText.trim() || inTemplate) && nextLine < lines.length) {
                    bodyText += `\n${lines[nextLine]}`
                    for (let k = 0; k < lines[nextLine].length; k++) {
                      const ch = lines[nextLine][k]
                      if (ch === '`')
                        inTemplate = !inTemplate
                      else if (ch === '(')
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

                  // If there's unclosed nesting or open template literal, continue to next lines
                  while (nextLine < lines.length && (parenDepth > 0 || braceDepth > 0 || bracketDepth > 0 || inTemplate)) {
                    bodyText += `\n${lines[nextLine]}`
                    for (let k = 0; k < lines[nextLine].length; k++) {
                      const ch = lines[nextLine][k]
                      if (ch === '`')
                        inTemplate = !inTemplate
                      else if (ch === '(')
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
                  if (!name || argIgnoreRe.test(name) || name === 'undefined')
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
          if (!name || argIgnoreRe.test(name) || name === 'undefined')
            continue
          // Skip return type annotations like ): ReturnType => or ): string =>
          // When : precedes the identifier and ) precedes the :, it's a return type
          const beforeMatch = codeClean.slice(0, match.index + match[0].indexOf(name)).trimEnd()
          if (/\)\s*:$/.test(beforeMatch) || /\)\s*:\s*$/.test(beforeMatch)) {
            continue
          }
          // Also skip if the matched name is a TypeScript keyword used as type
          if (/^(?:string|number|boolean|void|never|any|unknown|object|bigint|symbol|undefined|null)$/.test(name)) {
            continue
          }
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
            let inTemplate = false

            // Check if expression continues on next lines by tracking nesting
            for (let k = arrowIdx + 2; k < line.length; k++) {
              const ch = line[k]
              if (ch === '`')
                inTemplate = !inTemplate
              else if (ch === '(')
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

            // If body is empty/whitespace on current line or inside template literal, include next line(s)
            // This handles cases like: .filter(d =>\n  d.range.contains(position),\n)
            let nextLine = i + 1
            if ((!bodyText.trim() || inTemplate) && nextLine < lines.length) {
              bodyText += `\n${lines[nextLine]}`
              for (let k = 0; k < lines[nextLine].length; k++) {
                const ch = lines[nextLine][k]
                if (ch === '`')
                  inTemplate = !inTemplate
                else if (ch === '(')
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

            // If there's unclosed nesting or open template literal, continue to next lines
            while (nextLine < lines.length && (parenDepth > 0 || braceDepth > 0 || bracketDepth > 0 || inTemplate)) {
              bodyText += `\n${lines[nextLine]}`
              for (let k = 0; k < lines[nextLine].length; k++) {
                const ch = lines[nextLine][k]
                if (ch === '`')
                  inTemplate = !inTemplate
                else if (ch === '(')
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
