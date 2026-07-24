import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatControls from '../components/chat/ChatControls';

describe('ChatControls Component', () => {
  const defaultProps = {
    selectedProvider: 'openai',
    onProviderChange: jest.fn(),
    selectedModel: 'gpt-4o',
    onModelChange: jest.fn(),
    availableModels: [{ value: 'gpt-4o', label: 'GPT-4o' }, { value: 'gpt-3.5-turbo', label: 'GPT-3.5' }],
    temperature: 0.7,
    onTemperatureChange: jest.fn(),
    selectedDocIds: [],
    streaming: false,
    onShowPromptModal: jest.fn(),
    onShowDocModal: jest.fn(),
    onExportChat: jest.fn(),
    messagesCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('рендериться коректно з пропсами за замовчуванням', () => {
    render(<ChatControls {...defaultProps} />);
    
    // Перевіряємо наявність вибору провайдера
    const providerSelect = screen.getByLabelText('Провайдер AI');
    expect(providerSelect).toBeInTheDocument();
    expect(providerSelect).toHaveValue('openai');

    // Перевіряємо наявність вибору моделі
    const modelSelect = screen.getByLabelText('Модель AI');
    expect(modelSelect).toBeInTheDocument();
    expect(modelSelect).toHaveValue('gpt-4o');

    // Перевіряємо наявність кнопок
    expect(screen.getByText('💡 Ролі AI')).toBeInTheDocument();
    expect(screen.getByText('📎 Документи')).toBeInTheDocument();
    
    // Кнопка експорту не повинна бути, бо messagesCount = 0
    expect(screen.queryByText('💾 Експорт')).not.toBeInTheDocument();
  });

  it('відображає кнопку експорту, якщо є повідомлення', () => {
    render(<ChatControls {...defaultProps} messagesCount={5} />);
    expect(screen.getByText('💾 Експорт')).toBeInTheDocument();
  });

  it('викликає onProviderChange при зміні провайдера', () => {
    render(<ChatControls {...defaultProps} />);
    const select = screen.getByLabelText('Провайдер AI');
    fireEvent.change(select, { target: { value: 'ollama' } });
    expect(defaultProps.onProviderChange).toHaveBeenCalled();
  });

  it('викликає onModelChange при зміні моделі', () => {
    render(<ChatControls {...defaultProps} />);
    const select = screen.getByLabelText('Модель AI');
    fireEvent.change(select, { target: { value: 'gpt-3.5-turbo' } });
    expect(defaultProps.onModelChange).toHaveBeenCalledWith('gpt-3.5-turbo');
  });

  it('кнопка RAG показує кількість вибраних документів', () => {
    render(<ChatControls {...defaultProps} selectedDocIds={[1, 2]} />);
    expect(screen.getByText('📎 RAG (2)')).toBeInTheDocument();
  });

  it('викликає onShowPromptModal та onShowDocModal', () => {
    render(<ChatControls {...defaultProps} />);
    
    fireEvent.click(screen.getByText('💡 Ролі AI'));
    expect(defaultProps.onShowPromptModal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('📎 Документи'));
    expect(defaultProps.onShowDocModal).toHaveBeenCalledTimes(1);
  });

  it('блокує поля вводу під час стрімінгу', () => {
    render(<ChatControls {...defaultProps} streaming={true} />);
    
    expect(screen.getByLabelText('Провайдер AI')).toBeDisabled();
    expect(screen.getByLabelText('Модель AI')).toBeDisabled();
    expect(screen.getByLabelText('Температура')).toBeDisabled();
  });
});
