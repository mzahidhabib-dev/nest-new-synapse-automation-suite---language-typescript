import { ChunkerService } from '../src/modules/rag/pipeline/chunker.service';
import { ExtractedPage } from '../src/modules/rag/pipeline/extractor.service';

const chunker = new ChunkerService();

const samplePages: ExtractedPage[] = [
  {
    pageNumber: 1,
    text: `Welcome to Synapse Automation Suite. This is the first sentence. 
It is followed by the second sentence, which is slightly longer and contains more details! 
What happens if we have a third sentence? It should also be parsed correctly.
Finally, the fourth sentence concludes this paragraph.`,
  },
  {
    pageNumber: 2,
    text: `Here is a new paragraph from page 2. It should still be chunked semantically. We want to ensure that no words are cut in half.
This is a test of the semantic chunking algorithm. We are using a small chunk size for testing purposes.`,
  },
];

// Hack the maxCharsPerChunk for testing so we can see the overlap easily
(chunker as any).maxCharsPerChunk = 150;

const chunks = chunker.chunk(samplePages, 'test-document.pdf');

console.log(`Total Chunks: ${chunks.length}\n`);

chunks.forEach((chunk, i) => {
  console.log(`--- CHUNK ${i + 1} (Page ${chunk.metadata.page}) ---`);
  console.log(chunk.content);
  console.log('-------------------\n');
});
