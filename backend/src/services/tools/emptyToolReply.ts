import type { ToolTraceEntry } from './types';

export function synthesizeEmptyToolReply(toolTrace: ToolTraceEntry[]): string {
  const successfulCalc = toolTrace.find(
    (entry) =>
      entry.tool === 'calculate' &&
      entry.status === 'completed' &&
      entry.result !== null &&
      typeof entry.result === 'object' &&
      'result' in (entry.result as Record<string, unknown>)
  );
  const successfulTime = toolTrace.find(
    (entry) =>
      entry.tool === 'get_current_time' &&
      entry.status === 'completed' &&
      entry.result !== null &&
      typeof entry.result === 'object' &&
      'local' in (entry.result as Record<string, unknown>)
  );
  const successfulWeb = toolTrace.find(
    (entry) =>
      entry.tool === 'web_search' &&
      entry.status === 'completed' &&
      entry.result !== null &&
      typeof entry.result === 'object'
  );
  const successfulDocSearch = toolTrace.find(
    (entry) =>
      entry.tool === 'search_documents' &&
      entry.status === 'completed' &&
      entry.result !== null &&
      typeof entry.result === 'object' &&
      'count' in (entry.result as Record<string, unknown>)
  );
  const successfulDocList = toolTrace.find(
    (entry) =>
      entry.tool === 'list_documents' &&
      entry.status === 'completed' &&
      Array.isArray(entry.result)
  );

  if (successfulCalc && typeof successfulCalc.result === 'object' && successfulCalc.result !== null) {
    const calcResult = (successfulCalc.result as Record<string, unknown>).result;
    return `Результат обчислення: **${String(calcResult)}**`;
  }
  if (successfulTime && typeof successfulTime.result === 'object' && successfulTime.result !== null) {
    const time = successfulTime.result as Record<string, unknown>;
    return `Поточний час (${time.timezone || 'Europe/Kyiv'}): **${String(time.local)}**`;
  }
  if (successfulWeb && typeof successfulWeb.result === 'object' && successfulWeb.result !== null) {
    const web = successfulWeb.result as Record<string, unknown>;
    return `Знайдено результатів у вебі за запитом "${String(web.query || '')}": **${String(web.results_count ?? 0)}**`;
  }
  if (successfulDocSearch && typeof successfulDocSearch.result === 'object' && successfulDocSearch.result !== null) {
    const docs = successfulDocSearch.result as Record<string, unknown>;
    return `Знайдено фрагментів у документах: **${String(docs.count ?? 0)}**`;
  }
  if (successfulDocList && Array.isArray(successfulDocList.result)) {
    return `Знайдено доступних документів: **${successfulDocList.result.length}**`;
  }
  const completedTools = toolTrace.filter((entry) => entry.status === 'completed');
  if (completedTools.length > 0) {
    return `Виконано інструменти: ${completedTools.map((entry) => entry.tool).join(', ')}.`;
  }
  return '';
}
