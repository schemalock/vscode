const esbuild = require("esbuild");

const minify = process.argv.includes("--minify");
const watch = process.argv.includes("--watch");

const sharedConfig = {
  bundle: true,
  external: ["vscode"],
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: !minify,
  minify: minify,
  logLevel: "info",
};

const extensionConfig = {
  ...sharedConfig,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
};

// Build restartBudget as a standalone CJS module so tests can require it
// directly without going through the full extension bundle.  It has no
// external dependencies so bundle:true is safe here.
const restartBudgetConfig = {
  ...sharedConfig,
  entryPoints: ["src/restartBudget.ts"],
  outfile: "dist/restartBudget.js",
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(extensionConfig);
    await ctx.watch();
    console.log("[esbuild] watching src/...");
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(restartBudgetConfig),
    ]);
  }
})().catch(() => process.exit(1));
