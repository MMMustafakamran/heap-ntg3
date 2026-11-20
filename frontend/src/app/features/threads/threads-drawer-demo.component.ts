/** HARNESS host: the Threads Drawer page's verbatim ConversationsComponent, full height. */
import { Component } from '@angular/core';

import { ConversationsComponent } from './conversations.component';

// HARNESS: the page doesn't say how the host lays out <app-conversations>. Left inline, it shrank to
// the drawer's width, the drawer switched to its collapsed launcher and the chat sat in ~320px.
// Give it the full width, drawer beside a flexible chat (layout only, the component stays verbatim).
@Component({
  selector: 'app-threads-drawer-demo',
  imports: [ConversationsComponent],
  styles: [`
    :host ::ng-deep app-conversations { display: flex; flex: 1; min-width: 0; height: 100%; }
    :host ::ng-deep app-conversations > copilot-chat { flex: 1; min-width: 0; height: 100%; }
  `],
  template: `<div style="display: flex; width: 100%; height: 100%"><app-conversations /></div>`,
})
export class ThreadsDrawerDemoComponent {}
