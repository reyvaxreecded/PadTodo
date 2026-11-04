export type Status = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface Category {
  id: string;
  name: string;
  color: string;
  listId: string;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  categoryId: string | null;
  sectionId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
export interface Section {
  level: number;
  id: string;
  title: string;
  listId: string;
  position: number;
  updatedAt: string;
  tasks: Task[];
}
export interface TaskList {
  id: string;
  name: string;
  description: string;
  color: string;
  position: number;
  updatedAt: string;
  openTasks?: number;
}
export interface ListDetail extends TaskList {
  sections: Section[];
  categories: Category[];
}
export const STATUS: Record<Status, string> = {
  TODO: 'À faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminé',
};
export const PRIORITY: Record<Priority, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  CRITICAL: 'Critique',
};
export const STATUSES = Object.keys(STATUS) as Status[];
export const PRIORITIES = Object.keys(PRIORITY) as Priority[];

export interface HeadingResult {
  sectionId: string;
  list: ListDetail;
}
export interface HeadingIntent {
  sectionId: string;
  text: string;
  sourceTaskId?: string;
  expectedUpdatedAt?: string;
  focused: boolean;
  next: boolean;
  clientId?: string;
}
