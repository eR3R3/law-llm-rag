import { Body, Controller, Delete, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeBaseService } from './knowledge-base.service';
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

@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post('add')
  async addDocuments(@Body() request: AddDocumentRequest): Promise<AddDocumentResponse> {
    return this.knowledgeBaseService.addDocuments(request);
  }

  @Get('get-all')
  async getAllDocuments() {
    return this.knowledgeBaseService.getAllDocuments();
  }

  @Post('query')
  async queryDocuments(@Body() request: QueryRequest): Promise<QueryResponse> {
    return this.knowledgeBaseService.queryDocuments(request);
  }

  @Delete('delete')
  async deleteDocuments(@Body() request: DeleteDocumentRequest): Promise<DeleteDocumentResponse> {
    return this.knowledgeBaseService.deleteDocuments(request);
  }

  @Post('reset')
  async resetKnowledgeBase(@Body() request: ResetRequest): Promise<ResetResponse> {
    return this.knowledgeBaseService.resetKnowledgeBase(request);
  }

  @Post('answer')
  async generateAnswer(@Body() request: { query: string; limit?: number }): Promise<{ answer: string }> {
    // First search for relevant documents
    const queryResponse = await this.knowledgeBaseService.queryDocuments(request);
    
    // Then generate an answer using these documents as context
    const answer = await this.knowledgeBaseService.generateAnswer(request.query, queryResponse.documents);
    
    return { answer };
  }

  @Post('upload-pdf')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPdf(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<PdfUploadResponse> {
    if (!file) {
      throw new Error('No file uploaded');
    }
    
    if (file.mimetype !== 'application/pdf') {
      throw new Error('File must be a PDF');
    }
    
    return this.knowledgeBaseService.parsePdfAndSave(file.buffer, file.originalname);
  }
}
