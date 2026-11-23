/**
 * Page actions for Google Antigravity + Angular. Each drives the feature its doc page teaches and checks the
 * effect the page promises; a missing effect calls ctx.fail, so a broken page records as a
 * failing clip (with the failure terminal at the end) instead of a quiet pass.
 *
 * ❌/⚠️ pages (assignment.json) end with the level-1 tail: back to the doc, drag-select each
 * faulty snippet (FINDING_EVIDENCE), then the note typed into Notepad (humanizeNote, via
 * showFinding). ✅ pages are plain working takes (AUTORECORDER.md sections 2-3).
 */
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page } from 'playwright';

import { type ActionContext, type PageActionHandler } from '../core/types';
import { runStandardAction, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { sleep } from '../core/overlays/cursor';
import { mark } from '../core/timeline';
import { registerDocEvidence } from '../core/doc-evidence';
import { attachImage } from './attach-image';
import { type DocEvidence, showFinding } from './doc-evidence';
import { glideClick, glideTo } from './glide-click';

// ---------------------------------------------------------------------------------------------
// Findings shown at the end of ❌/⚠️ clips. `text` is matched on the rendered doc page.
// ---------------------------------------------------------------------------------------------

export const FINDING_EVIDENCE: Record<string, DocEvidence[]> = {
  quickstart: [
    { text: 'AGENT_REGISTRY = build_registry()', caption: 'Backend is a fragment: build_registry is never defined; _common.py has no imports or constants (FINDINGS.md #1)' },
    { text: 'Expose the selected backend through Copilot Runtime', caption: 'Runtime step is only this callout; no Node runtime server or start command for Angular, the runtime guide loops back here' },
  ],
  'open-generative-ui': [
    // The rendered <p> breaks the line after "sandboxed" (raw text node has a newline), so the needle stops there.
    { text: 'object opts the frontend into the built-in sandboxed', caption: 'Only the frontend config is shown; the runtime openGenerativeUI flag that turns it on is never shown' },
  ],
  // --- shared-state / agent-readonly / hitl / interrupts / sub-agents (2026-11-18) ---
  'shared-state': [
    { text: 'then ask the agent for the current priority', caption: 'Agent never sees agent.setState state: Antigravity needs experimental_app_state=True + a get_shared_state prompt, never shown' },
  ],
  'agent-readonly': [
    { text: 'connectAgentContext(() => ({', caption: 'Values never reach the agent: needs experimental_app_context=True + a get_app_context instruction, never shown' },
  ],
  'use-interrupt': [
    { text: 'When the backend agent pauses for input', caption: 'No Antigravity backend that pauses is shown or linked' },
    { text: 'injectInterrupt<ReviewRequest>("default")', caption: 'So the default agent never interrupts and this never fires' },
  ],
  'clf-headless-ui': [
    { text: 'await this.copilotKit.core.runAgent({ agent });', caption: 'ng serve fails TS2739 on this line with today packages: @copilotkit/angular 0.6.0 pins @ag-ui/client 1.0.2, core 1.89.0 uses 1.0.5 (FINDINGS.md #14)' },
  ],
  'headless-interrupts': [
    { text: 'When the backend agent emits an AG-UI interrupt', caption: 'No Antigravity interrupt backend is shown or linked, so nothing appears' },
  ],
};
// Doc step highlights these before the IDE (no KNOWN_ISSUE set in this repo, so no skip list).
registerDocEvidence(FINDING_EVIDENCE);

export const FINDING_NOTES: Record<string, string> = {
  quickstart: [
    "page says connect the antigravity backend then run backend runtime and angular app and chat works",
    "following just the page theres nothing to run, chat only answers on a backend and runtime i put together myself",
    "backend snippet is a fragment,no imports no constants and build_registry is never defined",
    "and theres no node runtime server or start command for angular,the runtime guide just loops back to the quickstart",
  ].join('\n'),
  a2ui: [
    "page says pass your catalog thru provideCopilotKit a2ui and the chat renders your catalog components",
    "asked for a flight card and only got a plain text reply,no a2ui surface at all",
    "the config uses productCatalog which is never defined,catalog snippets also use dynamicString AcmeBadge PanelComponent with no imports",
    "page itself says without a catalog a2ui stays off,so as written theres nothing to render with",
  ].join('\n'),
  'open-generative-ui': [
    "page says add openGenerativeUI and the agent streams sandboxed ui into the chat",
    "asked for 3 filter buttons,agent says it generated the ui above but no sandbox iframe ever shows,just text",
    "page only shows the frontend config",
    "the runtime openGenerativeUI flag that actually turns it on is never shown so nothing sandboxed renders",
  ].join('\n'),
  'mcp-apps': [
    "page says add provideMCPApps and the chat renders the app resources an mcp server returns",
    "added it exactly,asked for an app and the agent just says no mcp app tool is available",
    "page never says which mcp server to use or where to connect it,runtime config isnt shown either",
    "only the browser provider is on the page so nothing can ever return an app",
  ].join('\n'),
  // --- shared-state / agent-readonly / hitl / interrupts / sub-agents (2026-11-18) ---
  'shared-state': [
    "page says click mark high priority then ask the agent and it answers high",
    "panel shows priority high but the agent never answers,run ends with no reply",
    "backend log says model produced invalid output,improper format stop reason",
    "agent never sees state from agent.setState",
    "antigravity needs experimental_app_state true plus a prompt to call get_shared_state,angular page never shows that",
  ].join('\n'),
  'agent-readonly': [
    "page says connectAgentContext sends app values like name and timezone to the agent",
    "clicked use london time and asked,the agent never answers,no reply at all",
    "backend log says model produced invalid output,improper format stop reason",
    "values never reach the agent",
    "antigravity needs experimental_app_context true and an instruction to call get_app_context,never shown on the page",
  ].join('\n'),
  'use-interrupt': [
    "page says when the backend agent pauses injectInterrupt gives u the pending decision",
    "following the page nothing pauses so nothing ever shows up",
    "no antigravity backend that pauses is shown or linked anywhere",
    "so injectInterrupt default never fires,i had to write my own interrupt agent to see the panel",
  ].join('\n'),
  'clf-headless-ui': [
    "page says call copilotKit.core.runAgent with the agent and the headless chat sends ur message",
    "with todays install ng serve wont even compile,ts2739 type abstractagent is missing _threadId maxEnforcedEntries",
    "angular 0.6.0 pins ag-ui client 1.0.2 exact but core 1.89 uses 1.0.5,so u get two copies of abstractagent",
    "the runAgent line straight from the page is what breaks,i had to cast it to get the rest of the app building",
  ].join('\n'),
  'headless-interrupts': [
    "page says when the backend emits an interrupt the agent store holds the pending decision",
    "following the page nothing appears,no pending decision",
    "no antigravity interrupt backend is shown or linked",
    "had to write my own interrupt agent to see approve and reject",
  ].join('\n'),
  'multi-agent-subagents': [
    'page says pip install ag-ui-antigravity google-antigravity then run subagents.py',
    'subagents.py imports httpx at the top so the server crashes,modulenotfound no module named httpx',
    'frontend part is a fragment,readDelegations subAgentRendererConfig SubAgentName never defined',
    'had to add httpx and write the delegation log myself,then the sub agents run',
  ].join('\n'),
};

/** Status per page from assignment.json: the Notepad tail runs only on ❌/⚠️ pages (AUTORECORDER.md section 3). */
function pageStatus(id: string): string {
  try {
    const a = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'assignment.json'), 'utf-8')) as { pages: { id: string; status?: string }[] };
    return a.pages.find((p) => p.id === id)?.status ?? '';
  } catch { return ''; }
}

