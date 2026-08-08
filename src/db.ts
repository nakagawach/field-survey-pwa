import { openDB } from 'idb';
import type { BoundaryPhoto, BoundaryPoint, SurveyProject } from './types';

const DB_NAME = 'field-survey-db';
const DB_VERSION = 3;

const PROJECT_STORE = 'projects';
const BOUNDARY_POINT_STORE = 'boundaryPoints';
const PHOTO_STORE = 'photos';

const getDB = () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, {
          keyPath: 'id',
        });
      }

      if (!db.objectStoreNames.contains(BOUNDARY_POINT_STORE)) {
        const store = db.createObjectStore(BOUNDARY_POINT_STORE, {
          keyPath: 'id',
        });

        store.createIndex('projectId', 'projectId');
      }

      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, {
          keyPath: 'id',
        });

        store.createIndex('boundaryPointId', 'boundaryPointId');

        store.createIndex('projectId', 'projectId');
      }
    },
  });
};

export const getProjects = async (): Promise<SurveyProject[]> => {
  const db = await getDB();

  const projects = await db.getAll(PROJECT_STORE);

  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const saveProject = async (project: SurveyProject): Promise<void> => {
  const db = await getDB();

  await db.put(PROJECT_STORE, project);
};

export const deleteProject = async (id: string): Promise<void> => {
  const db = await getDB();

  const boundaryPoints = await getBoundaryPointsByProjectId(id);

  const transaction = db.transaction(
    [PROJECT_STORE, BOUNDARY_POINT_STORE, PHOTO_STORE],
    'readwrite'
  );

  await transaction.objectStore(PROJECT_STORE).delete(id);

  for (const point of boundaryPoints) {
    const photos = await getPhotosByBoundaryPointId(point.id);

    for (const photo of photos) {
      await transaction.objectStore(PHOTO_STORE).delete(photo.id);
    }

    await transaction.objectStore(BOUNDARY_POINT_STORE).delete(point.id);
  }

  await transaction.done;
};

export const getBoundaryPointsByProjectId = async (
  projectId: string
): Promise<BoundaryPoint[]> => {
  const db = await getDB();

  const points = await db.getAllFromIndex(
    BOUNDARY_POINT_STORE,
    'projectId',
    projectId
  );

  return points.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
    })
  );
};

export const saveBoundaryPoint = async (
  point: BoundaryPoint
): Promise<void> => {
  const db = await getDB();

  await db.put(BOUNDARY_POINT_STORE, point);
};

export const deleteBoundaryPoint = async (id: string): Promise<void> => {
  const db = await getDB();

  const photos = await getPhotosByBoundaryPointId(id);

  const transaction = db.transaction(
    [BOUNDARY_POINT_STORE, PHOTO_STORE],
    'readwrite'
  );

  for (const photo of photos) {
    await transaction.objectStore(PHOTO_STORE).delete(photo.id);
  }

  await transaction.objectStore(BOUNDARY_POINT_STORE).delete(id);

  await transaction.done;
};

export const getPhotosByBoundaryPointId = async (
  boundaryPointId: string
): Promise<BoundaryPhoto[]> => {
  const db = await getDB();

  const photos = await db.getAllFromIndex(
    PHOTO_STORE,
    'boundaryPointId',
    boundaryPointId
  );

  return photos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const savePhoto = async (photo: BoundaryPhoto): Promise<void> => {
  const db = await getDB();

  await db.put(PHOTO_STORE, photo);
};

export const deletePhoto = async (id: string): Promise<void> => {
  const db = await getDB();

  await db.delete(PHOTO_STORE, id);
};
