// Public entry for `@inertiajs/core/testing`. This file must only import from './index' so
// the bundled entry shares Inertia's state with the main entry instead of duplicating it.
export { createTestScope, MemoryHistory, type TestScope, type TestScopeOptions } from './index'
