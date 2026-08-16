import { useEffect, useMemo, useState } from 'react'

import {
  deleteBoundaryPoint,
  deletePhoto,
  deleteProject,
  getBoundaryPointsByProjectId,
  getPhotosByBoundaryPointId,
  getProjects,
  saveBoundaryPoint,
  savePhoto,
  saveProject,
} from '../db'
import type { BoundaryPhoto, BoundaryPoint, SurveyProject } from '../types'
import ActionButton from './ActionButton'
import PhotoViewer from './PhotoViewer'
import { calculateProgress, type SurveyProgress } from './progress'

type Screen =
  | 'projectList'
  | 'projectEdit'
  | 'projectDetail'
  | 'boundaryEdit'
  | 'boundaryDetail'

const PHOTO_CATEGORIES = [
  '全景',
  '境界標アップ',
  '接面道路',
  '周辺状況',
  '図面・資料',
  'その他',
] as const

const todayLocal = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const createProject = (): SurveyProject => {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    location: '',
    lotNumber: '',
    surveyDate: todayLocal(),
    landCategory: '',
    boundaryChecked: false,
    memo: '',
    createdAt: now,
    updatedAt: now,
  }
}

const createBoundaryPoint = (
  projectId: string,
  number: number
): BoundaryPoint => {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    projectId,
    name: `P${number}`,
    markerType: '',
    condition: '',
    positionMemo: '',
    memo: '',
    createdAt: now,
    updatedAt: now,
  }
}

