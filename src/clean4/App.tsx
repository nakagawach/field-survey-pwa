import { useEffect, useMemo, useState } from 'react'
import type { BoundaryPhoto, BoundaryPoint, SurveyProject } from '../types'
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
import PickerInput from './PickerInput'
import PhotoViewer from './PhotoViewer'
import { calculateProgress } from './progress'
import './styles.css'

type Screen = 'projectList' | 'projectEdit' | 'projectDetail' | 'pointEdit' | 'pointDetail'

const PHOTO_CATEGORIES = ['全景', '境界標アップ', '接面道路', '周辺状況', '図面・資料', 'その他'] as const
const MARKER_TYPES = ['', 'コンクリート杭', '金属標', '金属鋲', 'プラスチック杭', 'その他']
const CONDITIONS = ['', '良好', '傾き', '破損', '亡失', '確認不能']
const isoNow = () => new Date().toISOString()

const createProject = (): SurveyProject => {
  const createdAt = isoNow()
  return {
    id: crypto.randomUUID(),
    title: '',
    location: '',
    lotNumber: '',
    surveyDate: createdAt.slice(0, 10),
    landCategory: '',
    boundaryChecked: false,
    memo: '',
    createdAt,
    updatedAt: createdAt,
  }
}

const createPoint = (projectId: string, number: number): BoundaryPoint => {
  const createdAt = isoNow()
  return {
    id: crypto.randomUUID(),
    projectId,
    name: `P${number}`,
    markerType: '',
    condition: '',
    positionMemo: '',
    memo: '',
    createdAt,
    updatedAt: createdAt,
  }
}

