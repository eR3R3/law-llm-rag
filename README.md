# LLM Knowledge Base

A knowledge base system for Large Language Models (LLMs) using Qdrant as a vector database and OpenAI for embeddings and query optimization.

## Architecture

This system implements the following workflow:

1. User asks a question
2. OpenAI optimizes the query
3. Query is converted to embedding vector
4. System searches in Qdrant for similar content
5. Top matching documents are returned
6. Final prompt is built with context
7. OpenAI generates the answer

## Prerequisites

- Node.js (v18+)
- Qdrant (running on http://localhost:6333 by default)
- OpenAI API key

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up environment variables by creating a `.env` file with:
   ```
   OPENAI_API_KEY=your_openai_api_key
   QDRANT_URL=http://localhost:6333
   QDRANT_COLLECTION_NAME=knowledge_base
   ```

## Starting Qdrant

You can run Qdrant using Docker:

```bash
docker run -p 6333:6333 -p 6334:6334 \
    -v $(pwd)/qdrant_storage:/qdrant/storage \
    qdrant/qdrant
```

## Running the Application

```bash
npm run start:dev
```

## API Endpoints

### Add Documents

Add documents to the knowledge base.

```
POST /knowledge-base/add
```

Request body:
```json
{
  "documents": [
    {
      "content": "Document content goes here",
      "metadata": {
        "source": "Source of the document",
        "date": "2023-07-20"
      }
    }
  ]
}
```

Response:
```json
{
  "ids": ["document_id_1"]
}
```

### Upload PDF

Upload a PDF file to be parsed and added to the knowledge base. The PDF will be split into paragraphs and each paragraph will be stored as a separate document.

```
POST /knowledge-base/upload-pdf
```

Request: Form data with a file field named 'file' containing the PDF file.

Response:
```json
{
  "filename": "example.pdf",
  "paragraphs": 42,
  "documentIds": ["id1", "id2", "id3", ...]
}
```

Example using curl:
```bash
curl -X POST http://localhost:3000/knowledge-base/upload-pdf \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/document.pdf"
```

### Query Documents

Query the knowledge base for similar documents.

```
POST /knowledge-base/query
```

Request body:
```json
{
  "query": "Your query here",
  "limit": 5
}
```

Response:
```json
{
  "documents": [
    {
      "id": "document_id_1",
      "content": "Document content",
      "metadata": {
        "source": "Source of the document"
      }
    }
  ]
}
```

### Generate Answer

Query the knowledge base and generate an answer using the matched documents as context.

```
POST /knowledge-base/answer
```

Request body:
```json
{
  "query": "Your question here",
  "limit": 5
}
```

Response:
```json
{
  "answer": "Generated answer based on the knowledge base"
}
```

### Delete Documents

Delete documents from the knowledge base.

```
DELETE /knowledge-base/delete
```

Request body:
```json
{
  "ids": ["document_id_1", "document_id_2"]
}
```

Response:
```json
{
  "deleted": 2
}
```

### Reset Knowledge Base

Reset the entire knowledge base.

```
POST /knowledge-base/reset
```

Request body:
```json
{
  "confirm": true
}
```

Response:
```json
{
  "message": "Knowledge base reset successfully"
}
```

## Example Usage

### Adding Documents

```bash
curl -X POST http://localhost:3000/knowledge-base/add \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "content": "Qdrant is a vector similarity search engine",
        "metadata": {
          "source": "Qdrant documentation"
        }
      }
    ]
  }'
```

### Uploading a PDF

```bash
curl -X POST http://localhost:3000/knowledge-base/upload-pdf \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/document.pdf"
```

### Querying and Getting an Answer

```bash
curl -X POST http://localhost:3000/knowledge-base/answer \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is Qdrant?",
    "limit": 5
  }'
```