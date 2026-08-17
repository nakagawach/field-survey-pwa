export type SurveyProject = {
  id: string
  title: string
  location: string
  lotNumber: string
  surveyDate: string
  landCategory: string
  boundaryChecked: boolean
  memo: string

  latitude?: number
  longitude?: number
  accuracy?: number
  locationCapturedAt?: string

  createdAt: string
  updatedAt: string
}

export type BoundaryPoint = {
  id: string
  projectId: string
  name: string
  markerType: string
  condition: string
  positionMemo: string
  memo: string
  createdAt: string
  updatedAt: string
}

export type BoundaryPhoto = {
  id: string
  projectId: string
  boundaryPointId: string

  // 写真種別
  category?: string

  // 任意の整理タグ。既存写真は未定義のまま互換利用する。
  tags?: string[]

  fileName: string
  fileType: string
  fileSize: number
  blob: Blob
  createdAt: string
}