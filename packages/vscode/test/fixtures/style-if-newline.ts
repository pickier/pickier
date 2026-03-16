// Test fixture for style/if-newline rule
// if-else chains should have consistent newlines

function testIfNewline() {
  const x = 10

  // ISSUE: if-else on same line (inconsistent with multiline blocks)
  if (x > 100) {
    console.log('Large')
  }
else { console.log('Small') }

  // ISSUE: Mixed single-line and multi-line
  if (x === 0) return 0
  else if (x === 1) {
    return 1
  }
  else return -1

  // OK: Consistent formatting
  if (x > 50) {
    console.log('Greater than 50')
  }
  else if (x > 25) {
    console.log('Greater than 25')
  }
  else {
    console.log('25 or less')
  }

  // OK: All single-line (consistent)
  if (x > 0) return 'positive'
  else if (x < 0) return 'negative'
  else return 'zero'
}
