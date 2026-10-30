interface ModelPricing {
  promptPerMillion: number;
  completionPerMillion: number;
}

const PRICING_MAP: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o-mini': { promptPerMillion: 0.15, completionPerMillion: 0.60 },
  'gpt-4o': { promptPerMillion: 2.50, completionPerMillion: 10.00 },
  'gpt-3.5-turbo': { promptPerMillion: 0.50, completionPerMillion: 1.50 },

  // Google Gemini
  'gemini-2.0-flash': { promptPerMillion: 0.10, completionPerMillion: 0.40 },
  'gemini-2.0-flash-exp': { promptPerMillion: 0.10, completionPerMillion: 0.40 },
  'gemini-1.5-flash': { promptPerMillion: 0.075, completionPerMillion: 0.30 },
  'gemini-1.5-pro': { promptPerMillion: 1.25, completionPerMillion: 5.00 },

  // Anthropic Claude (ready for Wave 4)
  'claude-3-5-sonnet-20241022': { promptPerMillion: 3.00, completionPerMillion: 15.00 },
  'claude-3-5-haiku-20241022': { promptPerMillion: 0.80, completionPerMillion: 4.00 },
};

export function calculateTokenCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number | undefined {
  const normalized = model.toLowerCase().trim();

  if (
    normalized.startsWith('ollama') ||
    normalized.includes(':') ||
    normalized.startsWith('llama') ||
    normalized.startsWith('mistral') ||
    normalized.startsWith('qwen') ||
    normalized.startsWith('phi')
  ) {
    return 0;
  }

  // Exact match or prefix match
  let pricing: ModelPricing | undefined = PRICING_MAP[normalized];
  if (!pricing) {
    const key = Object.keys(PRICING_MAP).find((k) => normalized.includes(k));
    if (key) pricing = PRICING_MAP[key];
  }

  if (!pricing) return undefined;

  const promptCost = (promptTokens / 1_000_000) * pricing.promptPerMillion;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionPerMillion;
  const total = promptCost + completionCost;
  return Math.round(total * 1000000) / 1000000;
}
