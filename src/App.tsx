import { memo, useEffect, useLayoutEffect, useState } from 'react'
import type { ChangeEvent } from 'react'

import './App.css'
import PhotoViewer from './PhotoViewerV2'

import type {
  BoundaryPhoto,
  BoundaryPoint,
  SurveyProject,
} from './types'

import {
  calculateSurveyProgress,
} from './surveyValidation'
import type {
  SurveyProgress,
} from './surveyValidation'

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
} from './db'

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

type PhotoThumbnailProps = {
  photo: BoundaryPhoto
  index: number
  onOpen: (index: number) => void
}

const PhotoThumbnail = memo(function PhotoThumbnail({
  photo,
  index,
  onOpen,
}: PhotoThumbnailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    const nextImageUrl = URL.createObjectURL(photo.blob)
    setImageUrl(nextImageUrl)

    return () => URL.revokeObjectURL(nextImageUrl)
  }, [photo.blob])

  return (
    <button
      type="button"
      className="photo-image-button"
      aria-label={`${photo.fileName}を全画面で表示`}
      onClick={() => onOpen(index)}
    >
      <div className="photo-image-wrapper">
        {imageUrl ? (
          <img src={imageUrl} alt={photo.fileName} />
        ) : (
          <div className="photo-thumbnail-placeholder" aria-hidden="true" />
        )}

        <div className="photo-category-badge">
          {photo.category || '未分類'}
        </div>
      </div>
    </button>
  )
})

const createEmptyProject = (): SurveyProject => {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    title: '',
    location: '',
    lotNumber: '',
    surveyDate: new Date().toISOString().slice(0, 10),
    landCategory: '',
    boundaryChecked: false,
    memo: '',
    createdAt: now,
    updatedAt: now,
  }
}

