import type { BoundaryPoint, SurveyProject } from '../types'

export type ProgressItem = { complete: boolean; text: string }
export type Progress = { percentage: number; items: ProgressItem[] }

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

  const items: ProgressItem[] = [
    { complete: hasGps, text: hasGps ? 'GPS取得済み' : 'GPSが未取得です' },
    { complete: hasPoints, text: hasPoints ? '境界点登録済み' : '境界点が登録されていません' },
    {
      complete: infoDone,
      text: infoDone ? '境界点情報入力済み' : hasPoints ? '種類または状態が未入力の境界点があります' : '境界点情報を入力してください',
    },
    {
      complete: photosDone,
      text: photosDone
        ? 'すべての境界点に写真登録済み'
        : missingPhotos.length
          ? missingPhotos.map((point) => `${point.name}：写真なし`).join('、')
          : '境界点の写真を登録してください',
    },
  ]

  return {
    percentage: Math.round((items.filter((item) => item.complete).length / items.length) * 100),
    items,
  }
}