async function writeFinding(page: Page, id: string, config: Parameters<PageActionHandler>[1]): Promise<void> {
  const st = pageStatus(id);
  if (!st.includes('❌') && !st.includes('⚠')) return; // ✅ take: no Notepad
  await showFinding(page, config, FINDING_EVIDENCE[id], FINDING_NOTES[id]);
}

async function settle(page: Page, msgCount: number, ctx: ActionContext, quietMs = 3000): Promise<void> {
  try {
    // Page `timeouts` (pages.config.ts) apply here too, not only in runStandardAction.
    await waitForAgentResponseCompletion(page, quietMs, msgCount, undefined, { startTimeoutMs: ctx.timeouts.replyStartMs, streamTimeoutMs: ctx.timeouts.replyStreamMs });
  } catch (e) {
    ctx.warn(`Reply did not complete cleanly: ${String(e).slice(0, 160)}`);
  }
}

/**
 * Run a real command and append its output to a repo log (logs/<file>), so the failure terminal
 * at the end of the clip tails the real error. Never throws.
 */
function runToLog(root: string, file: string, cwd: string, cmd: string, args: string[]): Promise<void> {
  mkdirSync(join(root, 'logs'), { recursive: true });
  const log = join(root, 'logs', file);
  appendFileSync(log, `\n$ (cd ${cwd} && ${cmd} ${args.join(' ')})\n`);
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: join(root, cwd), timeout: 180000, shell: process.platform === 'win32' }, (_err, stdout, stderr) => {
      appendFileSync(log, `${stdout ?? ''}${stderr ?? ''}`);
      resolve();
    });
  });
}

const typecheck = (root: string, folder: string) =>
  runToLog(root, 'doc-typecheck.log', 'frontend', 'node', [
    'node_modules/typescript/bin/tsc',
    '-p',
    `doc-verbatim/${folder}/tsconfig.json`,
  ]);

// ---------------------------------------------------------------------------------------------
// ❌ / ⚠️ pages
// ---------------------------------------------------------------------------------------------

/** Quickstart: the chat answers, but only on the harness backend + runtime (FINDINGS.md #1). */
export const runQuickstartAction: PageActionHandler = async (page, config, root, ctx) => {
  try {
    await runStandardAction(page, config, root, ctx);
  } finally {
    await writeFinding(page, config.id, config);
  }
};

