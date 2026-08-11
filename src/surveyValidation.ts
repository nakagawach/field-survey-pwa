import type {
  BoundaryPoint,
  SurveyProject,
} from './types'

export type SurveyProgressCheck = {
  id: 'gps' | 'boundaryPoints' | 'boundaryInfo' | 'photos'
  complete: boolean
  message: string
}

export type SurveyProgress = {
  percentage: number
  completedCount: number
  totalCount: number
  checks: SurveyProgressCheck[]
}

export const calculateSurveyProgress = (
  project: SurveyProject,
  boundaryPoints: BoundaryPoint[],
  photoCounts: Record<string, number>
): SurveyProgress => {
  const hasGps =
    project.latitude !== undefined &&
    project.longitude !== undefined

  const hasBoundaryPoints = boundaryPoints.length > 0

  const hasCompleteBoundaryInfo =
    hasBoundaryPoints &&
    boundaryPoints.every(
      (point) =>
        point.markerType.trim() !== '' &&
        point.condition.trim() !== ''
    )

  const pointsWithoutPhotos = boundaryPoints.filter(
    (point) => (photoCounts[point.id] ?? 0) === 0
  )

  const allPointsHavePhotos =
    hasBoundaryPoints && pointsWithoutPhotos.length === 0

  const checks: SurveyProgressCheck[] = [
    {
      id: 'gps',
      complete: hasGps,
      message: hasGps
        ? 'GPS取得済み'
        : 'GPSが未取得です',
    },
    {
      id: 'boundaryPoints',
      complete: hasBoundaryPoints,
      message: hasBoundaryPoints
        ? '境界点登録済み'
        : '境界点が登録されていません',
    },
    {
      id: 'boundaryInfo',
      complete: hasCompleteBoundaryInfo,
      message: hasCompleteBoundaryInfo
        ? '境界点情報入力済み'
        : hasBoundaryPoints
          ? '種類または状態が未入力の境界点があります'
          : '境界点情報を入力してください',
    },
    {
      id: 'photos',
      complete: allPointsHavePhotos,
      message: allPointsHavePhotos
        ? 'すべての境界点に写真登録済み'
        : pointsWithoutPhotos.length > 0
          ? pointsWithoutPhotos
              .map((point) => `${point.name}：写真なし`)
              .join('、')
          : '境界点の写真を登録してください',
    },
  ]

  const completedCount = checks.filter(
    (check) => check.complete
  ).length

  return {
    percentage: Math.round(
      (completedCount / checks.length) * 100
    ),
    completedCount,
    totalCount: checks.length,
    checks,
  }
}
