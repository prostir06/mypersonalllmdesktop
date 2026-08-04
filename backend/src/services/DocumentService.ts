const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
import prisma from '../config/prisma';
import logger from '../logger';
import EmbeddingService = require('./EmbeddingService');

type FileInfo = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type DocumentRow = {
  id: number;
  userId: number;
  filename: string;
  fileType: string;
  fileSize: number;
  createdAt: Date;
};

function toPublicDocument(row: DocumentRow, chunksCount?: number) {
  const base = {
    id: row.id,
    user_id: row.userId,
    filename: row.filename,
    file_type: row.fileType,
    file_size: row.fileSize,
    created_at: row.createdAt,
  };

  if (chunksCount !== undefined) {
    return { ...base, chunks_count: chunksCount };
  }

  return base;
}

class DocumentService {
  static chunkText(text: string, chunkSize = 1500, overlap = 300): string[] {
    if (!text || typeof text !== 'string') return [];

    const cleaned = text.replace(/\r\n/g, '\n').trim();
    if (cleaned.length <= chunkSize) return [cleaned];

    const chunks: string[] = [];
    let start = 0;

    while (start < cleaned.length) {
      let end = start + chunkSize;

      if (end < cleaned.length) {
        const lastBreak = cleaned.lastIndexOf('\n\n', end);
        if (lastBreak > start + chunkSize / 2) {
          end = lastBreak;
        } else {
          const lastSentence = cleaned.lastIndexOf('. ', end);
          if (lastSentence > start + chunkSize / 2) {
            end = lastSentence + 1;
          }
        }
      }

      const chunk = cleaned.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      start = end - overlap;
    }

    return chunks;
  }

  static async extractText(
    buffer: Buffer,
    mimetype: string,
    originalname: string
  ): Promise<string> {
    if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
      const parser = new PDFParse({ data: buffer });
      try {
        const pdfData = await parser.getText();
        return pdfData?.text || '';
      } finally {
        await parser.destroy();
      }
    }

    if (
      mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalname.endsWith('.docx')
    ) {
      const docxResult = await mammoth.extractRawText({ buffer });
      return docxResult.value;
    }

    return buffer.toString('utf-8');
  }

  static async uploadAndProcess(fileInfo: FileInfo, userId: number) {
    const { originalname, mimetype, size, buffer } = fileInfo;
    const extractedText = await this.extractText(buffer, mimetype, originalname);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('Не вдалося витягти текст з надісланого файлу');
    }

    const chunks = this.chunkText(extractedText);
    let embeddings: Array<number[] | null> = [];

    if (EmbeddingService.isAvailable()) {
      embeddings = await EmbeddingService.generateBatchEmbeddings(chunks);
    }

    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          userId,
          filename: originalname,
          fileType: mimetype,
          fileSize: size,
        },
      });

      for (let i = 0; i < chunks.length; i++) {
        const embedding = embeddings[i] || null;

        if (embedding) {
          const vectorLiteral = `[${embedding.join(',')}]`;
          await tx.$executeRawUnsafe(
            `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
             VALUES ($1, $2, $3, $4::vector)`,
            created.id,
            i,
            chunks[i],
            vectorLiteral
          );
        } else {
          await tx.documentChunk.create({
            data: {
              documentId: created.id,
              chunkIndex: i,
              content: chunks[i],
            },
          });
        }
      }

      return created;
    });

    logger.info(
      `Document uploaded & chunked: ${originalname} (id=${doc.id}, ${chunks.length} chunks, embeddings=${embeddings.filter(Boolean).length})`
    );

    if (!EmbeddingService.isAvailable()) {
      logger.warn(
        'Embeddings not generated: OPENAI_API_KEY not configured. RAG will use fallback chunk selection.'
      );
    }

    return {
      document: toPublicDocument(doc),
      chunksCount: chunks.length,
    };
  }

  static async getByUser(userId: number) {
    const rows = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });

    return rows.map((row) => toPublicDocument(row, row._count.chunks));
  }

  static async delete(docId: number, userId: number): Promise<boolean> {
    const result = await prisma.document.deleteMany({
      where: { id: docId, userId },
    });

    return result.count > 0;
  }
}

export = DocumentService;
