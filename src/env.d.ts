/** Build-time constants injected by Vite. */
declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;

/** Side-effect CSS imports (handled by Vite, not emitted by tsc). */
declare module "*.css";
