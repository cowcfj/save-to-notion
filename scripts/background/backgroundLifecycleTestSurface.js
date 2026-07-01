const TEST_SURFACE_KEY = '__backgroundLifecycleTestSurface';

function setBackgroundLifecycleTestSurface(surface) {
  globalThis[TEST_SURFACE_KEY] = surface;
}

function getBackgroundLifecycleTestSurface() {
  return globalThis[TEST_SURFACE_KEY];
}

export { getBackgroundLifecycleTestSurface, setBackgroundLifecycleTestSurface };
