export class DocumentEntity {
  id: string;
  filename: string;
  mimeType: string;
  status: 'processing' | 'ready' | 'failed';
  createdAt: Date;
}
