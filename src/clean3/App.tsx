import { useEffect, useMemo, useState } from 'react'
import type { BoundaryPhoto, BoundaryPoint, SurveyProject } from '../types'
import {
  deleteBoundaryPoint, deletePhoto, deleteProject, getBoundaryPointsByProjectId,
  getPhotosByBoundaryPointId, getProjects, saveBoundaryPoint, savePhoto, saveProject,
} from '../db'
import PressButton from './PressButton'
import PickerInput from './PickerInput'
import PickerSelect from './PickerSelect'
import PhotoViewer from './PhotoViewer'
import './styles.css'

type Screen = 'projects' | 'projectEdit' | 'project' | 'pointEdit' | 'point'
const CATEGORIES = ['全景', '境界標アップ', '接面道路', '周辺状況', '図面・資料', 'その他'] as const
const MARKERS = ['', 'コンクリート杭', '金属標', '金属鋲', 'プラスチック杭', 'その他']
const CONDITIONS = ['', '良好', '傾き', '破損', '亡失', '確認不能']

const now = () => new Date().toISOString()
const newProject = (): SurveyProject => ({
  id: crypto.randomUUID(), title: '', location: '', lotNumber: '', surveyDate: now().slice(0, 10),
  landCategory: '', boundaryChecked: false, memo: '', createdAt: now(), updatedAt: now(),
})
const newPoint = (projectId: string, n: number): BoundaryPoint => ({
  id: crypto.randomUUID(), projectId, name: `P${n}`, markerType: '', condition: '',
  positionMemo: '', memo: '', createdAt: now(), updatedAt: now(),
})

