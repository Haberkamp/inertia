import { Config } from './config'
import { environment } from './environment'
import { Router } from './router'
import { createTestScope as createScope, testScopeOwnership, type TestScope, type TestScopeOptions } from './testScope'

export { UseFormUtils } from './useFormUtils'

export { axiosAdapter } from './axiosHttpClient'
export { config } from './config'
export { getInitialPageFromDOM, getScrollableParent } from './domUtils'
export { hasFiles } from './files'
export { objectToFormData } from './formData'
export { formDataToObject } from './formObject'
export { default as createHeadManager, resolveServerHead } from './head'
export { http } from './http'
export { HttpCancelledError, HttpError, HttpNetworkError, HttpResponseError } from './httpErrors'
export { default as useInfiniteScroll } from './infiniteScroll'
/** @internal Not part of the public API. May change or be removed without notice. */
export { exposeInterceptors, interceptors } from './interceptors'
export {
  createLayoutPropsStore,
  isPropsObject,
  isPropsObjectOrCallback,
  normalizeLayouts,
  type LayoutCallbackReturn,
  type LayoutDefinition,
  type LayoutPropsStore,
} from './layout'
export { shouldIntercept, shouldNavigate } from './navigationEvents'
export { isPathOrSubPath, partialReloadRequestsProp, partialReloadRequestsSomeProps } from './partialReload'
export { progress, default as setupProgress } from './progress'
export { FormComponentResetSymbol, resetFormFields } from './resetFormFields'
export { buildSSRBody } from './ssrUtils'
export * from './types'
export {
  hrefToUrl,
  isSameUrlWithoutQueryOrHash,
  isUrlMethodPair,
  mergeDataIntoQueryString,
  resolveUrlMethodPairComponent,
  urlHasProtocol,
  urlToString,
  urlWithoutHash,
} from './url'
export { XhrHttpClient, xhrHttpClient } from './xhrHttpClient'
export { type Config, type Router }

export const router = new Router()

/** @internal Use `@inertiajs/core/testing` instead. */
export { MemoryHistory } from './environment'
/** @internal Use `@inertiajs/core/testing` instead. */
export { activeTestScope, onTestScopeReset, type TestScope, type TestScopeOptions } from './testScope'
/** @internal The current URL: the browser's location, or the in-memory one inside a test scope. */
export const currentLocation = (): Location | URL => environment.location()

/** @internal Use `createTestScope` from `@inertiajs/core/testing` instead. */
export const createTestScope = (options?: TestScopeOptions): TestScope => createScope(router, options)

/** @internal Used by the adapters' test components. */
export const testScopes = {
  acquire: (owner: object, options: TestScopeOptions = {}): TestScope =>
    testScopeOwnership.acquire(router, owner, options),
  mount: (owner: object): void => testScopeOwnership.mount(owner),
  release: (owner: object): void => testScopeOwnership.release(owner),
}
