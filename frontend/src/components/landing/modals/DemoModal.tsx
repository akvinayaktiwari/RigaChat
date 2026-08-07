import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Play, Pause, RotateCcw, Check } from 'lucide-react'
import {
  VERTICALS,
  CHAPTERS,
  CHAPTER_OFFSETS,
  TOTAL_TICKS,
  TICK_MS,
  resolveTick,
} from '../walkthrough/walkthrough-content'
import type { VerticalId } from '../walkthrough/walkthrough-content'
import {
  SystemPanel,
  QualifyPanel,
  CrmPanel,
  JourneyPanel,
  BookedPanel,
} from '../walkthrough/WalkthroughPanels'

interface DemoModalProps {
  isOpen: boolean
  onClose: () => void
}

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [tick, setTick] = useState(0)
  const [verticalId, setVerticalId] = useState<VerticalId>('real_estate')

  const script = useMemo(() => VERTICALS.find((v) => v.id === verticalId) ?? VERTICALS[0], [verticalId])
  const { chapterIndex, localTick } = useMemo(() => resolveTick(tick), [tick])

  useEffect(() => {
    if (!isOpen) return
    setIsPlaying(true)
    setTick(0)
    setVerticalId('real_estate')
  }, [isOpen])

  useEffect(() => {
    if (!isPlaying || !isOpen) return
    const interval = setInterval(() => setTick((prev) => prev + 1), TICK_MS)
    return () => clearInterval(interval)
  }, [isPlaying, isOpen])

  function goToChapter(index: number) {
    setTick(CHAPTER_OFFSETS[index])
    setIsPlaying(true)
  }

  function handleSelectVertical(id: VerticalId) {
    setVerticalId(id)
    // Restart the current chapter so the newly chosen vertical is actually seen
    // from the top rather than joining halfway through someone else's script.
    setTick(CHAPTER_OFFSETS[chapterIndex])
    setIsPlaying(true)
  }

  function handleTryLiveAgent() {
    onClose()
    // The real streaming agent already lives in the hero. This walkthrough is
    // scripted, so proof is deliberately handed off to the thing that is not.
    setTimeout(() => {
      document.getElementById('hero-demo-chat')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 220)
  }

  const panelProps = { script, localTick }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-on-background/50 backdrop-blur-md"
            id="demo-backdrop"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-4xl bg-inverse-surface rounded-2xl shadow-2xl border border-outline/20 overflow-hidden z-10"
            id="demo-modal-content"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-on-background/80 border-b border-outline/10 text-white">
              <span className="font-bold text-sm uppercase tracking-wider text-outline-variant">
                Guided product walkthrough
              </span>
              <button
                onClick={onClose}
                className="text-outline-variant hover:text-white p-1 rounded-full hover:bg-outline/20 transition-colors"
                id="demo-close-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid lg:grid-cols-12">
              <div className="lg:col-span-4 bg-on-background/40 p-4 border-b lg:border-b-0 lg:border-r border-outline/10">
                <p className="text-[10px] font-bold text-outline-variant uppercase tracking-wider mb-2">Your industry</p>
                <div className="flex gap-1.5 mb-5">
                  {VERTICALS.map((vertical) => (
                    <button
                      key={vertical.id}
                      onClick={() => handleSelectVertical(vertical.id)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        vertical.id === verticalId
                          ? 'bg-primary text-white'
                          : 'text-outline-variant hover:bg-outline/10'
                      }`}
                      id={`walkthrough-vertical-${vertical.id}`}
                    >
                      {vertical.label}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] font-bold text-outline-variant uppercase tracking-wider mb-2">Chapters</p>
                <div className="flex flex-col gap-1">
                  {CHAPTERS.map((chapter, i) => {
                    const isActive = i === chapterIndex
                    const isDone = i < chapterIndex
                    return (
                      <button
                        key={chapter.id}
                        onClick={() => goToChapter(i)}
                        className={`px-2.5 py-2 rounded-lg text-left text-[11px] font-semibold flex items-center gap-2 transition-all ${
                          isActive ? 'bg-primary/20 text-white' : 'text-outline-variant hover:bg-outline/10'
                        }`}
                        id={`walkthrough-chapter-${chapter.id}`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 text-[8px] ${
                            isActive
                              ? 'border-primary bg-primary text-white'
                              : isDone
                                ? 'border-emerald-400/50 text-emerald-400'
                                : 'border-outline/40'
                          }`}
                        >
                          {isDone ? <Check className="w-2.5 h-2.5" /> : i + 1}
                        </span>
                        <span className="leading-tight">{chapter.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="lg:col-span-8 p-5 bg-on-background flex flex-col">
                <div className="min-h-[268px] flex-1">
                  {chapterIndex === 0 && <SystemPanel {...panelProps} />}
                  {chapterIndex === 1 && <QualifyPanel {...panelProps} />}
                  {chapterIndex === 2 && <CrmPanel {...panelProps} />}
                  {chapterIndex === 3 && <JourneyPanel {...panelProps} />}
                  {chapterIndex === 4 && <BookedPanel {...panelProps} onTryLiveAgent={handleTryLiveAgent} />}
                </div>

                <div className="mt-4 pt-4 border-t border-outline/10 flex items-center gap-4">
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-1.5 text-outline-variant hover:text-white rounded-lg hover:bg-outline/10 transition-colors"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      id="play-pause-video-btn"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => goToChapter(0)}
                      className="p-1.5 text-outline-variant hover:text-white rounded-lg hover:bg-outline/10 transition-colors"
                      aria-label="Restart"
                      id="replay-video-btn"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 h-1.5 bg-outline/20 rounded-full overflow-hidden">
                    <div
                      className="h-full cta-accent transition-all duration-150"
                      style={{ width: `${((tick % TOTAL_TICKS) / TOTAL_TICKS) * 100}%` }}
                    />
                  </div>

                  <span className="hidden sm:inline text-[11px] text-outline-variant shrink-0" style={JAKARTA_FONT}>
                    Illustration, not a recording
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
