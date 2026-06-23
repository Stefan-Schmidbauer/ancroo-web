/** About panel showing version and project information. */
export function AboutPanel({ onClose }: { onClose: () => void }) {
  const version = __APP_VERSION__;

  return (
    <div class="flex flex-col h-screen">
      <div class="flex items-center justify-between p-3 border-b bg-white">
        <h1 class="font-bold text-sm">About Ancroo</h1>
        <button onClick={onClose} class="text-xs text-gray-400 hover:text-gray-600">
          Close
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div class="text-center py-4">
          <img
            src="/ancroo.png"
            alt="Ancroo"
            class="w-20 h-20 mx-auto rounded-2xl shadow-md mb-3"
          />
          <h2 class="text-lg font-bold text-gray-900">Ancroo</h2>
          <p class="text-sm text-gray-500 mt-1">AI Prompt Launcher for your Browser</p>
          <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-2">
            Point. Prompt. Done.
          </p>
        </div>

        <div class="bg-white rounded-lg border divide-y">
          <div class="flex justify-between px-3 py-2.5">
            <span class="text-sm text-gray-500">Version</span>
            <span class="text-sm font-mono text-gray-900">{version}</span>
          </div>
          <div class="flex justify-between px-3 py-2.5">
            <span class="text-sm text-gray-500">Build</span>
            <span class="text-sm font-mono text-gray-900">{__COMMIT_HASH__}</span>
          </div>
        </div>

        <div class="bg-white rounded-lg border divide-y">
          <div class="flex justify-between px-3 py-2.5">
            <span class="text-sm text-gray-500">Author</span>
            <span class="text-sm text-gray-900">Stefan Schmidbauer</span>
          </div>
          <div class="flex justify-between px-3 py-2.5">
            <span class="text-sm text-gray-500">License</span>
            <span class="text-sm text-gray-900">MIT</span>
          </div>
          <div class="flex justify-between px-3 py-2.5">
            <span class="text-sm text-gray-500">Source</span>
            <a
              href="https://github.com/ancroo/ancroo-web"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-blue-600 hover:text-blue-700"
            >
              GitHub
            </a>
          </div>
          <div class="flex justify-between px-3 py-2.5">
            <span class="text-sm text-gray-500">Demo</span>
            <a
              href="https://ancroo.github.io/ancroo-web/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-blue-600 hover:text-blue-700"
            >
              Try it out
            </a>
          </div>
        </div>

        <p class="text-xs text-gray-400 text-center">
          Built with the help of AI (Claude by Anthropic)
        </p>
      </div>
    </div>
  );
}
