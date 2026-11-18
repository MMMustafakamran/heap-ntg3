/**
 * Pages of https://docs.copilotkit.ai/angular/google-antigravity under test, one per assignment.json page and
 * in the same order, so the clip names match: ANTIGRAVITY-angular-<NN>-<videoName>.
 * Demo routes are `<route>/demo` (frontend/src/app/app.routes.ts).
 * Statuses and findings: assignment.json / FINDINGS.md. ❌/⚠️ pages end with doc evidence and a
 * Notepad note (actions/antigravity.actions.ts).
 */
import { definePages } from '../core/types';

export const SKIP_RECORDING: Record<string, string> = {};

const PKG = { filePath: 'frontend/package.json', startLine: 20, endLine: 40 };
/** Installed versions (scripts/write-versions.mjs, written after the final install in each CI job). */
const VERSIONS = { filePath: 'frontend/VERSIONS.md', startLine: 6, endLine: 20 };
const RUNTIME = { filePath: 'frontend/server.ts', startLine: 1, endLine: 50 };
/** The docs site's persisted framework tab (localStorage), so the doc opens on Angular. */
const ANGULAR_TAB = { 'shell-docs.tab.frontend_framework': 'angular' };
const AGENT = { filePath: 'backend/agent_server.py', startLine: 1, endLine: 30 };
const COMMON = { filePath: 'backend/agents/_common.py', startLine: 58, endLine: 120 };

export const PAGES = definePages([
  {
    id: 'quickstart',
    name: 'Quickstart (Angular)',
    videoName: 'Quickstart',
    docPath: '',
    route: 'quickstart',
    ideFile: 'frontend/src/app/features/quickstart/quickstart-chat.ts',
    startLine: 1,
    endLine: 15,
    extraTabs: [
      VERSIONS,
      PKG,
      { filePath: 'frontend/src/app/app.config.ts', startLine: 1, endLine: 50 },
      COMMON,
      { ...AGENT, addedText: 'def build_registry():  # HARNESS: never defined on the page' },
      { ...RUNTIME, addedText: '  process.env["AGENT_URL"] ?? "http://localhost:8281/default"; // HARNESS: Antigravity agent server, port 8281 (doc: 8000)' },
    ],
    prompt: 'Hey, are you connected? Tell me a quick fun fact about kites.',
    waitAfterPromptMs: 3000,
  },
  // PAGE GROUPS: one entry per assignment.json page, in the same order (added per group).
]);
