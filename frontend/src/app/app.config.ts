import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideCopilotKit } from '@copilotkit/angular';
import { basicCatalog } from '@copilotkit/angular/a2ui'; // HARNESS: A2UI catalog from the Copilot Runtime guide (productCatalog is never defined)
import { provideMCPApps } from '@copilotkit/angular/mcp-apps'; // HARNESS: MCP Apps page's provider

// HARNESS: CopilotKit is a root singleton (providedIn: 'root') that reads the ROOT provideCopilotKit
// config, so route-level provideCopilotKit({ runtimeUrl }) is ignored. The demo a page loads directly
// picks its runtime here instead (server.pages.ts: 8286 MCP Apps, 8287 Threads, 8288 Voice).
const DEMO_PATH = typeof location !== 'undefined' ? location.pathname : '';
const on = (route: string) => DEMO_PATH.startsWith(`/${route}/demo`);
const DEMO_RUNTIME_PORT = on('voice') ? 8288 : on('threads-drawer') || on('headless-threads') ? 8287 : on('mcp-apps') ? 8286 : 8280;

import { routes } from './app.routes';
import { setDashboardFilter } from './features/open-generative-ui/app.config'; // HARNESS: Open Generative UI page's sandbox function



/**
 * One provider at the application root, so a conversation started on any demo
 * route continues on every other route.
 *
 * `runtimeUrl` points at the Copilot Runtime from the quickstart — the
 * supported path, where the browser never talks to the AG2 agent directly.
 * The `HttpAgent` binding that reaches the AG2 AG-UI endpoint lives
 * server-side in frontend/server.ts.
 *
 * `a2ui.recovery` and `openGenerativeUI.sandboxFunctions` are the A2UI and
 * generative-UI guide options. No `a2ui.catalog` is set yet — supplying one is
 * what actually registers the render_a2ui renderer, so A2UI stays inert until
 * a catalog is added. See README known issues.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideClientHydration(),
    // quickstart : connect to copilot runtime start
    provideCopilotKit({
      runtimeUrl: `http://localhost:${DEMO_RUNTIME_PORT}/api/copilotkit`, // HARNESS: doc says :8200, runtime runs on 8280 (workspace port plan); page runtimes see DEMO_RUNTIME_PORT
      // a2ui : recover incomplete streams start
      a2ui: {
        ...(on('a2ui') ? { catalog: basicCatalog } : {}), // HARNESS: A2UI demo only
        recovery: { showAfterMs: 2_000, showAfterAttempts: 2 },
      },
      // a2ui : recover incomplete streams end
      // HARNESS: the Open Generative UI page's route-level config never reaches the root CopilotKit
      // singleton (see DEMO_RUNTIME_PORT above), so its openGenerativeUI is applied here, that demo only.
      ...(on('open-generative-ui') ? { openGenerativeUI: { sandboxFunctions: [setDashboardFilter] } } : {}),
      // HARNESS: the Frontend tools page's Open Generative UI config (openGenerativeUI with
      // setDashboardFilter) is kept verbatim in doc-verbatim/frontend-tools/app.config.ts, not here:
      // registered at the root it gave every page's agent a generateSandboxedUi tool, which on the
      // Native generative UI demo answered with an empty message instead of text.
    }),
    // quickstart : connect to copilot runtime end
    ...(on('mcp-apps') ? [provideMCPApps()] : []), // HARNESS: MCP Apps demo only
  ],
};
