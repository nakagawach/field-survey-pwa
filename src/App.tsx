import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'

import './App.css';

import type { BoundaryPhoto, BoundaryPoint, SurveyProject } from './types';

import {
  deleteBoundaryPoint,
  deletePhoto,
  deleteProject,
  getBoundaryPointsByProjectId,
  getPhotosByBoundaryPointId,
  getProjects,
  saveBoundaryPoint,
  savePhoto,
  saveProject,
} from './db';

type Screen =
  | 'projectList'
  | 'projectEdit'
  | 'projectDetail'
  | 'boundaryEdit'
  | 'boundaryDetail';

const createEmptyProject = (): SurveyProject => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: '',
    location: '',
    lotNumber: '',
    surveyDate: new Date().toISOString().slice(0, 10),
    landCategory: '',
    boundaryChecked: false,
    memo: '',
    createdAt: now,
    updatedAt: now,
  };
};

const createEmptyBoundaryPoint = (
  projectId: string,
  number: number
): BoundaryPoint => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    projectId,
    name: `P${number}`,
    markerType: '',
    condition: '',
    memo: '',
    createdAt: now,
    updatedAt: now,
  };
};

function App() {
  const [screen, setScreen] = useState<Screen>('projectList');

  const [projects, setProjects] = useState<SurveyProject[]>([]);

  const [selectedProject, setSelectedProject] = useState<SurveyProject | null>(
    null
  );

  const [editingProject, setEditingProject] = useState<SurveyProject | null>(
    null
  );

  const [boundaryPoints, setBoundaryPoints] = useState<BoundaryPoint[]>([]);

  const [selectedBoundaryPoint, setSelectedBoundaryPoint] =
    useState<BoundaryPoint | null>(null);

  const [editingBoundaryPoint, setEditingBoundaryPoint] =
    useState<BoundaryPoint | null>(null);

  const [photos, setPhotos] = useState<BoundaryPhoto[]>([]);

  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});

  const loadProjects = async () => {
    const data = await getProjects();
    setProjects(data);
  };

  const loadBoundaryPoints = async (projectId: string) => {
    const data = await getBoundaryPointsByProjectId(projectId);

    setBoundaryPoints(data);

    const counts: Record<string, number> = {};

    for (const point of data) {
      const pointPhotos = await getPhotosByBoundaryPointId(point.id);

      counts[point.id] = pointPhotos.length;
    }

    setPhotoCounts(counts);
  };

  const loadPhotos = async (boundaryPointId: string) => {
    const data = await getPhotosByBoundaryPointId(boundaryPointId);

    setPhotos(data);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleNewProject = () => {
    setEditingProject(createEmptyProject());
    setScreen('projectEdit');
  };

  const handleEditProject = (project: SurveyProject) => {
    setEditingProject({
      ...project,
    });

    setScreen('projectEdit');
  };

  const handleSaveProject = async () => {
    if (!editingProject) {
      return;
    }

    if (!editingProject.title.trim()) {
      alert('案件名を入力してください');
      return;
    }

    const projectToSave: SurveyProject = {
      ...editingProject,
      updatedAt: new Date().toISOString(),
    };

    await saveProject(projectToSave);

    setEditingProject(null);

    await loadProjects();

    if (selectedProject?.id === projectToSave.id) {
      setSelectedProject(projectToSave);
      setScreen('projectDetail');
    } else {
      setScreen('projectList');
    }
  };

  const handleDeleteProject = async (project: SurveyProject) => {
    const ok = window.confirm(
      `「${project.title}」を削除しますか？\n境界点と写真も削除されます。`
    );

    if (!ok) {
      return;
    }

    await deleteProject(project.id);

    await loadProjects();
  };

  const handleOpenProject = async (project: SurveyProject) => {
    setSelectedProject(project);

    await loadBoundaryPoints(project.id);

    setScreen('projectDetail');
  };

  const handleNewBoundaryPoint = () => {
    if (!selectedProject) {
      return;
    }

    const point = createEmptyBoundaryPoint(
      selectedProject.id,
      boundaryPoints.length + 1
    );

    setEditingBoundaryPoint(point);

    setScreen('boundaryEdit');
  };

  const handleEditBoundaryPoint = (point: BoundaryPoint) => {
    setEditingBoundaryPoint({
      ...point,
    });

    setScreen('boundaryEdit');
  };

  const handleSaveBoundaryPoint = async () => {
    if (!editingBoundaryPoint || !selectedProject) {
      return;
    }

    if (!editingBoundaryPoint.name.trim()) {
      alert('境界点名を入力してください');
      return;
    }

    const pointToSave: BoundaryPoint = {
      ...editingBoundaryPoint,
      updatedAt: new Date().toISOString(),
    };

    await saveBoundaryPoint(pointToSave);

    setEditingBoundaryPoint(null);

    await loadBoundaryPoints(selectedProject.id);

    setScreen('projectDetail');
  };

  const handleDeleteBoundaryPoint = async (point: BoundaryPoint) => {
    if (!selectedProject) {
      return;
    }

    const ok = window.confirm(
      `「${point.name}」を削除しますか？\n写真も削除されます。`
    );

    if (!ok) {
      return;
    }

    await deleteBoundaryPoint(point.id);

    await loadBoundaryPoints(selectedProject.id);
  };

  const handleOpenBoundaryPoint = async (point: BoundaryPoint) => {
    setSelectedBoundaryPoint(point);

    await loadPhotos(point.id);

    setScreen('boundaryDetail');
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedProject || !selectedBoundaryPoint) {
      return;
    }

    const files = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    for (const file of Array.from(files)) {
      const photo: BoundaryPhoto = {
        id: crypto.randomUUID(),
        projectId: selectedProject.id,
        boundaryPointId: selectedBoundaryPoint.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        blob: file,
        createdAt: new Date().toISOString(),
      };

      await savePhoto(photo);
    }

    event.target.value = '';

    await loadPhotos(selectedBoundaryPoint.id);

    await loadBoundaryPoints(selectedProject.id);
  };

  const handleDeletePhoto = async (photo: BoundaryPhoto) => {
    if (!selectedBoundaryPoint || !selectedProject) {
      return;
    }

    const ok = window.confirm('この写真を削除しますか？');

    if (!ok) {
      return;
    }

    await deletePhoto(photo.id);

    await loadPhotos(selectedBoundaryPoint.id);

    await loadBoundaryPoints(selectedProject.id);
  };

  if (screen === 'projectEdit' && editingProject) {
    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => {
              if (selectedProject) {
                setScreen('projectDetail');
              } else {
                setScreen('projectList');
              }
            }}
          >
            ←
          </button>

          <h1>案件編集</h1>
        </header>

        <main className="form-container">
          <label>
            案件名
            <input
              type="text"
              value={editingProject.title}
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  title: e.target.value,
                })
              }
            />
          </label>

          <label>
            所在
            <input
              type="text"
              value={editingProject.location}
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  location: e.target.value,
                })
              }
            />
          </label>

          <label>
            地番
            <input
              type="text"
              value={editingProject.lotNumber}
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  lotNumber: e.target.value,
                })
              }
            />
          </label>

          <label>
            調査日
            <input
              type="date"
              value={editingProject.surveyDate}
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  surveyDate: e.target.value,
                })
              }
            />
          </label>

          <label>
            現況地目
            <select
              value={editingProject.landCategory}
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  landCategory: e.target.value,
                })
              }
            >
              <option value="">選択してください</option>
              <option value="宅地">宅地</option>
              <option value="田">田</option>
              <option value="畑">畑</option>
              <option value="山林">山林</option>
              <option value="雑種地">雑種地</option>
              <option value="道路">道路</option>
              <option value="その他">その他</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={editingProject.boundaryChecked}
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  boundaryChecked: e.target.checked,
                })
              }
            />
            境界標確認済み
          </label>

          <label>
            現地メモ
            <textarea
              value={editingProject.memo}
              onChange={(e) =>
                setEditingProject({
                  ...editingProject,
                  memo: e.target.value,
                })
              }
              rows={6}
            />
          </label>

          <button className="save-button" onClick={handleSaveProject}>
            保存
          </button>
        </main>
      </div>
    );
  }

  if (screen === 'boundaryEdit' && editingBoundaryPoint) {
    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => setScreen('projectDetail')}
          >
            ←
          </button>

          <h1>境界点編集</h1>
        </header>

        <main className="form-container">
          <label>
            境界点名
            <input
              type="text"
              value={editingBoundaryPoint.name}
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  name: e.target.value,
                })
              }
            />
          </label>

          <label>
            境界標の種類
            <select
              value={editingBoundaryPoint.markerType}
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  markerType: e.target.value,
                })
              }
            >
              <option value="">選択してください</option>
              <option value="コンクリート杭">コンクリート杭</option>
              <option value="金属標">金属標</option>
              <option value="金属鋲">金属鋲</option>
              <option value="プラスチック杭">プラスチック杭</option>
              <option value="刻印">刻印</option>
              <option value="境界標なし">境界標なし</option>
              <option value="その他">その他</option>
            </select>
          </label>

          <label>
            状態
            <select
              value={editingBoundaryPoint.condition}
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  condition: e.target.value,
                })
              }
            >
              <option value="">選択してください</option>
              <option value="良好">良好</option>
              <option value="傾きあり">傾きあり</option>
              <option value="摩耗あり">摩耗あり</option>
              <option value="破損">破損</option>
              <option value="不明">不明</option>
            </select>
          </label>

          <label>
            メモ
            <textarea
              value={editingBoundaryPoint.memo}
              onChange={(e) =>
                setEditingBoundaryPoint({
                  ...editingBoundaryPoint,
                  memo: e.target.value,
                })
              }
              rows={6}
            />
          </label>

          <button className="save-button" onClick={handleSaveBoundaryPoint}>
            保存
          </button>
        </main>
      </div>
    );
  }

  if (screen === 'boundaryDetail' && selectedBoundaryPoint) {
    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => {
              setSelectedBoundaryPoint(null);
              setPhotos([]);
              setScreen('projectDetail');
            }}
          >
            ←
          </button>

          <h1>境界点詳細</h1>
        </header>

        <main className="project-container">
          <section className="detail-card">
            <div className="detail-header">
              <div>
                <h2>{selectedBoundaryPoint.name}</h2>

                <p>{selectedBoundaryPoint.markerType || '境界標未入力'}</p>
              </div>

              <button
                className="small-button"
                onClick={() => handleEditBoundaryPoint(selectedBoundaryPoint)}
              >
                編集
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">種類</span>
                <strong>{selectedBoundaryPoint.markerType || '未入力'}</strong>
              </div>

              <div>
                <span className="detail-label">状態</span>
                <strong>{selectedBoundaryPoint.condition || '未入力'}</strong>
              </div>
            </div>

            {selectedBoundaryPoint.memo && (
              <div className="project-memo">
                <span className="detail-label">メモ</span>
                <p>{selectedBoundaryPoint.memo}</p>
              </div>
            )}
          </section>

          <section className="photo-section">
            <div className="section-title-row">
              <div>
                <h2>写真</h2>

                <span className="count-text">{photos.length}枚</span>
              </div>

              <label className="small-button photo-add-button">
                ＋ 写真追加
                <input
                  className="hidden-file-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handlePhotoSelected}
                />
              </label>
            </div>

            {photos.length === 0 ? (
              <div className="boundary-empty">
                <div className="boundary-empty-icon">📷</div>

                <p>写真がありません</p>

                <span>「＋ 写真追加」から撮影してください</span>
              </div>
            ) : (
              <div className="photo-grid">
                {photos.map((photo) => {
                  const imageUrl = URL.createObjectURL(photo.blob);

                  return (
                    <div className="photo-card" key={photo.id}>
                      <img
                        src={imageUrl}
                        alt={photo.fileName}
                        onLoad={() => URL.revokeObjectURL(imageUrl)}
                      />

                      <button
                        className="photo-delete-button"
                        onClick={() => handleDeletePhoto(photo)}
                      >
                        削除
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (screen === 'projectDetail' && selectedProject) {
    return (
      <div className="app">
        <header className="header">
          <button
            className="back-button"
            onClick={() => {
              setSelectedProject(null);
              setBoundaryPoints([]);
              setScreen('projectList');
            }}
          >
            ←
          </button>

          <h1>案件詳細</h1>
        </header>

        <main className="project-container">
          <section className="detail-card">
            <div className="detail-header">
              <div>
                <h2>{selectedProject.title}</h2>

                <p>{selectedProject.location || '所在地未入力'}</p>
              </div>

              <button
                className="small-button"
                onClick={() => handleEditProject(selectedProject)}
              >
                編集
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <span className="detail-label">地番</span>
                <strong>{selectedProject.lotNumber || '未入力'}</strong>
              </div>

              <div>
                <span className="detail-label">調査日</span>
                <strong>{selectedProject.surveyDate}</strong>
              </div>

              <div>
                <span className="detail-label">現況地目</span>
                <strong>{selectedProject.landCategory || '未入力'}</strong>
              </div>

              <div>
                <span className="detail-label">境界標確認</span>
                <strong>
                  {selectedProject.boundaryChecked ? '確認済み' : '未確認'}
                </strong>
              </div>
            </div>

            {selectedProject.memo && (
              <div className="project-memo">
                <span className="detail-label">現地メモ</span>
                <p>{selectedProject.memo}</p>
              </div>
            )}
          </section>

          <section className="boundary-section">
            <div className="section-title-row">
              <div>
                <h2>境界点</h2>

                <span className="count-text">{boundaryPoints.length}点</span>
              </div>

              <button className="small-button" onClick={handleNewBoundaryPoint}>
                ＋ 追加
              </button>
            </div>

            {boundaryPoints.length === 0 ? (
              <div className="boundary-empty">
                <div className="boundary-empty-icon">📍</div>

                <p>境界点がありません</p>

                <span>「＋ 追加」から登録してください</span>
              </div>
            ) : (
              <div className="boundary-list">
                {boundaryPoints.map((point) => (
                  <div className="boundary-card" key={point.id}>
                    <button
                      className="boundary-main"
                      onClick={() => handleOpenBoundaryPoint(point)}
                    >
                      <div className="boundary-name">{point.name}</div>

                      <div className="boundary-info">
                        <span>
                          種類：
                          {point.markerType || '未入力'}
                        </span>

                        <span>
                          状態：
                          {point.condition || '未入力'}
                        </span>

                        <span>
                          写真：
                          {photoCounts[point.id] ?? 0}枚
                        </span>
                      </div>
                    </button>

                    <button
                      className="boundary-delete-button"
                      onClick={() => handleDeleteBoundaryPoint(point)}
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <button className="floating-button" onClick={handleNewBoundaryPoint}>
          ＋
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>現場調査</h1>
      </header>

      <main className="project-container">
        {projects.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📍</div>

            <p>案件がありません</p>

            <small>右下の＋から案件を登録してください</small>
          </div>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <div className="project-card" key={project.id}>
                <button
                  className="project-main"
                  onClick={() => handleOpenProject(project)}
                >
                  <strong>{project.title}</strong>

                  <span>{project.location || '所在地未入力'}</span>

                  <span>
                    地番：
                    {project.lotNumber || '未入力'}
                  </span>

                  <span>
                    調査日：
                    {project.surveyDate}
                  </span>
                </button>

                <button
                  className="delete-button"
                  onClick={() => handleDeleteProject(project)}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <button className="floating-button" onClick={handleNewProject}>
        ＋
      </button>
    </div>
  );
}

export default App;