function PhotoThumbnail({
  photo,
  index,
  onOpen,
}: {
  photo: BoundaryPhoto
  index: number
  onOpen: (index: number) => void
}) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const next = URL.createObjectURL(photo.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [photo.blob])

  return (
    <ActionButton className="photo-thumb" onPress={() => onOpen(index)}>
      {url ? <img src={url} alt={photo.fileName} /> : <span>読込中</span>}
    </ActionButton>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('projectList')
  const [projects, setProjects] = useState<SurveyProject[]>([])
  const [projectProgress, setProjectProgress] = useState<
    Record<string, SurveyProgress>
  >({})
  const [selectedProject, setSelectedProject] = useState<SurveyProject | null>(
    null
  )
  const [editingProject, setEditingProject] = useState<SurveyProject | null>(
    null
  )
  const [boundaryPoints, setBoundaryPoints] = useState<BoundaryPoint[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [selectedBoundaryPoint, setSelectedBoundaryPoint] =
    useState<BoundaryPoint | null>(null)
  const [editingBoundaryPoint, setEditingBoundaryPoint] =
    useState<BoundaryPoint | null>(null)
  const [photos, setPhotos] = useState<BoundaryPhoto[]>([])
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null
  )
  const [selectedPhotoCategory, setSelectedPhotoCategory] = useState<string>(
    '境界標アップ'
  )
  const [capturedPhotoIds, setCapturedPhotoIds] = useState<Set<string>>(
    () => new Set()
  )
  const [locationLoading, setLocationLoading] = useState(false)

  const loadProjectProgress = async (project: SurveyProject) => {
    const points = await getBoundaryPointsByProjectId(project.id)
    const counts: Record<string, number> = {}
    for (const point of points) {
      counts[point.id] = (await getPhotosByBoundaryPointId(point.id)).length
    }
    return calculateProgress(project, points, counts)
  }

  const refreshProjects = async () => {
    const list = await getProjects()
    setProjects(list)

    const entries = await Promise.all(
      list.map(async (project) => [project.id, await loadProjectProgress(project)] as const)
    )
    setProjectProgress(Object.fromEntries(entries))
  }

  const refreshBoundaryPoints = async (project: SurveyProject) => {
    const points = await getBoundaryPointsByProjectId(project.id)
    const counts: Record<string, number> = {}

    for (const point of points) {
      counts[point.id] = (await getPhotosByBoundaryPointId(point.id)).length
    }

    setBoundaryPoints(points)
    setPhotoCounts(counts)
    setProjectProgress((current) => ({
      ...current,
      [project.id]: calculateProgress(project, points, counts),
    }))
  }

  const refreshPhotos = async (pointId: string) => {
    setPhotos(await getPhotosByBoundaryPointId(pointId))
  }

  useEffect(() => {
    void refreshProjects()
  }, [])

  const selectedProgress = useMemo(() => {
    if (!selectedProject) return null
    return (
      projectProgress[selectedProject.id] ??
      calculateProgress(selectedProject, boundaryPoints, photoCounts)
    )
  }, [selectedProject, projectProgress, boundaryPoints, photoCounts])

  const startNewProject = () => {
    setSelectedProject(null)
    setEditingProject(createProject())
    setScreen('projectEdit')
  }

  const saveEditingProject = async () => {
    if (!editingProject) return
    if (!editingProject.title.trim()) {
      window.alert('案件名を入力してください')
      return
    }

    const next: SurveyProject = {
      ...editingProject,
      title: editingProject.title.trim(),
      updatedAt: new Date().toISOString(),
    }
    await saveProject(next)
    setEditingProject(null)
    await refreshProjects()

    if (selectedProject?.id === next.id) {
      setSelectedProject(next)
      await refreshBoundaryPoints(next)
      setScreen('projectDetail')
    } else {
      setScreen('projectList')
    }
  }

  const openProject = async (project: SurveyProject) => {
    setSelectedProject(project)
    await refreshBoundaryPoints(project)
    setScreen('projectDetail')
  }

  const removeProject = async (project: SurveyProject) => {
    if (
      !window.confirm(
        `「${project.title}」を削除しますか？\n境界点と写真も削除されます。`
      )
    ) {
      return
    }
    await deleteProject(project.id)
    await refreshProjects()
  }

  const startNewBoundaryPoint = () => {
    if (!selectedProject) return
    setEditingBoundaryPoint(
      createBoundaryPoint(selectedProject.id, boundaryPoints.length + 1)
    )
    setScreen('boundaryEdit')
  }

  const saveEditingBoundaryPoint = async () => {
    if (!editingBoundaryPoint || !selectedProject) return
    if (!editingBoundaryPoint.name.trim()) {
      window.alert('境界点名を入力してください')
      return
    }

    const next: BoundaryPoint = {
      ...editingBoundaryPoint,
      name: editingBoundaryPoint.name.trim(),
      positionMemo: editingBoundaryPoint.positionMemo ?? '',
      updatedAt: new Date().toISOString(),
    }
    await saveBoundaryPoint(next)
    setEditingBoundaryPoint(null)
    await refreshBoundaryPoints(selectedProject)

    if (selectedBoundaryPoint?.id === next.id) {
      setSelectedBoundaryPoint(next)
      setScreen('boundaryDetail')
    } else {
      setScreen('projectDetail')
    }
  }

  const openBoundaryPoint = async (point: BoundaryPoint) => {
    const normalized = { ...point, positionMemo: point.positionMemo ?? '' }
    setSelectedBoundaryPoint(normalized)
    await refreshPhotos(point.id)
    setScreen('boundaryDetail')
  }

  const removeBoundaryPoint = async (point: BoundaryPoint) => {
    if (!selectedProject) return
    if (!window.confirm(`「${point.name}」を削除しますか？\n写真も削除されます。`)) {
      return
    }
    await deleteBoundaryPoint(point.id)
    await refreshBoundaryPoints(selectedProject)
  }

  const saveFiles = async (files: File[], source: 'camera' | 'library') => {
    if (!selectedProject || !selectedBoundaryPoint || files.length === 0) return

    const saved: BoundaryPhoto[] = []
    const failed: string[] = []
    const baseTime = Date.now()

    for (const [index, file] of files.entries()) {
      const photo: BoundaryPhoto = {
        id: crypto.randomUUID(),
        projectId: selectedProject.id,
        boundaryPointId: selectedBoundaryPoint.id,
        category: selectedPhotoCategory,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        blob: file,
        createdAt: new Date(baseTime + index).toISOString(),
      }

      try {
        await savePhoto(photo)
        saved.push(photo)
      } catch {
        failed.push(file.name)
      }
    }

    if (source === 'camera' && saved.length > 0) {
      setCapturedPhotoIds((current) => {
        const next = new Set(current)
        saved.forEach((photo) => next.add(photo.id))
        return next
      })
    }

    await refreshPhotos(selectedBoundaryPoint.id)
    await refreshBoundaryPoints(selectedProject)

    if (failed.length > 0) {
      window.alert(`${failed.length}枚の写真を保存できませんでした。`)
    }
  }

  const handleFileInput = (
    input: HTMLInputElement,
    source: 'camera' | 'library'
  ) => {
    // ネイティブpickerのFileListを同期的に通常配列へ退避してからinputを空にする。
    // 非同期IndexedDB保存中にinput要素の状態へ依存しない。
    const files = Array.from(input.files ?? [])
    input.value = ''
    void saveFiles(files, source)
  }

  const removePhoto = async (photo: BoundaryPhoto) => {
    if (!selectedProject || !selectedBoundaryPoint) return
    if (!window.confirm('この写真を削除しますか？')) return

    await deletePhoto(photo.id)
    setCapturedPhotoIds((current) => {
      const next = new Set(current)
      next.delete(photo.id)
      return next
    })
    await refreshPhotos(selectedBoundaryPoint.id)
    await refreshBoundaryPoints(selectedProject)
  }

  const changePhotoCategory = async (photo: BoundaryPhoto, category: string) => {
    if (!selectedBoundaryPoint) return
    await savePhoto({ ...photo, category })
    await refreshPhotos(selectedBoundaryPoint.id)
  }

  const savePhotoToDevice = async (photo: BoundaryPhoto) => {
    const file = new File([photo.blob], photo.fileName, {
      type: photo.fileType || photo.blob.type || 'image/jpeg',
    })

    try {
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: photo.fileName })
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }

    const url = URL.createObjectURL(photo.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = photo.fileName
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const captureLocation = () => {
    if (!selectedProject) return
    if (!navigator.geolocation) {
      window.alert('この端末では位置情報を利用できません。')
      return
    }

    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next: SurveyProject = {
          ...selectedProject,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          locationCapturedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        try {
          await saveProject(next)
          setSelectedProject(next)
          await refreshProjects()
          await refreshBoundaryPoints(next)
        } finally {
          setLocationLoading(false)
        }
      },
      (error) => {
        setLocationLoading(false)
        if (error.code === error.PERMISSION_DENIED) {
          window.alert('位置情報の利用が許可されていません。')
        } else if (error.code === error.TIMEOUT) {
          window.alert('現在地の取得がタイムアウトしました。')
        } else {
          window.alert('現在地を取得できませんでした。')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  if (screen === 'projectEdit' && editingProject) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <ActionButton
            className="icon-button"
            aria-label="戻る"
            onPress={() => setScreen(selectedProject ? 'projectDetail' : 'projectList')}
          >
            ←
          </ActionButton>
          <h1>案件編集</h1>
        </header>

        <main className="page form-page">
          <label className="field">
            <span>案件名</span>
            <input
              value={editingProject.title}
              onChange={(event) =>
                setEditingProject({ ...editingProject, title: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>所在</span>
            <input
              value={editingProject.location}
              onChange={(event) =>
                setEditingProject({ ...editingProject, location: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>地番</span>
            <input
              value={editingProject.lotNumber}
              onChange={(event) =>
                setEditingProject({ ...editingProject, lotNumber: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>調査日</span>
            <input
              type="date"
              value={editingProject.surveyDate}
              onChange={(event) =>
                setEditingProject({ ...editingProject, surveyDate: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>現況地目</span>
            <select
              value={editingProject.landCategory}
              onChange={(event) =>
                setEditingProject({
                  ...editingProject,
                  landCategory: event.target.value,
                })
              }
            >
              <option value="">選択してください</option>
              <option>宅地</option>
              <option>田</option>
              <option>畑</option>
              <option>山林</option>
              <option>雑種地</option>
              <option>道路</option>
              <option>その他</option>
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={editingProject.boundaryChecked}
              onChange={(event) =>
                setEditingProject({
                  ...editingProject,
                  boundaryChecked: event.target.checked,
                })
              }
            />
            <span>境界標確認済み</span>
          </label>
          <label className="field">
            <span>現地メモ</span>
            <textarea
              rows={5}
              value={editingProject.memo}
              onChange={(event) =>
                setEditingProject({ ...editingProject, memo: event.target.value })
              }
            />
          </label>
          <ActionButton className="primary-button" onPress={saveEditingProject}>
            保存
          </ActionButton>
        </main>
      </div>
    )
  }

  if (screen === 'boundaryEdit' && editingBoundaryPoint) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <ActionButton
            className="icon-button"
            aria-label="戻る"
            onPress={() =>
              setScreen(
                selectedBoundaryPoint?.id === editingBoundaryPoint.id
                  ? 'boundaryDetail'
                  : 'projectDetail'
              )
            }
          >
            ←
          </ActionButton>
          <h1>境界点編集</h1>
        </header>

        <main className="page form-page">
          <label className="field">
            <span>境界点名</span>
            <input
              value={editingBoundaryPoint.name}
              onChange={(event) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  name: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>境界標の種類</span>
            <select
              value={editingBoundaryPoint.markerType}
              onChange={(event) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  markerType: event.target.value,
                })
              }
            >
              <option value="">選択してください</option>
              <option>コンクリート杭</option>
              <option>金属標</option>
              <option>金属鋲</option>
              <option>プラスチック杭</option>
              <option>刻印</option>
              <option>境界標なし</option>
              <option>その他</option>
            </select>
          </label>
          <label className="field">
            <span>状態</span>
            <select
              value={editingBoundaryPoint.condition}
              onChange={(event) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  condition: event.target.value,
                })
              }
            >
              <option value="">選択してください</option>
              <option>良好</option>
              <option>傾きあり</option>
              <option>摩耗あり</option>
              <option>破損</option>
              <option>不明</option>
            </select>
          </label>
          <label className="field">
            <span>位置関係メモ</span>
            <input
              value={editingBoundaryPoint.positionMemo ?? ''}
              placeholder="例：北西角・道路側"
              onChange={(event) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  positionMemo: event.target.value,
                })
              }
            />
          </label>
          <label className="field">
            <span>メモ</span>
            <textarea
              rows={5}
              value={editingBoundaryPoint.memo}
              onChange={(event) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  memo: event.target.value,
                })
              }
            />
          </label>
          <ActionButton
            className="primary-button"
            onPress={saveEditingBoundaryPoint}
          >
            保存
          </ActionButton>
        </main>
      </div>
    )
  }

  if (screen === 'boundaryDetail' && selectedBoundaryPoint) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <ActionButton
            className="icon-button"
            aria-label="戻る"
            onPress={() => {
              setSelectedPhotoIndex(null)
              setSelectedBoundaryPoint(null)
              setPhotos([])
              setScreen('projectDetail')
            }}
          >
            ←
          </ActionButton>
          <h1>{selectedBoundaryPoint.name}</h1>
        </header>

        <main className="page">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>{selectedBoundaryPoint.name}</h2>
                <p>{selectedBoundaryPoint.markerType || '境界標未入力'}</p>
              </div>
              <ActionButton
                className="secondary-button"
                onPress={() => {
                  setEditingBoundaryPoint({ ...selectedBoundaryPoint })
                  setScreen('boundaryEdit')
                }}
              >
                編集
              </ActionButton>
            </div>
            <div className="info-grid">
              <div><span>種類</span><strong>{selectedBoundaryPoint.markerType || '未入力'}</strong></div>
              <div><span>状態</span><strong>{selectedBoundaryPoint.condition || '未入力'}</strong></div>
              <div><span>位置</span><strong>{selectedBoundaryPoint.positionMemo || '未入力'}</strong></div>
            </div>
            {selectedBoundaryPoint.memo && <p className="memo-box">{selectedBoundaryPoint.memo}</p>}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>写真</h2>
              <span className="count-badge">{photos.length}枚</span>
            </div>

            <div className="chip-row">
              {PHOTO_CATEGORIES.map((category) => (
                <ActionButton
                  key={category}
                  className={selectedPhotoCategory === category ? 'chip active' : 'chip'}
                  onPress={() => setSelectedPhotoCategory(category)}
                >
                  {category}
                </ActionButton>
              ))}
            </div>

            <div className="photo-actions">
              <label className="native-file-button">
                <span>📷 撮影</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handleFileInput(event.currentTarget, 'camera')}
                />
              </label>
              <label className="native-file-button secondary-file">
                <span>🖼 写真から選択</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => handleFileInput(event.currentTarget, 'library')}
                />
              </label>
            </div>

            {photos.length === 0 ? (
              <div className="empty-state">写真がありません</div>
            ) : (
              <div className="photo-grid">
                {photos.map((photo, index) => (
                  <article className="photo-card" key={photo.id}>
                    <PhotoThumbnail
                      photo={photo}
                      index={index}
                      onOpen={setSelectedPhotoIndex}
                    />
                    <select
                      value={photo.category ?? ''}
                      onChange={(event) =>
                        void changePhotoCategory(photo, event.target.value)
                      }
                    >
                      <option value="">未分類</option>
                      {PHOTO_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <div className="photo-card-actions">
                      {capturedPhotoIds.has(photo.id) && (
                        <ActionButton
                          className="text-button"
                          onPress={() => void savePhotoToDevice(photo)}
                        >
                          端末にも保存
                        </ActionButton>
                      )}
                      <ActionButton
                        className="danger-text-button"
                        onPress={() => void removePhoto(photo)}
                      >
                        削除
                      </ActionButton>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        {selectedPhotoIndex !== null && (
          <PhotoViewer
            photos={photos}
            activeIndex={selectedPhotoIndex}
            onClose={() => setSelectedPhotoIndex(null)}
            onIndexChange={setSelectedPhotoIndex}
          />
        )}
      </div>
    )
  }

  if (screen === 'projectDetail' && selectedProject && selectedProgress) {
    const hasLocation =
      selectedProject.latitude !== undefined &&
      selectedProject.longitude !== undefined

    return (
      <div className="app-shell">
        <header className="topbar">
          <ActionButton
            className="icon-button"
            aria-label="戻る"
            onPress={() => {
              setSelectedProject(null)
              setBoundaryPoints([])
              setScreen('projectList')
            }}
          >
            ←
          </ActionButton>
          <h1>案件詳細</h1>
        </header>

        <main className="page">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>{selectedProject.title}</h2>
                <p>{selectedProject.location || '所在地未入力'}</p>
              </div>
              <ActionButton
                className="secondary-button"
                onPress={() => {
                  setEditingProject({ ...selectedProject })
                  setScreen('projectEdit')
                }}
              >
                編集
              </ActionButton>
            </div>
            <div className="info-grid">
              <div><span>地番</span><strong>{selectedProject.lotNumber || '未入力'}</strong></div>
              <div><span>調査日</span><strong>{selectedProject.surveyDate || '未入力'}</strong></div>
              <div><span>現況地目</span><strong>{selectedProject.landCategory || '未入力'}</strong></div>
              <div><span>境界標確認</span><strong>{selectedProject.boundaryChecked ? '確認済み' : '未確認'}</strong></div>
            </div>
            {selectedProject.memo && <p className="memo-box">{selectedProject.memo}</p>}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>調査進捗</h2>
              <strong>{selectedProgress.percentage}%</strong>
            </div>
            <div className="progress-track"><div style={{ width: `${selectedProgress.percentage}%` }} /></div>
            <ul className="check-list">
              {selectedProgress.items.map((item) => (
                <li key={item.key} className={item.complete ? 'done' : ''}>
                  <span>{item.complete ? '✓' : '!'}</span>{item.label}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="section-heading"><h2>現場位置</h2></div>
            {hasLocation ? (
              <>
                <div className="info-grid">
                  <div><span>緯度</span><strong>{selectedProject.latitude?.toFixed(6)}</strong></div>
                  <div><span>経度</span><strong>{selectedProject.longitude?.toFixed(6)}</strong></div>
                </div>
                <div className="button-row">
                  <ActionButton className="secondary-button" disabled={locationLoading} onPress={captureLocation}>
                    {locationLoading ? '取得中...' : '📍 再取得'}
                  </ActionButton>
                  <ActionButton
                    className="secondary-button"
                    onPress={() =>
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${selectedProject.latitude},${selectedProject.longitude}`,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    Googleマップ
                  </ActionButton>
                </div>
              </>
            ) : (
              <ActionButton className="primary-button" disabled={locationLoading} onPress={captureLocation}>
                {locationLoading ? '現在地を取得中...' : '📍 現場位置を取得'}
              </ActionButton>
            )}
          </section>

          <section className="card">
            <div className="section-heading">
              <div><h2>境界点</h2><p>{boundaryPoints.length}点</p></div>
              <ActionButton className="secondary-button" onPress={startNewBoundaryPoint}>＋ 追加</ActionButton>
            </div>
            {boundaryPoints.length === 0 ? (
              <div className="empty-state">境界点がありません</div>
            ) : (
              <div className="list-stack">
                {boundaryPoints.map((point) => (
                  <article className="list-card" key={point.id}>
                    <ActionButton className="list-main" onPress={() => void openBoundaryPoint(point)}>
                      <strong>{point.name}</strong>
                      <span>種類：{point.markerType || '未入力'}</span>
                      <span>状態：{point.condition || '未入力'}</span>
                      <span>写真：{photoCounts[point.id] ?? 0}枚</span>
                    </ActionButton>
                    <ActionButton className="danger-button" onPress={() => void removeBoundaryPoint(point)}>
                      削除
                    </ActionButton>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>

        <ActionButton className="fab" aria-label="境界点を追加" onPress={startNewBoundaryPoint}>＋</ActionButton>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar"><h1>現場調査</h1></header>
      <main className="page">
        {projects.length === 0 ? (
          <div className="empty-state large">案件がありません<br /><small>右下の＋から登録してください</small></div>
        ) : (
          <div className="list-stack">
            {projects.map((project) => (
              <article className="list-card" key={project.id}>
                <ActionButton className="list-main" onPress={() => void openProject(project)}>
                  <strong>{project.title}</strong>
                  <span>{project.location || '所在地未入力'}</span>
                  <span>地番：{project.lotNumber || '未入力'}</span>
                  <span>調査日：{project.surveyDate || '未入力'}</span>
                  <span>進捗：{projectProgress[project.id]?.percentage ?? 0}%</span>
                </ActionButton>
                <ActionButton className="danger-button" onPress={() => void removeProject(project)}>
                  削除
                </ActionButton>
              </article>
            ))}
          </div>
        )}
      </main>
      <ActionButton className="fab" aria-label="案件を追加" onPress={startNewProject}>＋</ActionButton>
    </div>
  )
}
