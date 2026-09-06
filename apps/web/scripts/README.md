# Build-time scripts

Not part of the application, and deliberately excluded from the app's
tsconfig. They are run by hand with `tsx` and may import tooling — `sharp`,
for instance — that the web package does not itself depend on.

That exclusion is not tidiness. `next build` type-checks everything the
tsconfig includes, so a script importing a package that is merely hoisted
into the local node_modules will build fine here and fail on a clean
install in CI. It did exactly that once.

    pnpm --filter web exec tsx scripts/craftShapes.ts