function PhotoThumb({ photo, onOpen }: { photo: BoundaryPhoto; onOpen: () => void }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const nextUrl = URL.createObjectURL(photo.blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [photo.blob])

  return (
    <button type="button" className="photo-thumb" onClick={onOpen} aria-label={`${photo.fileName}を全画面表示`}>
      {url && <img src={url} alt={photo.fileName} />}
      <span>{photo.category || '未分類'}</span>
    </button>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('projectList')
  const [projects, setProjects] = useState<SurveyProject[]>([])
  const [projectProgress, setProjectProgress] = useState<Record<string, number>>({})
  const [project, setProject] = useState<SurveyProject | null>(null)
  const [projectDraft, setProjectDraft] = useState<SurveyProject | null>(null)
  const [points, setPoints] = useState<BoundaryPoint[]>([])
  const [point, setPoint] = useState<BoundaryPoint | null>(null)
  const [pointDraft, setPointDraft] = useState<BoundaryPoint | null>(null)
  const [photos, setPhotos] = useState<BoundaryPhoto[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [category, setCategory] = useState<string>('境界標アップ')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)

  const refreshProjects = async () => {
    const nextProjects = await getProjects()
    setProjects(nextProjects)

    const progressEntries = await Promise.all(nextProjects.map(async (item) => {
      const nextPoints = await getBoundaryPointsByProjectId(item.id)
      const counts: Record<string, number> = {}
      await Promise.all(nextPoints.map(async (nextPoint) => {
        counts[nextPoint.id] = (await getPhotosByBoundaryPointId(nextPoint.id)).length
      }))
      return [item.id, calculateProgress(item, nextPoints, counts).percentage] as const
    }))

    setProjectProgress(Object.fromEntries(progressEntries))
  }

  const refreshProjectData = async (projectId: string) => {
    const nextPoints = await getBoundaryPointsByProjectId(projectId)
    const counts: Record<string, number> = {}
    await Promise.all(nextPoints.map(async (item) => {
      counts[item.id] = (await getPhotosByBoundaryPointId(item.id)).length
    }))
    setPoints(nextPoints)
    setPhotoCounts(counts)
  }

  const refreshPhotos = async (pointId: string) => {
    const nextPhotos = await getPhotosByBoundaryPointId(pointId)
    setPhotos(nextPhotos)
    setPhotoCounts((current) => ({ ...current, [pointId]: nextPhotos.length }))
  }

  useEffect(() => { void refreshProjects() }, [])
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) }, [screen])

  const progress = useMemo(
    () => project ? calculateProgress(project, points, photoCounts) : null,
    [project, points, photoCounts],
  )

  const openProject = async (nextProject: SurveyProject) => {
    setProject(nextProject)
    await refreshProjectData(nextProject.id)
    setScreen('projectDetail')
  }

  const saveProjectDraft = async () => {
    if (!projectDraft) return
    if (!projectDraft.title.trim()) {
      window.alert('案件名を入力してください')
      return
    }

    const saved = { ...projectDraft, updatedAt: isoNow() }
    await saveProject(saved)
    await refreshProjects()
    setProjectDraft(null)

    if (project?.id === saved.id) {
      setProject(saved)
      setScreen('projectDetail')
    } else {
      setProject(null)
      setScreen('projectList')
    }
  }

  const removeProject = async (target: SurveyProject) => {
    if (!window.confirm(`「${target.title}」を削除しますか？\n境界点と写真も削除されます。`)) return
    await deleteProject(target.id)
    await refreshProjects()
  }

  const openPoint = async (nextPoint: BoundaryPoint) => {
    setPoint({ ...nextPoint, positionMemo: nextPoint.positionMemo ?? '' })
    await refreshPhotos(nextPoint.id)
    setScreen('pointDetail')
  }

  const savePointDraft = async () => {
    if (!pointDraft || !project) return
    if (!pointDraft.name.trim()) {
      window.alert('境界点名を入力してください')
      return
    }

    const saved = { ...pointDraft, positionMemo: pointDraft.positionMemo ?? '', updatedAt: isoNow() }
    await saveBoundaryPoint(saved)
    await refreshProjectData(project.id)
    setPointDraft(null)

    if (point?.id === saved.id) {
      setPoint(saved)
      setScreen('pointDetail')
    } else {
      setScreen('projectDetail')
    }
  }

  const removePoint = async (target: BoundaryPoint) => {
    if (!project || !window.confirm(`「${target.name}」を削除しますか？\n写真も削除されます。`)) return
    await deleteBoundaryPoint(target.id)
    await refreshProjectData(project.id)
  }

  const addPhotos = async (files: File[]) => {
    if (!project || !point) return
    const base = Date.now()
    const failed: string[] = []

    for (const [index, file] of files.entries()) {
      const nextPhoto: BoundaryPhoto = {
        id: crypto.randomUUID(),
        projectId: project.id,
        boundaryPointId: point.id,
        category,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        blob: file,
        createdAt: new Date(base + index).toISOString(),
      }

      try {
        await savePhoto(nextPhoto)
      } catch {
        failed.push(file.name)
      }
    }

    await refreshPhotos(point.id)
    if (failed.length) window.alert(`${failed.length}枚の写真を保存できませんでした。`)
  }

  const updatePhotoCategory = async (target: BoundaryPhoto, nextCategory: string) => {
    if (!point) return
    await savePhoto({ ...target, category: nextCategory })
    await refreshPhotos(point.id)
  }

  const removePhoto = async (target: BoundaryPhoto) => {
    if (!point || !window.confirm('この写真を削除しますか？')) return
    await deletePhoto(target.id)
    await refreshPhotos(point.id)
    setViewerIndex(null)
  }

  const savePhotoToDevice = (target: BoundaryPhoto) => {
    const url = URL.createObjectURL(target.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = target.fileName || 'photo'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const captureGps = () => {
    if (!project) return
    if (!navigator.geolocation) {
      window.alert('この端末では位置情報を利用できません。')
      return
    }

    setGpsBusy(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const saved: SurveyProject = {
          ...project,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          locationCapturedAt: isoNow(),
          updatedAt: isoNow(),
        }
        try {
          await saveProject(saved)
          setProject(saved)
          await refreshProjects()
        } finally {
          setGpsBusy(false)
        }
      },
      () => {
        setGpsBusy(false)
        window.alert('位置情報を取得できませんでした。')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const Header = ({ title, onBack }: { title: string; onBack?: () => void }) => (
    <header className="app-header">
      {onBack && <button type="button" className="back-button" onClick={onBack} aria-label="戻る">‹</button>}
      <h1>{title}</h1>
    </header>
  )

  if (screen === 'projectEdit' && projectDraft) {
    const editing = project?.id === projectDraft.id
    return (
      <div className="app-shell">
        <Header title={editing ? '案件編集' : '案件登録'} onBack={() => setScreen(editing ? 'projectDetail' : 'projectList')} />
        <main className="form-screen">
          <label>案件名<input value={projectDraft.title} onChange={(e) => setProjectDraft({ ...projectDraft, title: e.target.value })} /></label>
          <label>所在地<input value={projectDraft.location} onChange={(e) => setProjectDraft({ ...projectDraft, location: e.target.value })} /></label>
          <label>地番<input value={projectDraft.lotNumber} onChange={(e) => setProjectDraft({ ...projectDraft, lotNumber: e.target.value })} /></label>
          <label>調査日<input type="date" value={projectDraft.surveyDate} onChange={(e) => setProjectDraft({ ...projectDraft, surveyDate: e.target.value })} /></label>
          <label>地目<input value={projectDraft.landCategory} onChange={(e) => setProjectDraft({ ...projectDraft, landCategory: e.target.value })} /></label>
          <label className="check-row"><input type="checkbox" checked={projectDraft.boundaryChecked} onChange={(e) => setProjectDraft({ ...projectDraft, boundaryChecked: e.target.checked })} />境界確認済み</label>
          <label>メモ<textarea rows={4} value={projectDraft.memo} onChange={(e) => setProjectDraft({ ...projectDraft, memo: e.target.value })} /></label>
          <button type="button" className="primary-button" onClick={() => void saveProjectDraft()}>保存</button>
        </main>
      </div>
    )
  }

  if (screen === 'pointEdit' && pointDraft) {
    const editing = point?.id === pointDraft.id
    return (
      <div className="app-shell">
        <Header title={editing ? '境界点編集' : '境界点登録'} onBack={() => setScreen(editing ? 'pointDetail' : 'projectDetail')} />
        <main className="form-screen">
          <label>境界点名<input value={pointDraft.name} onChange={(e) => setPointDraft({ ...pointDraft, name: e.target.value })} /></label>
          <label>境界標種類<select value={pointDraft.markerType} onChange={(e) => setPointDraft({ ...pointDraft, markerType: e.target.value })}>{MARKER_TYPES.map((value) => <option key={value} value={value}>{value || '選択してください'}</option>)}</select></label>
          <label>状態<select value={pointDraft.condition} onChange={(e) => setPointDraft({ ...pointDraft, condition: e.target.value })}>{CONDITIONS.map((value) => <option key={value} value={value}>{value || '選択してください'}</option>)}</select></label>
          <label>位置関係メモ<input value={pointDraft.positionMemo ?? ''} onChange={(e) => setPointDraft({ ...pointDraft, positionMemo: e.target.value })} /></label>
          <label>メモ<textarea rows={4} value={pointDraft.memo} onChange={(e) => setPointDraft({ ...pointDraft, memo: e.target.value })} /></label>
          <button type="button" className="primary-button" onClick={() => void savePointDraft()}>保存</button>
        </main>
      </div>
    )
  }

  if (screen === 'pointDetail' && project && point) {
    return (
      <div className="app-shell">
        <Header title={point.name} onBack={() => setScreen('projectDetail')} />
        <main className="content-screen">
          <section className="card">
            <div className="card-head"><div><h2>{point.markerType || '境界標未設定'}</h2><p>{point.condition || '状態未設定'}</p></div><button type="button" className="small-button" onClick={() => { setPointDraft({ ...point }); setScreen('pointEdit') }}>編集</button></div>
            <p>{point.positionMemo || '位置関係メモなし'}</p><p>{point.memo || 'メモなし'}</p>
          </section>

          <section>
            <div className="section-head"><h2>写真 <small>{photos.length}枚</small></h2><select value={category} onChange={(e) => setCategory(e.target.value)}>{PHOTO_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div className="picker-row">
              <PickerInput label="📷 撮影" className="camera-picker" inputProps={{ accept: 'image/*', capture: 'environment' }} onFiles={addPhotos} />
              <PickerInput label="🖼 写真から選択" inputProps={{ accept: 'image/*', multiple: true }} onFiles={addPhotos} />
            </div>
            <div className="photo-grid">
              {photos.map((photo, index) => (
                <article className="photo-card" key={photo.id}>
                  <PhotoThumb photo={photo} onOpen={() => setViewerIndex(index)} />
                  <select value={photo.category || ''} onChange={(e) => void updatePhotoCategory(photo, e.target.value)}><option value="">未分類</option>{PHOTO_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select>
                  <div className="photo-actions"><button type="button" onClick={() => savePhotoToDevice(photo)}>端末保存</button><button type="button" className="danger-button" onClick={() => void removePhoto(photo)}>削除</button></div>
                </article>
              ))}
            </div>
          </section>
          {viewerIndex !== null && <PhotoViewer photos={photos} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />}
        </main>
      </div>
    )
  }

  if (screen === 'projectDetail' && project) {
    return (
      <div className="app-shell">
        <Header title={project.title} onBack={() => { setProject(null); setPoint(null); setScreen('projectList'); void refreshProjects() }} />
        <main className="content-screen">
          <section className="card">
            <div className="card-head"><div><h2>{project.location || '所在地未入力'}</h2><p>{project.lotNumber || '地番未入力'} ／ {project.surveyDate}</p></div><button type="button" className="small-button" onClick={() => { setProjectDraft({ ...project }); setScreen('projectEdit') }}>編集</button></div>
            <p>{project.landCategory || '地目未入力'} ／ {project.boundaryChecked ? '境界確認済み' : '境界未確認'}</p><p>{project.memo || 'メモなし'}</p>
          </section>

          <section className="card"><h2>位置情報</h2>{project.latitude !== undefined && project.longitude !== undefined ? <p>{project.latitude.toFixed(6)}, {project.longitude.toFixed(6)}　精度 ±{Math.round(project.accuracy ?? 0)}m</p> : <p>未取得</p>}<div className="button-row"><button type="button" disabled={gpsBusy} onClick={captureGps}>{gpsBusy ? '取得中…' : '現在地を取得'}</button>{project.latitude !== undefined && project.longitude !== undefined && <button type="button" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`, '_blank', 'noopener,noreferrer')}>Googleマップ</button>}</div></section>

          {progress && <section className="card progress-card"><div className="progress-title"><h2>調査進捗</h2><strong>{progress.percentage}%</strong></div><div className="progress-track"><div style={{ width: `${progress.percentage}%` }} /></div><ul>{progress.items.map((item) => <li key={item.text} className={item.complete ? 'done' : 'todo'}>{item.complete ? '✓' : '!'} {item.text}</li>)}</ul></section>}

          <section><div className="section-head"><h2>境界点 <small>{points.length}件</small></h2></div>{points.length === 0 ? <div className="empty-card">境界点を追加してください</div> : points.map((item) => <div className="list-card" key={item.id}><button type="button" className="list-main" onClick={() => void openPoint(item)}><strong>{item.name}</strong><span>{item.markerType || '種類未設定'} ／ {item.condition || '状態未設定'} ／ 写真 {photoCounts[item.id] ?? 0}枚</span></button><button type="button" className="list-delete" onClick={() => void removePoint(item)}>削除</button></div>)}</section>
          <button type="button" className="floating-button" aria-label="境界点を追加" onClick={() => { setPoint(null); setPointDraft(createPoint(project.id, points.length + 1)); setScreen('pointEdit') }}>＋</button>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header title="現場調査" />
      <main className="content-screen">
        {projects.length === 0 ? <div className="empty-card large">案件がありません<br /><small>右下の＋から案件を登録してください</small></div> : projects.map((item) => {
          const percentage = projectProgress[item.id]
          return <div className="project-card" key={item.id}><button type="button" className="project-main" onClick={() => void openProject(item)}><strong>{item.title}{percentage !== undefined && <span style={{ marginLeft: 8, color: percentage === 100 ? '#23733c' : '#1267b9', WebkitTextFillColor: percentage === 100 ? '#23733c' : '#1267b9', fontSize: 13, fontWeight: 700 }}>{percentage === 100 ? '完了' : `${percentage}%`}</span>}</strong><span>{item.location || '所在地未入力'} ／ {item.surveyDate}</span></button><button type="button" className="project-delete" onClick={() => void removeProject(item)}>削除</button></div>
        })}
        <button type="button" className="floating-button" aria-label="案件を追加" onClick={() => { setProject(null); setProjectDraft(createProject()); setScreen('projectEdit') }}>＋</button>
      </main>
    </div>
  )
}
