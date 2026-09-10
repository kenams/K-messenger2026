import { registerRootComponent } from 'expo';
import { Root } from './Root';

// Last-resort visibility: if something throws outside React's render tree
// (an async task, a bad import), surface it instead of a silent white screen.
// React render errors are still caught by RootErrorBoundary inside <Root/>.
const globalErrorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: unknown, f: boolean) => void; setGlobalHandler?: (h: (e: unknown, f: boolean) => void) => void } }).ErrorUtils;
if (globalErrorUtils?.setGlobalHandler) {
  const previous = globalErrorUtils.getGlobalHandler?.();
  globalErrorUtils.setGlobalHandler((error, isFatal) => {
    // eslint-disable-next-line no-console
    console.error('[K-ssenger] uncaught', isFatal ? '(fatal)' : '', error);
    previous?.(error, isFatal);
  });
}

registerRootComponent(Root);
