'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { X, CircleNotch } from '@phosphor-icons/react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { Video } from '@/types'
import { ConsentGate } from '@/components/ConsentGate'
import type { DialogProps } from '@/lib/component-contracts'

interface VideoModalProps extends DialogProps {
  video: Video | null
  /** Optional R2 placeholder image URL shown before consent is given. */
  placeholderUrl?: string
  /** Translated label for the YouTube consent gate button. */
  youtubeLabel?: string
}

export function VideoModal({ video, open, onClose, placeholderUrl, youtubeLabel }: VideoModalProps) {
  const prefersReducedMotion = useReducedMotion()
  const [iframeLoaded, setIframeLoaded] = useState(false)

  // Reset iframe-loaded flag each time a new video opens
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose()
      setIframeLoaded(false)
    }
  }

  if (!video) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-labelledby="video-modal-title" aria-describedby={undefined} className="max-w-full w-screen p-0 bg-background/95 backdrop-blur-xl border-accent/30 overflow-hidden max-h-[92vh] flex flex-col rounded-none sm:rounded-lg sm:max-w-[95vw] sm:w-[95vw]">
        <DialogTitle className="sr-only">{video?.title}</DialogTitle>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 40, stiffness: 400 }}
              className="relative"
            >
              <button
                onClick={onClose}
                aria-label="Close video"
                className="absolute top-4 right-4 z-50 rounded-full bg-background/80 backdrop-blur-sm p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-foreground hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110 border border-border"
              >
                <X size={20} weight="bold" aria-hidden="true" />
              </button>
              
              <div className="relative w-full aspect-video" style={{ maxHeight: 'min(92vh, calc(95vw * 0.5625))' }}>
                <div className="absolute inset-0">
                  <ConsentGate label={youtubeLabel ?? 'YouTube laden'} placeholderUrl={placeholderUrl}>
                    {/* Loading spinner shown while the iframe content is fetching */}
                    {!iframeLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10" aria-label="Video wird geladen" role="status">
                        <CircleNotch size={40} className="animate-spin text-accent" aria-hidden="true" />
                      </div>
                    )}
                    <iframe
                      className="w-full h-full rounded-t-lg"
                      src={`https://www.youtube.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
                      title={video.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      onLoad={() => setIframeLoaded(true)}
                    />
                  </ConsentGate>
                </div>
              </div>

              <motion.div
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
                className="p-6 bg-card/50 backdrop-blur-sm border-t border-border"
              >
                <h3 id="video-modal-title" className="text-2xl font-bold mb-2">{video.title}</h3>
                <p className="text-muted-foreground font-mono">{video.artistName}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
