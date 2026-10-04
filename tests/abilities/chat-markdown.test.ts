import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChatMarkdown} from '../../tooling/spell-editor/src/chatMarkdown';

const render=(text:string)=>renderToStaticMarkup(createElement(ChatMarkdown,{text}));
it('renders assistant asset reports and checklists as accessible Markdown rather than raw pipes',()=>{
 const html=render('| Spell | Asset |\n|---|---|\n| Blink | `asset.custom.blink-command-icon` |\n\n- [x] Published\n- [ ] Inspect thumbnail');
 expect(html).toContain('<table>');expect(html).toContain('<th>Spell</th>');expect(html).toContain('<td><code>asset.custom.blink-command-icon</code></td>');
 expect(html).toContain('aria-label="Scrollable table"');expect(html).toContain('tabindex="0"');
 expect(html).toContain('type="checkbox"');expect(html).toContain('disabled=""');expect(html).not.toContain('|---|');
});
it('keeps untrusted model HTML and executable links inert while preserving ordinary links',()=>{
 const html=render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29)\n\n[good](https://example.com/guide)');
 expect(html).not.toContain('<script');expect(html).not.toContain('<img');expect(html).not.toContain('href="javascript:');expect(html).not.toContain('onerror=');
 expect(html).toContain('href="https://example.com/guide"');
});
