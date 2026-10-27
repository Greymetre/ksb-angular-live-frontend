import { ChangeDetectorRef, Component } from '@angular/core';
import { Router } from '@angular/router';
import { AssistantAction, AssistantChip, AssistantService } from '../../../services/assistant.service';

interface ChatMsg { from: 'user' | 'bot'; text: string; chips?: AssistantChip[]; }

/**
 * The floating "Ask" assistant, shown on every page inside the authenticated layout. Rule-based
 * (no AI) - it talks to /api/assistant/ask, which answers within the user's permissions and
 * reporting-wise data scope. Multi-turn flows (e.g. the loyalty export wizard) carry their state
 * in the opaque `context` the backend returns and the client echoes back.
 */
@Component({
  standalone: false,
  selector: 'app-assistant-chat',
  templateUrl: './assistant-chat.component.html',
  styleUrls: ['./assistant-chat.component.scss']
})
export class AssistantChatComponent {
  open = false;
  input = '';
  sending = false;
  messages: ChatMsg[] = [];
  private context: Record<string, string> | null = null;
  private greeted = false;

  constructor(private service: AssistantService, private router: Router, private cdr: ChangeDetectorRef) {}

  toggle(): void {
    this.open = !this.open;
    if (this.open && !this.greeted) { this.greeted = true; this.send(''); }
  }

  sendChip(send: string): void { this.send(send); }

  send(explicit?: string): void {
    if (this.sending) return;
    const text = (explicit !== undefined ? explicit : this.input).trim();
    // Last few USER messages (before this one) so the backend can resolve short follow-ups.
    const history = this.messages.filter(m => m.from === 'user').map(m => m.text).slice(-10);
    if (text) this.messages.push({ from: 'user', text });
    this.input = '';
    this.sending = true;
    this.cdr.detectChanges();
    this.scrollSoon();
    const startedAt = Date.now();
    this.service.ask(text, this.context, history).subscribe({
      next: reply => {
        // Hold the typing indicator a touch, like Teams/WhatsApp, so replies never feel robotic.
        this.afterTyping(reply.reply, startedAt, () => {
          this.context = reply.context;
          this.messages.push({ from: 'bot', text: reply.reply, chips: reply.chips });
          if (reply.action) this.runAction(reply.action);
        });
      },
      error: () => {
        this.afterTyping('error', startedAt, () => {
          this.messages.push({ from: 'bot', text: 'Oops — something went wrong on my end. Mind trying that again?' });
        });
      }
    });
  }

  /** Keeps the typing dots on screen for a natural 1.4-2.8s before revealing the reply. */
  private afterTyping(replyText: string, startedAt: number, reveal: () => void): void {
    const target = Math.min(2800, 1400 + replyText.length * 14);
    const wait = Math.max(300, target - (Date.now() - startedAt));
    setTimeout(() => {
      this.sending = false;
      reveal();
      this.cdr.detectChanges();
      this.scrollSoon();
    }, wait);
  }

  private runAction(action: AssistantAction): void {
    if (action.type === 'download') {
      this.service.download(action).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = action.file_name || 'export.xlsx'; a.click();
          URL.revokeObjectURL(url);
          this.messages.push({ from: 'bot', text: `✓ ${action.file_name || 'File'} downloaded.` });
          this.cdr.detectChanges();
          this.scrollSoon();
        },
        error: () => {
          // The export needs a filter (or isn't allowed from here) - open its page so the user
          // can set the filters and export it the usual way.
          if (action.route) {
            this.messages.push({ from: 'bot', text: 'This one needs a filter first — opening its page for you so you can set it and export there.' });
            this.cdr.detectChanges();
            this.scrollSoon();
            setTimeout(() => { this.router.navigateByUrl(action.route); this.open = false; this.cdr.detectChanges(); }, 900);
          } else {
            this.messages.push({ from: 'bot', text: 'Could not generate the file - a filter may be missing or you may not have access.' });
            this.cdr.detectChanges();
            this.scrollSoon();
          }
        }
      });
    } else if (action.type === 'navigate' && action.route) {
      this.router.navigateByUrl(action.route);
      this.open = false;
    }
  }

  private scrollSoon(): void {
    setTimeout(() => {
      const el = document.querySelector('.assistant-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 40);
  }
}
