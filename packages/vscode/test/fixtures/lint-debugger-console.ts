// Test fixture for noDebugger and noConsole rules
// Default: noDebugger = 'error', noConsole = 'warn'
//
// The `debugger` statements below are the point of this file. `--fix` deletes
// one wherever it finds it, and a sweep of the tree took both out of here in
// 7185a5a, which left the test asserting a rule that no longer had anything
// to report. The project config ignores **/test/fixtures/**, so they survive
// a run from the repo root; do not remove them.

function testFunction() {
  // ISSUE: debugger statement
  debugger

  // ISSUE: console.log call
  console.log('Debug message')

  // ISSUE: console.warn call
  console.warn('Warning message')

  // ISSUE: console.error call
  console.error('Error message')

  const x = 1

  // ISSUE: debugger in conditional
  if (x > 0) {
    debugger
  }

  // ISSUE: console.info
  console.info('Info message')

  // ISSUE: console.debug
  console.debug('Debug call')

  // ISSUE: console.trace
  console.trace('Trace call')

  return x
}
