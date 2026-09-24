import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../repositories/kb-repository.js', () => ({
  createKBEntry: vi.fn(),
  createKBFileEntry: vi.fn(),
  deleteKBEntry: vi.fn(),
  getKBEntriesByBotId: vi.fn(),
  getKBEntryById: vi.fn(),
  updateKBEntry: vi.fn(),
}))

vi.mock('./rag-service.js', () => ({
  indexKnowledgeBaseEntry: vi.fn(),
}))

vi.mock('../repositories/vector-repository.js', () => ({
  deleteChunksByEntryId: vi.fn(),
}))

vi.mock('../repositories/redis-repository.js', () => ({
  bumpAnswerCacheGeneration: vi.fn(),
}))

vi.mock('./entitlement-service.js', () => ({
  checkEntitlement: vi.fn(),
}))

vi.mock('./bot-service.js', () => ({
  getBotConfig: vi.fn(),
}))

vi.mock('../lib/s3.js', () => ({
  deleteObject: vi.fn(),
  generatePresignedUploadUrl: vi.fn(),
}))

vi.mock('../lib/sqs.js', () => ({
  enqueueCrawlerJob: vi.fn(),
}))

const { deleteKBEntry, getKBEntryById, updateKBEntry: updateKBEntryRepo } = await import('../repositories/kb-repository.js')
const { indexKnowledgeBaseEntry } = await import('./rag-service.js')
const { deleteChunksByEntryId } = await import('../repositories/vector-repository.js')
const { bumpAnswerCacheGeneration } = await import('../repositories/redis-repository.js')
const { updateKBEntry, removeKBEntry } = await import('./kb-service.js')

const BOT_ID = 'bot-1'
const ENTRY_ID = 'entry-1'
const CLIENT_ID = 'client-1'

describe('updateKBEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getKBEntryById).mockResolvedValue({
      entryId: ENTRY_ID,
      botId: BOT_ID,
      clientId: CLIENT_ID,
      title: 'Old title',
      content: 'Old content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    vi.mocked(updateKBEntryRepo).mockResolvedValue({
      entryId: ENTRY_ID,
      botId: BOT_ID,
      clientId: CLIENT_ID,
      title: 'New title',
      content: 'New content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  // The bug this guards: indexKnowledgeBaseEntry generates a new chunkId per
  // chunk, so upserting cannot replace the previous vectors. Without an
  // explicit delete the old wording stays in Pinecone and keeps getting
  // retrieved, so an edited entry answers from both versions at once.
  it('deletes the entry old chunks before re-embedding', async () => {
    await updateKBEntry(BOT_ID, ENTRY_ID, CLIENT_ID, { title: 'New title', content: 'New content' })

    expect(deleteChunksByEntryId).toHaveBeenCalledWith(BOT_ID, ENTRY_ID)
    expect(indexKnowledgeBaseEntry).toHaveBeenCalledWith(BOT_ID, ENTRY_ID, 'New title', 'New content')

    const deleteOrder = vi.mocked(deleteChunksByEntryId).mock.invocationCallOrder[0]
    const indexOrder = vi.mocked(indexKnowledgeBaseEntry).mock.invocationCallOrder[0]
    expect(deleteOrder).toBeLessThan(indexOrder)
  })

  it('does not touch vectors when the caller does not own the entry', async () => {
    vi.mocked(getKBEntryById).mockResolvedValue({
      entryId: ENTRY_ID,
      botId: BOT_ID,
      clientId: 'someone-else',
      title: 'Old title',
      content: 'Old content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    await expect(
      updateKBEntry(BOT_ID, ENTRY_ID, CLIENT_ID, { title: 'New title', content: 'New content' })
    ).rejects.toThrow('KB entry not found')

    expect(deleteChunksByEntryId).not.toHaveBeenCalled()
    expect(indexKnowledgeBaseEntry).not.toHaveBeenCalled()
    expect(bumpAnswerCacheGeneration).not.toHaveBeenCalled()
  })

  // The bug this guards: answers are cached for 7 days under the question
  // text, so without an invalidation every question already asked keeps its
  // pre-edit answer even though Pinecone now holds the corrected text.
  it('invalidates the bot cached answers after re-embedding', async () => {
    await updateKBEntry(BOT_ID, ENTRY_ID, CLIENT_ID, { title: 'New title', content: 'New content' })

    expect(bumpAnswerCacheGeneration).toHaveBeenCalledWith(BOT_ID)
    const indexOrder = vi.mocked(indexKnowledgeBaseEntry).mock.invocationCallOrder[0]
    const bumpOrder = vi.mocked(bumpAnswerCacheGeneration).mock.invocationCallOrder[0]
    expect(indexOrder).toBeLessThan(bumpOrder)
  })

  it('still reports success when the cache invalidation fails', async () => {
    vi.mocked(bumpAnswerCacheGeneration).mockRejectedValue(new Error('redis down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      updateKBEntry(BOT_ID, ENTRY_ID, CLIENT_ID, { title: 'New title', content: 'New content' })
    ).resolves.toMatchObject({ entryId: ENTRY_ID })

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('removeKBEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getKBEntryById).mockResolvedValue({
      entryId: ENTRY_ID,
      botId: BOT_ID,
      clientId: CLIENT_ID,
      title: 'Title',
      content: 'Content',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  // The vectors are what the bot answers from, so the cache must be
  // invalidated once they are gone even if the row delete then fails.
  it('invalidates cached answers even when the row delete fails', async () => {
    vi.mocked(deleteKBEntry).mockRejectedValue(new Error('dynamo down'))

    await expect(removeKBEntry(BOT_ID, ENTRY_ID, CLIENT_ID)).rejects.toThrow('Failed to remove')

    expect(deleteChunksByEntryId).toHaveBeenCalledWith(BOT_ID, ENTRY_ID)
    expect(bumpAnswerCacheGeneration).toHaveBeenCalledWith(BOT_ID)
  })
})
