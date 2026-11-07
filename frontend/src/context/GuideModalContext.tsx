import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import SystemGuideModal from '../components/system/SystemGuideModal';
import { useSystemKnowledge } from '../hooks/useSystemKnowledge';
import type { AdvisoryTip, SystemKnowledgeQueryParams } from '../types/api';

type GuideRegistration = {
  params?: SystemKnowledgeQueryParams;
  onAskPrompt?: (prompt: string) => void;
  onOpenDocuments?: () => void;
  onOpenPrompts?: () => void;
};

type GuideModalValue = {
  open: () => void;
  close: () => void;
  warningCount: number;
  register: (next: GuideRegistration) => () => void;
};

const GuideModalContext = createContext<GuideModalValue>({
  open: () => {},
  close: () => {},
  warningCount: 0,
  register: () => () => {},
});

export function useGuideModal(): GuideModalValue {
  return useContext(GuideModalContext);
}

/** One system guide for the shell. Chat registers live params and actions. */
export function GuideModalProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [live, setLive] = useState<GuideRegistration>({});
  const { data, isLoading, isError, refetch } = useSystemKnowledge(live.params);

  const register = useCallback((next: GuideRegistration) => {
    setLive(next);
    return () => setLive({});
  }, []);

  const onAction = useCallback(
    (tip: AdvisoryTip) => {
      if (tip.actionType === 'navigate_settings') {
        navigate(tip.actionTarget || '/settings');
        return;
      }
      if (tip.actionType === 'open_documents') {
        if (live.onOpenDocuments) live.onOpenDocuments();
        else navigate('/dashboard');
        return;
      }
      if (tip.actionType === 'open_prompts') {
        if (live.onOpenPrompts) live.onOpenPrompts();
        else navigate('/dashboard');
        return;
      }
      if (tip.actionType === 'ask_ai' && tip.suggestedPrompt) {
        if (live.onAskPrompt) live.onAskPrompt(tip.suggestedPrompt);
        else navigate('/dashboard');
      }
    },
    [live, navigate]
  );

  const warningCount =
    data?.advisories.filter((item) => item.severity === 'warning').length ?? 0;

  const value = useMemo(
    () => ({
      open: () => setShow(true),
      close: () => setShow(false),
      warningCount,
      register,
    }),
    [register, warningCount]
  );

  return (
    <GuideModalContext.Provider value={value}>
      {children}
      <SystemGuideModal
        show={show}
        onHide={() => setShow(false)}
        knowledge={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        onAction={onAction}
        onAskPrompt={(prompt) => {
          if (live.onAskPrompt) live.onAskPrompt(prompt);
          else navigate('/dashboard');
        }}
      />
    </GuideModalContext.Provider>
  );
}
