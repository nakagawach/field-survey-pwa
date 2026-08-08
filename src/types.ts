export type SurveyProject = {
  id: string;
  title: string;
  location: string;
  lotNumber: string;
  surveyDate: string;
  landCategory: string;
  boundaryChecked: boolean;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type BoundaryPoint = {
  id: string;
  projectId: string;
  name: string;
  markerType: string;
  condition: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type BoundaryPhoto = {
  id: string;
  projectId: string;
  boundaryPointId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  blob: Blob;
  createdAt: string;
};
