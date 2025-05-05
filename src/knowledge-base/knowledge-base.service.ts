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

  async parsePdfAndSave(buffer: Buffer, filename: string): Promise<PdfUploadResponse> {
    try {
      // Parse the PDF
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text;
      
      // Split text into paragraphs (split by double newlines)
      const paragraphs = text
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0); // Remove empty paragraphs
      
      // Create documents from paragraphs
      const documents: Document[] = paragraphs.map((content, index) => ({
        content,
        metadata: {
          source: filename,
          paragraphIndex: index,
          pageCount: pdfData.numpages,
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
}
