# Angular

> Connect an Angular app to Copilot Runtime with CopilotKit.

This guide takes an Angular app to a working chat UI backed by [Copilot Runtime](/angular/google-antigravity/backend/copilot-runtime). When you select an agent backend in the sidebar, the backend step below changes with it. Without a selection, the guide uses CopilotKit's `BuiltInAgent`.

The runtime runs on your server, keeps model credentials out of the browser, and exposes the `default` agent that `CopilotChat` uses automatically.

<OpsPlatformCTA
  variant="inline"
  title="Take your Angular copilot from local to production"
  body="Add threads, inspection, and cloud-hosted or self-hosted CopilotKit Intelligence without changing the Angular frontend APIs in this guide."
  surface="docs:angular/quickstart:production"
/>

## Start with your coding agent [#start-with-your-coding-agent]

Use this prompt to connect your Angular app to Copilot Runtime with the selected agent backend, then verify a working conversation. You can also follow the manual steps below.

<PageAgentPrompt />

## Prerequisites [#prerequisites]

- An OpenAI API key (or another model provider supported by [Model Selection](/model-selection))
- Angular 22
- Node.js 22

## Getting started [#getting-started]

<Steps>
    <Step>
        ### Create your Angular app [#create-your-angular-app]

        If you don't have one already, pin the CLI to the supported major:

        ```bash
        npx @angular/cli@22 new my-copilot-app
        cd my-copilot-app
        ```
    </Step>
    <Step>
        ### Install CopilotKit [#install-copilotkit]

        `@copilotkit/angular` gives you Angular components, directives, and services for CopilotKit. It supports zoneless applications. Install it with `@angular/cdk`, and install `@copilotkit/runtime` for your local Copilot Runtime server:

        <Tabs groupId="package-manager" items={['npm', 'pnpm', 'yarn']}>
            <Tab value="npm">
                ```bash
                npm install @copilotkit/angular @angular/cdk @copilotkit/runtime
                npm install -D tsx typescript @types/node
                ```
            </Tab>
            <Tab value="pnpm">
                ```bash
                pnpm add @copilotkit/angular @angular/cdk @copilotkit/runtime
                pnpm add -D tsx typescript @types/node
                ```
            </Tab>
            <Tab value="yarn">
                ```bash
                yarn add @copilotkit/angular @angular/cdk @copilotkit/runtime
                yarn add -D tsx typescript @types/node
                ```
            </Tab>
        </Tabs>

        <Callout type="info" title="Match @angular/cdk to your Angular version">
          `@angular/cdk` must share your Angular major version. Most package managers resolve this for you, but if you hit a peer-dependency error, pin it explicitly (for example `@angular/cdk@^22`).
        </Callout>
    </Step>
    <Step>
      ### Connect the selected agent backend [#connect-the-selected-agent-backend]

      An Antigravity agent is an `AntigravityAgent` from `ag_ui_antigravity`. You give
      it a Gemini model and its API key, the `workspaces` it may touch on disk, and a
      `save_dir` for its conversation trajectories. To send the model calls somewhere
      other than Google's API, pass an `endpoint`: the SDK's
      `GeminiAPIEndpoint(base_url=..., http_headers=...)`. The showcase does that to
      replay aimock fixtures, and the headers ride on every call the harness makes.
      Antigravity is session-based rather than a stateless graph — the SDK drives a
      bundled Go `localharness` subprocess — so the session knobs belong here too.

      ~~~~python title="_common.py"
      def api_key() -> str | None:
          """The Gemini API key.

          ``GEMINI_API_KEY`` is the only name the Antigravity SDK reads. The showcase
          fleet exports ``GOOGLE_API_KEY`` for its Gemini integrations, so accept
          that too rather than fail on the first model call.
          """
          return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


      def gemini_base_url() -> str | None:
          """The Gemini-compatible server to call instead of Google's API.

          Showcase compose sets ``GOOGLE_GEMINI_BASE_URL=http://aimock:4010``, the
          same variable the google-adk integration reads.
          """
          return os.environ.get("GOOGLE_GEMINI_BASE_URL", "").rstrip("/") or None


      def aimock_headers() -> dict[str, str]:
          """Headers for a model call: the package's fixture context plus the
          current request's mock and diagnostic headers.

          ``X-AIMock-Context`` is fixed: it selects this package's fixtures whatever
          the request says. The rest comes from the inbound request (captured by
          ``HeaderForwardingHTTPMiddleware``) and is forwarded only when present, so
          ordinary demo traffic is never forced into strict mode.
          """
          forwarded = {
              k: v
              for k, v in get_forwarded_headers().items()
              if k.startswith(_FORWARDED_PREFIXES)
          }
          return {**forwarded, "x-aimock-context": SLUG}


      def endpoint() -> GeminiAPIEndpoint | None:
          """Where every model call goes: aimock under compose, Google's API otherwise.

          Passed to the adapter as a callable, so it runs each time a session is
          built, inside that conversation's first request. The harness makes the
          model calls itself, so headers can only reach them on the endpoint: the
          request's ``X-AIMock-Strict`` and ``x-test-id``/``x-diag-*`` ride along
          from here (PNI-576). They are fixed per conversation, because the SDK
          sets a conversation's model configuration when it starts.
          """
          base_url = gemini_base_url()
          if base_url is None:
              return None
          return GeminiAPIEndpoint(
              base_url=base_url,
              api_key=api_key(),
              http_headers=aimock_headers(),
          )


      def chat_only_capabilities() -> CapabilitiesConfig:
          """Only ``finish`` stays enabled.

          ``search_web`` returns an empty summary without Google credentials and the
          model retries it forever; ``ask_question`` would park on an interrupt the
          CopilotKit demos never answer. ``finish`` is how the harness ends a turn.
          """
          return CapabilitiesConfig(
              enabled_tools=[BuiltinTools.FINISH], enable_subagents=False
          )


      _DIRS_READY = False


      def _ensure_dirs() -> None:
          """Creates the workspace / save_dir once, on first agent construction.

          Deliberately NOT done at import time: the defaults live under ``/data``,
          which only exists inside the container image, so an import-time
          ``os.makedirs`` blows up on a developer machine (read-only ``/`` on macOS)
          and takes every ``import agent_server`` — including the package's pytest
          suite — down with it.
          """
          global _DIRS_READY
          if _DIRS_READY:
              return
          os.makedirs(WORKSPACE, exist_ok=True)
          os.makedirs(SAVE_DIR, exist_ok=True)
          _DIRS_READY = True


      _POOL = None


      def shared_pool():
          """One HarnessPool for the whole server: one Go process, not one per agent."""
          global _POOL
          if _POOL is None:
              from ag_ui_antigravity.harness_pool import HarnessPool

              _POOL = HarnessPool()
          return _POOL


      def build(**kwargs):
          """Creates an AntigravityAgent with the package defaults applied."""
          from ag_ui_antigravity import AntigravityAgent

          _ensure_dirs()

          defaults = dict(
              model=MODEL,
              api_key=api_key(),
              endpoint=endpoint,
              workspaces=[WORKSPACE],
              save_dir=SAVE_DIR,
              harness_pool=shared_pool(),
              capabilities=chat_only_capabilities(),
              session_timeout_seconds=SESSION_TIMEOUT_SECONDS,
              max_sessions=MAX_SESSIONS,
              max_tool_calls_per_turn=MAX_TOOL_CALLS_PER_TURN,
          )
          defaults.update(kwargs)
          return AntigravityAgent(**defaults)


      ~~~~

      Nothing about CopilotKit is configured on the agent: every tool the browser
      registers arrives with each run in `RunAgentInput.tools`, and the adapter
      rebuilds those as custom Antigravity tools for that turn, so a call the browser
      has to answer parks as an awaited coroutine until the answer arrives on a later
      run. Handing every agent the same `harness_pool` **and** the same `save_dir` is
      what keeps one Go harness process behind the whole server instead of one per
      agent — `save_dir` is half the pool's partition key, so passing the pool alone
      changes nothing.

      `create_antigravity_app` (also from `ag_ui_antigravity`) turns a `{name: agent}`
      mapping into a FastAPI app with one AG-UI endpoint per name, mounted at
      `/<name>`:

      ~~~~python title="agent_server.py"
      AGENT_REGISTRY = build_registry()
      app = create_antigravity_app(AGENT_REGISTRY)
      app.title = "Google Antigravity Agent Server"
      ~~~~

      Pass a single agent instead of a mapping to mount it at `/`. Then point Copilot
      Runtime at `http://localhost:8000/<agent name>`.

      <Accordions>
        <Accordion title="Install the SDK">
          ```bash
          pip install ag-ui-antigravity google-antigravity
          ```

          `google-antigravity` ships platform wheels that bundle the `localharness`
          binary, so there is no separate download step.

        </Accordion>
      </Accordions>

      <Callout type="info" title="Expose the selected backend through Copilot Runtime">
        Configure Copilot Runtime to register this backend as the `default`
        agent at `/api/copilotkit`. Continue with the selected backend's
        [Copilot Runtime guide](/angular/google-antigravity/backend/copilot-runtime) for its runtime
        adapter, credentials, and server command. Do not replace it with the
        `BuiltInAgent` server from the standalone Angular path.
      </Callout>
    </Step>
    <Step>
        ### Import the styles [#import-the-styles]

        Add the package stylesheet to your global styles. It's self-contained, so the chat renders without any other CSS.

        ```css title="src/styles.css"
        @import "@copilotkit/angular/styles.css"; /* [!code highlight] */
        ```
    </Step>
    <Step>
        ### Connect to Copilot Runtime [#connect-to-copilot-runtime]

        Point `provideCopilotKit` at the runtime endpoint. The chat uses the agent that your runtime registers as `default`.

        ```ts title="src/app/app.config.ts"
        import { ApplicationConfig } from "@angular/core";
        import { provideCopilotKit } from "@copilotkit/angular"; // [!code highlight]

        export const appConfig: ApplicationConfig = {
          providers: [
            // [!code highlight:3]
            provideCopilotKit({
              runtimeUrl: "http://localhost:8200/api/copilotkit",
            }),
          ],
        };
        ```
    </Step>
    <Step>
        ### Add the chat UI [#add-the-chat-ui]

        Import the `CopilotChat` component into your root component and drop it into the template.

        ```ts title="src/app/app.ts"
        import { Component } from "@angular/core";
        import { CopilotChat } from "@copilotkit/angular"; // [!code highlight]

        @Component({
          selector: "app-root",
          imports: [CopilotChat], // [!code highlight]
          template: `
            <!-- [!code highlight:3] -->
            <div style="height: 100vh">
              <copilot-chat />
            </div>
          `,
        })
        export class App {}
        ```

    </Step>
    <Step>
      ### Run the backend, runtime, and Angular app [#run-the-backend-runtime-and-angular-app]

      Start the selected agent backend and Copilot Runtime with the commands
      from its runtime guide. Confirm
      `http://localhost:8200/api/copilotkit/info` reports the `default`
      agent, then start Angular:

      ```bash
      npm start
      ```

      Open the Angular CLI URL (usually `http://localhost:4200`) and send a
      message. The request now follows the selected path end to end:
      Angular → Copilot Runtime → your selected agent backend.
    </Step>
    <Step>
        ### Open Inspector and confirm setup [#open-inspector-and-confirm-setup]

        On localhost, click the Inspector button in the corner of the app.

        1. Open **Inspect**, then **Agent**. Your agent is listed.
        2. Send a chat message. Open **Inspect**, then **AG-UI Events**. Events are moving.
        3. Open **Rich Threads**. The list is unlocked (Intelligence is on), or locked with **Copy setup prompt** (Intelligence is off).

        More detail: [Inspector](/angular/google-antigravity/inspector).
    </Step>

</Steps>

## Next steps [#next-steps]

1. [Prebuilt Components](/angular/prebuilt-components): choose a chat surface, then follow the sidebar to frontend tools, generative UI, human-in-the-loop, shared state, threads, attachments, and headless UI.
2. [Runtime and backend docs](/angular/google-antigravity/backend/copilot-runtime): configure the server, secure requests, and deploy without leaving the selected Angular surface.

Later:

- [CopilotKit Intelligence](/angular/google-antigravity/intelligence/overview): add threads, inspection, and cloud-hosted or self-hosted operations.
- [Angular API reference](/reference/angular): use components, signals, tools, context, and runtime services.
- [Production and lifecycle](/reference/angular/production-lifecycle): handle cleanup, errors, server rendering, hydration, zoneless Angular, and browser-only features.
