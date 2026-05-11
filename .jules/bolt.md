## 2024-05-18 - DocumentFragment & replaceChildren() optimization
**Learning:** Using DocumentFragment and replaceChildren() provides measurable speedups for rendering lists. However, Jest mocks might be missing newer DOM methods like replaceChildren.
**Action:** When migrating textContent = '' to replaceChildren(), always add mock implementation to test files as DOM APIs might not exist in the mocked elements.
