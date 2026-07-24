import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageInput from '../components/chat/MessageInput';

describe('MessageInput Component', () => {
  const defaultProps = {
    inputMessage: '',
    onInputChange: jest.fn(),
    onSubmit: jest.fn(),
    isListening: false,
    onToggleListening: jest.fn(),
    streaming: false,
    attachedImage: null,
    onClearImage: jest.fn(),
    onAttachImage: jest.fn(),
    supportsVision: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('рендериться коректно', () => {
    render(<MessageInput {...defaultProps} />);
    
    expect(screen.getByPlaceholderText(/Напишіть запитання.../i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Надіслати/i })).toBeInTheDocument();
    expect(screen.getByTitle('Голосове введення (STT)')).toBeInTheDocument();
  });

  it('відображає кнопку Vision, якщо supportsVision=true', () => {
    render(<MessageInput {...defaultProps} />);
    expect(screen.getByTitle('Додати зображення (Vision)')).toBeInTheDocument();
  });

  it('ховає кнопку Vision, якщо supportsVision=false', () => {
    render(<MessageInput {...defaultProps} supportsVision={false} />);
    expect(screen.queryByTitle('Додати зображення (Vision)')).not.toBeInTheDocument();
  });

  it('викликає onInputChange при введенні тексту', () => {
    render(<MessageInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/Напишіть запитання.../i);
    fireEvent.change(textarea, { target: { value: 'Привіт' } });
    expect(defaultProps.onInputChange).toHaveBeenCalledWith('Привіт');
  });

  it('кнопка Надіслати заблокована, якщо поле пусте', () => {
    render(<MessageInput {...defaultProps} />);
    const submitBtn = screen.getByRole('button', { name: /Надіслати/i });
    expect(submitBtn).toBeDisabled();
  });

  it('викликає onSubmit при відправці форми', () => {
    render(<MessageInput {...defaultProps} inputMessage="Привіт, ШІ" />);
    const submitBtn = screen.getByRole('button', { name: /Надіслати/i });
    expect(submitBtn).not.toBeDisabled();
    
    fireEvent.click(submitBtn);
    expect(defaultProps.onSubmit).toHaveBeenCalled();
  });

  it('відображає preview зображення, якщо воно прикріплено', () => {
    const attachedImage = { url: 'blob:fake-url', base64: 'data:image/png;base64,fake' };
    render(<MessageInput {...defaultProps} attachedImage={attachedImage} />);
    
    expect(screen.getByAltText('Прикріплене зображення')).toBeInTheDocument();
    expect(screen.getByTitle('Видалити зображення')).toBeInTheDocument();
  });

  it('викликає onClearImage при кліку на кнопку видалення зображення', () => {
    const attachedImage = { url: 'blob:fake-url' };
    render(<MessageInput {...defaultProps} attachedImage={attachedImage} />);
    
    const clearBtn = screen.getByTitle('Видалити зображення');
    fireEvent.click(clearBtn);
    expect(defaultProps.onClearImage).toHaveBeenCalledTimes(1);
  });

  it('кнопка мікрофону змінює стан', () => {
    const { rerender } = render(<MessageInput {...defaultProps} />);
    
    const sttBtn = screen.getByTitle('Голосове введення (STT)');
    expect(sttBtn).toHaveTextContent('🎤');
    
    fireEvent.click(sttBtn);
    expect(defaultProps.onToggleListening).toHaveBeenCalled();

    // Симулюємо перерендер зі зміненим станом
    rerender(<MessageInput {...defaultProps} isListening={true} />);
    expect(screen.getByTitle('Зупинити запис')).toHaveTextContent('⏹️');
  });

  it('блокує всі кнопки та ввід під час стрімінгу', () => {
    render(<MessageInput {...defaultProps} streaming={true} inputMessage="Текст" />);
    
    expect(screen.getByPlaceholderText(/Напишіть запитання.../i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Додати зображення/i })).toBeDisabled();
    expect(screen.getByTitle('Голосове введення (STT)')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Надіслати/i })).toBeDisabled();
  });
});