/** Voice and multimodal: attachments work; there is no mic (no transcription route shown). */
export const runVoiceAction: PageActionHandler = async (page, config, root, ctx) => {
  try {
    await attachImage(page, root);
    const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
    await settle(page, msgCount, ctx);
    const reply = (await page.locator('copilot-chat-assistant-message').last().innerText().catch(() => '')) || '';
    if (!/quarterly|revenue|q4/i.test(reply)) ctx.fail(`The agent did not read the attached chart: "${reply.slice(0, 160)}"`);
    const mic = page.locator('button[aria-label*="microphone" i], button[aria-label*="voice" i], button[aria-label*="record" i]');
    if ((await mic.count()) === 0) mark('error', 'no mic button in the composer');
    await glideTo(page, page.locator('copilot-chat-input, textarea').first(), 2500);
  } finally {
    await writeFinding(page, config.id, config);
  }
};

/** Shared state: the UI writes priority with agent.setState, then asks the agent what it is. */
export const runSharedStateAction: PageActionHandler = async (page, config, _root, ctx) => {
  const workspace = page.locator('app-workspace').first();
  await glideTo(page, workspace, 1500);
  await glideClick(page, page.getByRole('button', { name: 'Mark high priority' }).first());
  await sleep(2000);
  await glideTo(page, workspace, 1500);
  const msgCount = await sendPrompt(page, 'What is the priority set to right now?', { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = (await page.locator('copilot-chat-assistant-message').last().innerText().catch(() => '')) || '';
  const sawPriority = /\bhigh\b/i.test(reply);
  if (!sawPriority) mark('error');
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  await writeFinding(page, config.id, config);
  if (!sawPriority) {
    ctx.fail(`The agent never saw the priority the app wrote with agent.setState: "${reply.slice(0, 160)}" (FINDINGS.md #4).`);
  }
};

/** Authentication: signed out the hooked runtime answers 401 (no reply); signed in it replies. */
export const runAuthAction: PageActionHandler = async (page, config, _root, ctx) => {
  await sendPrompt(page, config.prompt, { timeoutMs: 15000, expectInputToEmpty: false }).catch(() => {});
  await sleep(9000);
  mark('action', 'signed out: runtime answers 401, no reply');
  await glideClick(page, page.getByRole('button', { name: 'Sign in' }).first());
  await sleep(1500);
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = (await page.locator('copilot-chat-assistant-message').last().innerText().catch(() => '')) || '';
  if (!reply.trim()) ctx.warn('No reply after signing in.');
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
};

/** Sub-agents: ask for research -> write -> critique; the delegation log stays empty; the doc's agent won't import. */
export const runSubagentsAction: PageActionHandler = async (page, config, root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const log = page.getByText('No delegations yet.').first();
  const empty = await log.isVisible().catch(() => false);
  await glideTo(page, log, 2500);
  if (empty) mark('error');
  await runToLog(root, 'subagents-import.log', 'backend', 'uv', ['run', 'python', '-c', 'import src.agents.subagents']);
  await writeFinding(page, config.id, config);
  if (empty) ctx.fail("No delegation ran: the page's subagents.py can't be imported (ModuleNotFoundError: No module named 'src.agents._loop_cap', FINDINGS.md #5).");
};

// ---------------------------------------------------------------------------------------------
// ✅ pages
// ---------------------------------------------------------------------------------------------

/** HITL: the approval card appears, the user approves, the run resumes. */
export const runHitlAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const card = page.locator('app-approval-card').last();
  const shown = await card.waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
  if (!shown) {
    ctx.fail('The approval card never appeared: requestApproval was not called.');
    return;
  }
  await glideTo(page, card, 2000);
  await glideClick(page, card.getByRole('button', { name: 'Approve' }));
  await sleep(1500);
  await settle(page, msgCount, ctx);
  await sleep(2000);
};

/** Inspector: run one turn, open the launcher, walk the panes the quickstart names. */
export const runInspectorAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const inspector = page.locator('cpk-web-inspector');
  if ((await inspector.count()) === 0) {
    ctx.fail('No <cpk-web-inspector> on the page.');
    return;
  }
  await glideClick(page, inspector.locator('button').first());
  await sleep(2500);
  for (const pane of ['Agent', 'AG-UI Events', 'Rich Threads']) {
    const link = inspector.getByText(pane, { exact: true }).first();
    if (await link.isVisible().catch(() => false)) {
      await glideClick(page, link);
      await sleep(3000);
    } else {
      ctx.warn(`Inspector pane "${pane}" not found.`);
    }
  }
};

// ---------------------------------------------------------------------------------------------
// Frontend Tools + Generative UI pages (2026-11-18)
// ---------------------------------------------------------------------------------------------

/** Text of the last assistant message, optionally inside a scope selector (shared by the pages below). */
const lastReply = async (page: Page, scope?: string) =>
  ((await page.locator(scope ? scope + ' copilot-chat-assistant-message' : 'copilot-chat-assistant-message').last().innerText().catch(() => '')) || '').trim();

/** Frontend Tools: change_background must change the gradient behind the chat. */
export const runFrontendToolsAction: PageActionHandler = async (page, config, _root, ctx) => {
  const host = page.locator('[data-testid="background-host"]').first();
  const before = await host.evaluate((el) => (el as HTMLElement).style.background).catch(() => '');
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const changed = await page
    .waitForFunction(
      (prev) => (document.querySelector('[data-testid="background-host"]') as HTMLElement | null)?.style.background !== prev,
      before,
      { timeout: 90000 },
    )
    .then(() => true)
    .catch(() => false);
  await settle(page, msgCount, ctx);
  if (!changed) ctx.fail('change_background never ran: the background did not change.');
  await sleep(1500);
};

