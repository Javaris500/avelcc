# Testing

Two suites gate this codebase. Both must be green to ship.

api    `pnpm --filter api test:e2e`     the HTTP surface, against a real database
web    `pnpm --filter web test:e2e`     the browser, against a running app

Every test asserts on observable state. A test with no assertion
passes every time.

Test the contract, not the implementation. Assert on the response
body and status code, not on which service method was called.

Each test creates the state it needs. No test depends on another
test having run first.

Assert on a condition, never on a duration. No sleeps.

An intermittent failure is a failure. Do not retry it and do not skip
it. Fix the condition or file a finding.

Name a test for the behaviour it pins, not for the function it calls.

An agent authors tests for the code it owns. Browser tests belong to
the verification agent. Nobody edits a test they did not author.

Nobody edits the code under test to make a test pass.