function Thumb({ photo, onOpen }: { photo: BoundaryPhoto; onOpen: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(photo.blob); setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [photo.blob])
  return <PressButton className="thumb" onPress={onOpen} aria-label={`${photo.fileName}を全画面表示`}><img src={url} alt="" /><span>{photo.category || '未分類'}</span></PressButton>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('projects')
  const [projects, setProjects] = useState<SurveyProject[]>([])
  const [project, setProject] = useState<SurveyProject | null>(null)
  const [draftProject, setDraftProject] = useState<SurveyProject | null>(null)
  const [points, setPoints] = useState<BoundaryPoint[]>([])
  const [point, setPoint] = useState<BoundaryPoint | null>(null)
  const [draftPoint, setDraftPoint] = useState<BoundaryPoint | null>(null)
  const [photos, setPhotos] = useState<BoundaryPhoto[]>([])
  const [category, setCategory] = useState<string>('境界標アップ')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [busyGps, setBusyGps] = useState(false)

  const refreshProjects = async () => setProjects(await getProjects())
  const refreshPoints = async (projectId: string) => setPoints(await getBoundaryPointsByProjectId(projectId))
  const refreshPhotos = async (pointId: string) => setPhotos(await getPhotosByBoundaryPointId(pointId))
  useEffect(() => { void refreshProjects() }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [screen])

  const completion = useMemo(() => {
    if (points.length === 0) return { done: 0, total: 0 }
    const done = points.filter((p) => p.markerType && p.condition).length
    return { done, total: points.length }
  }, [points])

  const openProject = async (p: SurveyProject) => {
    setProject(p); await refreshPoints(p.id); setScreen('project')
  }
  const saveProjectDraft = async () => {
    if (!draftProject) return
    if (!draftProject.title.trim()) { window.alert('案件名を入力してください'); return }
    const saved = { ...draftProject, updatedAt: now() }
    await saveProject(saved); setDraftProject(null); await refreshProjects()
    if (project?.id === saved.id) { setProject(saved); setScreen('project') } else setScreen('projects')
  }
  const removeProject = async (p: SurveyProject) => {
    if (!window.confirm(`「${p.title}」を削除しますか？\n境界点と写真も削除されます。`)) return
    await deleteProject(p.id); await refreshProjects()
  }
  const openPoint = async (p: BoundaryPoint) => {
    setPoint({ ...p, positionMemo: p.positionMemo ?? '' }); await refreshPhotos(p.id); setScreen('point')
  }
  const savePointDraft = async () => {
    if (!draftPoint || !project) return
    if (!draftPoint.name.trim()) { window.alert('境界点名を入力してください'); return }
    const saved = { ...draftPoint, positionMemo: draftPoint.positionMemo ?? '', updatedAt: now() }
    await saveBoundaryPoint(saved); await refreshPoints(project.id); setDraftPoint(null)
    if (point?.id === saved.id) { setPoint(saved); setScreen('point') } else setScreen('project')
  }
  const removePoint = async (p: BoundaryPoint) => {
    if (!project || !window.confirm(`「${p.name}」を削除しますか？\n写真も削除されます。`)) return
    await deleteBoundaryPoint(p.id); await refreshPoints(project.id)
  }
  const addPhotos = async (files: File[]) => {
    if (!project || !point) return
    const base = Date.now(); const failed: string[] = []
    for (const [i, file] of files.entries()) {
      const photo: BoundaryPhoto = {
        id: crypto.randomUUID(), projectId: project.id, boundaryPointId: point.id,
        category, fileName: file.name, fileType: file.type, fileSize: file.size, blob: file,
        createdAt: new Date(base + i).toISOString(),
      }
      try { await savePhoto(photo) } catch { failed.push(file.name) }
    }
    await refreshPhotos(point.id)
    if (failed.length) window.alert(`${failed.length}枚の写真を保存できませんでした。`)
  }
  const removePhoto = async (photo: BoundaryPhoto) => {
    if (!point || !window.confirm('この写真を削除しますか？')) return
    await deletePhoto(photo.id); await refreshPhotos(point.id)
  }
  const updatePhotoCategory = async (photo: BoundaryPhoto, next: string) => {
    if (!point) return
    await savePhoto({ ...photo, category: next }); await refreshPhotos(point.id)
  }
  const downloadPhoto = (photo: BoundaryPhoto) => {
    const url = URL.createObjectURL(photo.blob); const a = document.createElement('a')
    a.href = url; a.download = photo.fileName || 'photo'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const captureGps = () => {
    if (!project) return
    if (!navigator.geolocation) { window.alert('この端末では位置情報を利用できません。'); return }
    setBusyGps(true)
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const saved = { ...project, latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, locationCapturedAt: now(), updatedAt: now() }
      await saveProject(saved); setProject(saved); await refreshProjects(); setBusyGps(false)
    }, () => { setBusyGps(false); window.alert('位置情報を取得できませんでした。') }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  const Header = ({ title, back }: { title: string; back?: () => void }) => <header><div>{back && <PressButton className="back" onPress={back}>‹</PressButton>}<h1>{title}</h1></div></header>

  if (screen === 'projectEdit' && draftProject) return <div className="app"><Header title={project?.id === draftProject.id ? '案件編集' : '案件登録'} back={() => setScreen(project?.id === draftProject.id ? 'project' : 'projects')} /><main className="form">
    <label>案件名<input value={draftProject.title} onChange={(e) => setDraftProject({ ...draftProject, title: e.target.value })} /></label>
    <label>所在地<input value={draftProject.location} onChange={(e) => setDraftProject({ ...draftProject, location: e.target.value })} /></label>
    <label>地番<input value={draftProject.lotNumber} onChange={(e) => setDraftProject({ ...draftProject, lotNumber: e.target.value })} /></label>
    <label>調査日<input type="date" value={draftProject.surveyDate} onChange={(e) => setDraftProject({ ...draftProject, surveyDate: e.target.value })} /></label>
    <label>地目<input value={draftProject.landCategory} onChange={(e) => setDraftProject({ ...draftProject, landCategory: e.target.value })} /></label>
    <label>メモ<textarea rows={4} value={draftProject.memo} onChange={(e) => setDraftProject({ ...draftProject, memo: e.target.value })} /></label>
    <PressButton className="primary" onPress={saveProjectDraft}>保存</PressButton>
  </main></div>

  if (screen === 'pointEdit' && draftPoint) return <div className="app"><Header title="境界点編集" back={() => setScreen(point?.id === draftPoint.id ? 'point' : 'project')} /><main className="form">
    <label>境界点名<input value={draftPoint.name} onChange={(e) => setDraftPoint({ ...draftPoint, name: e.target.value })} /></label>
    <label>境界標種類<PickerSelect value={draftPoint.markerType} onChange={(e) => setDraftPoint({ ...draftPoint, markerType: e.target.value })}>{MARKERS.map((v) => <option key={v} value={v}>{v || '選択してください'}</option>)}</PickerSelect></label>
    <label>状態<PickerSelect value={draftPoint.condition} onChange={(e) => setDraftPoint({ ...draftPoint, condition: e.target.value })}>{CONDITIONS.map((v) => <option key={v} value={v}>{v || '選択してください'}</option>)}</PickerSelect></label>
    <label>位置関係メモ<input value={draftPoint.positionMemo ?? ''} onChange={(e) => setDraftPoint({ ...draftPoint, positionMemo: e.target.value })} /></label>
    <label>メモ<textarea rows={4} value={draftPoint.memo} onChange={(e) => setDraftPoint({ ...draftPoint, memo: e.target.value })} /></label>
    <PressButton className="primary" onPress={savePointDraft}>保存</PressButton>
  </main></div>

  if (screen === 'point' && project && point) return <div className="app"><Header title={point.name} back={() => setScreen('project')} /><main>
    <section className="card"><div className="row"><div><b>{point.markerType || '境界標未設定'}</b><p>{point.condition || '状態未設定'}</p></div><PressButton className="small" onPress={() => { setDraftPoint({ ...point }); setScreen('pointEdit') }}>編集</PressButton></div><p>{point.positionMemo || '位置関係メモなし'}</p><p>{point.memo || 'メモなし'}</p></section>
    <section><div className="section-head"><h2>写真 <small>{photos.length}枚</small></h2><PickerSelect value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((v) => <option key={v}>{v}</option>)}</PickerSelect></div>
      <div className="picker-row"><PickerInput label="📷 撮影" className="capture" inputProps={{ accept: 'image/*', capture: 'environment' }} onFiles={addPhotos} /><PickerInput label="🖼 写真から選択" inputProps={{ accept: 'image/*', multiple: true }} onFiles={addPhotos} /></div>
      <div className="photo-grid">{photos.map((p, i) => <div className="photo-card" key={p.id}><Thumb photo={p} onOpen={() => setViewerIndex(i)} /><PickerSelect value={p.category || ''} onChange={(e) => void updatePhotoCategory(p, e.target.value)}><option value="">未分類</option>{CATEGORIES.map((v) => <option key={v}>{v}</option>)}</PickerSelect><div className="photo-actions"><PressButton onPress={() => downloadPhoto(p)}>保存</PressButton><PressButton className="danger" onPress={() => void removePhoto(p)}>削除</PressButton></div></div>)}</div>
    </section>
    {viewerIndex !== null && <PhotoViewer photos={photos} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />}
  </main></div>

  if (screen === 'project' && project) return <div className="app"><Header title={project.title} back={() => { setProject(null); setScreen('projects'); void refreshProjects() }} /><main>
    <section className="card"><div className="row"><div><b>{project.location || '所在地未入力'}</b><p>{project.lotNumber || '地番未入力'} ／ {project.surveyDate}</p></div><PressButton className="small" onPress={() => { setDraftProject({ ...project }); setScreen('projectEdit') }}>編集</PressButton></div><p>{project.memo || 'メモなし'}</p></section>
    <section className="card"><h2>位置情報</h2>{project.latitude !== undefined ? <p>{project.latitude.toFixed(6)}, {project.longitude?.toFixed(6)}　精度 ±{Math.round(project.accuracy ?? 0)}m</p> : <p>未取得</p>}<div className="actions"><PressButton onPress={captureGps} disabled={busyGps}>{busyGps ? '取得中…' : '現在地を取得'}</PressButton>{project.latitude !== undefined && <PressButton onPress={() => window.open(`https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`, '_blank', 'noopener,noreferrer')}>Googleマップ</PressButton>}</div></section>
    <section className="card"><h2>調査進捗</h2><p>境界点 {completion.done}/{completion.total} 入力済み</p></section>
    <section><div className="section-head"><h2>境界点 <small>{points.length}件</small></h2></div>{points.length === 0 ? <div className="empty">境界点を追加してください</div> : points.map((p) => <div className="list-card" key={p.id}><PressButton className="list-main" onPress={() => void openPoint(p)}><b>{p.name}</b><span>{p.markerType || '種類未設定'} ／ {p.condition || '状態未設定'}</span></PressButton><PressButton className="danger side" onPress={() => void removePoint(p)}>削除</PressButton></div>)}</section>
    <PressButton className="fab" aria-label="境界点を追加" onPress={() => { setPoint(null); setDraftPoint(newPoint(project.id, points.length + 1)); setScreen('pointEdit') }}>＋</PressButton>
  </main></div>

  return <div className="app"><Header title="現場調査" /><main>{projects.length === 0 ? <div className="empty"><b>案件がありません</b><p>右下の＋から案件を登録してください</p></div> : projects.map((p) => <div className="list-card" key={p.id}><PressButton className="list-main" onPress={() => void openProject(p)}><b>{p.title}</b><span>{p.location || '所在地未入力'} ／ {p.surveyDate}</span></PressButton><PressButton className="danger side" onPress={() => void removeProject(p)}>削除</PressButton></div>)}</main><PressButton className="fab" aria-label="案件を追加" onPress={() => { setProject(null); setDraftProject(newProject()); setScreen('projectEdit') }}>＋</PressButton></div>
}
