import { Trophy } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type {
  AchievementFolder,
  ViewerAchievement,
} from '@/lib/achievement-folders';

export function ViewerAchievements({
  achievements,
  folders,
  summary,
  visible = true,
  className,
}: {
  achievements: ViewerAchievement[];
  folders: AchievementFolder[];
  summary: { total: number; completed: number };
  visible?: boolean;
  className?: string;
}) {
  return (
    <details className={className}>
      <summary>
        <Trophy size={18} aria-hidden="true" /> Достижения · {summary.completed}{' '}
        из {summary.total}
      </summary>
      {!visible ? (
        <p>Владелец скрыл подробный прогресс просмотра.</p>
      ) : (
        folders
          .filter((folder) => folder.id !== 'all')
          .map((folder) => (
            <details className="viewer-achievement-folder" key={folder.id}>
              <summary>
                {folder.name} · {folder.completed} из {folder.total}
              </summary>
              <div className="achievement-grid">
                {achievements
                  .filter((item) => item.folder === folder.id)
                  .map((item) => (
                    <div
                      className={
                        'achievement ' + (item.unlocked ? 'unlocked' : '')
                      }
                      key={item.id}
                    >
                      <Trophy size={20} aria-hidden="true" />
                      <strong>{item.title}</strong>
                      <Progress
                        value={
                          item.target > 0
                            ? Math.min(100, (item.current / item.target) * 100)
                            : 0
                        }
                      />
                      <small>
                        {item.unlocked
                          ? 'Получено'
                          : `${Math.min(item.current, item.target)} / ${item.target}`}
                      </small>
                    </div>
                  ))}
              </div>
            </details>
          ))
      )}
    </details>
  );
}
