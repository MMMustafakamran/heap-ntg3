/**
 * HARNESS: Pausing the Agent for Input demo. The page's InterruptPanelComponent (verbatim) above a chat.
 * The page shows no backend that pauses; panel + chat use the harness interrupt agent "interrupt"
 * (backend/interrupts_server.py via frontend/server.ts).
 * https://docs.copilotkit.ai/angular/google-antigravity/human-in-the-loop/useInterrupt
 */
import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { InterruptPanelComponent } from './interrupt-panel.component';

@Component({
  selector: 'app-use-interrupt-chat',
  imports: [CopilotChat, InterruptPanelComponent],
  template: `
    <div style="display: flex; flex-direction: column; height: 100%">
      <div style="padding: 0.75rem 1rem"><app-interrupt-panel /></div>
      <div style="flex: 1; min-height: 0"><copilot-chat agentId="interrupt" /></div>
    </div>
  `,
})
export class UseInterruptChatComponent {}
