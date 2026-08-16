import type { BoundaryPoint, SurveyProject } from '../types'

export type ProgressItem = { complete: boolean; text: string }
export type Progress = { percentage: number; items: ProgressItem[] }

function getMissingItems(point: BoundaryPoint, photoCount: number): string[] {
  const missing: string[] = []

  if (!point.markerType.trim()) missing.push('種類')
  if (!point.condition.trim()) missing.push('状態')
  if (photoCount === 0) missing.push('写真')

  return missing
}

export function calculateProgress(
  project: SurveyProject,
  points: BoundaryPoint[],
  photoCounts: Record<string, number>,
): Progress {
  const hasGps = project.latitude !== undefined && project.longitude !== undefined
  const hasPoints = points.length > 0
  const infoDone = hasPoints && points.every((point) => point.markerType.trim() && point.condition.trim())
  const missingPhotos = points.filter((point) => (photoCounts[point.id] ?? 0) === 0)
  const photosDone = hasPoints && missingPhotos.length === 0
  const boundaryConfirmed = project.boundaryChecked

  const coreItems: ProgressItem[] = [
    { complete: hasGps, text: hasGps ? 'GPS取得済み' : 'GPSが未取得です' },
    { complete: hasPoints, text: hasPoints ? '境界点登録済み' : '境界点が登録されていません' },
    {
      complete: infoDone,
      text: infoDone
        ? '境界点情報入力済み'
        : hasPoints
          ? '種類または状態が未入力の境界点があります'
          : '境界点情報を入力してください',
    },
    {
      complete: photosDone,
      text: photosDone
        ? 'すべての境界点に写真登録済み'
        : missingPhotos.length
          ? missingPhotos.map((point) => `${point.name}：写真なし`).join('、')
          : '境界点の写真を登録してください',
    },
    {
      complete: boundaryConfirmed,
      text: boundaryConfirmed
        ? '境界確認済み'
        : '境界確認が未完了です',
    },
  ]

  const boundaryStatuses = points.map((point) => {
    const missing = getMissingItems(point, photoCounts[point.id] ?? 0)

    return {
      point,
      missing,
      complete: missing.length === 0,
    }
  })

  const completedBoundaryCount = boundaryStatuses.filter((status) => status.complete).length
  const nextBoundary = boundaryStatuses.find((status) => !status.complete)

  const detailItems: ProgressItem[] = hasPoints
    ? [
        {
          complete: completedBoundaryCount === boundaryStatuses.length,
          text: `境界点 ${completedBoundaryCount}/${boundaryStatuses.length} 完了`,
        },
        ...boundaryStatuses.map(({ point, missing, complete }) => ({
          complete,
          text: complete
            ? `${point.name} 完了`
            : `${point.name}：${missing.join('・')}`,
        })),
        ...(nextBoundary
          ? [{
              complete: false,
              text: `次：${nextBoundary.point.name}の${nextBoundary.missing.join('・')}`,
            }]
          : []),
      ]
    : []

  return {
    percentage: Math.round((coreItems.filter((item) => item.complete).length / coreItems.length) * 100),
    items: [...coreItems, ...detailItems],
  }
}
