import { playerCss } from '../../shared/player/player';
import { chatText, type ChatMessage } from '../../shared/chat/chat';
import './chat.css';
export class GameChat {
  private root = document.createElement('section');
  private log = document.createElement('div');
  private input = document.createElement('input');
  private opened = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(host: HTMLElement, private send: (text: string) => void) {
    this.root.className = 'game-chat';
    this.log.className = 'game-chat-log';
    this.log.role = 'log';
    this.log.setAttribute('aria-label', 'Match chat');
    this.input.placeholder = 'Message everyone… Enter to send · Esc to close';
    this.input.maxLength = 300;
    this.input.setAttribute('aria-label', 'Chat message');
    this.input.hidden = true;
    this.root.append(this.log, this.input); host.append(this.root);
    window.addEventListener('keydown', this.key, true);
  }
  private key = (event: KeyboardEvent) => {
    if (!this.opened && (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey ||
      (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable],dialog')))) return;
    if (this.opened || event.key === 'Enter') {
      event.stopImmediatePropagation();
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      if (event.repeat || event.isComposing) return;
      if (event.key === 'Escape') { this.toggle(false); return; }
      if (!this.opened) { this.toggle(true); return; }
      const text = chatText(this.input.value);
      if (text) this.send(text);
      this.input.value = ''; this.toggle(false);
    }
  };
  private toggle(open: boolean) {
    this.opened = open;
    this.root.classList.toggle('open', open);
    this.input.hidden = !open;
    document.documentElement.classList.toggle('game-chat-open', open);
    if (open) { this.input.focus(); this.log.scrollTop = this.log.scrollHeight; }
    else this.input.blur();
  }
  receive(message: ChatMessage) {
    const row = document.createElement('div'); row.className = 'game-chat-message';
    const name = document.createElement('strong'); name.textContent = `${message.name}: `;
    name.style.color = message.player === null ? '#ccc' : playerCss(message.player);
    row.append(name, document.createTextNode(message.text)); this.log.append(row);
    while (this.log.childElementCount > 200) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
    const timer = setTimeout(() => { row.classList.add('expired'); this.timers.delete(timer);
      const collapse = setTimeout(() => { row.classList.add('collapsed'); this.timers.delete(collapse); }, 300); this.timers.add(collapse); }, 10000);
    this.timers.add(timer);
  }
  destroy() {
    window.removeEventListener('keydown', this.key, true);
    this.timers.forEach(clearTimeout); this.toggle(false); this.root.remove();
  }
}
