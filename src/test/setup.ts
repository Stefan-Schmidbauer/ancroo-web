/** Test setup: stub the browser extension APIs the adapters touch.
 *
 *  Only what the code under test actually calls is stubbed — the Ollama
 *  adapter installs a declarativeNetRequest rule before every request. */

import { vi, beforeEach } from "vitest";

const chromeStub = {
  declarativeNetRequest: {
    updateDynamicRules: vi.fn().mockResolvedValue(undefined),
    RuleActionType: { MODIFY_HEADERS: "modifyHeaders" },
    HeaderOperation: { SET: "set" },
    ResourceType: { XMLHTTPREQUEST: "xmlhttprequest" },
  },
  permissions: {
    contains: vi.fn().mockResolvedValue(true),
    request: vi.fn().mockResolvedValue(true),
  },
};

vi.stubGlobal("chrome", chromeStub);

beforeEach(() => {
  chromeStub.declarativeNetRequest.updateDynamicRules.mockClear();
});
