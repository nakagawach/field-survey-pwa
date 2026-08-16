import type { BoundaryPoint, SurveyProject } from '../types'

export type ProgressItem = {
  key: string
  label: string
  complete: boolean
}

export type SurveyProgress = {
  percentage: number
  items: ProgressItem[]
}

export const calculateProgress = (
  project: SurveyProject,
  points: BoundaryPoint[],
  photoCounts: Record<string, number>
): SurveyProgress => {
  const hasGps =
    project.latitude !== undefined && project.longitude !== undefined
  const hasPoints = points.length > 0
  const hasPointInfo =
    hasPoints &&
    points.every(
      (point) => point.markerType.trim() !== '' && point.condition.trim() !== ''
    )
  const hasPhotos =
    hasPoints && points.every((point) => (photoCounts[point.id] ?? 0) > 0)

  const items: ProgressItem[] = [
    { key: 'gps', label: '現場位置', complete: hasGps },
    { key: 'points', label: '境界点登録', complete: hasPoints },
    { key: 'info', label: '境界標種類・状態', complete: hasPointInfo },
    { key: 'photos', label: '各境界点の写真', complete: hasPhotos },
  ]

  return {
    items,
    percentage: Math.round(
      (items.filter((item) => item.complete).length / items.length) * 100
    ),
  }
}