const createEmptyBoundaryPoint = (
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

function App() {
  const [screen, setScreen] =
    useState<Screen>('projectList')

  const [projects, setProjects] =
    useState<SurveyProject[]>([])

  const [selectedProject, setSelectedProject] =
    useState<SurveyProject | null>(null)

  const [editingProject, setEditingProject] =
    useState<SurveyProject | null>(null)

  const [boundaryPoints, setBoundaryPoints] =
    useState<BoundaryPoint[]>([])

  const [
    selectedBoundaryPoint,
    setSelectedBoundaryPoint,
  ] = useState<BoundaryPoint | null>(null)

  const [
    editingBoundaryPoint,
    setEditingBoundaryPoint,
  ] = useState<BoundaryPoint | null>(null)

  const [photos, setPhotos] =
    useState<BoundaryPhoto[]>([])

  const [capturedPhotoIds, setCapturedPhotoIds] =
    useState<Set<string>>(() => new Set())

  const [selectedPhotoIndex, setSelectedPhotoIndex] =
    useState<number | null>(null)

  const [photoCounts, setPhotoCounts] =
    useState<Record<string, number>>({})

  const [projectProgress, setProjectProgress] =
    useState<Record<string, SurveyProgress>>({})

  const [locationLoading, setLocationLoading] =
    useState(false)

  // iOS Safari/PWA may preserve the previous SPA screen's scroll offset.
  // Reset only entry/edit forms, before the new screen is painted.
  useLayoutEffect(() => {
    if (screen !== 'projectEdit' && screen !== 'boundaryEdit') {
      return
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [screen])

  const loadProjects = async () => {
    const data = await getProjects()
    setProjects(data)

    const progressEntries = await Promise.all(
      data.map(async (project) => {
        const points =
          await getBoundaryPointsByProjectId(project.id)
        const counts: Record<string, number> = {}

        await Promise.all(
          points.map(async (point) => {
            const pointPhotos =
              await getPhotosByBoundaryPointId(point.id)
            counts[point.id] = pointPhotos.length
          })
        )

        return [
          project.id,
          calculateSurveyProgress(
            project,
            points,
            counts
          ),
        ] as const
      })
    )

    setProjectProgress(
      Object.fromEntries(progressEntries)
    )
  }

  const loadBoundaryPoints = async (
    projectId: string
  ) => {
    const data =
      await getBoundaryPointsByProjectId(projectId)

    setBoundaryPoints(data)

    const counts: Record<string, number> = {}

    for (const point of data) {
      const pointPhotos =
        await getPhotosByBoundaryPointId(point.id)

      counts[point.id] = pointPhotos.length
    }

    setPhotoCounts(counts)

    const project =
      projects.find((item) => item.id === projectId) ??
      (selectedProject?.id === projectId
        ? selectedProject
        : null)

    if (project) {
      setProjectProgress((current) => ({
        ...current,
        [projectId]: calculateSurveyProgress(
          project,
          data,
          counts
        ),
      }))
    }
  }

  const loadPhotos = async (
    boundaryPointId: string
  ) => {
    const data =
      await getPhotosByBoundaryPointId(
        boundaryPointId
      )

    setPhotos(data)
  }

  const [selectedPhotoCategory, setSelectedPhotoCategory] =
    useState('境界標アップ')

  useEffect(() => {
    loadProjects()
  }, [])

  /*
   * 案件
   */

  const handleNewProject = () => {
    setSelectedProject(null)
    setEditingProject(createEmptyProject())
    setScreen('projectEdit')
  }

  const handleEditProject = (
    project: SurveyProject
  ) => {
    setEditingProject({
      ...project,
    })

    setScreen('projectEdit')
  }

  const handleSaveProject = async () => {
    if (!editingProject) {
      return
    }

    if (!editingProject.title.trim()) {
      alert('案件名を入力してください')
      return
    }

    const projectToSave: SurveyProject = {
      ...editingProject,
      updatedAt: new Date().toISOString(),
    }

    await saveProject(projectToSave)

    await loadProjects()

    if (
      selectedProject?.id === projectToSave.id
    ) {
      setSelectedProject(projectToSave)
      setEditingProject(null)
      setScreen('projectDetail')
    } else {
      setEditingProject(null)
      setScreen('projectList')
    }
  }

  const handleDeleteProject = async (
    project: SurveyProject
  ) => {
    const ok = window.confirm(
      `「${project.title}」を削除しますか？\n境界点と写真も削除されます。`
    )

    if (!ok) {
      return
    }

    await deleteProject(project.id)
    await loadProjects()
  }

  const handleOpenProject = async (
    project: SurveyProject
  ) => {
    setSelectedProject(project)

    await loadBoundaryPoints(project.id)

    setScreen('projectDetail')
  }

  /*
   * 案件GPS
   */

  const handleCaptureProjectLocation = () => {
    if (!selectedProject) {
      return
    }

    if (!navigator.geolocation) {
      alert(
        'この端末では位置情報を利用できません。'
      )
      return
    }

    setLocationLoading(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const updatedProject: SurveyProject = {
          ...selectedProject,

          latitude:
            position.coords.latitude,

          longitude:
            position.coords.longitude,

          accuracy:
            position.coords.accuracy,

          locationCapturedAt:
            new Date().toISOString(),

          updatedAt:
            new Date().toISOString(),
        }

        try {
          await saveProject(updatedProject)

          setSelectedProject(
            updatedProject
          )

          await loadProjects()
        } finally {
          setLocationLoading(false)
        }
      },

      (error) => {
        setLocationLoading(false)

        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert(
              '位置情報の利用が許可されていません。\nブラウザのサイト設定から位置情報を許可してください。'
            )
            break

          case error.POSITION_UNAVAILABLE:
            alert(
              '現在地を取得できませんでした。'
            )
            break

          case error.TIMEOUT:
            alert(
              '現在地の取得がタイムアウトしました。'
            )
            break

          default:
            alert(
              '位置情報の取得に失敗しました。'
            )
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  const handleOpenGoogleMaps = () => {
    if (
      selectedProject?.latitude === undefined ||
      selectedProject?.longitude === undefined
    ) {
      return
    }

    const latitude =
      selectedProject.latitude

    const longitude =
      selectedProject.longitude

    const url =
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    )
  }

  /*
   * 境界点
   */

  const handleNewBoundaryPoint = () => {
    if (!selectedProject) {
      return
    }

    const point =
      createEmptyBoundaryPoint(
        selectedProject.id,
        boundaryPoints.length + 1
      )

    setEditingBoundaryPoint(point)

    setScreen('boundaryEdit')
  }

  const handleEditBoundaryPoint = (
    point: BoundaryPoint
  ) => {
    setEditingBoundaryPoint({
      ...point,

      // 古いデータでも壊れないように
      positionMemo:
        point.positionMemo ?? '',
    })

    setScreen('boundaryEdit')
  }

  const handleSaveBoundaryPoint =
    async () => {
      if (
        !editingBoundaryPoint ||
        !selectedProject
      ) {
        return
      }

      if (
        !editingBoundaryPoint.name.trim()
      ) {
        alert(
          '境界点名を入力してください'
        )

        return
      }

      const pointToSave: BoundaryPoint = {
        ...editingBoundaryPoint,

        positionMemo:
          editingBoundaryPoint.positionMemo ??
          '',

        updatedAt:
          new Date().toISOString(),
      }

      await saveBoundaryPoint(
        pointToSave
      )

      await loadBoundaryPoints(
        selectedProject.id
      )

      if (
        selectedBoundaryPoint?.id ===
        pointToSave.id
      ) {
        setSelectedBoundaryPoint(
          pointToSave
        )

        setEditingBoundaryPoint(null)

        setScreen(
          'boundaryDetail'
        )

        return
      }

      setEditingBoundaryPoint(null)

      setScreen('projectDetail')
    }

  const handleDeleteBoundaryPoint =
    async (point: BoundaryPoint) => {
      if (!selectedProject) {
        return
      }

      const ok = window.confirm(
        `「${point.name}」を削除しますか？\n写真も削除されます。`
      )

      if (!ok) {
        return
      }

      await deleteBoundaryPoint(
        point.id
      )

      await loadBoundaryPoints(
        selectedProject.id
      )
    }

  const handleOpenBoundaryPoint =
    async (point: BoundaryPoint) => {
      setSelectedBoundaryPoint({
        ...point,

        positionMemo:
          point.positionMemo ?? '',
      })

      await loadPhotos(point.id)

      setScreen('boundaryDetail')
    }

  /*
   * 写真
   */

  const saveSelectedPhotos = async (
    files: FileList
  ): Promise<BoundaryPhoto[]> => {
    if (
      !selectedProject ||
      !selectedBoundaryPoint
    ) {
      return []
    }

    const savedPhotos: BoundaryPhoto[] = []
    const failedFileNames: string[] = []
    const createdAt = Date.now()

    for (const [index, file] of Array.from(files).entries()) {
      const photo: BoundaryPhoto = {
        id: crypto.randomUUID(),

        projectId:
          selectedProject.id,

        boundaryPointId:
          selectedBoundaryPoint.id,

        category:
          selectedPhotoCategory,

        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,

        blob: file,

        createdAt: new Date(createdAt + index).toISOString(),
      }

      try {
        await savePhoto(photo)
        savedPhotos.push(photo)
      } catch {
        failedFileNames.push(file.name)
      }
    }

    await loadPhotos(
      selectedBoundaryPoint.id
    )

    await loadBoundaryPoints(
      selectedProject.id
    )

    if (failedFileNames.length > 0) {
      window.alert(
        `${failedFileNames.length}枚の写真を保存できませんでした。\n${failedFileNames.join('\n')}`
      )
    }

    return savedPhotos
  }

  const handlePhotoSelected = async (
    event: ChangeEvent<HTMLInputElement>,
    source: 'camera' | 'library'
  ) => {
    const input = event.currentTarget
    const files = input.files

    if (!files || files.length === 0) {
      input.value = ''
      return
    }

    try {
      const savedPhotos = await saveSelectedPhotos(files)

      if (source === 'camera' && savedPhotos.length > 0) {
        setCapturedPhotoIds((current) => {
          const next = new Set(current)
          savedPhotos.forEach((photo) => next.add(photo.id))
          return next
        })
      }
    } catch {
      window.alert('写真を保存できませんでした。もう一度お試しください。')
    } finally {
      input.value = ''
    }
  }

  const handleSavePhotoToDevice = async (
    photo: BoundaryPhoto
  ) => {
    const file = new File(
      [photo.blob],
      photo.fileName,
      { type: photo.fileType || photo.blob.type || 'image/jpeg' }
    )

    let canShareFile = false

    try {
      canShareFile =
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
    } catch {
      canShareFile = false
    }

    if (canShareFile) {
      try {
        await navigator.share({
          files: [file],
          title: photo.fileName,
        })
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          window.alert('端末への保存用共有を開始できませんでした。')
        }
      }

      return
    }

    let downloadUrl: string | null = null

    try {
      downloadUrl = URL.createObjectURL(photo.blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = photo.fileName
      link.click()
      link.remove()
    } catch {
      window.alert('このブラウザでは端末への保存を開始できませんでした。')
    } finally {
      if (downloadUrl) {
        const urlToRevoke = downloadUrl
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 0)
      }
    }
  }

  const handleDeletePhoto = async (
    photo: BoundaryPhoto
  ) => {
    if (
      !selectedBoundaryPoint ||
      !selectedProject
    ) {
      return false
    }

    const ok = window.confirm(
      'この写真を削除しますか？'
    )

    if (!ok) {
      return false
    }

    await deletePhoto(photo.id)

    setCapturedPhotoIds((current) => {
      const next = new Set(current)
      next.delete(photo.id)
      return next
    })

    await loadPhotos(
      selectedBoundaryPoint.id
    )

    await loadBoundaryPoints(
      selectedProject.id
    )

    return true
  }

  const handleChangePhotoCategory = async (
    photo: BoundaryPhoto,
    category: string
  ) => {
    const updatedPhoto: BoundaryPhoto = {
      ...photo,
      category,
    }

    await savePhoto(updatedPhoto)

    if (selectedBoundaryPoint) {
      await loadPhotos(
        selectedBoundaryPoint.id
      )
    }
  }

  /*
   * 案件編集
   */

  if (
    screen === 'projectEdit' &&
    editingProject
  ) {
    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => {
              if (selectedProject) {
                setScreen(
                  'projectDetail'
                )
              } else {
                setScreen(
                  'projectList'
                )
              }
            }}
          >
            ←
          </button>

          <h1>案件編集</h1>
        </header>

        <main className="form-container">
          <label>
            案件名
            <input
              type="text"
              value={
                editingProject.title
              }
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  title:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            所在
            <input
              type="text"
              value={
                editingProject.location
              }
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  location:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            地番
            <input
              type="text"
              value={
                editingProject.lotNumber
              }
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  lotNumber:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            調査日
            <input
              type="date"
              value={
                editingProject.surveyDate
              }
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  surveyDate:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            現況地目
            <select
              value={
                editingProject.landCategory
              }
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  landCategory:
                    e.target.value,
                })
              }
            >
              <option value="">
                選択してください
              </option>

              <option value="宅地">
                宅地
              </option>

              <option value="田">
                田
              </option>

              <option value="畑">
                畑
              </option>

              <option value="山林">
                山林
              </option>

              <option value="雑種地">
                雑種地
              </option>

              <option value="道路">
                道路
              </option>

              <option value="その他">
                その他
              </option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={
                editingProject.boundaryChecked
              }
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  boundaryChecked:
                    e.target.checked,
                })
              }
            />

            境界標確認済み
          </label>

          <label>
            現地メモ
            <textarea
              value={
                editingProject.memo
              }
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  memo:
                    e.target.value,
                })
              }
              rows={6}
            />
          </label>

          <button
            className="save-button"
            onClick={
              handleSaveProject
            }
          >
            保存
          </button>
        </main>
      </div>
    )
  }

  /*
   * 境界点編集
   */

  if (
    screen === 'boundaryEdit' &&
    editingBoundaryPoint
  ) {
    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => {
              if (
                selectedBoundaryPoint?.id ===
                editingBoundaryPoint.id
              ) {
                setScreen(
                  'boundaryDetail'
                )
              } else {
                setScreen(
                  'projectDetail'
                )
              }
            }}
          >
            ←
          </button>

          <h1>境界点編集</h1>
        </header>

        <main className="form-container">
          <label>
            境界点名
            <input
              type="text"
              value={
                editingBoundaryPoint.name
              }
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  name:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            境界標の種類
            <select
              value={
                editingBoundaryPoint
                  .markerType
              }
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  markerType:
                    e.target.value,
                })
              }
            >
              <option value="">
                選択してください
              </option>

              <option value="コンクリート杭">
                コンクリート杭
              </option>

              <option value="金属標">
                金属標
              </option>

              <option value="金属鋲">
                金属鋲
              </option>

              <option value="プラスチック杭">
                プラスチック杭
              </option>

              <option value="刻印">
                刻印
              </option>

              <option value="境界標なし">
                境界標なし
              </option>

              <option value="その他">
                その他
              </option>
            </select>
          </label>

          <label>
            状態
            <select
              value={
                editingBoundaryPoint
                  .condition
              }
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  condition:
                    e.target.value,
                })
              }
            >
              <option value="">
                選択してください
              </option>

              <option value="良好">
                良好
              </option>

              <option value="傾きあり">
                傾きあり
              </option>

              <option value="摩耗あり">
                摩耗あり
              </option>

              <option value="破損">
                破損
              </option>

              <option value="不明">
                不明
              </option>
            </select>
          </label>

          <label>
            位置関係メモ
            <input
              type="text"
              value={
                editingBoundaryPoint
                  .positionMemo ?? ''
              }
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  positionMemo:
                    e.target.value,
                })
              }
              placeholder="例：北西角・道路側・ブロック塀角付近"
            />
          </label>

          <label>
            メモ
            <textarea
              value={
                editingBoundaryPoint.memo
              }
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  memo:
                    e.target.value,
                })
              }
              rows={6}
            />
          </label>

          <button
            className="save-button"
            onClick={
              handleSaveBoundaryPoint
            }
          >
            保存
          </button>
        </main>
      </div>
    )
  }

  /*
   * 境界点詳細
   */

  if (
    screen === 'boundaryDetail' &&
    selectedBoundaryPoint
  ) {
    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => {
              setSelectedPhotoIndex(null)

              setSelectedBoundaryPoint(
                null
              )

              setPhotos([])

              setScreen(
                'projectDetail'
              )
            }}
          >
            ←
          </button>

          <h1>境界点詳細 {selectedBoundaryPoint.name}</h1>
        </header>

        <main className="project-container">
          <section className="detail-card">
            <div className="detail-header">
              <div>
                <h2>
                  {
                    selectedBoundaryPoint.name
                  }
                </h2>

                <p>
                  {selectedBoundaryPoint
                    .markerType ||
                    '境界標未入力'}
                </p>
              </div>

              <button
                className="small-button"
                onPointerUp={() =>
                  handleEditBoundaryPoint(
                    selectedBoundaryPoint
                  )
                }
              >
                編集
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">
                  種類
                </span>

                <strong>
                  {selectedBoundaryPoint
                    .markerType ||
                    '未入力'}
                </strong>
              </div>

              <div>
                <span className="detail-label">
                  状態
                </span>

                <strong>
                  {selectedBoundaryPoint
                    .condition ||
                    '未入力'}
                </strong>
              </div>
            </div>

            {selectedBoundaryPoint
              .positionMemo && (
                <div className="project-memo">
                  <span className="detail-label">
                    位置関係
                  </span>

                  <p>
                    {
                      selectedBoundaryPoint
                        .positionMemo
                    }
                  </p>
                </div>
              )}

            {selectedBoundaryPoint.memo && (
              <div className="project-memo">
                <span className="detail-label">
                  メモ
                </span>

                <p>
                  {
                    selectedBoundaryPoint.memo
                  }
                </p>
              </div>
            )}
          </section>

          <section className="photo-section">
            <div className="section-title-row">
              <div>
                <h2>写真</h2>

                <span className="count-text">
                  {photos.length}枚
                </span>
              </div>
            </div>

            <div className="photo-category-box">
              <div className="photo-category-title">
                追加する写真の種類
              </div>

              <div className="photo-category-chips">
                {PHOTO_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={
                      selectedPhotoCategory === category
                        ? 'photo-category-chip active'
                        : 'photo-category-chip'
                    }
                    onClick={() =>
                      setSelectedPhotoCategory(
                        category
                      )
                    }
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="photo-add-actions">
                <label className="photo-capture-button">
                  📷 撮影

                  <input
                    className="hidden-file-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(event) =>
                      handlePhotoSelected(event, 'camera')
                    }
                  />
                </label>

                <label className="photo-library-button">
                  🖼 写真から選択

                  <input
                    className="hidden-file-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) =>
                      handlePhotoSelected(event, 'library')
                    }
                  />
                </label>
              </div>
            </div>

            {photos.length === 0 ? (
              <div className="boundary-empty">
                <div className="boundary-empty-icon">
                  📷
                </div>

                <p>
                  写真がありません
                </p>

                <span>
                  写真種別を選んで撮影または追加してください
                </span>
              </div>
            ) : (
              <div className="photo-grid">
                {photos.map(
                  (photo, index) => {
                    return (
                      <div
                        className="photo-card"
                        key={
                          photo.id
                        }
                      >
                        <PhotoThumbnail
                          photo={photo}
                          index={index}
                          onOpen={setSelectedPhotoIndex}
                        />

                        <div className="photo-card-controls">
                          <select
                            value={
                              photo.category ||
                              ''
                            }
                            onChange={(e) =>
                              handleChangePhotoCategory(
                                photo,
                                e.target.value
                              )
                            }
                          >
                            <option value="">
                              未分類
                            </option>

                            <option value="全景">
                              全景
                            </option>

                            <option value="境界標アップ">
                              境界標アップ
                            </option>

                            <option value="接面道路">
                              接面道路
                            </option>

                            <option value="周辺状況">
                              周辺状況
                            </option>

                            <option value="図面・資料">
                              図面・資料
                            </option>

                            <option value="その他">
                              その他
                            </option>
                          </select>

                          {capturedPhotoIds.has(photo.id) && (
                            <button
                              type="button"
                              className="photo-device-save-button"
                              onClick={() => handleSavePhotoToDevice(photo)}
                            >
                              端末にも保存
                            </button>
                          )}

                          <button
                            type="button"
                            className="photo-delete-button"
                            onClick={() =>
                              handleDeletePhoto(
                                photo
                              )
                            }
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )
                  }
                )}
              </div>
            )}
          </section>
        </main>

        {selectedPhotoIndex !== null && (
          <PhotoViewer
            photos={photos}
            activeIndex={selectedPhotoIndex}
            boundaryPointName={selectedBoundaryPoint.name}
            categories={PHOTO_CATEGORIES}
            onClose={() => setSelectedPhotoIndex(null)}
            onIndexChange={setSelectedPhotoIndex}
            onDelete={handleDeletePhoto}
            onCategoryChange={handleChangePhotoCategory}
          />
        )}
      </div>
    )
  }

  /*
   * 案件詳細
   */

  if (
    screen === 'projectDetail' &&
    selectedProject
  ) {
    const hasLocation =
      selectedProject.latitude !==
      undefined &&
      selectedProject.longitude !==
      undefined

    const progress =
      projectProgress[selectedProject.id] ??
      calculateSurveyProgress(
        selectedProject,
        boundaryPoints,
        photoCounts
      )

    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => {
              setSelectedProject(null)
              setBoundaryPoints([])
              setScreen('projectList')
            }}
          >
            ←
          </button>

          <h1>案件詳細</h1>
        </header>

        <main className="project-container">
          <section className="detail-card">
            <div className="detail-header">
              <div>
                <h2>
                  {
                    selectedProject.title
                  }
                </h2>

                <p>
                  {selectedProject.location ||
                    '所在地未入力'}
                </p>
              </div>

              <button
                className="small-button"
                onClick={() =>
                  handleEditProject(
                    selectedProject
                  )
                }
              >
                編集
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">
                  地番
                </span>

                <strong>
                  {selectedProject.lotNumber ||
                    '未入力'}
                </strong>
              </div>

              <div>
                <span className="detail-label">
                  調査日
                </span>

                <strong>
                  {
                    selectedProject.surveyDate
                  }
                </strong>
              </div>

              <div>
                <span className="detail-label">
                  現況地目
                </span>

                <strong>
                  {selectedProject.landCategory ||
                    '未入力'}
                </strong>
              </div>

              <div>
                <span className="detail-label">
                  境界標確認
                </span>

                <strong>
                  {selectedProject.boundaryChecked
                    ? '確認済み'
                    : '未確認'}
                </strong>
              </div>
            </div>

            {selectedProject.memo && (
              <div className="project-memo">
                <span className="detail-label">
                  現地メモ
                </span>

                <p>
                  {
                    selectedProject.memo
                  }
                </p>
              </div>
            )}
          </section>

          <section className="progress-card">
            <div className="progress-header">
              <h2>調査進捗</h2>

              <strong>
                {progress.percentage === 100
                  ? '調査完了'
                  : `${progress.percentage}%`}
              </strong>
            </div>

            <div
              className="progress-track"
              role="progressbar"
              aria-label="調査進捗"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percentage}
            >
              <div
                className="progress-bar"
                style={{
                  width: `${progress.percentage}%`,
                }}
              />
            </div>

            <ul className="progress-check-list">
              {progress.checks.map((check) => (
                <li
                  key={check.id}
                  className={
                    check.complete
                      ? 'progress-check complete'
                      : 'progress-check incomplete'
                  }
                >
                  <span aria-hidden="true">
                    {check.complete ? '✓' : '!'}
                  </span>
                  <span>{check.message}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="location-section">
            <div className="section-title-row">
              <div>
                <h2>現場位置</h2>
              </div>
            </div>

            <div className="location-card">
              {hasLocation ? (
                <>
                  <div className="location-grid">
                    <div>
                      <span className="detail-label">
                        緯度
                      </span>

                      <strong>
                        {selectedProject.latitude?.toFixed(
                          6
                        )}
                      </strong>
                    </div>

                    <div>
                      <span className="detail-label">
                        経度
                      </span>

                      <strong>
                        {selectedProject.longitude?.toFixed(
                          6
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="location-accuracy">
                    GPS精度：約
                    {Math.round(
                      selectedProject.accuracy ??
                      0
                    )}
                    m
                  </div>

                  <div className="location-actions">
                    <button
                      className="location-button"
                      onClick={
                        handleCaptureProjectLocation
                      }
                      disabled={
                        locationLoading
                      }
                    >
                      {locationLoading
                        ? '取得中...'
                        : '📍 現在地を再取得'}
                    </button>

                    <button
                      className="maps-button"
                      onClick={
                        handleOpenGoogleMaps
                      }
                    >
                      Googleマップで開く
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="location-empty">
                    <div className="location-icon">
                      📍
                    </div>

                    <p>
                      現場位置は未取得です
                    </p>

                    <span>
                      案件単位でGPS位置を保存します
                    </span>
                  </div>

                  <button
                    className="location-button full-width-button"
                    onClick={
                      handleCaptureProjectLocation
                    }
                    disabled={
                      locationLoading
                    }
                  >
                    {locationLoading
                      ? '現在地を取得中...'
                      : '📍 現場位置を取得'}
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="boundary-section">
            <div className="section-title-row">
              <div>
                <h2>境界点</h2>

                <span className="count-text">
                  {boundaryPoints.length}
                  点
                </span>
              </div>

              <button
                className="small-button"
                onClick={
                  handleNewBoundaryPoint
                }
              >
                ＋ 追加
              </button>
            </div>

            {boundaryPoints.length ===
              0 ? (
              <div className="boundary-empty">
                <div className="boundary-empty-icon">
                  📍
                </div>

                <p>
                  境界点がありません
                </p>

                <span>
                  「＋ 追加」から登録してください
                </span>
              </div>
            ) : (
              <div className="boundary-list">
                {boundaryPoints.map(
                  (point) => (
                    <div
                      className="boundary-card"
                      key={
                        point.id
                      }
                    >
                      <button
                        className="boundary-main"
                        onClick={() =>
                          handleOpenBoundaryPoint(
                            point
                          )
                        }
                      >
                        <div className="boundary-name">
                          {
                            point.name
                          }
                        </div>

                        <div className="boundary-info">
                          <span>
                            種類：
                            {point.markerType ||
                              '未入力'}
                          </span>

                          <span>
                            状態：
                            {point.condition ||
                              '未入力'}
                          </span>

                          <span>
                            位置：
                            {point.positionMemo ||
                              '未入力'}
                          </span>

                          <span>
                            写真：
                            {photoCounts[
                              point.id
                            ] ?? 0}
                            枚
                          </span>
                        </div>
                      </button>

                      <button
                        className="boundary-delete-button"
                        onClick={() =>
                          handleDeleteBoundaryPoint(
                            point
                          )
                        }
                      >
                        削除
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </main>

        <button
          className="floating-button"
          onClick={
            handleNewBoundaryPoint
          }
        >
          ＋
        </button>
      </div>
    )
  }

  /*
   * 案件一覧
   */

  return (
    <div className="app">
      <header className="header">
        <h1>現場調査</h1>
      </header>

      <main className="project-container">
        {projects.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              📍
            </div>

            <p>
              案件がありません
            </p>

            <small>
              右下の＋から案件を登録してください
            </small>
          </div>
        ) : (
          <div className="project-list">
            {projects.map(
              (project) => (
                <div
                  className="project-card"
                  key={
                    project.id
                  }
                >
                  <button
                    className="project-main"
                    onClick={() =>
                      handleOpenProject(
                        project
                      )
                    }
                  >
                    <strong>
                      {project.title}
                    </strong>

                    <span>
                      {project.location ||
                        '所在地未入力'}
                    </span>

                    <span>
                      地番：
                      {project.lotNumber ||
                        '未入力'}
                    </span>

                    <span>
                      調査日：
                      {
                        project.surveyDate
                      }
                    </span>

                    <span>
                      GPS：
                      {project.latitude !==
                        undefined
                        ? '取得済み'
                        : '未取得'}
                    </span>

                    {projectProgress[
                      project.id
                    ] && (
                        <span className="project-progress-label">
                          調査進捗：
                          {projectProgress[
                            project.id
                          ].percentage === 100
                            ? '調査完了'
                            : `${projectProgress[
                              project.id
                            ].percentage}%`}
                        </span>
                      )}
                  </button>

                  <button
                    className="delete-button"
                    onClick={() =>
                      handleDeleteProject(
                        project
                      )
                    }
                  >
                    削除
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </main>

      <button
        className="floating-button"
        onClick={
          handleNewProject
        }
      >
        ＋
      </button>
    </div>
  )
}

export default App