/** Components as Tools: show_incident must render the incident card with the id. */
export const runToolBasedAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const card = page.locator('app-incident-card article').last();
  const shown = await card.waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
  await settle(page, msgCount, ctx);
  if (!shown) {
    ctx.fail('show_incident never rendered the incident card.');
    return;
  }
  const text = (await card.innerText().catch(() => '')) || '';
  if (!/INC-4711/i.test(text)) ctx.fail(`The incident card rendered without the id: "${text.slice(0, 80)}"`);
  await glideTo(page, card, 2500);
};

/**
 * Tool Call Rendering: the weather card must show the city and the tool result. The page's
 * handler fetches /api/weather, which the page never provides: ng serve answers with index.html.
 */
export const runToolRenderingAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const card = page.locator('app-weather-card article').last();
  const shown = await card.waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
  await settle(page, msgCount, ctx);
  if (!shown) {
    mark('error');
    ctx.fail('The weather card never reached "complete": getWeather did not render.');
    return;
  }
  const result = ((await card.locator('p').innerText().catch(() => '')) || '').trim();
  await glideTo(page, card, 2500);
  // ✅ + Note (owner, 2026-11-20): /api/weather is the reader's own placeholder endpoint; the card rendering is the feature.
  if (!result || /<!doctype html|<html/i.test(result)) ctx.warn(`Card rendered; tool result is not weather ("${result.slice(0, 60)}"): /api/weather is a placeholder the page doesn't provide.`);
  await sleep(1500);
};


/** Observed facts for a failure text: which runtime URLs the page called and what its /info says (no secrets). */
async function runtimeInfo(page: Page): Promise<string> {
  const urls = await page
    .evaluate(() => [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /:828\d\//.test(u)).map((u) => u.replace(/\?.*$/, '')))])
    .catch(() => [] as string[]);
  const base = (urls.find((u) => /\/api\/copilotkit/.test(u)) ?? '').replace(/(\/api\/copilotkit).*$/, '$1');
  let info = '';
  if (base) {
    info = await page
      .evaluate(async (u) => {
        try {
          const r = await fetch(`${u}/info`);
          const j: any = await r.json().catch(() => ({}));
          const pick = { status: r.status, audioFileTranscriptionEnabled: j.audioFileTranscriptionEnabled, threadEndpoints: j.threadEndpoints, a2ui: j.a2ui, mcpApps: j.mcpApps ?? j.mcpServers, agents: Object.keys(j.agents ?? {}) };
          return JSON.stringify(pick);
        } catch (e) { return `info fetch failed: ${String(e)}`; }
      }, base)
      .catch(() => '');
  }
  return `Runtime calls: ${urls.slice(0, 6).join(', ') || 'none'}; ${base || 'runtime'}/info: ${info || 'n/a'}`;
}

/** A2UI: ask for a catalog component; A2UI stays off without the never-defined catalog. */
export const runA2uiAction: PageActionHandler = async (page, config, root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const surface = page.locator('copilot-a2ui-surface, copilot-a2ui-activity-renderer, copilot-a2ui-tool-renderer');
  const rendered = await surface.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  const reply = await lastReply(page);
  if (reply) await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  if (!rendered) mark('error');
  await sleep(1500);
  await typecheck(root, 'a2ui');
  await writeFinding(page, config.id, config);
  if (!rendered) ctx.fail(`No A2UI surface rendered; the agent's reply text: "${reply.slice(0, 120)}". ${await runtimeInfo(page)}`);
};

/** MCP Apps: provideMCPApps() alone; the page gives no MCP server, so no app resource can come back. */
export const runMcpAppsAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const app = page.locator('copilot-mcp-apps-activity-renderer, copilot-mcp-apps-widget');
  const rendered = await app.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  const reply = await lastReply(page);
  if (reply) await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  if (!rendered) mark('error');
  await sleep(1500);
  await writeFinding(page, config.id, config);
  if (!rendered) ctx.fail(`No MCP app rendered; the agent's reply text: "${reply.slice(0, 120)}". ${await runtimeInfo(page)}`);
};

/** Open Generative UI: the sandboxed iframe must render; clicking a button calls setDashboardFilter. */
export const runOpenGenUiAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const sel = '[data-testid="open-generative-ui-final-sandbox"]';
  const frame = page.locator(sel).last();
  // 75 s: under the 90 s freeze limit (review 2026-11-18)
  const shown = await frame.waitFor({ state: 'visible', timeout: 75000 }).then(() => true).catch(() => false);
  await settle(page, msgCount, ctx, 5000);
  if (!shown) {
    mark('error');
    await writeFinding(page, config.id, config);
    ctx.fail(`No sandboxed UI rendered: "${(await lastReply(page)).slice(0, 120)}"`);
    return;
  }
  await glideTo(page, frame, 2000);
  const btn = page.frameLocator(sel).last().getByRole('button', { name: /open/i }).first();
  const clicked = await btn.click({ timeout: 10000 }).then(() => true).catch(() => false);
  await sleep(2000);
  const filter = await page.evaluate(() => sessionStorage.getItem('dashboard-filter')).catch(() => null);
  if (!clicked) ctx.warn('Could not click the Open button inside the sandbox.');
  else if (!filter) ctx.fail('Clicking a sandbox button never called setDashboardFilter (sessionStorage dashboard-filter is empty).');
};


