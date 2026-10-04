import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Model text stays Markdown: no raw HTML, scripts or custom URL transforms. */
export function ChatMarkdown({text}:{text:string}){
 return <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
  table:({children})=><div className="chat-table" tabIndex={0} role="region" aria-label="Scrollable table"><table>{children}</table></div>,
 }}>{text}</ReactMarkdown></div>;
}
