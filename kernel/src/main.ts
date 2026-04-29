// kernel/src/main.ts — Phase-1 stub
// Per STATE.md ## Decisions: the kernel runs as a separate Node process spawned by
// Electron main. Phase 1 only proves the spawn works; observation/IPC arrives Phase 2+.
//
// Runtime contract for Phase 1:
//   1. Print `[kernel] up` with pid + start timestamp on launch.
//   2. Emit a heartbeat every 30s so a developer running `npm run start` can see it alive.
//   3. Exit cleanly (code 0) on SIGTERM / SIGINT.
// No JSON-RPC, no observation, no restart logic. Phase 2+ replaces this.

const startedAt = new Date().toISOString();
console.log(`[kernel] up pid=${process.pid} started=${startedAt}`);

// Heartbeat every 30s so a developer running `npm run start` can see the kernel alive.
const heartbeat = setInterval(() => {
	console.log(`[kernel] heartbeat pid=${process.pid} uptime=${Math.floor(process.uptime())}s`);
}, 30_000);

function shutdown(signal: NodeJS.Signals): void {
	clearInterval(heartbeat);
	console.log(`[kernel] received ${signal}, exiting cleanly`);
	process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// The setInterval handle keeps the event loop alive; no explicit keep-alive needed.