export const runPrebuiltAction: PageActionHandler = async (page, config, _root, ctx) => {
  const inline = 'app-support-chat';
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000, inputSelector: `${inline} textarea` });
  await settle(page, msgCount, ctx);
  if (!(await lastReply(page, inline)).trim()) ctx.fail('The inline chat (agentId="support") never replied.');
  await sleep(1000);
  mark('click', 'popup launcher');
  const launcher = page.locator('copilot-popup button[aria-label="Open Copilot chat"]').first();
  if ((await launcher.count()) === 0) {
    ctx.fail('No popup launcher button rendered.');
    return;
  }
  await glideClick(page, launcher).catch(async () => launcher.click({ force: true }));
  await sleep(1500);
  const open = await page.locator('copilot-popup [role="dialog"]').first().isVisible().catch(() => false);
  const sidebarOpen = await page.getByText('Workspace assistant').first().isVisible().catch(() => false);
  if (!open) {
    mark('error', sidebarOpen ? 'the sidebar opened instead of the popup' : 'popup did not open');
    await sleep(2000);
    // Level-3 minor note (FINDINGS.md minor notes): ✅ page, no finding tail.
    ctx.warn(sidebarOpen ? 'Clicking the popup launcher opened the sidebar, not the popup: both launchers sit on the same bottom-right spot.' : 'Clicking the popup launcher did not open the popup.');
    return;
  }
  const before = await page.locator('copilot-popup copilot-chat-assistant-message').count();
  await sendPrompt(page, 'Say hi from the popup in one short sentence.', { timeoutMs: 15000, inputSelector: 'copilot-popup textarea' });
  await page
    .waitForFunction((n) => document.querySelectorAll('copilot-popup copilot-chat-assistant-message').length > n, before, { timeout: 60000 })
    .catch(() => {});
  await sleep(3000);
  const popupReply = (await lastReply(page, 'copilot-popup')).trim();
  if (!popupReply) ctx.fail('The popup opened but the message got no reply in the popup.');
  else await glideTo(page, page.locator('copilot-popup copilot-chat-assistant-message').last(), 2000);
};

/** Multimodal attachments: attach the chart image, ask about it, the reply reads it. */
export const runAttachmentsAction: PageActionHandler = async (page, config, root, ctx) => {
  await attachImage(page, root);
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = await lastReply(page);
  if (!/quarterly|revenue|q4|300/i.test(reply)) ctx.fail(`The agent did not read the attached chart: "${reply.slice(0, 160)}"`);
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
};

/**
 * Voice: the demo uses the real mic. The take's browser plays `fakeMicWav` (pages.config.ts) as the
 * microphone; click Transcribe, let the prompt play, click Finish, the runtime's transcription
 * service fills the composer, then send it and wait for the reply.
 */
export const runVoicePageAction: PageActionHandler = async (page, config, _root, ctx) => {
  const startBtn = page.locator('copilot-chat-input button[aria-label="Transcribe"]').first();
  const finishBtn = page.locator('copilot-chat-input button[aria-label="Finish"]').first();
  const input = page.locator('copilot-chat-input textarea').first();
  const hasMic = await startBtn.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false);
  if (!hasMic) {
    mark('error', 'no mic button in the composer');
    ctx.fail(`No mic button in the composer. ${await runtimeInfo(page)}`);
    await writeFinding(page, config.id, config);
    return;
  }
  const msgCount = await page.locator('copilot-chat-assistant-message').count();
  await glideClick(page, startBtn);
  mark('action', 'mic on: speaking the prompt');
  await finishBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await sleep(5500); // the wav: 0.3 s lead-in, ~3.7 s of speech, then silence
  await glideClick(page, finishBtn);
  mark('action', 'mic off: transcribing');
  let text = '';
  const until = Date.now() + 45000;
  while (Date.now() < until && !text) {
    text = (await input.inputValue().catch(() => '')).trim();
    if (!text) await sleep(500);
  }
  console.log(`   🎙️ Transcribed: "${text}"`);
  if (!text) {
    mark('error', 'transcription left the composer empty');
    ctx.fail(`Nothing was transcribed into the composer. ${await runtimeInfo(page)}`);
    await writeFinding(page, config.id, config);
    return;
  }
  await glideTo(page, input, 1500);
  await page.keyboard.press('Enter');
  await settle(page, msgCount, ctx);
  const reply = (await page.locator('copilot-chat-assistant-message').last().innerText().catch(() => '')) || '';
  console.log(`   💬 Reply: "${reply.slice(0, 200)}"`);
  if (!reply.trim()) ctx.fail(`No reply to the transcribed prompt "${text}".`);
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  await writeFinding(page, config.id, config);
};

