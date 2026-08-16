import type { BoundaryPoint, SurveyProject } from '../types'

export type ProgressCheck = { id: string; complete: boolean; message: string }
export type Progress = { percentage: number; checks: ProgressCheck[] }

export const calculateProgress = (
  project: SurveyProject,
  points: BoundaryPoint[],
  photoCounts: Record<string, number>
): Progress => {
  const hasGps = project.latitude !== undefined && project.longitude !== undefined
  const hasPoints = points.length > 0
  const allInfo = hasPoints && points.every((p) => p.markerType.trim() && p.condition.trim())
  const allPhotos = hasPoints && points.every((p) => (photoCounts[p.id] ?? 0) > 0)

  const checks: ProgressCheck[] = [
    { id: 'gps', complete: hasGps, message: hasGps ? '現場位置取得済み' : '現場位置を取得してください' },
    { id: 'points', complete: hasPoints, message: hasPoints ? `境界点 ${points.length}点` : '境界点を登録してください' },
    { id: 'info', complete: allInfo, message: allInfo ? '境界点情報入力済み' : '種類または状態が未入力の境界点があります' },
    { id: 'photos', complete: allPhotos, message: allPhotos ? '各境界点に写真あり' : '写真がない境界点があります' },
  ]

  return {
    percentage: Math.round((checks.filter((c) => c.complete).length / checks.length) * 100),
    checks,
  }
}
