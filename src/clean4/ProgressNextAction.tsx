import type { BoundaryPoint } from '../types'

type Props = {
  points: BoundaryPoint[]
  photoCounts: Record<string, number>
}

function missingFor(point: BoundaryPoint, photoCount: number): string[] {
  const missing: string[] = []
  if (!point.markerType.trim()) missing.push('種類')
  if (!point.condition.trim()) missing.push('状態')
  if (photoCount === 0) missing.push('写真')
  return missing
}

export default function ProgressNextAction({ points, photoCounts }: Props) {
  if (points.length === 0) return null

  const statuses = points.map((point) => {
    const missing = missingFor(point, photoCounts[point.id] ?? 0)
    return { point, missing, complete: missing.length === 0 }
  })

  const completedCount = statuses.filter((status) => status.complete).length
  const next = statuses.find((status) => !status.complete)

  return (
    <div className="boundary-progress-detail" aria-label="境界点ごとの進捗">
      <p className="boundary-progress-summary">
        境界点 {completedCount}/{statuses.length} 完了
      </p>
      <div className="boundary-progress-chips">
        {statuses.map(({ point, missing, complete }) => (
          <span key={point.id} className={complete ? 'complete' : 'incomplete'}>
            {complete ? '✓' : '!'} {point.name}
            {!complete && `：${missing.join('・')}`}
          </span>
        ))}
      </div>
      {next && (
        <p className="boundary-next-action">
          次：{next.point.name}の{next.missing.join('・')}
        </p>
      )}
    </div>
  )
}
