import { Pinecone } from '@pinecone-database/pinecone'

const apiKey = process.env.PINECONE_API_KEY

if (!apiKey) {
  throw new Error(
    'Missing required environment variable PINECONE_API_KEY. Set it in your .env file before starting the server.'
  )
}

export const pineconeClient = new Pinecone({ apiKey })

export function getIndex() {
  const indexName = process.env.PINECONE_INDEX_NAME

  if (!indexName) {
    throw new Error(
      'Missing required environment variable PINECONE_INDEX_NAME. Set it in your .env file before starting the server.'
    )
  }

  return pineconeClient.index(indexName)
}
