# Testing Philosophy

This document describes how we test the Wisdom project. It synthesizes ideas
from matklad's excellent writings on testing (see [Unit and Integration
Tests](https://matklad.github.io/2022/07/04/unit-and-integration-tests.html)
and [How to Test](https://matklad.github.io/2021/05/31/how-to-test.html)).

## Guiding Principles

### 1. Test Features, Not Code

Tests should verify that features work as expected, not that a particular
implementation exists. Ask yourself: "Would this test still be valid if I rewrote
the feature from scratch?"

The test suite should pass the **neural network test**: if we replaced the
entire implementation with a black box that produces the same outputs, would our
tests still be useful?

### 2. Purity Over Extent

When thinking about tests, use the purity/extent framework:

- **Purity**: How much IO does the test do? Pure tests (no disk, network, or
  process spawning) are fast, stable, and non-flaky. Impure tests are slow and
  brittle. Ruthlessly optimize for purity.
- **Extent**: How much code does the test exercise? Don't artificially limit
  extent with mocks — it's fine for a test to exercise large portions of the
  codebase as long as it remains pure.

A test that exercises the entire HTTP API handler chain through a pure function
call is better than a test that mocks out dependencies. As a corollary, design
code to be testable this way.

### 3. Minimize Test Friction

Adding a new test should be trivial. If writing a test is more work than the fix
it verifies, tests won't get written.

Use data-driven tests with a `check` helper function that encapsulates the API
under test. Instead of:

```go
func TestFeature(t *testing.T) {
    result := feature.Call(someSetup(), "input")
    assert.Equal(t, expected, result)
}
```

Prefer:

```go
func TestFeature(t *testing.T) {
    check(t, "input", "expected")
}
```

The `check` function handles setup, invocation, and assertions. When the API
changes, you update one place.

### 4. Test at Boundaries

For the Go backend, boundaries are the public HTTP API and exported package
functions. For the frontend, boundaries are user-visible behaviors.

Don't test private functions directly. If a function is important enough to
test, it's important enough to be part of a public API or have its behavior
verified through the boundary.

### 5. Make Tests Fast

Slow tests kill productivity. Tests that take longer than your attention span
obliterate the edit-test feedback loop.

- Keep the core test suite under 10 seconds
- Isolate IO (database, filesystem, network) behind interfaces
- Use in-memory implementations in tests
- Mark genuinely slow tests with `RUN_SLOW_TESTS` environment variable, skip by
  default, run on CI

### 6. Prefer Integration Tests

The classical "unit test" approach of isolating functions and mocking
dependencies tends to test implementation details. This makes refactoring harder.

Instead, write **integrated tests** that exercise real code paths through public
APIs. Mock external dependencies (databases, HTTP clients) but don't mock your
own code.

## Language-Specific Guidelines

### Go Backend

1. **Test the public API**: Write tests against exported functions and HTTP
   handlers. The `check` helper should construct an HTTP request and verify the
   response.

2. **Use interfaces for IO**: Database access, filesystem operations, and HTTP
   clients should be behind interfaces. Tests use in-memory implementations.

3. **Test each layer**: If you have `storage -> service -> handler`, write
   integrated tests for each layer:
   - `storage` tests verify storage behavior
   - `service` tests verify service behavior (using real storage)
   - `handler` tests verify HTTP behavior (using real service and storage)

4. **Use table-driven tests**: Go's idiomatic table-driven tests align well with
   data-driven testing:

   ```go
   func TestFeature(t *testing.T) {
       tests := []struct {
           name     string
           input    string
           expected string
       }{
           {"empty", "", "result"},
           {"simple", "input", "output"},
       }
       for _, tt := range tests {
           t.Run(tt.name, func(t *testing.T) {
               check(t, tt.input, tt.expected)
           })
       }
   }
   ```

### TypeScript/React Frontend

1. **Test user-visible behavior**: Don't test component implementation details.
   Test what users see and can interact with.

2. **Use testing-library**: `@testing-library/react` encourages testing like a
   user would interact with the UI.

3. **Mock the backend**: The frontend talks to the Go backend via HTTP. In
   tests, mock these calls with known responses.

4. **Test complex logic in isolation**: Pure functions for data transformation
   can be tested without React. Keep components thin.

## Anti-Patterns

1. **Over-mocking**: Mocking your own code creates brittle tests that break on
   refactoring. Mock external boundaries only.

2. **Testing private functions**: If you need to test it, make it public or test
   it through public APIs.

3. **Slow tests in the main suite**: Any test that takes more than a second
   should be marked as slow and skipped by default.

4. **Flaky tests**: Tests that fail intermittently destroy trust in the test
   suite. Fix or delete flaky tests immediately.

5. **TDD as design**: Tests don't tell you how to structure code. Write tests
   after you understand the problem and solution.

## Practical Workflow

1. **Write the feature first**: Understand what you're building before writing
   tests.

2. **Add tests through the boundary**: Write tests that exercise the feature via
   its public API.

3. **Use the `check` idiom**: Create a helper that encapsulates the setup,
   invocation, and assertion.

4. **Run tests continuously**: Keep the test feedback loop tight. Slow tests go
   to CI only.

5. **Update tests with changes**: When refactoring, update the `check` function,
   not individual tests.

## Summary

- Test features, not implementation
- Keep tests pure (no IO) for speed and reliability
- Use integrated tests that exercise real code paths
- Minimize friction with `check` helpers and table-driven tests
- Test at boundaries (HTTP API for backend, user interactions for frontend)
- Make adding tests trivial and running them fast
