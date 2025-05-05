import { Injectable, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as pdfParse from 'pdf-parse';
import {
  Document,
  QueryRequest,
  QueryResponse,
  AddDocumentRequest,
  AddDocumentResponse,
  DeleteDocumentRequest,
  DeleteDocumentResponse,
  ResetRequest,
  ResetResponse,
  PdfUploadResponse,
} from './knowledge-base.types';

dotenv.config();

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
  private qdrantClient: QdrantClient;
  private openaiClient: OpenAI;
  private readonly collectionName: string;
  private readonly embeddingDimension = 1536; // OpenAI ada-002 embedding dimension

  constructor() {
    this.qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
    });
    this.openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.chatanywhere.tech/v1',
    });

    this.collectionName = process.env.QDRANT_COLLECTION_NAME || 'knowledge_base';
    
  }

  async onModuleInit() {
    await this.ensureCollectionExists();
  }

  async ensureCollectionExists() {
    try {
      const collections = await this.qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        (collection) => collection.name === this.collectionName,
      );

      if (!collectionExists) {
        await this.qdrantClient.createCollection(this.collectionName, {
          vectors: {
            size: this.embeddingDimension,
            distance: 'Cosine',
          },
        });
      }
    } catch (error) {
      console.error('Error ensuring collection exists:', error);
      throw error;
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const response = await this.openaiClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    console.log(response.data[0].embedding);
    return response.data[0].embedding;
  }

  async optimizeQuery(query: string): Promise<string> {
    // Use OpenAI to optimize the query for semantic search
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a query optimization assistant. Rewrite the following query to make it more effective for semantic search.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.3,
      });
      //@ts-ignore
      console.log(response.choices[0].message.content.trim());
      //@ts-ignore
      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error optimizing query:', error);
      return query; // Return original query if optimization fails
    }
  }

  async addDocuments(request: AddDocumentRequest): Promise<AddDocumentResponse> {
    const ids: string[] = [];
    
    for (const doc of request.documents) {
      const id = doc.id || uuidv4();
      const embedding = await this.getEmbedding(doc.content);
      
      await this.qdrantClient.upsert(this.collectionName, {
        points: [
          {
            id,
            vector: embedding,
            payload: {
              content: doc.content,
              metadata: doc.metadata || {},
            },
          },
        ],
      });
      
      ids.push(id);
    }
    
    return { ids };
  }

  async queryDocuments(request: QueryRequest): Promise<QueryResponse> {
    const optimizedQuery = await this.optimizeQuery(request.query);
    const embedding = await this.getEmbedding(optimizedQuery);
    const limit = request.limit || 5;
    
    // vector: embedding means we use the query vector to search the document, but it will return
    const searchResult = await this.qdrantClient.search(this.collectionName, {
      vector: embedding,
      limit,
      with_payload: true,
    });
    
    const documents = searchResult.map((result) => {
      if (!result.payload) {
        return {
          id: result.id.toString(),
          content: '',
          metadata: {},
        };
      }
      console.log(result);
      
      return {
        id: result.id.toString(),
        score: result.score,
        content: result.payload.content as string,
        metadata: result.payload.metadata as Record<string, any> || {},
      };
    });
    
    return { documents };
  }

  async deleteDocuments(request: DeleteDocumentRequest): Promise<DeleteDocumentResponse> {
    await this.qdrantClient.delete(this.collectionName, {
      points: request.ids,
    });
    
    return { deleted: request.ids.length };
  }

  async resetKnowledgeBase(request: ResetRequest): Promise<ResetResponse> {
    if (!request.confirm) {
      throw new Error('Confirmation required to reset knowledge base');
    }
    
    try {
      await this.qdrantClient.deleteCollection(this.collectionName);
      await this.ensureCollectionExists();
      
      return { message: 'Knowledge base reset successfully' };
    } catch (error) {
      console.error('Error resetting knowledge base:', error);
      throw error;
    }
  }

  async generateAnswer(query: string, documents: Document[]): Promise<string> {
    const context = documents.map(doc => doc.content).join('\n\n');
    
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant. Answer the user's question based on the following context: \n\n${context}`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.7,
      });
      //@ts-ignore
      console.log(response.choices[0].message.content.trim());
      //@ts-ignore
      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating answer:', error);
      return 'Sorry, I was unable to generate an answer. Please try again.';
    }
  }

  /**
   * Detects paragraph boundaries in text using multiple heuristics
   * @param text The text to split into paragraphs
   * @returns Array of paragraphs
   */
  private detectParagraphs(text: string): string[] {
    // Normalize line endings and remove excessive whitespace
    let normalizedText = text
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/\n{3,}/g, '\n\n')  // Replace 3+ newlines with 2
      .replace(/[ \t]+/g, ' ')  // Replace multiple spaces/tabs with single space
      .trim();

    // Split by any newline first
    const lines = normalizedText.split(/\n/);
    const paragraphs: string[] = [];
    let currentParagraph = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        // Empty line indicates a potential paragraph break
        if (currentParagraph) {
          paragraphs.push(currentParagraph);
          currentParagraph = '';
        }
        continue;
      }

      // Check if this line should start a new paragraph
      const shouldStartNewParagraph = 
        // Previous line ends with sentence-ending punctuation
        (currentParagraph && 
         (currentParagraph.endsWith('。') || 
          currentParagraph.endsWith('！') || 
          currentParagraph.endsWith('？') || 
          currentParagraph.endsWith('：') || 
          currentParagraph.endsWith('；') ||
          currentParagraph.endsWith('.') || 
          currentParagraph.endsWith('!') || 
          currentParagraph.endsWith('?') || 
          currentParagraph.endsWith(':') || 
          currentParagraph.endsWith(';'))) ||
        // Line starts with a number or bullet point
        /^[\d•\-\*]/.test(line) ||
        // Line is significantly shorter than average (likely a header)
        (line.length < 20 && i > 0 && lines[i-1].length > 40) ||
        // Line starts with common paragraph indicators
        /^(第[一二三四五六七八九十百千万]+[章节篇]|[\d]+[\.\、])/.test(line);

      if (shouldStartNewParagraph && currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = line;
      } else {
        // If the current line doesn't end with punctuation and the next line exists,
        // it might be a continuation of the current paragraph
        const isContinuation = 
          i < lines.length - 1 && 
          !line.match(/[。！？：；.!?:;]$/) && 
          !lines[i + 1].trim().match(/^(第[一二三四五六七八九十百千万]+[章节篇]|[\d]+[\.\、])/);

        if (isContinuation) {
          currentParagraph = currentParagraph ? `${currentParagraph} ${line}` : line;
        } else {
          if (currentParagraph) {
            paragraphs.push(currentParagraph);
          }
          currentParagraph = line;
        }
      }
    }
    
    // Add the last paragraph if it exists
    if (currentParagraph) {
      paragraphs.push(currentParagraph);
    }
    
    // Post-process paragraphs to ensure they're meaningful
    return paragraphs
      .map(p => p.trim())
      .filter(p => {
        // Filter out paragraphs that are too short (likely headers or footers)
        if (p.length < 10) return false;
        
        // Filter out paragraphs that are just numbers or special characters
        if (/^[\d\s\W]+$/.test(p)) return false;
        
        // Filter out paragraphs that are just repeated characters
        if (/(.)\1{10,}/.test(p)) return false;
        
        return true;
      });
  }

  async parsePdfAndSave(buffer: Buffer, filename: string): Promise<PdfUploadResponse> {
    try {
      // Parse the PDF
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text;

      console.log(text);
      
      // Use the improved paragraph detection
      const paragraphs = this.detectParagraphs(text);
      
      // Create documents from paragraphs
      const documents: Document[] = paragraphs.map((content, index) => ({
        content,
        metadata: {
          source: filename,
          paragraphIndex: index,
          pageCount: pdfData.numpages,
          totalParagraphs: paragraphs.length,
        },
      }));
      
      // Save to knowledge base
      const { ids } = await this.addDocuments({ documents });
      
      return {
        filename,
        paragraphs: paragraphs.length,
        documentIds: ids,
      };
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  async getAllDocuments() {
    const documents = await this.qdrantClient.scroll(this.collectionName, {
      with_payload: true,
    });
    return documents;
  }
}
