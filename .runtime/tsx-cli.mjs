// Runs tsx's CLI from the borrowed node_modules (works under ELECTRON_RUN_AS_NODE).
const cliUrl = new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url).href;
await import(cliUrl);
