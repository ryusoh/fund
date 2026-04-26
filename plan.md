1.  **Optimize `initParticles` array creation in `js/ui/tableGlassEffect.js`**
    -   Replace `Array.from({ length: count }, () => (...))` with a pre-allocated array and a `for` loop. `Array.from` with a map function creates unnecessary GC overhead, which is bad for performance, especially if particles are re-initialized or initialized frequently.

2.  **Optimize `resize` row tracking loop in `js/ui/tableGlassEffect.js`**
    -   Replace `rows.forEach((row) => { this.rows.push(...) })` with a pre-sized array assignment using a `for` loop `for (let i = 0; i < rows.length; i++)`. This avoids dynamic array resizing (via `.push()`) and closure allocation overhead per iteration (via `.forEach()`) in the resize handler, which can be called rapidly.

3.  **Complete pre commit steps**
    -   Ensure proper testing, verification, review, and reflection are done by running `pnpm lint`, `pnpm test`, and following any other instructions.

4.  **Submit the change**
    -   Submit the PR with the branch name `bolt-optimize-table-glass-effect`, detailing the performance improvements by eliminating intermediate allocations and GC pressure.
