export type SurveyProject = {
  id: string
  title: string
  location: string
  lotNumber: string
  surveyDate: string
  landCategory: string
  boundaryChecked: boolean
  memo: string

  // 案件単位のGPS情報
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

  // 境界点の位置関係を文章で記録
  positionMemo: string

  memo: string
  createdAt: string
  updatedAt: string
}

export type BoundaryPhoto = {
  id: string
  projectId: string
  boundaryPointId: string
  fileName: string
  fileType: string
  fileSize: number
  blob: Blob
  createdAt: string
}