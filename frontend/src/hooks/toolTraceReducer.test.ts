import { describe, expect, it } from 'vitest';
import {
  applyToolCallEvent,
  applyToolResultEvent,
  applyToolConfirmationEvent,
  upsertStreamingAssistantMessage,
} from './toolTraceReducer';
import type { Message, ToolTraceEntry } from '../types/api';

describe('toolTraceReducer', () => {
  it('adds and updates read tool call lifecycle by callId', () => {
    let trace: ToolTraceEntry[] = [];
    trace = applyToolCallEvent(trace, {
      id: 'call_1',
      name: 'calculate',
      args: { expression: '2 + 2' },
    });
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      callId: 'call_1',
      tool: 'calculate',
      status: 'running',
    });

    trace = applyToolResultEvent(trace, {
      id: 'call_1',
      name: 'calculate',
      result: { value: 4 },
      durationMs: 12,
    });
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      callId: 'call_1',
      tool: 'calculate',
      status: 'completed',
      result: { value: 4 },
      durationMs: 12,
    });
  });

  it('transitions write tool call to pending_confirmation with proposal and expiration', () => {
    let trace: ToolTraceEntry[] = [];
    trace = applyToolConfirmationEvent(trace, {
      pendingActionId: 'act-99',
      tool: 'update_settings',
      args: { temperature: 0.3 },
      proposal: {
        title: 'Оновити налаштування',
        summary: 'Зміна параметрів: temperature',
      },
      expiresAt: '2026-11-08T00:00:00.000Z',
    });

    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      tool: 'update_settings',
      category: 'write',
      requiresConfirmation: true,
      pendingActionId: 'act-99',
      status: 'pending_confirmation',
    });
  });

  it('upserts in-flight assistant message in message list', () => {
    const initial: Message[] = [{ id: 1, role: 'user', content: 'Привіт' }];
    const step1 = upsertStreamingAssistantMessage(initial, null, 'Вітаю', []);
    expect(step1.messages).toHaveLength(2);
    expect(step1.inFlightIndex).toBe(1);
    expect(step1.messages[1].content).toBe('Вітаю');

    const step2 = upsertStreamingAssistantMessage(
      step1.messages,
      step1.inFlightIndex,
      'Вітаю! Чим допомогти?',
      [{ tool: 'get_current_time', status: 'completed' }]
    );
    expect(step2.messages).toHaveLength(2);
    expect(step2.messages[1].content).toBe('Вітаю! Чим допомогти?');
    expect(step2.messages[1].tool_trace).toHaveLength(1);
  });
});