/** CSS customization: user bubble blue (#2563eb), assistant bubble pale blue (#eff6ff). */
export const runCssAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const bg = (sel: string) =>
    page.locator(sel).last().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '');
  const user = await bg('.support-chat .copilotKitUserMessage');
  const assistant = await bg('.support-chat .copilotKitAssistantMessage');
  ctx.warn(`Computed backgrounds: user ${user}, assistant ${assistant}`);
  if (user !== 'rgb(37, 99, 235)') ctx.fail(`The user message is not restyled: background ${user || 'element missing'}`);
  if (assistant !== 'rgb(239, 246, 255)') ctx.fail(`The assistant message is not restyled: background ${assistant || 'element missing'}`);
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  await sleep(3000); // hold on the styled reply so the clip doesn't stop mid-glide (end mark landed past the video, review 2026-11-18)
};

/** Slots: every assistant reply renders through the custom component ("Assistant" label). */
export const runSlotsAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await page.locator('app-custom-assistant-message').first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  await settle(page, msgCount, ctx);
  await sleep(2000);
  const custom = page.locator('app-custom-assistant-message');
  const text = (await custom.last().innerText().catch(() => '')).trim();
  ctx.warn(`Custom message text: ${text.slice(0, 160)}`);
  if ((await custom.count()) === 0 || !/Assistant/.test(text)) ctx.fail('The reply did not render through CustomAssistantMessageComponent.');
  else if (text.replace(/^Assistant\s*/, '').trim() === '') ctx.fail('The custom assistant message rendered with no content.');
  else await glideTo(page, custom.last(), 2500);
};

/**
 * Headless UI (FINDINGS.md #14): with today's packages the page's `runAgent({ agent })` line fails
 * ng serve with TS2739 (@copilotkit/angular 0.6.0 pins @ag-ui/client 1.0.2, core 1.89.0 uses 1.0.5).
 * The shared app keeps a HARNESS cast so the other pages build; for this take the verbatim line is put
 * back, the real compile error shows (overlay + logs/angular-4280.log), and the cast is restored in
 * `finally`. Pages record one at a time, so the broken build costs no other take.
 */
export const runHeadlessUiAction: PageActionHandler = async (page, config, root, ctx) => {
  const file = join(root, 'frontend', 'src', 'app', 'features', 'headless', 'headless-chat.component.ts');
  const log = join(root, 'logs', 'angular-4280.log');
  const cast = 'runAgent({ agent: agent as any })';
  const src = readFileSync(file, 'utf8');
  const logLen = () => (existsSync(log) ? readFileSync(log, 'utf8').length : 0);
  const from = logLen();
  let seen = false;
  try {
    if (!src.includes(cast)) ctx.warn('HARNESS cast not found in headless-chat.component.ts');
    writeFileSync(file, src.replace(cast, 'runAgent({ agent })'));
    for (let i = 0; i < 90 && !seen; i++) {
      await sleep(1000);
      seen = existsSync(log) && readFileSync(log, 'utf8').slice(from).includes('TS2739');
    }
    await page.reload().catch(() => null);
    const overlay = await page.locator('vite-error-overlay').first()
      .waitFor({ state: 'attached', timeout: 20000 }).then(() => true).catch(() => false);
    mark('error', "TS2739: Type 'AbstractAgent' is missing the following properties from type 'AbstractAgent'");
    await sleep(6000);
    if (!seen) ctx.warn('TS2739 never appeared in logs/angular-4280.log');
    if (!overlay) ctx.warn('No vite-error-overlay after the reload');
    await writeFinding(page, config.id, config);
  } finally {
    writeFileSync(file, src);
    await page.waitForEvent('load', { timeout: 20000 }).catch(() => null);
  }
  ctx.fail("ng serve fails to compile the page's runAgent({ agent }): TS2739: Type 'AbstractAgent' is missing the following properties from type 'AbstractAgent': _threadId, _maxEnforcedEntries, maxEnforcedEntries (two @ag-ui/client copies: @copilotkit/angular 0.6.0 pins 1.0.2, @copilotkit/core 1.89.0 uses 1.0.5).");
};

/** Threads Drawer: the drawer lists the conversation next to the chat. */
export const runThreadsDrawerAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  await sleep(3000);
  const drawer = page.locator('copilot-threads-drawer').first();
  // The drawer is a web component (shadow DOM) that may start collapsed behind a launcher: open it like a reader would.
  const opener = drawer.getByRole('button', { name: /open.*(thread|drawer|conversation)/i }).first();
  if (await opener.isVisible().catch(() => false)) {
    await glideClick(page, opener).catch(async () => opener.click({ force: true }).catch(() => {}));
    await sleep(2000);
  }
  // String body (not a closure): tsx's __name helper does not exist in the browser.
  const text = (
    await drawer
      .evaluate((el) => new Function('el', "const w=(n)=>n.nodeType===3?(n.textContent||''):[...((n.shadowRoot&&n.shadowRoot.childNodes)||[]),...n.childNodes].map(w).join(' ');return w(el);")(el) as string)
      .catch((e) => `evaluate failed: ${String(e).slice(0, 80)}`)
  ).replace(/\s+/g, ' ').trim();
  await glideTo(page, drawer, 2500);
  ctx.warn(`Drawer text: ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
  const empty = !text || text.startsWith('evaluate failed');
  if (empty) mark('error', 'drawer renders empty: no list, no locked state');
  await writeFinding(page, config.id, config);
  if (empty) ctx.fail(`CopilotThreadsDrawer renders an empty panel: no thread list and no locked state. ${await runtimeInfo(page)}`);
};

/** Headless Threads: the injectThreads list shows the conversation. */
export const runHeadlessThreadsAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  await sleep(3000);
  const list = page.locator('app-thread-list').first();
  const text = (await list.innerText().catch(() => '')).trim();
  await glideTo(page, list, 2500);
  ctx.warn(`Thread list text: ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
  const hasThread = (await list.locator('button').count()) > 1;
  if (!hasThread) mark('error', 'thread list stays empty after a conversation');
  await writeFinding(page, config.id, config);
  if (!hasThread) ctx.fail(`injectThreads lists no conversation after a chat on agent "support": only the New conversation button. ${await runtimeInfo(page)}`);
};

