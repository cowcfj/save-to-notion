## 2024-05-16 - O(N) Regex Compilation Bottleneck
**Learning:** In Javascript, instantiating `new RegExp` in a tight loop across dozens of terms causes measurable GC and compile-time overhead. When parsing long text content, matching term by term is $O(N \cdot M)$.
**Action:** When doing bulk keyword searches against text, always pre-compile strings into a single alternating regex `\b(word1|word2)\b` globally. This reduces execution to a single optimized pass $O(N)$.
