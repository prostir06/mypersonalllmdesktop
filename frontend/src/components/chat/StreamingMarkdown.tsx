import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './MessageItem';
import { splitStreamingMarkdown } from '../../utils/streamingMarkdown';

export default function StreamingMarkdown({ text }: { text: string }) {
  const { done, tail } = splitStreamingMarkdown(text);
  return (
    <>
      {done ? (
        <ReactMarkdown components={{ code: CodeBlock }}>{done}</ReactMarkdown>
      ) : null}
      {tail ? <span className="streaming-tail">{tail}</span> : null}
    </>
  );
}