/** Inspector: the framework mounts cpk-web-inspector; the page's CSS puts the launcher bottom-left. */
export const runInspectorPageAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const inspector = page.locator('cpk-web-inspector');
  if ((await inspector.count()) === 0) {
    ctx.fail('No <cpk-web-inspector> on the page.');
    return;
  }
  const box = await inspector.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), bottom: Math.round(window.innerHeight - r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  });
  ctx.warn(`Inspector box: ${JSON.stringify(box)}`);
  if (!(box.left < 100 && box.bottom < 100)) ctx.fail(`The Inspector launcher is not in the bottom-left corner: ${JSON.stringify(box)}`);
  const button = inspector.locator('button').first();
  if ((await button.count()) > 0) {
    await glideClick(page, button).catch(() => {});
    await sleep(3000);
  }
};

/** Authentication: signed out the hooked runtime answers 401 (no reply); signed in it replies. */
export const runAuthPageAction: PageActionHandler = async (page, config, _root, ctx) => {
  await sendPrompt(page, config.prompt, { timeoutMs: 15000, expectInputToEmpty: false }).catch(() => {});
  await sleep(8000);
  const signedOutReply = (await lastReply(page)).trim();
  if (signedOutReply) ctx.fail(`Signed out, the runtime still answered: "${signedOutReply.slice(0, 120)}"`);
  mark('action', 'signed out: runtime answers 401, no reply');
  await glideClick(page, page.getByRole('button', { name: 'Sign in' }).first());
  await sleep(1500);
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = (await lastReply(page)).trim();
  if (!reply) ctx.fail('No reply after signing in with a valid token.');
  else await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
};

// ---------------------------------------------------------------------------------------------
// Shared State / Agent Read-Only Context / HITL / interrupts / WebMCP / Sub-agents (2026-11-18)
// ---------------------------------------------------------------------------------------------


/** Ends a take: finding tail for ❌/⚠️ pages (FINDING_NOTES set), then fail if the check failed. */
async function finish(page: Page, config: Parameters<PageActionHandler>[1], ctx: ActionContext, failure?: string) {
  if (failure) mark('error');
  if (FINDING_NOTES[config.id]) await writeFinding(page, config.id, config);
  if (failure) ctx.fail(failure);
}

/** Shared State: click "Mark high priority" (agent.setState), ask the agent; the page says it answers "high". */
export const runSharedStatePageAction: PageActionHandler = async (page, config, _root, ctx) => {
  await glideClick(page, page.getByRole('button', { name: 'Mark high priority' }).first());
  await sleep(1500);
  const shown = await page.getByText('Priority: high').first().isVisible().catch(() => false);
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = await lastReply(page);
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  await finish(page, config, ctx,
    !shown ? 'The panel never showed "Priority: high" after the click.'
    : !/\bhigh\b/i.test(reply) ? `The agent did not answer "high" after agent.setState: "${reply.slice(0, 160)}"` : undefined);
};

/** Agent Read-Only Context: click "Use London time", ask; the agent should see Ada, Europe/London, record-42. */
export const runAgentReadonlyAction: PageActionHandler = async (page, config, _root, ctx) => {
  await glideClick(page, page.getByRole('button', { name: 'Use London time' }).first());
  await sleep(1500);
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = await lastReply(page);
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  const ok = /ada/i.test(reply) && /london/i.test(reply);
  if (ok && !/record-42/i.test(reply)) ctx.warn(`Reply did not name the selected record: "${reply.slice(0, 160)}"`);
  await finish(page, config, ctx, ok ? undefined : `The agent never saw the app context (Ada, Europe/London): "${reply.slice(0, 160)}"`);
};

/** HITL Overview: approval card appears in chat, Approve, the run continues. */
export const runHitlPageAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const card = page.locator('app-approval-card').last();
  const shown = await card.waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
  let resumed = false;
  let decisionLost = '';
  if (shown) {
    await glideTo(page, card, 2000);
    await glideClick(page, card.getByRole('button', { name: 'Approve' }));
    await settle(page, msgCount, ctx, 5000);
    resumed = (await card.getByRole('button', { name: 'Approve' }).count()) === 0 && (await lastReply(page)).length > 0;
    const r = await lastReply(page);
    if (resumed && !/approved/i.test(r)) { resumed = false; decisionLost = r.slice(0, 160); }
    await sleep(1500);
  }
  await finish(page, config, ctx,
    !shown ? 'The approval card never appeared: requestApproval was not called.'
    : decisionLost ? `After Approve the agent never got { approved: true }: "${decisionLost}"` : !resumed ? 'After Approve the run did not continue.' : undefined);
};

