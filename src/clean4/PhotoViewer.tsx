import { useEffect, useRef, useState } from 'react'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
import type { BoundaryPhoto } from '../types'

type Props = {
  photos: BoundaryPhoto[]
  index: number
  tagChoices: string[]
  onClose: () => void
  onIndexChange: (index: number) => void
  onTagsChange: (photo: BoundaryPhoto, tags: string[]) => Promise<void>
}

const normalizeTag = (value: string) => value.trim().replace(/\s+/g, ' ')
const uniqueTags = (values: string[]) => Array.from(new Set(values.map(normalizeTag).filter(Boolean)))

const readImageSize = (src: string) => new Promise<{ width: number; height: number }>((resolve) => {
  const image = new Image()
  image.onload = () => resolve({
    width: Math.max(1, image.naturalWidth),
    height: Math.max(1, image.naturalHeight),
  })
  image.onerror = () => resolve({ width: 1, height: 1 })
  image.src = src
})

type FullscreenTagEditorProps = {
  photo: BoundaryPhoto
  index: number
  total: number
  tagChoices: string[]
  onClose: () => void
  onTagsChange: (photo: BoundaryPhoto, tags: string[]) => Promise<void>
}

function FullscreenTagEditor({ photo, index, total, tagChoices, onClose, onTagsChange }: FullscreenTagEditorProps) {
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState<string[]>(photo.tags ?? [])
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    const nextUrl = URL.createObjectURL(photo.blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [photo.blob])

  const choices = uniqueTags([...tagChoices, ...tags]).slice(0, 18)

  const saveTags = (nextTags: string[]) => {
    const normalized = uniqueTags(nextTags)
    setTags(normalized)
    void onTagsChange(photo, normalized)
  }

  const addTag = () => {
    const tag = normalizeTag(newTag)
    if (!tag) return
    saveTags([...tags, tag])
    setNewTag('')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="写真タグ編集"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'grid',
        gridTemplateRows: '56px minmax(220px, 42vh) minmax(0, 1fr)',
        background: '#f5f6f8',
        color: '#222',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#fff', borderBottom: '1px solid #dde2e7' }}>
        <button type="button" onClick={onClose} aria-label="タグ編集を閉じる" style={{ width: 40, height: 40, border: 0, borderRadius: 20, fontSize: 24, background: '#eef1f4' }}>×</button>
        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 16 }}>写真タグ</strong>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#666' }}>{index + 1} / {total}　{photo.fileName}</span>
        </div>
      </header>

      <div style={{ display: 'grid', placeItems: 'center', minHeight: 0, padding: 10, background: '#050505' }}>
        {url && <img src={url} alt={photo.fileName} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />}
      </div>

      <section style={{ minHeight: 0, overflowY: 'auto', padding: '14px 14px calc(18px + env(safe-area-inset-bottom))', background: '#fff' }}>
        <div style={{ marginBottom: 7, fontSize: 12, fontWeight: 800, color: '#555' }}>現在</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
          {tags.length === 0 ? <span style={{ fontSize: 13, color: '#777' }}>タグなし</span> : tags.map((tag) => (
            <span key={tag} style={{ border: '1px solid #9cc4ee', borderRadius: 999, padding: '8px 10px', background: '#e8f2ff', color: '#1267b9', fontSize: 13, fontWeight: 700 }}>✓ {tag}</span>
          ))}
        </div>

        <div style={{ marginBottom: 7, fontSize: 12, fontWeight: 800, color: '#555' }}>タグ候補</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {choices.map((tag) => {
            const selected = tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => saveTags(selected ? tags.filter((value) => value !== tag) : [...tags, tag])}
                style={{
                  border: selected ? '1px solid #9cc4ee' : '1px solid #d3dce6',
                  borderRadius: 999,
                  padding: '9px 11px',
                  background: selected ? '#e8f2ff' : '#f7f8fa',
                  color: selected ? '#1267b9' : '#3f4c58',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {selected ? `✓ ${tag}` : tag}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginTop: 16 }}>
          <input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              addTag()
            }}
            placeholder="新しいタグを追加"
            aria-label="写真タグを追加"
            style={{ minWidth: 0, border: '1px solid #cfd6dd', borderRadius: 9, padding: 11, background: '#fff', color: '#222', fontSize: 16 }}
          />
          <button type="button" onClick={addTag} style={{ border: 0, borderRadius: 9, padding: '10px 14px', background: '#1976d2', color: '#fff', fontWeight: 700 }}>追加</button>
        </div>

        <button type="button" onClick={onClose} style={{ width: '100%', marginTop: 16, border: 0, borderRadius: 10, padding: '12px 14px', background: '#1976d2', color: '#fff', fontWeight: 800 }}>完了して戻る</button>
      </section>
    </div>
  )
}

export default function PhotoViewer({ photos, index, tagChoices, onClose, onIndexChange, onTagsChange }: Props) {
  const callbacksRef = useRef({ onClose, onIndexChange, onTagsChange })
  callbacksRef.current = { onClose, onIndexChange, onTagsChange }
  const photosRef = useRef(photos)
  photosRef.current = photos
  const initialIndexRef = useRef(index)
  const [editorIndex, setEditorIndex] = useState<number | null>(null)
  const mediaKey = photos.map((photo) => `${photo.id}:${photo.createdAt}`).join('|')

  useEffect(() => {
    const sourcePhotos = photosRef.current
    const urls = sourcePhotos.map((photo) => URL.createObjectURL(photo.blob))
    let viewer: PhotoSwipe | null = null
    let requestedTagIndex: number | null = null
    let disposed = false

    void Promise.all(
      urls.map(async (src, photoIndex) => ({
        src,
        ...(await readImageSize(src)),
        alt: sourcePhotos[photoIndex]?.fileName ?? '写真',
      })),
    ).then((dataSource) => {
      if (disposed || dataSource.length === 0) {
        if (!disposed) callbacksRef.current.onClose()
        return
      }

      viewer = new PhotoSwipe({
        dataSource,
        index: Math.min(initialIndexRef.current, dataSource.length - 1),
        close: true,
        zoom: true,
        counter: true,
        arrowPrev: true,
        arrowNext: true,
        closeOnVerticalDrag: true,
        allowPanToNext: false,
        doubleTapAction: 'zoom',
        wheelToZoom: true,
        escKey: true,
        arrowKeys: true,
        loop: false,
        bgOpacity: 1,
      })

      viewer.on('uiRegister', () => {
        if (!viewer?.ui) return
        viewer.ui.registerElement({
          name: 'photo-tags',
          order: 9,
          isButton: true,
          ariaLabel: '写真タグを編集',
          html: '🏷',
          onClick: (event) => {
            event.stopPropagation()
            if (!viewer) return
            requestedTagIndex = viewer.currIndex
            viewer.close()
          },
        })
      })

      viewer.on('change', () => {
        if (viewer) callbacksRef.current.onIndexChange(viewer.currIndex)
      })

      viewer.on('destroy', () => {
        if (disposed) return
        viewer = null
        if (requestedTagIndex !== null) {
          setEditorIndex(requestedTagIndex)
          return
        }
        callbacksRef.current.onClose()
      })

      viewer.init()
    })

    return () => {
      disposed = true
      viewer?.destroy()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [mediaKey])

  const editingPhoto = editorIndex === null ? null : photos[editorIndex] ?? null
  if (!editingPhoto || editorIndex === null) return null

  return (
    <FullscreenTagEditor
      photo={editingPhoto}
      index={editorIndex}
      total={photos.length}
      tagChoices={tagChoices}
      onClose={onClose}
      onTagsChange={onTagsChange}
    />
  )
}
