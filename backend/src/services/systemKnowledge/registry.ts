import { getLiveSystemMetadata } from './liveMetadata';
import type { KnowledgeCard } from './types';

export function getCuratedKnowledgeCards(): KnowledgeCard[] {
  const metadata = getLiveSystemMetadata();

  return [
    {
      id: 'provider-openai',
      category: 'providers',
      title: 'Провайдер OpenAI',
      summary:
        'Хмарний провайдер моделей штучного інтелекту від OpenAI (серії GPT-4o, GPT-4o-mini тощо).',
      whyUse:
        'Забезпечує високу якість міркувань, мультимодальність та підтримку найновіших моделей.',
      howToUse:
        'Введіть власний OpenAI API ключ у налаштуваннях та виберіть потрібну модель зі списку.',
      uiPath: '/settings',
      relatedSettings: [
        'default_provider',
        'defaultProvider',
        'openai_api_key',
        'clear_openai_api_key',
        'openaiApiKeyEnc',
      ],
      relatedRoutes: ['models'],
      keywords: ['openai', 'gpt', 'gpt-4o', 'провайдер', 'хмара', 'api key'],
      liveFacts: {
        provider: 'openai',
        pricingModelsCount: metadata.supportedPricingModels.filter((m) =>
          m.includes('gpt')
        ).length,
      },
    },
    {
      id: 'provider-ollama',
      category: 'providers',
      title: 'Локальний провайдер Ollama',
      summary:
        'Локальний сервер для запуску моделей із відкритими вагами (Llama 3, Mistral, Qwen тощо) без передачі даних у хмару.',
      whyUse:
        'Повна приватність даних, офлайн-робота та нульова вартість використання токенів.',
      howToUse:
        'Запустіть Ollama локально або в мережі та налаштуйте адресу хоста у параметрах застосунку.',
      uiPath: '/settings',
      relatedSettings: ['default_ollama_host', 'defaultOllamaHost'],
      relatedRoutes: ['models'],
      keywords: ['ollama', 'локальний', 'llama', 'mistral', 'офлайн', 'приватність'],
      liveFacts: {
        provider: 'ollama',
        isLocal: true,
        defaultHost: 'http://127.0.0.1:11434/v1/chat/completions',
      },
    },
    {
      id: 'provider-gemini',
      category: 'providers',
      title: 'Провайдер Google Gemini',
      summary:
        'Моделі нового покоління від Google із розширеним контекстним вікном та швидкою генерацією (Gemini 2.0 Flash, 1.5 Pro).',
      whyUse:
        'Ідеально для аналізу великих документів, мультимодальних завдань та швидких відповідей.',
      howToUse:
        'Введіть Gemini API ключ у налаштуваннях провайдерів та виберіть модель Gemini.',
      uiPath: '/settings',
      relatedSettings: ['gemini_api_key', 'clear_gemini_api_key', 'geminiApiKeyEnc'],
      relatedRoutes: ['models'],
      keywords: ['gemini', 'google', 'flash', 'pro', 'мультимодальність', 'контекст'],
      liveFacts: {
        provider: 'gemini',
        pricingModelsCount: metadata.supportedPricingModels.filter((m) =>
          m.includes('gemini')
        ).length,
      },
    },
    {
      id: 'provider-anthropic',
      category: 'providers',
      title: 'Провайдер Anthropic Claude',
      summary:
        'Інтелектуальні моделі Claude 3.5 Sonnet та Claude 3.5 Haiku з передовими навичками програмування та аналізу.',
      whyUse:
        'Виняткова якість генерації коду, глибокий аналіз складних запитів та чітке дотримання інструкцій.',
      howToUse:
        'Додайте Anthropic API ключ у налаштуваннях та активуйте модель Claude.',
      uiPath: '/settings',
      relatedSettings: [
        'anthropic_api_key',
        'clear_anthropic_api_key',
        'anthropicApiKeyEnc',
      ],
      relatedRoutes: ['models'],
      keywords: ['anthropic', 'claude', 'sonnet', 'haiku', 'код', 'програмування'],
      liveFacts: {
        provider: 'anthropic',
        pricingModelsCount: metadata.supportedPricingModels.filter((m) =>
          m.includes('claude')
        ).length,
      },
    },
    {
      id: 'setting-temperature-tokens',
      category: 'settings',
      title: 'Параметри генерації: Температура та Ліміт токенів',
      summary:
        'Керування творчістю моделі (temperature) та максимальною довжиною відповіді (max_tokens).',
      whyUse:
        'Дозволяє налаштувати баланс між точністю фактів і креативністю, а також контролювати обсяг вихідних повідомлень.',
      howToUse:
        'Встановіть повзунок температури та вкажіть ліміт токенів у розділі Налаштування.',
      uiPath: '/settings',
      relatedSettings: ['temperature', 'max_tokens', 'maxTokens'],
      relatedRoutes: ['settings'],
      keywords: ['температура', 'токени', 'параметри', 'генерація', 'налаштування'],
      liveFacts: {
        minTemp: metadata.temperatureRange.min,
        maxTemp: metadata.temperatureRange.max,
        minTokens: metadata.maxTokensRange.min,
        maxTokens: metadata.maxTokensRange.max,
      },
    },
    {
      id: 'setting-default-model',
      category: 'settings',
      title: 'Модель за замовчуванням',
      summary:
        'Вибір основної LLM-моделі, яка автоматично використовується для створення нових діалогів.',
      whyUse:
        'Економить час під час початку нового чату, підставляючи вашу улюблену та найбільш придатну модель.',
      howToUse:
        'Оберіть модель у випадаючому списку параметрів за замовчуванням у вкладці Налаштування.',
      uiPath: '/settings',
      relatedSettings: ['default_model', 'defaultModel'],
      relatedRoutes: ['settings', 'models'],
      keywords: ['модель за замовчуванням', 'вибір моделі', 'default model'],
      liveFacts: {
        allowedProviders: metadata.allowedProviders,
      },
    },
    {
      id: 'setting-system-prompt',
      category: 'settings',
      title: 'Глобальний системний промпт',
      summary:
        'Базова інструкція для ШІ, яка визначає поведінку, роль, тон спілкування та правила для всіх розмов.',
      whyUse:
        'Забезпечує послідовну поведінку асистента без необхідності повторювати інструкції в кожному новому чаті.',
      howToUse:
        'Введіть інструкції українською або іншою мовою у поле системного промпту в налаштуваннях.',
      uiPath: '/settings',
      relatedSettings: ['system_prompt', 'systemPrompt'],
      relatedRoutes: ['settings'],
      keywords: ['системний промпт', 'інструкція', 'роль', 'поведінка'],
      liveFacts: {},
    },
    {
      id: 'rag-hybrid',
      category: 'rag',
      title: 'База знань RAG (Пошук за документами)',
      summary:
        'Гібридний семантичний та повнотекстовий пошук за завантаженими документами (PDF, DOCX, XLSX, TXT) із векторними ембедінгами.',
      whyUse:
        'Дозволяє моделі надавати точні відповіді, спираючись на ваші власні файли, з цитуванням першоджерел.',
      howToUse:
        'Завантажте документи у розділі Документи, дочекайтеся індексації та підключіть їх до діалогу.',
      uiPath: '/documents',
      relatedRoutes: ['documents'],
      keywords: [
        'rag',
        'документи',
        'ембедінги',
        'векторний пошук',
        'індексація',
        'pdf',
        'docx',
      ],
      liveFacts: {
        maxUploadMb: metadata.maxUploadMb,
      },
    },
    {
      id: 'memory-dual',
      category: 'memory',
      title: 'Дворівнева пам’ять: Діалог та Користувач',
      summary:
        'Довготривала пам’ять, що поєднує автоматичне резюмування діалогу та глобальні нотатки фактів про користувача.',
      whyUse:
        'Модель пам’ятає контекст тривалих розмов та ваші ключові вподобання без переповнення контекстного вікна.',
      howToUse:
        'Переглядайте та редагуйте нотатки пам’яті на бічній панелі чату або в профілі користувача.',
      uiPath: '/chat',
      relatedRoutes: ['conversations', 'users'],
      keywords: ['пам’ять', 'нотатки', 'резюме', 'контекст', 'спогади'],
      liveFacts: {
        convMaxNotes: metadata.conversationMemoryMaxNotes,
        convNoteMaxChars: metadata.conversationMemoryNoteMaxChars,
        summaryThreshold: metadata.conversationSummaryThreshold,
        userMaxNotes: metadata.userMemoryMaxNotes,
        userNoteMaxChars: metadata.userMemoryNoteMaxChars,
      },
    },
    {
      id: 'prompt-library',
      category: 'chat_tools',
      title: 'Бібліотека та закріплення промптів',
      summary:
        'Збірка багаторазових шаблонів запитів із можливістю швидкої вставки у поле вводу та закріплення найважливіших.',
      whyUse:
        'Прискорює роботу з типовими завданнями: переклад, форматування, код-рев’ю чи аналіз даних.',
      howToUse:
        'Відкрийте панель промптів через кнопку в полі введення або через меню навігації.',
      uiPath: '/prompts',
      relatedRoutes: ['prompts'],
      keywords: ['промпти', 'шаблони', 'бібліотека', 'закріплені'],
      liveFacts: {},
    },
    {
      id: 'interactive-artifacts',
      category: 'artifacts',
      title: 'Інтерактивні артефакти',
      summary:
        'Відокремлений рендеринг коду, Markdown-документів, SVG-графіки, діаграм Mermaid та HTML-віджетів.',
      whyUse:
        'Дозволяє зручно переглядати, копіювати, тестувати та експортувати створені моделлю матеріали поруч із чатом.',
      howToUse:
        'Попросіть модель згенерувати код, документ або діаграму — артефакт автоматично відкриється у бічній панелі.',
      uiPath: '/chat',
      keywords: [
        'артефакти',
        'mermaid',
        'код',
        'svg',
        'попередній перегляд',
        'html',
      ],
      liveFacts: {
        supportedFormats: ['code', 'markdown', 'mermaid', 'svg', 'html'],
      },
    },
    {
      id: 'chat-tools',
      category: 'chat_tools',
      title: 'Інструменти чату та веб-пошук',
      summary:
        'Розширені можливості діалогу: живий веб-пошук DuckDuckGo, розгалуження повідомлень, експорт історій та системні консультації.',
      whyUse:
        'Надає моделі доступ до актуальних світових новин та дозволяє експериментувати з різними гілками відповідей.',
      howToUse:
        'Увімкніть перемикач Веб-пошук під полем вводу для пошуку актуальної інформації або натисніть значок розгалуження біля повідомлення.',
      uiPath: '/chat',
      relatedSettings: ['tools_enabled', 'toolsEnabled'],
      relatedRoutes: ['chat', 'auth', 'system'],
      keywords: [
        'веб-пошук',
        'інструменти',
        'розгалуження',
        'експорт',
        'токен-калькулятор',
        'авторизація',
        'система',
      ],
      liveFacts: {
        hasWebSearch: true,
        hasBranching: true,
      },
    },
    {
      id: 'desktop-app',
      category: 'desktop',
      title: 'Десктопний клієнт Antigravity Desktop',
      summary:
        'Повнофункціональний локальний застосунок із підтримкою системних повідомлень, глобальних гарячих клавіш та автономної роботи.',
      whyUse:
        'Забезпечує максимальну швидкодію, автономність та тісну інтеграцію з робочим столом вашої операційної системи.',
      howToUse:
        'Керуйте вікном за допомогою гарячих клавіш, використовуйте контекстне меню та отримуйте сповіщення про завершення генерації.',
      uiPath: '/desktop',
      keywords: [
        'десктоп',
        'electron',
        'гарячі клавіші',
        'сповіщення',
        'локальний клієнт',
      ],
      liveFacts: {
        client: 'Electron Desktop',
      },
    },
  ];
}
