import { useEffect, useMemo, useState } from 'react'
import type { BoundaryPhoto, BoundaryPoint, FieldChecklist, SurveyProject } from '../types'
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
type ProjectSort = 'updatedDesc' | 'surveyDateDesc' | 'titleAsc'
type FieldChecklistKey = keyof FieldChecklist

const PHOTO_CATEGORIES = ['全景', '境界標アップ', '接面道路', '周辺状況', '図面・資料', 'その他'] as const
const PHOTO_TAG_SUGGESTIONS = ['道路側', '隣地側', '北側', '南側', '東側', '西側', '既設', '新設', '要確認'] as const
const MARKER_TYPES = ['', 'コンクリート杭', '金属標', '金属鋲', 'プラスチック杭', 'その他']
const CONDITIONS = ['', '良好', '傾き', '破損', '亡失', '確認不能']
const FIELD_CHECKLIST_ITEMS: Array<{ key: FieldChecklistKey; label: string }> = [
  { key: 'siteAccessChecked', label: '現地・接道状況を確認' },
  { key: 'boundaryLayoutChecked', label: '境界点の配置・見落としを確認' },
  { key: 'photoReviewChecked', label: '必要写真の撮り忘れを確認' },
  { key: 'notesLocationChecked', label: 'メモ・位置情報を確認' },
  { key: 'finalWalkthroughChecked', label: '撤収前の最終確認' },
]
const EMPTY_FIELD_CHECKLIST: FieldChecklist = {
  siteAccessChecked: false,
  boundaryLayoutChecked: false,
  photoReviewChecked: false,
  notesLocationChecked: false,
  finalWalkthroughChecked: false,
}
const isoNow = () => new Date().toISOString()
const normalizeTag = (value: string) => value.trim().replace(/\s+/g, ' ')
const uniqueTags = (values: string[]) => Array.from(new Set(values.map(normalizeTag).filter(Boolean)))
const getFieldChecklist = (project: SurveyProject): FieldChecklist => ({
  ...EMPTY_FIELD_CHECKLIST,
  ...(project.fieldChecklist ?? {}),
})

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
  const [projectQuery, setProjectQuery] = useState('')
  const [projectSort, setProjectSort] = useState<ProjectSort>('updatedDesc')
  const [project, setProject] = useState<SurveyProject | null>(null)
  const [projectDraft, setProjectDraft] = useState<SurveyProject | null>(null)
  const [points, setPoints] = useState<BoundaryPoint[]>([])
  const [point, setPoint] = useState<BoundaryPoint | null>(null)
  const [pointDraft, setPointDraft] = useState<BoundaryPoint | null>(null)
  const [photos, setPhotos] = useState<BoundaryPhoto[]>([])
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({})
  const [category, setCategory] = useState<string>('境界標アップ')
  const [captureTags, setCaptureTags] = useState<string[]>([])
  const [newCaptureTag, setNewCaptureTag] = useState('')
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

  const progress = useMemo(() => project ? calculateProgress(project, points, photoCounts) : null, [project, points, photoCounts])

  const visibleProjects = useMemo(() => {
    const query = projectQuery.trim().toLocaleLowerCase('ja-JP')
    const filtered = query
      ? projects.filter((item) => [item.title, item.location, item.lotNumber].some((value) => value.toLocaleLowerCase('ja-JP').includes(query)))
      : [...projects]
    return filtered.sort((a, b) => {
      if (projectSort === 'surveyDateDesc') return b.surveyDate.localeCompare(a.surveyDate) || b.updatedAt.localeCompare(a.updatedAt)
      if (projectSort === 'titleAsc') return a.title.localeCompare(b.title, 'ja', { numeric: true })
      return b.updatedAt.localeCompare(a.updatedAt)
    })
  }, [projectQuery, projectSort, projects])

  const tagChoices = useMemo(() => {
    const recent = [...photos].reverse().flatMap((photo) => photo.tags ?? [])
    return uniqueTags([...recent, ...PHOTO_TAG_SUGGESTIONS, ...captureTags]).slice(0, 14)
  }, [captureTags, photos])

  const openProject = async (nextProject: SurveyProject) => {
    setProject(nextProject)
    await refreshProjectData(nextProject.id)
    setScreen('projectDetail')
  }

  const saveProjectDraft = async () => {
    if (!projectDraft) return
    if (!projectDraft.title.trim()) { window.alert('案件名を入力してください'); return }
    const saved = { ...projectDraft, updatedAt: isoNow() }
    await saveProject(saved)
    await refreshProjects()
    setProjectDraft(null)
    if (project?.id === saved.id) { setProject(saved); setScreen('projectDetail') } else { setProject(null); setScreen('projectList') }
  }

  const duplicateProjectDraft = (source: SurveyProject) => {
    const createdAt = isoNow()
    setProject(null)
    setPoint(null)
    setProjectDraft({ id: crypto.randomUUID(), title: `${source.title}（コピー）`, location: source.location, lotNumber: source.lotNumber, surveyDate: createdAt.slice(0, 10), landCategory: source.landCategory, boundaryChecked: false, memo: source.memo, createdAt, updatedAt: createdAt })
    setScreen('projectEdit')
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
    if (!pointDraft.name.trim()) { window.alert('境界点名を入力してください'); return }
    const saved = { ...pointDraft, positionMemo: pointDraft.positionMemo ?? '', updatedAt: isoNow() }
    await saveBoundaryPoint(saved)
    await refreshProjectData(project.id)
    setPointDraft(null)
    if (point?.id === saved.id) { await refreshPhotos(saved.id); setPoint(saved); setScreen('pointDetail') } else setScreen('projectDetail')
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
      const nextPhoto: BoundaryPhoto = { id: crypto.randomUUID(), projectId: project.id, boundaryPointId: point.id, category, tags: captureTags.length ? [...captureTags] : undefined, fileName: file.name, fileType: file.type, fileSize: file.size, blob: file, createdAt: new Date(base + index).toISOString() }
      try { await savePhoto(nextPhoto) } catch { failed.push(file.name) }
    }
    await refreshPhotos(point.id)
    if (failed.length) window.alert(`${failed.length}枚の写真を保存できませんでした。`)
  }

  const updatePhotoCategory = async (target: BoundaryPhoto, nextCategory: string) => {
    if (!point) return
    await savePhoto({ ...target, category: nextCategory })
    await refreshPhotos(point.id)
  }

  const updatePhotoTags = async (target: BoundaryPhoto, tags: string[]) => {
    if (!point) return
    await savePhoto({ ...target, tags: tags.length ? uniqueTags(tags) : undefined })
    await refreshPhotos(point.id)
  }

  const toggleCaptureTag = (tag: string) => setCaptureTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])

  const addCaptureTag = () => {
    const tag = normalizeTag(newCaptureTag)
    if (!tag) return
    setCaptureTags((current) => uniqueTags([...current, tag]))
    setNewCaptureTag('')
  }

  const addTagToPhoto = async (target: BoundaryPhoto, value: string) => {
    const tag = normalizeTag(value)
    if (!tag) return
    await updatePhotoTags(target, [...(target.tags ?? []), tag])
  }

  const removeTagFromPhoto = async (target: BoundaryPhoto, tag: string) => {
    await updatePhotoTags(target, (target.tags ?? []).filter((value) => value !== tag))
  }

  const togglePhotoTag = async (target: BoundaryPhoto, tag: string) => {
    const current = target.tags ?? []
    if (current.includes(tag)) {
      await removeTagFromPhoto(target, tag)
      return
    }
    await updatePhotoTags(target, [...current, tag])
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
    if (!navigator.geolocation) { window.alert('この端末では位置情報を利用できません。'); return }
    setGpsBusy(true)
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const saved: SurveyProject = { ...project, latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, locationCapturedAt: isoNow(), updatedAt: isoNow() }
      try { await saveProject(saved); setProject(saved); await refreshProjects() } finally { setGpsBusy(false) }
    }, () => { setGpsBusy(false); window.alert('位置情報を取得できませんでした。') }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  const toggleFieldChecklist = async (key: FieldChecklistKey) => {
    if (!project) return
    const current = getFieldChecklist(project)
    const saved: SurveyProject = { ...project, fieldChecklist: { ...current, [key]: !current[key] }, updatedAt: isoNow() }
    await saveProject(saved)
    setProject(saved)
    await refreshProjects()
  }

  const Header = ({ title, onBack }: { title: string; onBack?: () => void }) => (
    <header className="app-header">{onBack && <button type="button" className="back-button" onClick={onBack} aria-label="戻る">‹</button>}<h1>{title}</h1></header>
  )

  if (screen === 'projectEdit' && projectDraft) {
    const editing = project?.id === projectDraft.id
    return <div className="app-shell"><Header title={editing ? '案件編集' : '案件登録'} onBack={() => setScreen(editing ? 'projectDetail' : 'projectList')} /><main className="form-screen"><label>案件名<input value={projectDraft.title} onChange={(e) => setProjectDraft({ ...projectDraft, title: e.target.value })} /></label><label>所在地<input value={projectDraft.location} onChange={(e) => setProjectDraft({ ...projectDraft, location: e.target.value })} /></label><label>地番<input value={projectDraft.lotNumber} onChange={(e) => setProjectDraft({ ...projectDraft, lotNumber: e.target.value })} /></label><label>調査日<input type="date" value={projectDraft.surveyDate} onChange={(e) => setProjectDraft({ ...projectDraft, surveyDate: e.target.value })} /></label><label>地目<input value={projectDraft.landCategory} onChange={(e) => setProjectDraft({ ...projectDraft, landCategory: e.target.value })} /></label><label className="check-row"><input type="checkbox" checked={projectDraft.boundaryChecked} onChange={(e) => setProjectDraft({ ...projectDraft, boundaryChecked: e.target.checked })} />境界確認済み</label><label>メモ<textarea rows={4} value={projectDraft.memo} onChange={(e) => setProjectDraft({ ...projectDraft, memo: e.target.value })} /></label><button type="button" className="primary-button" onClick={() => void saveProjectDraft()}>保存</button></main></div>
  }

  if (screen === 'pointEdit' && pointDraft) {
    const editing = point?.id === pointDraft.id
    return <div className="app-shell"><Header title={editing ? '境界点編集' : '境界点登録'} onBack={() => setScreen(editing ? 'pointDetail' : 'projectDetail')} /><main className="form-screen"><label>境界点名<input value={pointDraft.name} onChange={(e) => setPointDraft({ ...pointDraft, name: e.target.value })} /></label><label>境界標種類<select value={pointDraft.markerType} onChange={(e) => setPointDraft({ ...pointDraft, markerType: e.target.value })}>{MARKER_TYPES.map((value) => <option key={value} value={value}>{value || '選択してください'}</option>)}</select></label><label>状態<select value={pointDraft.condition} onChange={(e) => setPointDraft({ ...pointDraft, condition: e.target.value })}>{CONDITIONS.map((value) => <option key={value} value={value}>{value || '選択してください'}</option>)}</select></label><label>位置関係メモ<input value={pointDraft.positionMemo ?? ''} onChange={(e) => setPointDraft({ ...pointDraft, positionMemo: e.target.value })} /></label><label>メモ<textarea rows={4} value={pointDraft.memo} onChange={(e) => setPointDraft({ ...pointDraft, memo: e.target.value })} /></label><button type="button" className="primary-button" onClick={() => void savePointDraft()}>保存</button></main></div>
  }

  if (screen === 'pointDetail' && project && point) {
    const currentPointIndex = points.findIndex((item) => item.id === point.id)
    const previousPoint = currentPointIndex > 0 ? points[currentPointIndex - 1] : null
    const nextPoint = currentPointIndex >= 0 && currentPointIndex < points.length - 1 ? points[currentPointIndex + 1] : null
    return <div className="app-shell point-detail-shell"><Header title={point.name} onBack={() => setScreen('projectDetail')} /><main className="content-screen point-detail-content"><section className="card"><div className="card-head"><div><h2>{point.markerType || '境界標未設定'}</h2><p>{point.condition || '状態未設定'}</p></div><button type="button" className="small-button" onClick={() => { setPointDraft({ ...point }); setScreen('pointEdit') }}>編集</button></div><p>{point.positionMemo || '位置関係メモなし'}</p><p>{point.memo || 'メモなし'}</p></section><section><div className="section-head"><h2>写真 <small>{photos.length}枚</small></h2><select value={category} onChange={(e) => setCategory(e.target.value)}>{PHOTO_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></div><div className="picker-row point-photo-picker-row"><PickerInput label="🖼 写真から選択" inputProps={{ accept: 'image/*', multiple: true }} onFiles={addPhotos} /></div><div className="photo-grid">{photos.map((photo, index) => <article className="photo-card" key={photo.id}><PhotoThumb photo={photo} onOpen={() => setViewerIndex(index)} /><select value={photo.category || ''} onChange={(e) => void updatePhotoCategory(photo, e.target.value)}><option value="">未分類</option>{PHOTO_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select><div className="photo-tags photo-tags-summary"><div className="tag-chip-list compact">{(photo.tags ?? []).length === 0 ? <span className="tag-empty">タグなし</span> : (photo.tags ?? []).map((tag) => <span key={tag} className="tag-chip photo-tag-display">{tag}</span>)}</div><details className="photo-tag-editor"><summary>タグ編集</summary><div className="photo-tag-editor-panel"><div className="tag-editor-head"><div><strong>写真のタグ</strong><small>候補を押すとその場で追加・解除します。</small></div><button type="button" className="tag-editor-close" aria-label="タグ編集を閉じる" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>×</button></div><div className="capture-tag-selected-preview"><span>現在</span><div className="tag-chip-list compact">{(photo.tags ?? []).length === 0 ? <span className="tag-empty">タグなし</span> : (photo.tags ?? []).map((tag) => <span key={tag} className="tag-chip selected-preview">✓ {tag}</span>)}</div></div><div className="tag-chip-list capture-tag-choices">{tagChoices.map((tag) => <button key={tag} type="button" className={(photo.tags ?? []).includes(tag) ? 'tag-chip active' : 'tag-chip'} onClick={() => void togglePhotoTag(photo, tag)}>{(photo.tags ?? []).includes(tag) ? `✓ ${tag}` : tag}</button>)}</div><form className="photo-tag-form" onSubmit={(e) => { e.preventDefault(); const input = e.currentTarget.elements.namedItem('tag'); if (!(input instanceof HTMLInputElement)) return; const value = input.value; input.value = ''; void addTagToPhoto(photo, value) }}><input name="tag" placeholder="新しいタグを追加" aria-label={`${photo.fileName}にタグを追加`} /><button type="submit">追加</button></form><button type="button" className="tag-editor-done" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>完了して閉じる</button></div></details></div><div className="photo-actions"><button type="button" onClick={() => savePhotoToDevice(photo)}>端末保存</button><button type="button" className="danger-button" onClick={() => void removePhoto(photo)}>削除</button></div></article>)}</div></section><footer className="point-action-footer" aria-label="境界点の撮影操作"><div className="capture-tag-summary-row"><div className="capture-tag-current" aria-label="現在の撮影タグ"><span className="capture-tag-label">🏷</span><div className="capture-tag-current-list">{captureTags.length === 0 ? <span className="capture-tag-none">タグなし</span> : captureTags.slice(0, 3).map((tag) => <span key={tag} className="capture-tag-current-chip">{tag}</span>)}{captureTags.length > 3 && <span className="capture-tag-more">+{captureTags.length - 3}</span>}</div></div><details className="capture-tag-menu"><summary>変更</summary><div className="capture-tag-menu-panel"><div className="tag-editor-head"><div className="capture-tag-menu-head"><strong>撮影タグを選択</strong><small>選択しても候補の位置は変わりません。</small></div><button type="button" className="tag-editor-close" aria-label="撮影タグ選択を閉じる" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>×</button></div><div className="capture-tag-selected-preview"><span>選択中</span><div className="tag-chip-list compact">{captureTags.length === 0 ? <span className="tag-empty">タグなし</span> : captureTags.map((tag) => <span key={tag} className="tag-chip selected-preview">✓ {tag}</span>)}</div></div><div className="tag-chip-list capture-tag-choices">{tagChoices.map((tag) => <button key={tag} type="button" className={captureTags.includes(tag) ? 'tag-chip active' : 'tag-chip'} onClick={() => toggleCaptureTag(tag)}>{captureTags.includes(tag) ? `✓ ${tag}` : tag}</button>)}</div><div className="tag-add-row"><input value={newCaptureTag} onChange={(e) => setNewCaptureTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCaptureTag() } }} placeholder="新しいタグを追加" aria-label="撮影時タグを追加" /><button type="button" onClick={addCaptureTag}>追加</button></div><button type="button" className="tag-editor-done" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>完了して閉じる</button></div></details></div><div className="point-action-row"><button type="button" className="point-nav-button" disabled={!previousPoint} onClick={() => { if (previousPoint) void openPoint(previousPoint) }}>← {previousPoint?.name ?? '前なし'}</button><div className="point-position" aria-label={`境界点 ${currentPointIndex + 1} / ${points.length}`}>{currentPointIndex + 1} / {points.length}</div><button type="button" className="point-nav-button" disabled={!nextPoint} onClick={() => { if (nextPoint) void openPoint(nextPoint) }}>{nextPoint?.name ?? '次なし'} →</button><PickerInput label="📷" className="camera-picker point-footer-camera" inputProps={{ accept: 'image/*', capture: 'environment' }} onFiles={addPhotos} /></div></footer>{viewerIndex !== null && <PhotoViewer photos={photos} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />}</main></div>
  }

  if (screen === 'projectDetail' && project) {
    const pointWithMissingInfo = points.find((item) => !item.markerType.trim() || !item.condition.trim()) ?? null
    const pointWithoutPhoto = points.find((item) => (photoCounts[item.id] ?? 0) === 0) ?? null
    const hasGps = project.latitude !== undefined && project.longitude !== undefined
    const fieldChecklist = getFieldChecklist(project)
    const completedFieldChecks = FIELD_CHECKLIST_ITEMS.filter(({ key }) => fieldChecklist[key]).length
    const nextAction = !hasGps ? { label: '次にやる：GPSを取得', run: () => captureGps() } : points.length === 0 ? { label: '次にやる：境界点を追加', run: () => { setPoint(null); setPointDraft(createPoint(project.id, 1)); setScreen('pointEdit') } } : pointWithMissingInfo ? { label: `次にやる：${pointWithMissingInfo.name}の情報を入力`, run: () => { setPoint(pointWithMissingInfo); setPointDraft({ ...pointWithMissingInfo, positionMemo: pointWithMissingInfo.positionMemo ?? '' }); setScreen('pointEdit') } } : pointWithoutPhoto ? { label: `次にやる：${pointWithoutPhoto.name}の写真を登録`, run: () => { void openPoint(pointWithoutPhoto) } } : !project.boundaryChecked ? { label: '次にやる：境界確認を入力', run: () => { setProjectDraft({ ...project }); setScreen('projectEdit') } } : null
    return <div className="app-shell"><Header title={project.title} onBack={() => { setProject(null); setPoint(null); setScreen('projectList'); void refreshProjects() }} /><main className="content-screen"><section className="card"><div className="card-head"><div><h2>{project.location || '所在地未入力'}</h2><p>{project.lotNumber || '地番未入力'} ／ {project.surveyDate}</p></div><div className="project-detail-actions"><button type="button" className="small-button" onClick={() => { setProjectDraft({ ...project }); setScreen('projectEdit') }}>編集</button><button type="button" className="small-button" onClick={() => duplicateProjectDraft(project)}>複製</button></div></div><p>{project.landCategory || '地目未入力'} ／ {project.boundaryChecked ? '境界確認済み' : '境界未確認'}</p><p>{project.memo || 'メモなし'}</p></section><section className="card"><h2>位置情報</h2>{project.latitude !== undefined && project.longitude !== undefined ? <p>{project.latitude.toFixed(6)}, {project.longitude.toFixed(6)}　精度 ±{Math.round(project.accuracy ?? 0)}m</p> : <p>未取得</p>}<div className="button-row"><button type="button" disabled={gpsBusy} onClick={captureGps}>{gpsBusy ? '取得中…' : '現在地を取得'}</button>{project.latitude !== undefined && project.longitude !== undefined && <button type="button" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`, '_blank', 'noopener,noreferrer')}>Googleマップ</button>}</div></section>{progress && <section className="card progress-card"><div className="progress-title"><h2>調査進捗</h2><strong>{progress.percentage}%</strong></div><div className="progress-track"><div style={{ width: `${progress.percentage}%` }} /></div><ul>{progress.items.map((item) => <li key={item.text} className={item.complete ? 'done' : 'todo'}>{item.complete ? '✓' : '!'} {item.text}</li>)}</ul>{nextAction && <div className="button-row"><button type="button" className="primary-button" disabled={gpsBusy && !hasGps} onClick={nextAction.run}>{gpsBusy && !hasGps ? 'GPS取得中…' : nextAction.label}</button></div>}</section>}<section className="card field-checklist-card"><div className="progress-title"><h2>現場チェック</h2><strong>{completedFieldChecks}/{FIELD_CHECKLIST_ITEMS.length}</strong></div><div className="field-checklist-list">{FIELD_CHECKLIST_ITEMS.map(({ key, label }) => <label key={key} className={fieldChecklist[key] ? 'field-check-item checked' : 'field-check-item'}><input type="checkbox" checked={fieldChecklist[key]} onChange={() => void toggleFieldChecklist(key)} /><span>{label}</span></label>)}</div><p className="field-check-help">調査進捗とは別の、現場での手動確認用チェックです。</p></section><section><div className="section-head"><h2>境界点 <small>{points.length}件</small></h2></div>{points.length === 0 ? <div className="empty-card">境界点を追加してください</div> : points.map((item) => <div className="list-card" key={item.id}><button type="button" className="list-main" onClick={() => void openPoint(item)}><strong>{item.name}</strong><span>{item.markerType || '種類未設定'} ／ {item.condition || '状態未設定'} ／ 写真 {photoCounts[item.id] ?? 0}枚</span></button><button type="button" className="list-delete" onClick={() => void removePoint(item)}>削除</button></div>)}</section><button type="button" className="floating-button" aria-label="境界点を追加" onClick={() => { setPoint(null); setPointDraft(createPoint(project.id, points.length + 1)); setScreen('pointEdit') }}>＋</button></main></div>
  }

  return <div className="app-shell"><Header title="現場調査アプリ（バージョンv1.1）" /><main className="content-screen"><section className="project-tools" aria-label="案件検索と並び替え"><label className="project-search">案件検索<input type="search" value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} placeholder="案件名・所在地・地番" /></label><label className="project-sort">並び替え<select value={projectSort} onChange={(e) => setProjectSort(e.target.value as ProjectSort)}><option value="updatedDesc">更新が新しい順</option><option value="surveyDateDesc">調査日が新しい順</option><option value="titleAsc">案件名順</option></select></label></section>{projects.length === 0 ? <div className="empty-card large">案件がありません<br /><small>右下の＋から案件を登録してください</small></div> : visibleProjects.length === 0 ? <div className="empty-card">検索条件に一致する案件がありません</div> : visibleProjects.map((item) => { const percentage = projectProgress[item.id]; return <div className="project-card" key={item.id}><button type="button" className="project-main" onClick={() => void openProject(item)}><strong>{item.title}{percentage !== undefined && <span style={{ marginLeft: 8, color: percentage === 100 ? '#23733c' : '#1267b9', WebkitTextFillColor: percentage === 100 ? '#23733c' : '#1267b9', fontSize: 13, fontWeight: 700 }}>{percentage === 100 ? '完了' : `${percentage}%`}</span>}</strong><span>{item.location || '所在地未入力'} ／ {item.surveyDate}</span></button><button type="button" className="project-delete" onClick={() => void removeProject(item)}>削除</button></div> })}<button type="button" className="floating-button" aria-label="案件を追加" onClick={() => { setProject(null); setProjectDraft(createProject()); setScreen('projectEdit') }}>＋</button></main></div>
}
