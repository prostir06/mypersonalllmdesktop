import { Virtuoso, VirtuosoMockContext, type VirtuosoProps } from 'react-virtuoso';

const inTest = Boolean(import.meta.env.VITEST);

/** Fixed-height virtual list. Tests get a mock viewport so rows stay in the document. */
export default function VirtualFrame<ItemData>(
  props: VirtuosoProps<ItemData, unknown>
) {
  const list = <Virtuoso {...props} style={{ height: '100%' }} />;
  if (!inTest) return list;
  return (
    <VirtuosoMockContext.Provider value={{ viewportHeight: 800, itemHeight: 64 }}>
      <div style={{ height: 800 }}>{list}</div>
    </VirtuosoMockContext.Provider>
  );
}
