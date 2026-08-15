declare module 'compression' {
  import { Request, RequestHandler, Response } from 'express';

  type CompressionFilter = (req: Request, res: Response) => boolean;

  interface CompressionOptions {
    filter?: CompressionFilter;
    [key: string]: unknown;
  }

  interface Compression {
    (options?: CompressionOptions): RequestHandler;
    filter: CompressionFilter;
  }

  const compression: Compression;
  export = compression;
}
