import { useEffect, useRef } from 'react'
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

export default function PhotoViewer({ photos, index, tagChoices, onClose, onIndexChange, onTagsChange }: Props) {
  const callbacksRef = useRef({ onClose, onIndexChange, onTagsChange })
  callbacksRef.current = { onClose, onIndexChange, onTagsChange }
  const photosRef = useRef(photos)
  photosRef.current = photos
  const tagChoicesRef = useRef(tagChoices)
  tagChoicesRef.current = tagChoices
  const initialIndexRef = useRef(index)
  const mediaKey = photos.map((photo) => `${photo.id}:${photo.createdAt}`).join('|')

  useEffect(() => {
    const sourcePhotos = photosRef.current
    const urls = sourcePhotos.map((photo) => URL.createObjectURL(photo.blob))
    const tagOverrides = new Map<string, string[]>()
    let viewer: PhotoSwipe | null = null
    let tagPanel: HTMLElement | null = null
    let tagPanelOpen = false
    let disposed = false

    const getCurrentPhoto = () => {
      if (!viewer) return null
      return photosRef.current[viewer.currIndex] ?? null
    }

    const getPhotoTags = (photo: BoundaryPhoto) => tagOverrides.get(photo.id) ?? photo.tags ?? []

    const setTags = (photo: BoundaryPhoto, tags: string[]) => {
      const nextTags = uniqueTags(tags)
      tagOverrides.set(photo.id, nextTags)
      renderTagPanel()
      void callbacksRef.current.onTagsChange(photo, nextTags)
    }

    const renderTagPanel = () => {
      if (!tagPanel || !tagPanelOpen) return
      const photo = getCurrentPhoto()
      tagPanel.replaceChildren()
      if (!photo) return

      const tags = getPhotoTags(photo)
      const choices = uniqueTags([...tagChoicesRef.current, ...tags]).slice(0, 18)

      const head = document.createElement('div')
      head.className = 'pswp-tag-head'
      const titleWrap = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = '写真タグ'
      const sub = document.createElement('small')
      sub.textContent = `${viewer!.currIndex + 1} / ${photosRef.current.length}　${photo.fileName}`
      titleWrap.append(title, sub)
      const closeButton = document.createElement('button')
      closeButton.type = 'button'
      closeButton.className = 'pswp-tag-close'
      closeButton.setAttribute('aria-label', 'タグ編集を閉じる')
      closeButton.textContent = '×'
      closeButton.addEventListener('click', (event) => {
        event.stopPropagation()
        tagPanelOpen = false
        if (tagPanel) tagPanel.hidden = true
      })
      head.append(titleWrap, closeButton)

      const currentLabel = document.createElement('div')
      currentLabel.className = 'pswp-tag-section-label'
      currentLabel.textContent = '現在'
      const current = document.createElement('div')
      current.className = 'pswp-tag-current'
      if (tags.length === 0) {
        const empty = document.createElement('span')
        empty.className = 'pswp-tag-empty'
        empty.textContent = 'タグなし'
        current.append(empty)
      } else {
        tags.forEach((tag) => {
          const chip = document.createElement('span')
          chip.className = 'pswp-tag-current-chip'
          chip.textContent = `✓ ${tag}`
          current.append(chip)
        })
      }

      const choiceLabel = document.createElement('div')
      choiceLabel.className = 'pswp-tag-section-label'
      choiceLabel.textContent = 'タグ候補'
      const choiceWrap = document.createElement('div')
      choiceWrap.className = 'pswp-tag-choices'
      choices.forEach((tag) => {
        const button = document.createElement('button')
        button.type = 'button'
        const selected = tags.includes(tag)
        button.className = selected ? 'pswp-tag-choice selected' : 'pswp-tag-choice'
        button.textContent = selected ? `✓ ${tag}` : tag
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          const currentTags = getPhotoTags(photo)
          setTags(photo, currentTags.includes(tag)
            ? currentTags.filter((value) => value !== tag)
            : [...currentTags, tag])
        })
        choiceWrap.append(button)
      })

      const addRow = document.createElement('div')
      addRow.className = 'pswp-tag-add-row'
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = '新しいタグを追加'
      input.setAttribute('aria-label', '写真タグを追加')
      const addButton = document.createElement('button')
      addButton.type = 'button'
      addButton.textContent = '追加'
      const addTag = () => {
        const tag = normalizeTag(input.value)
        if (!tag) return
        setTags(photo, [...getPhotoTags(photo), tag])
      }
      addButton.addEventListener('click', (event) => {
        event.stopPropagation()
        addTag()
      })
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        addTag()
      })
      addRow.append(input, addButton)

      tagPanel.append(head, currentLabel, current, choiceLabel, choiceWrap, addRow)
    }

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
        if (!viewer) return
        viewer.ui.registerElement({
          name: 'photo-tags',
          order: 9,
          isButton: true,
          ariaLabel: '写真タグを編集',
          html: '🏷',
          onClick: (event) => {
            event.stopPropagation()
            tagPanelOpen = !tagPanelOpen
            if (tagPanel) {
              tagPanel.hidden = !tagPanelOpen
              if (tagPanelOpen) renderTagPanel()
            }
          },
        })
        viewer.ui.registerElement({
          name: 'photo-tag-panel',
          className: 'pswp__photo-tag-panel',
          appendTo: 'root',
          onInit: (element) => {
            tagPanel = element
            tagPanel.hidden = true
            element.addEventListener('pointerdown', (event) => event.stopPropagation())
            element.addEventListener('click', (event) => event.stopPropagation())
          },
        })
      })

      viewer.on('change', () => {
        if (!viewer) return
        callbacksRef.current.onIndexChange(viewer.currIndex)
        if (tagPanelOpen) renderTagPanel()
      })

      viewer.on('destroy', () => {
        if (!disposed) callbacksRef.current.onClose()
      })

      viewer.init()
    })

    return () => {
      disposed = true
      viewer?.destroy()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [mediaKey])

  return null
}
