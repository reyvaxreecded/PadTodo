import { inject, Injectable, REQUEST, DOCUMENT } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { TaskList, ListDetail, Task, Category, Section } from '../shared/models';
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private document = inject(DOCUMENT);
  private request = inject(REQUEST, { optional: true });
  private url(path: string) {
    return (
      (this.request ? new URL(this.request.url).origin : this.document.location.origin) +
      '/api' +
      path
    );
  }
  async get<T>(path: string) {
    return (await firstValueFrom(this.http.get<{ data: T }>(this.url(path)))).data;
  }
  async send<T = unknown>(method: string, path: string, body: unknown = {}) {
    const result = await firstValueFrom(
      this.http.request<{ data: T }>(method, this.url(path), { body }),
    );
    return result?.data;
  }
  lists() {
    return this.get<TaskList[]>('/lists');
  }
  list(id: string) {
    return this.get<ListDetail>('/lists/' + id);
  }
  createList(data: Partial<TaskList>) {
    return this.send<TaskList>('POST', '/lists', data);
  }
  saveList(id: string, data: unknown) {
    return this.send<TaskList>('PATCH', '/lists/' + id, data);
  }
  createSection(listId: string, title: string) {
    return this.send<Section>('POST', `/lists/${listId}/sections`, { title });
  }
  createTask(sectionId: string, title: string) {
    return this.send<Task>('POST', `/sections/${sectionId}/tasks`, { title });
  }
  saveTask(task: Task, data: unknown) {
    return this.send<Task>('PATCH', '/tasks/' + task.id, {
      ...(data as object),
      expectedUpdatedAt: task.updatedAt,
    });
  }
  saveCategory(id: string, data: unknown) {
    return this.send<Category>('PATCH', '/categories/' + id, data);
  }
}
