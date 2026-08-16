import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
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
import PhotoViewer from './PhotoViewer'
import { calculateProgress } from './progress'
import './styles.css'

type Screen = 'projectList' | 'projectEdit' | 'projectDetail' | 'pointEdit' | 'pointDetail'

const PHOTO_CATEGORIES = ['全景', '境界標アップ', '接面道路', '周辺状況', '図面・資料', 'その他'] as const

const today = () => new Date().toISOString().slice(0, 10)

const newProject = (): SurveyProject => {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    location: '',
    lotNumber: '',
    surveyDate: today(),
    landCategory: '',
    boundaryChecked: false,
    memo: '',
    createdAt: now,
    updatedAt: now,
  }
}

const newPoint = (projectId: string, number: number): BoundaryPoint => {
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

function PhotoThumb({ photo }: { photo: BoundaryPhoto }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const next = URL.createObjectURL(photo.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [photo.blob])

  return <img className="thumb" src={url} alt={photo.fileName} />
}

function App() {
  const [screen, setScreen] = useState<Screen>('projectList')
  const [projects, setProjects] = useState<SurveyProject[]>([])
  const [selectedProject, setSelectedProject] = useState<SurveyProject | null>(null)
  const [editingProject, setEditingProject] = useState<SurveyProject | null>(null)
  const [points, setPoints] = useState<BoundaryPoint[]>([])
  const [selectedPoint, setSelectedPoint] = useState<BoundaryPoint | null>(null)
  const [editingPoint, setEditingPoint] = useState<BoundaryPoint | null>(null)
  const [photos, setPhotos] = useState<BoundaryPhoto[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [category, setCategory] = useState<string>('境界標アップ')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)

  const loadProjects = async () => {
    setProjects(await getProjects())
  }

  const loadPoints = async (projectId: string) => {
    const data = await getBoundaryPointsByProjectId(projectId)
    const counts: Record<string, number> = {}
    await Promise.all(
      data.map(async (point) => {
        counts[point.id] = (await getPhotosByBoundaryPointId(point.id)).length
      })
    )
    setPoints(data)
    setPhotoCounts(counts)
  }

  const loadPhotos = async (pointId: string) => {
    setPhotos(await getPhotosByBoundaryPointId(pointId))
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const openNewProject = () => {
    setSelectedProject(null)
    setEditingProject(newProject())
    setScreen('projectEdit')
  }

  const editProject = (project: SurveyProject) => {
    setEditingProject({ ...project })
    setScreen('projectEdit')
  }

  const saveEditingProject = async () => {
    if (!editingProject) return
    if (!editingProject.title.trim()) {
      window.alert('案件名を入力してください')
      return
    }

    const saved = { ...editingProject, updatedAt: new Date().toISOString() }
    await saveProject(saved)
    await loadProjects()
    setEditingProject(null)

    if (selectedProject?.id === saved.id) {
      setSelectedProject(saved)
      setScreen('projectDetail')
    } else {
      setScreen('projectList')
    }
  }

  const removeProject = async (project: SurveyProject) => {
    if (!window.confirm(`「${project.title}」を削除しますか？\n境界点と写真も削除されます。`)) return
    await deleteProject(project.id)
    await loadProjects()
  }

  const openProject = async (project: SurveyProject) => {
    setSelectedProject(project)
    await loadPoints(project.id)
    setScreen('projectDetail')
  }

  const openNewPoint = () => {
    if (!selectedProject) return
    setEditingPoint(newPoint(selectedProject.id, points.length + 1))
    setScreen('pointEdit')
  }

  const editPoint = (point: BoundaryPoint) => {
    setEditingPoint({ ...point, positionMemo: point.positionMemo ?? '' })
    setScreen('pointEdit')
  }

  const saveEditingPoint = async () => {
    if (!editingPoint || !selectedProject) return
    if (!editingPoint.name.trim()) {
      window.alert('境界点名を入力してください')
      return
    }

    const saved = { ...editingPoint, updatedAt: new Date().toISOString() }
    await saveBoundaryPoint(saved)
    await loadPoints(selectedProject.id)
    setEditingPoint(null)

    if (selectedPoint?.id === saved.id) {
      setSelectedPoint(saved)
      setScreen('pointDetail')
    } else {
      setScreen('projectDetail')
    }
  }

  const removePoint = async (point: BoundaryPoint) => {
    if (!selectedProject) return
    if (!window.confirm(`「${point.name}」を削除しますか？\n写真も削除されます。`)) return
    await deleteBoundaryPoint(point.id)
    await loadPoints(selectedProject.id)
  }

  const openPoint = async (point: BoundaryPoint) => {
    setSelectedPoint({ ...point, positionMemo: point.positionMemo ?? '' })
    await loadPhotos(point.id)
    setViewerIndex(null)
    setScreen('pointDetail')
  }

  const saveFiles = async (files: File[]) => {
    if (!selectedProject || !selectedPoint || files.length === 0) return

    const failed: string[] = []
    const baseTime = Date.now()

    for (const [index, file] of files.entries()) {
      const photo: BoundaryPhoto = {
        id: crypto.randomUUID(),
        projectId: selectedProject.id,
        boundaryPointId: selectedPoint.id,
        category,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        blob: file,
        createdAt: new Date(baseTime + index).toISOString(),
      }

      try {
        await savePhoto(photo)
      } catch {
        failed.push(file.name)
      }
    }

    await loadPhotos(selectedPoint.id)
    await loadPoints(selectedProject.id)

    if (failed.length > 0) {
      window.alert(`${failed.length}枚の写真を保存できませんでした。\n${failed.join('\n')}`)
    }
  }

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    void saveFiles(files)
  }

  const changePhotoCategory = async (photo: BoundaryPhoto, nextCategory: string) => {
    await savePhoto({ ...photo, category: nextCategory })
    if (selectedPoint) await loadPhotos(selectedPoint.id)
  }

  const removePhoto = async (photo: BoundaryPhoto) => {
    if (!selectedProject || !selectedPoint) return
    if (!window.confirm('この写真を削除しますか？')) return
    await deletePhoto(photo.id)
    setViewerIndex(null)
    await loadPhotos(selectedPoint.id)
    await loadPoints(selectedProject.id)
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
    const link = document.createElement('a')
    link.href = url
    link.download = photo.fileName
    link.click()
    link.remove()
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
        const updated: SurveyProject = {
          ...selectedProject,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          locationCapturedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        try {
          await saveProject(updated)
          setSelectedProject(updated)
          await loadProjects()
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

  const openMap = () => {
    if (selectedProject?.latitude === undefined || selectedProject.longitude === undefined) return
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${selectedProject.latitude},${selectedProject.longitude}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  if (screen === 'projectEdit' && editingProject) {
    return (
      <div className="app">
        <header className="header">
          <button className="btn secondary icon" type="button" onClick={() => setScreen(selectedProject ? 'projectDetail' : 'projectList')}>←</button>
          <h1>案件編集</h1>
        </header>
        <main className="page">
          <div className="card form">
            <label>案件名<input value={editingProject.title} onChange={(e) => setEditingProject({ ...editingProject, title: e.target.value })} /></label>
            <label>所在<input value={editingProject.location} onChange={(e) => setEditingProject({ ...editingProject, location: e.target.value })} /></label>
            <label>地番<input value={editingProject.lotNumber} onChange={(e) => setEditingProject({ ...editingProject, lotNumber: e.target.value })} /></label>
            <label>調査日<input type="date" value={editingProject.surveyDate} onChange={(e) => setEditingProject({ ...editingProject, surveyDate: e.target.value })} /></label>
            <label>現況地目
              <select value={editingProject.landCategory} onChange={(e) => setEditingProject({ ...editingProject, landCategory: e.target.value })}>
                <option value="">選択してください</option>
                {['宅地','田','畑','山林','雑種地','道路','その他'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="row"><input type="checkbox" checked={editingProject.boundaryChecked} onChange={(e) => setEditingProject({ ...editingProject, boundaryChecked: e.target.checked })} />境界標確認済み</label>
            <label>現地メモ<textarea rows={5} value={editingProject.memo} onChange={(e) => setEditingProject({ ...editingProject, memo: e.target.value })} /></label>
            <button type="button" className="btn" onClick={() => void saveEditingProject()}>保存</button>
          </div>
        </main>
      </div>
    )
  }

  if (screen === 'pointEdit' && editingPoint) {
    return (
      <div className="app">
        <header className="header">
          <button className="btn secondary icon" type="button" onClick={() => setScreen(selectedPoint?.id === editingPoint.id ? 'pointDetail' : 'projectDetail')}>←</button>
          <h1>境界点編集</h1>
        </header>
        <main className="page">
          <div className="card form">
            <label>境界点名<input value={editingPoint.name} onChange={(e) => setEditingPoint({ ...editingPoint, name: e.target.value })} /></label>
            <label>境界標の種類
              <select value={editingPoint.markerType} onChange={(e) => setEditingPoint({ ...editingPoint, markerType: e.target.value })}>
                <option value="">選択してください</option>
                {['コンクリート杭','金属標','金属鋲','プラスチック杭','刻印','境界標なし','その他'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>状態
              <select value={editingPoint.condition} onChange={(e) => setEditingPoint({ ...editingPoint, condition: e.target.value })}>
                <option value="">選択してください</option>
                {['良好','傾きあり','摩耗あり','破損','不明'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>位置関係メモ<input value={editingPoint.positionMemo ?? ''} onChange={(e) => setEditingPoint({ ...editingPoint, positionMemo: e.target.value })} /></label>
            <label>メモ<textarea rows={5} value={editingPoint.memo} onChange={(e) => setEditingPoint({ ...editingPoint, memo: e.target.value })} /></label>
            <button type="button" className="btn" onClick={() => void saveEditingPoint()}>保存</button>
          </div>
        </main>
      </div>
    )
  }

  if (screen === 'pointDetail' && selectedPoint && selectedProject) {
    return (
      <div className="app">
        <header className="header">
          <button className="btn secondary icon" type="button" onClick={() => { setViewerIndex(null); setSelectedPoint(null); setPhotos([]); setScreen('projectDetail') }}>←</button>
          <h1>{selectedPoint.name}</h1>
        </header>
        <main className="page stack">
          <section className="card stack">
            <div className="spread"><div><div className="title">{selectedPoint.name}</div><div className="muted">{selectedPoint.markerType || '境界標未入力'}</div></div><button className="btn secondary" type="button" onClick={() => editPoint(selectedPoint)}>編集</button></div>
            <div className="grid2"><div><div className="muted">種類</div><strong>{selectedPoint.markerType || '未入力'}</strong></div><div><div className="muted">状態</div><strong>{selectedPoint.condition || '未入力'}</strong></div></div>
            {selectedPoint.positionMemo && <div><div className="muted">位置関係</div>{selectedPoint.positionMemo}</div>}
            {selectedPoint.memo && <div><div className="muted">メモ</div>{selectedPoint.memo}</div>}
          </section>

          <section className="card stack">
            <div className="spread"><h2 className="section-title">写真</h2><span className="muted">{photos.length}枚</span></div>
            <div className="pill-row">{PHOTO_CATEGORIES.map((item) => <button type="button" key={item} className={category === item ? 'pill active' : 'pill'} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className="photo-actions">
              <label className="file-action">📷 撮影<input type="file" accept="image/*" capture="environment" onChange={handleFileInput} /></label>
              <label className="file-action library">🖼 写真から選択<input type="file" accept="image/*" multiple onChange={handleFileInput} /></label>
            </div>
            {photos.length === 0 ? <div className="empty">写真がありません</div> : (
              <div className="photo-grid">
                {photos.map((photo, index) => (
                  <article className="photo-card" key={photo.id}>
                    <button type="button" className="thumb-button" onClick={() => setViewerIndex(index)}><PhotoThumb photo={photo} /></button>
                    <div className="photo-controls">
                      <select value={photo.category ?? ''} onChange={(e) => void changePhotoCategory(photo, e.target.value)}>
                        <option value="">未分類</option>
                        {PHOTO_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <button type="button" className="btn secondary" onClick={() => void savePhotoToDevice(photo)}>端末にも保存</button>
                      <button type="button" className="btn danger" onClick={() => void removePhoto(photo)}>削除</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
        {viewerIndex !== null && (
          <PhotoViewer photos={photos} activeIndex={viewerIndex} onClose={() => setViewerIndex(null)} onIndexChange={setViewerIndex} />
        )}
      </div>
    )
  }

  if (screen === 'projectDetail' && selectedProject) {
    const progress = calculateProgress(selectedProject, points, photoCounts)
    const hasLocation = selectedProject.latitude !== undefined && selectedProject.longitude !== undefined

    return (
      <div className="app">
        <header className="header">
          <button className="btn secondary icon" type="button" onClick={() => { setSelectedProject(null); setPoints([]); setScreen('projectList') }}>←</button>
          <h1>案件詳細</h1>
        </header>
        <main className="page stack">
          <section className="card stack">
            <div className="spread"><div><div className="title">{selectedProject.title}</div><div className="muted">{selectedProject.location || '所在地未入力'}</div></div><button type="button" className="btn secondary" onClick={() => editProject(selectedProject)}>編集</button></div>
            <div className="grid2"><div><div className="muted">地番</div><strong>{selectedProject.lotNumber || '未入力'}</strong></div><div><div className="muted">調査日</div><strong>{selectedProject.surveyDate}</strong></div></div>
          </section>

          <section className="card">
            <div className="spread"><h2 className="section-title">調査進捗</h2><strong>{progress.percentage === 100 ? '調査完了' : `${progress.percentage}%`}</strong></div>
            <div className="progress"><div style={{ width: `${progress.percentage}%` }} /></div>
            <ul className="check-list">{progress.checks.map((check) => <li key={check.id}>{check.complete ? '✓' : '!'} {check.message}</li>)}</ul>
          </section>

          <section className="card stack">
            <h2 className="section-title">現場位置</h2>
            {hasLocation ? <><div className="grid2"><div><div className="muted">緯度</div><strong>{selectedProject.latitude?.toFixed(6)}</strong></div><div><div className="muted">経度</div><strong>{selectedProject.longitude?.toFixed(6)}</strong></div></div><div className="row"><button type="button" className="btn secondary" onClick={captureLocation} disabled={locationLoading}>{locationLoading ? '取得中...' : '現在地を再取得'}</button><button type="button" className="btn secondary" onClick={openMap}>Googleマップ</button></div></> : <button type="button" className="btn" onClick={captureLocation} disabled={locationLoading}>{locationLoading ? '取得中...' : '📍 現場位置を取得'}</button>}
          </section>

          <section className="stack">
            <div className="spread"><h2 className="section-title">境界点</h2><button type="button" className="btn secondary" onClick={openNewPoint}>＋ 追加</button></div>
            {points.length === 0 ? <div className="card empty">境界点がありません</div> : <div className="list">{points.map((point) => <div className="list-item" key={point.id}><button type="button" className="list-main" onClick={() => void openPoint(point)}><strong>{point.name}</strong><span>種類：{point.markerType || '未入力'}</span><span>状態：{point.condition || '未入力'}</span><span>写真：{photoCounts[point.id] ?? 0}枚</span></button><button type="button" className="btn danger" onClick={() => void removePoint(point)}>削除</button></div>)}</div>}
          </section>
        </main>
        <button type="button" className="btn fab" aria-label="境界点を追加" onClick={openNewPoint}>＋</button>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header"><h1>現場調査</h1></header>
      <main className="page">
        {projects.length === 0 ? <div className="empty">案件がありません<br /><span className="muted">右下の＋から登録してください</span></div> : <div className="list">{projects.map((project) => <div className="list-item" key={project.id}><button type="button" className="list-main" onClick={() => void openProject(project)}><strong>{project.title}</strong><span>{project.location || '所在地未入力'}</span><span>地番：{project.lotNumber || '未入力'}</span><span>調査日：{project.surveyDate}</span></button><button type="button" className="btn danger" onClick={() => void removeProject(project)}>削除</button></div>)}</div>}
      </main>
      <button type="button" className="btn fab" aria-label="案件を追加" onClick={openNewProject}>＋</button>
    </div>
  )
}

export default App
