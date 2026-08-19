export type RelevantChunk = {
  content: string;
  filename: string;
  similarity: number;
};

export type VectorRow = {
  chunk_id: number;
  content: string;
  filename: string;
  similarity: number;
};

export type FtsRow = {
  chunk_id: number;
  content: string;
  filename: string;
  rank: number;
};