/** useInterrupt / Headless Interrupts: the interrupt UI appears above the chat; resolve it; the run resumes. */
export const runInterruptAction: PageActionHandler = async (page, config, _root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  let decisionLost = '';
  const host = page.locator(config.id === 'use-interrupt' ? 'app-interrupt-panel section' : 'app-ticket-approval section').first();
  const shown = await host.waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
  let resumed = false;
  if (shown) {
    await glideTo(page, host, 2000);
    const choice = host.getByRole('button').filter({ hasNotText: 'Cancel' });
    const hasChoice = (await choice.count()) > 0;
    if (config.id === 'use-interrupt' && !hasChoice) ctx.warn('The panel shows no choices (only Cancel): event.value has no title/choices.');
    const btn = config.id === 'use-interrupt' ? (hasChoice ? choice.first() : host.getByRole('button', { name: 'Cancel' })) : host.getByRole('button', { name: 'Approve' });
    await glideClick(page, btn);
    const gone = await host.waitFor({ state: 'hidden', timeout: 30000 }).then(() => true).catch(() => false);
    await settle(page, msgCount, ctx, 5000);
    resumed = gone && (await lastReply(page)).length > 0;
    const r = await lastReply(page);
    if (resumed && !/\bapprov|cancel|declin|reject|ship|\bhold\b/i.test(r)) decisionLost = r.slice(0, 160);
    if (resumed) await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  }
  await finish(page, config, ctx,
    !shown ? 'No interrupt UI appeared: the agent never paused.'
    : !resumed ? 'Resolving the interrupt did not resume the run.'
    : decisionLost ? `The run resumed but the agent never saw the decision: "${decisionLost}"` : undefined);
};

/** WebMCP: the CopilotKit agent calls searchOrders; also note whether document.modelContext exists. */
export const runWebmcpAction: PageActionHandler = async (page, config, _root, ctx) => {
  const hasMc = await page.evaluate(() => 'modelContext' in document).catch(() => false);
  if (!hasMc) ctx.warn('document.modelContext is not available in this browser (WebMCP needs the Chrome flag / origin trial); the mirror is not observable in the take.');
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  await settle(page, msgCount, ctx);
  const reply = await lastReply(page);
  await glideTo(page, page.locator('copilot-chat-assistant-message').last(), 2500);
  const calls = await page.evaluate(() => (window as unknown as { __searchOrdersCalls?: string[] }).__searchOrdersCalls ?? []).catch(() => [] as string[]);
  if (calls.length) ctx.warn(`searchOrders handler ran with: ${calls.join(', ')}`);
  // The WebMCP feature is the browser-agent path; the CopilotKit agent path is the Frontend Tools page's.
  if (!calls.length) ctx.fail("searchOrders was never called.");
  else if (!/ORD-1001/i.test(reply)) ctx.warn(`searchOrders ran but its result never reached the reply: "${reply.slice(0, 160)}"`);
  await finish(page, config, ctx);
};

/** Sub-agents: the supervisor delegates; the delegation log (state.delegations) fills in. */
export const runSubagentsPageAction: PageActionHandler = async (page, config, root, ctx) => {
  const msgCount = await sendPrompt(page, config.prompt, { timeoutMs: 15000 });
  const entry = page.locator('app-subagents-chat article.delegation').first();
  const got = await entry.waitFor({ state: 'visible', timeout: 150000 }).then(() => true).catch(() => false);
  await settle(page, msgCount, ctx, 8000);
  await glideTo(page, got ? entry : page.getByText('No delegations yet.').first(), 2500);
  const n = await page.locator('app-subagents-chat article.delegation').count();
  if (got && n < 3) ctx.warn(`Only ${n} delegation(s) logged (expected research, writing, critique).`);
  // The page's install step as published (no httpx): the import error the reader gets.
  await runToLog(root, 'subagents-import.log', 'backend', 'uv', ['run', 'python', '-c', '"import agents.subagents"']);
  await typecheck(root, 'multi-agent-subagents');
  await finish(page, config, ctx, got ? undefined : 'No delegation was logged: the supervisor never ran a sub-agent.');
};

Object.assign(FINDING_EVIDENCE, {
} satisfies Record<string, DocEvidence[]>);

Object.assign(FINDING_NOTES, {
  voice: [
    'page says the mic button shows in the composer once the runtime has a transcription service',
    'no mic shows up, info says audiofiletranscriptionenabled false',
    'the voice backend setup link just points back to this same page at #backend and theres no such section',
    'no transcriptionservice code anywhere so u cant set it up from the page',
  ].join('\n'),
  'threads-drawer': [
    'page says the drawer lists and switches conversations or shows its locked state when threads isnt available',
    'drawer renders as an empty panel, no list no locked state, chat squeezed next to it',
    'runtime has no thread list endpoint and page never says what has to serve it',
  ].join('\n'),
  'headless-threads': [
    'page says injectthreads gives u the saved conversations for a custom list',
    'after chatting on agent support the list only shows the new conversation button, no threads',
    'runtime info says thread list false, page doesnt say what backend or platform provides the list',
    'had to add selectedthreadid myself,page never defines it',
  ].join('\n'),
});
