import type {
  BoundaryPoint,
  SurveyProject,
} from './types'

export type SurveyProgressCheck = {
  id:
    | 'gps'
    | 'boundaryPoints'
    | 'boundaryInfo'
    | 'photos'
    | 'boundaryCompletion'
  complete: boolean
  message: string
}

export type BoundaryPointCompletion = {
  complete: boolean
  completedCount: number
  totalCount: number
  missing: string[]
}

export type SurveyProgress = {
  percentage: number
  completedCount: number
  totalCount: number
  checks: SurveyProgressCheck[]
}

export const calculateBoundaryPointCompletion = (
  point: BoundaryPoint,
  photoCount: number
): BoundaryPointCompletion => {
  const missing: string[] = []

  if (point.markerType.trim() === '') {
    missing.push('境界標種類')
  }

  if (point.condition.trim() === '') {
    missing.push('状態')
  }

  if (photoCount === 0) {
    missing.push('写真')
  }

  const totalCount = 3
  const completedCount = totalCount - missing.length

  return {
    complete: missing.length === 0,
    completedCount,
    totalCount,
    missing,
  }
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

  const incompleteBoundaryInfo = boundaryPoints.filter(
    (point) =>
      point.markerType.trim() === '' ||
      point.condition.trim() === ''
  )

  const hasCompleteBoundaryInfo =
    hasBoundaryPoints && incompleteBoundaryInfo.length === 0

  const pointsWithoutPhotos = boundaryPoints.filter(
    (point) => (photoCounts[point.id] ?? 0) === 0
  )

  const allPointsHavePhotos =
    hasBoundaryPoints && pointsWithoutPhotos.length === 0

  const pointCompletion = boundaryPoints.map((point) => ({
    point,
    completion: calculateBoundaryPointCompletion(
      point,
      photoCounts[point.id] ?? 0
    ),
  }))

  const completedBoundaryPoints = pointCompletion.filter(
    ({ completion }) => completion.complete
  ).length

  const allBoundaryPointsComplete =
    hasBoundaryPoints &&
    completedBoundaryPoints === boundaryPoints.length

  const pointStatusText = pointCompletion
    .map(({ point, completion }) =>
      completion.complete
        ? `✓ ${point.name}`
        : `! ${point.name}：${completion.missing.join('・')}`
    )
    .join(' ／ ')

  const nextIncomplete = pointCompletion.find(
    ({ completion }) => !completion.complete
  )

  const nextActionText = nextIncomplete
    ? `｜次：${nextIncomplete.point.name}の${nextIncomplete.completion.missing.join('・')}`
    : ''

  const boundaryCompletionMessage = !hasBoundaryPoints
    ? '境界点を登録すると完了チェックを開始します'
    : `境界点 ${completedBoundaryPoints}/${boundaryPoints.length} 完了${
        pointStatusText ? `｜${pointStatusText}` : ''
      }${nextActionText}`

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
        : incompleteBoundaryInfo.length > 0
          ? `${incompleteBoundaryInfo
              .map((point) => point.name)
              .join('、')}：種類または状態が未入力`
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
    {
      id: 'boundaryCompletion',
      complete: allBoundaryPointsComplete,
      message: boundaryCompletionMessage,
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
