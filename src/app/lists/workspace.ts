import {
  Component,
  inject,
  signal,
  computed,
  DestroyRef,
  OnInit,
  ViewChildren,
  QueryList,
  DOCUMENT,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { sectionTree, flattenSections, type SectionNode } from '../sections/tree';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  FormsModule,
  ReactiveFormsModule,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import {
  CdkDrag,
  CdkDropList,
  CdkDragHandle,
  type CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { CategoryManager } from '../categories/category-manager';
import { reordered } from '../sections/order';
import { Api } from '../core/api';
import { Preferences } from '../core/preferences';
import { Realtime } from '../core/realtime';
import { Icon } from '../shared/icon';
import { NoteComposer, type ComposedNote, type ComposedHeading } from '../tasks/note-composer';
import { SectionHeading } from '../sections/section-heading';
import { WritingGuide } from '../tasks/writing-guide';
import { editingFields, parseHeading, newDraftId, type ContinueLine } from '../tasks/note-text';
import { TaskRow } from '../tasks/task-row';
import { TaskDetail } from '../tasks/task-detail';
import {
  type Task,
  type TaskList,
  type ListDetail,
  type HeadingIntent,
  type HeadingResult,
  type Category,
  type Section,
  STATUS,
  PRIORITY,
  STATUSES,
  PRIORITIES,
  type Status,
  type Priority,
} from '../shared/models';
import { emptyFilters, matches, isFiltered, type Filters } from '../shared/filters';
type Dialog = {
  expectedUpdatedAt?: string;
  kind: 'list' | 'section' | 'category' | 'confirm';
  title: string;
  id?: string;
  message?: string;
  action?: () => Promise<unknown>;
};
@Component({
  selector: 'app-workspace',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    Icon,
    TaskRow,
    NoteComposer,
    SectionHeading,
    WritingGuide,
    TaskDetail,
    CategoryManager,
    CdkDrag,
    CdkDropList,
    CdkDragHandle,
    CdkTrapFocus,
  ],
  templateUrl: './workspace.html',
  styleUrl: './workspace.scss',
  host: { '(keydown)': 'editorKey($event)', '(input)': 'typed()' },
})
export class Workspace implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy = inject(DestroyRef);
  private document = inject(DOCUMENT);
  @ViewChildren(TaskRow) rows!: QueryList<TaskRow>;
  @ViewChildren(NoteComposer) composers!: QueryList<NoteComposer>;
  @ViewChildren(SectionHeading) headings!: QueryList<SectionHeading>;
  prefs = inject(Preferences);
  realtime = inject(Realtime);
  lists = signal<TaskList[]>([]);
  list = signal<ListDetail | null>(null);
  loading = signal(true);
  error = signal('');
  busy = signal(false);
  notice = signal('');
  filters = signal<Filters>(emptyFilters());
  showFilters = signal(false);
  showEmpty = signal(false);
  selected = signal<Task | null>(null);
  dialog = signal<Dialog | null>(null);
  settings = signal(false);
  mobileNavOpen = signal(false);
  STATUS = STATUS;
  PRIORITY = PRIORITY;
  STATUSES = STATUSES;
  PRIORITIES = PRIORITIES;
  pendingLine = signal<{ sectionId: string; anchorId: string; side: 'after' | 'before' } | null>(
    null,
  );
  activeSection = signal<string | null>(null);
  undo = signal<{ token: string; expiresAt: string; task: Task } | null>(null);
  restoring = signal(false);
  private undoShortcut = false;
  private undoTimer: ReturnType<typeof setTimeout> | undefined;

  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private refreshRunning = false;
  private refreshAgain = false;
  allTasks = computed(() => this.list()?.sections.flatMap((s) => s.tasks) ?? []);
  done = computed(() => this.allTasks().filter((t) => t.status === 'DONE').length);
  progress = computed(() =>
    this.allTasks().length ? Math.round((this.done() / this.allTasks().length) * 100) : 0,
  );
  filtered = computed(() => isFiltered(this.filters()));
  visible = computed(
    () =>
      new Map(
        this.list()?.sections.map((s) => [
          s.id,
          s.tasks.filter((t) => matches(t, this.filters())),
        ]) ?? [],
      ),
  );
  sectionTree = computed(() => sectionTree(this.list()?.sections ?? []));
  taskDropIds = computed(() => this.list()?.sections.map((s) => s.id) ?? []);
  sectionVisible(section: SectionNode): boolean {
    return (
      !this.filtered() ||
      this.showEmpty() ||
      !!this.tasks(section).length ||
      section.children.some((child) => this.sectionVisible(child))
    );
  }
  sectionNumber(id: string) {
    return ((this.list()?.sections.findIndex((s) => s.id === id) ?? -1) + 1)
      .toString()
      .padStart(2, '0');
  }
  resultCount = computed(() => [...this.visible().values()].reduce((n, t) => n + t.length, 0));
  stale = computed(() => {
    const selected = this.selected();
    if (!selected) return false;
    return this.allTasks().find((t) => t.id === selected.id)?.updatedAt !== selected.updatedAt;
  });
  form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(10000),
    }),
    color: new FormControl('#65866b', { nonNullable: true }),
  });
  constructor() {
    const unsubscribe = this.realtime.subscribe((change) => {
      if (
        !change ||
        !change.listId ||
        change.listId === this.route.snapshot.paramMap.get('id') ||
        change.type.startsWith('list.')
      )
        this.scheduleRefresh();
      else this.scheduleRefresh(true);
    });
    this.destroy.onDestroy(() => {
      this.stopped = true;
      this.generation++;
      unsubscribe();
      clearTimeout(this.timer);
      clearTimeout(this.noticeTimer);
      clearTimeout(this.undoTimer);
    });
    const querySubscription = this.route.queryParamMap.subscribe((params) => {
      this.filters.set({
        search: params.get('q') ?? '',
        statuses: (params.get('status')?.split(',') ?? []).filter((s): s is Status =>
          STATUSES.includes(s as Status),
        ),
        priorities: (params.get('priority')?.split(',') ?? []).filter((p): p is Priority =>
          PRIORITIES.includes(p as Priority),
        ),
        categories: params.get('category')?.split(',').filter(Boolean) ?? [],
        hideDone: params.get('hideDone') === '1',
      });
    });
    this.destroy.onDestroy(() => querySubscription.unsubscribe());
  }
  ngOnInit() {
    const subscription = this.route.paramMap.subscribe(() => {
      this.selected.set(null);
      this.pendingLine.set(null);
      this.settings.set(false);
      void this.load(true);
    });
    this.destroy.onDestroy(() => subscription.unsubscribe());
  }
  private scheduleRefresh(_listsOnly = false) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(false), 120);
  }
  async load(initial = false) {
    if (this.stopped) return;
    if (!initial && this.refreshRunning) {
      this.refreshAgain = true;
      return;
    }
    const token = ++this.generation;
    const id = this.route.snapshot.paramMap.get('id');
    this.refreshRunning = true;
    if (initial) {
      this.loading.set(true);
      this.list.set(null);
    }
    try {
      const [lists, list] = await Promise.all([
        this.api.lists(),
        id ? this.api.list(id) : Promise.resolve(null),
      ]);
      if (this.stopped || token !== this.generation) return;
      this.lists.set(lists);
      this.list.set(list);
      this.error.set('');
      if (!id && lists.length)
        void this.router.navigate(['/lists', lists[0].id], { replaceUrl: true });
      if (
        this.selected() &&
        !list?.sections.some((s) => s.tasks.some((t) => t.id === this.selected()?.id))
      ) {
        this.selected.set(null);
        this.flash('Cette tâche a été supprimée.');
      }
    } catch (error) {
      if (token === this.generation) {
        const e = error as { status?: number };
        if (e.status === 404) {
          void this.router.navigate(['/'], { replaceUrl: true });
        } else
          this.error.set(
            'Impossible de charger les données. Vérifiez le serveur et la connexion PostgreSQL.',
          );
      }
    } finally {
      if (token === this.generation) {
        this.loading.set(false);
        this.refreshRunning = false;
        if (this.refreshAgain) {
          this.refreshAgain = false;
          this.scheduleRefresh();
        }
      }
    }
  }
  async act(action: () => Promise<unknown>, message = 'Modifications enregistrées') {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      await action();
      await this.load();
      this.flash(message);
      return true;
    } catch (error) {
      const e = error as { error?: { error?: { message?: string } } };
      this.flash(
        e.error?.error?.message ?? 'Enregistrement impossible. Vérifiez votre connexion.',
        true,
      );
      this.scheduleRefresh();
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  flash(message: string, failure = false) {
    clearTimeout(this.noticeTimer);
    this.notice.set((failure ? 'Erreur : ' : '') + message);
    this.noticeTimer = setTimeout(() => this.notice.set(''), failure ? 10000 : 3500);
  }
  updateFilter(patch: Partial<Filters>) {
    this.filters.update((f) => ({ ...f, ...patch }));
    const f = this.filters();
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: f.search || null,
        status: f.statuses.join(',') || null,
        priority: f.priorities.join(',') || null,
        category: f.categories.join(',') || null,
        hideDone: f.hideDone ? '1' : null,
      },
    });
  }
  toggleFilter(group: 'statuses' | 'priorities' | 'categories', value: string) {
    const values = this.filters()[group] as string[];
    this.updateFilter({
      [group]: values.includes(value) ? values.filter((x) => x !== value) : [...values, value],
    });
  }
  resetFilters() {
    this.updateFilter(emptyFilters());
  }
  tasks(section: Section) {
    return this.visible().get(section.id) ?? [];
  }
  sectionDone(section: Section) {
    return section.tasks.filter((t) => t.status === 'DONE').length;
  }
  startRenameSection(section: Section) {
    this.headings.find((h) => h.section().id === section.id)?.edit();
  }
  sectionChanged(section: Section) {
    const editor = this.headings.find((h) => h.section().id === section.id);
    const state = editor?.captureEditing();
    const continuing = editor?.continuing;
    this.list.update((l) =>
      l
        ? {
            ...l,
            sections: l.sections.map((s) =>
              s.id === section.id ? { ...s, ...section, tasks: s.tasks } : s,
            ),
          }
        : l,
    );
    if (state) this.revealSection(section.id);
    if (state)
      setTimeout(() => {
        const next = this.headings.find((h) => h.section().id === section.id);
        if (next && next !== editor) {
          if (continuing) this.focusQuick(section.id);
          else next.restoreEditing(state);
        }
      }, 0);
    this.scheduleRefresh();
  }
  async startNote() {
    const list = this.list();
    if (!list) return;
    if (this.filtered()) this.resetFilters();
    let section = list.sections.find((s) => s.id === this.activeSection()) ?? list.sections[0];
    if (!section) {
      try {
        const created = await this.api.createSection(list.id, 'Notes de réunion');
        section = { ...created, tasks: [] };
        this.list.update((l) =>
          l && l.id === list.id ? { ...l, sections: [...l.sections, section!] } : l,
        );
      } catch {
        this.flash('Impossible de créer la section. Réessayez.', true);
        return;
      }
    }
    this.pendingLine.set(null);
    this.activeSection.set(section.id);
    this.focusQuick(section.id);
  }
  continueAfter(section: Section, task: Task, event: ContinueLine) {
    this.activeSection.set(section.id);
    this.pendingLine.set({ sectionId: section.id, anchorId: task.id, side: event.side });
    setTimeout(() => this.document.getElementById('new-' + task.id)?.focus(), 0);
  }
  makeHeading = async (intent: HeadingIntent): Promise<boolean> => {
    const heading = parseHeading(intent.text);
    const list = this.list();
    if (!heading?.title || !list) return false;
    try {
      const result = await this.api.send<HeadingResult>(
        'POST',
        `/sections/${intent.sectionId}/headings`,
        {
          ...heading,
          listId: list.id,
          clientId: intent.clientId ?? newDraftId(),
          ...(intent.sourceTaskId
            ? { sourceTaskId: intent.sourceTaskId, expectedUpdatedAt: intent.expectedUpdatedAt }
            : {}),
        },
      );
      this.rows.find((r) => r.task().id === intent.sourceTaskId)?.draft.discard();
      this.headingComposed({ result, focused: intent.focused, next: intent.next });
      return true;
    } catch (error) {
      const e = error as { error?: { error?: { message?: string } } };
      this.flash(
        e.error?.error?.message ?? 'Impossible de créer le titre. Votre saisie est conservée.',
        true,
      );
      return false;
    }
  };
  headingComposed(event: ComposedHeading) {
    if (this.list()?.id !== event.result.list.id) return;
    this.list.set(event.result.list);
    if (event.focused) {
      this.activeSection.set(event.result.sectionId);
      this.pendingLine.set(null);
      if (this.prefs.collapsed().includes(event.result.sectionId))
        this.prefs.toggleSection(event.result.sectionId);
    }
    if (event.focused || event.carry) {
      setTimeout(() => {
        this.composers
          .find((c) => c.sectionId() === event.result.sectionId && !c.anchorId())
          ?.seed(event.carry ?? '');
        if (event.focused) this.focusQuick(event.result.sectionId);
      }, 0);
    }
    this.scheduleRefresh();
  }
  composed(section: Section, event: ComposedNote) {
    section = this.list()?.sections.find((s) => s.id === event.task.sectionId) ?? section;
    if (!this.list()?.sections.some((s) => s.id === section.id)) return;
    this.list.update((list) =>
      list
        ? {
            ...list,
            sections: list.sections.map((s) => {
              if (s.id !== section.id) return s;
              const exists = s.tasks.some((t) => t.id === event.task.id);
              const tasks = s.tasks
                .filter((t) => t.id !== event.task.id)
                .map((t) =>
                  !exists && t.position >= event.task.position
                    ? { ...t, position: t.position + 1 }
                    : t,
                );
              return {
                ...s,
                tasks: [...tasks, event.task].sort((a, b) => a.position - b.position),
              };
            }),
          }
        : list,
    );
    if (event.focused) {
      this.activeSection.set(section.id);
      this.pendingLine.set(
        event.next ? { sectionId: section.id, anchorId: event.task.id, side: 'after' } : null,
      );
    }
    setTimeout(() => {
      const row = this.rows.find((r) => r.task().id === event.task.id);
      const fields = editingFields(event.text);
      if (row) {
        row.draft.receive(event.task);
        if (fields.title !== event.task.title || fields.description !== event.task.description)
          row.draft.edit(fields.title, fields.description);
        if (event.focused && !event.next) row.focusNote(event.text, event.caret);
      } else if (
        fields.title !== event.task.title ||
        fields.description !== event.task.description
      ) {
        void this.api.saveTask(event.task, fields).catch(() => {
          try {
            localStorage.setItem(
              'padtodo.draft.' + event.task.id,
              JSON.stringify({ ...fields, expectedUpdatedAt: event.task.updatedAt }),
            );
          } catch {}
          this.flash('Votre texte reste dans le brouillon de cette ligne.', true);
        });
      }
      if (event.focused && event.next) {
        this.composers.find((c) => c.anchorId() === event.task.id)?.seed(event.carry ?? '');
        this.document.getElementById('new-' + event.task.id)?.focus();
      }
    }, 0);
    this.scheduleRefresh();
  }
  cancelNew(section: Section) {
    const anchor = this.pendingLine()?.anchorId;
    this.pendingLine.set(null);
    const id = anchor ?? this.tasks(section).at(-1)?.id;
    if (id) this.rows.find((r) => r.task().id === id)?.focusTitle();
  }
  navigateLine(section: Section, task: Task, direction: 'previous' | 'next') {
    const tasks = this.tasks(section);
    const index = tasks.findIndex((t) => t.id === task.id);
    const next = tasks[index + (direction === 'previous' ? -1 : 1)];
    if (next)
      this.rows
        .find((r) => r.task().id === next.id)
        ?.focusTitle(direction === 'previous' ? 'end' : 'start');
    else if (direction === 'next') this.focusQuick(section.id);
  }
  deleteLine = (task: Task) => this.removeLine(task);
  async removeLine(task: Task): Promise<boolean> {
    try {
      const record = await this.api.send<{ token: string; expiresAt: string; task: Task }>(
        'POST',
        `/tasks/${task.id}/trash`,
        { expectedUpdatedAt: task.updatedAt },
      );
      this.rows.find((r) => r.task().id === task.id)?.draft.discard();
      const section = this.list()?.sections.find((s) => s.id === task.sectionId);
      const tasks = section ? this.tasks(section) : [];
      const index = tasks.findIndex((t) => t.id === task.id);
      const target = tasks[index - 1] ?? tasks[index + 1];
      this.undo.set(record);
      clearTimeout(this.undoTimer);
      this.undoTimer = setTimeout(
        () => {
          if (this.undo()?.token === record.token) {
            this.undo.set(null);
            this.undoShortcut = false;
          }
        },
        Math.max(0, new Date(record.expiresAt).getTime() - Date.now()),
      );
      this.undoShortcut = true;
      this.pendingLine.set(null);
      this.list.update((l) =>
        l
          ? {
              ...l,
              sections: l.sections.map((s) => ({
                ...s,
                tasks: s.tasks.filter((t) => t.id !== task.id),
              })),
            }
          : l,
      );
      setTimeout(() => {
        if (target) this.rows.find((r) => r.task().id === target.id)?.focusTitle();
        else this.focusQuick(task.sectionId);
      }, 0);
      this.scheduleRefresh();
      return true;
    } catch {
      this.flash('Suppression impossible. Votre ligne et votre saisie sont conservées.', true);
      return false;
    }
  }
  async restoreLine() {
    const record = this.undo();
    if (!record || this.restoring()) return;
    this.restoring.set(true);
    try {
      const task = await this.api.send<Task>('POST', '/tasks/restore', { token: record.token });
      this.undo.set(null);
      this.undoShortcut = false;
      await this.load();
      setTimeout(() => this.rows.find((r) => r.task().id === task.id)?.focusTitle(), 0);
    } catch (error) {
      const e = error as { error?: { error?: { message?: string } } };
      this.flash(e.error?.error?.message ?? 'Annulation impossible. Réessayez.', true);
    } finally {
      this.restoring.set(false);
    }
  }
  typed() {
    this.undoShortcut = false;
  }
  editorKey(event: KeyboardEvent) {
    if (event.isComposing || this.dialog() || this.selected()) return;
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z' &&
      this.undoShortcut &&
      this.undo()
    ) {
      event.preventDefault();
      void this.restoreLine();
    }
  }
  async changeTask(task: Task, data: Record<string, unknown>) {
    const row = this.rows.find((r) => r.task().id === task.id);
    if (row && !(await row.draft.flush())) return;
    await this.act(() => this.api.saveTask(row?.draft.base() ?? task, data));
  }
  async saveDetail(data: Record<string, unknown>) {
    const task = this.selected();
    if (task && (await this.act(() => this.api.saveTask(task, data)))) this.selected.set(null);
  }
  async duplicate() {
    const task = this.selected();
    if (
      task &&
      (await this.act(
        () => this.api.send('POST', `/tasks/${task.id}/duplicate`),
        'Tâche dupliquée',
      ))
    )
      this.selected.set(null);
  }
  confirmTask() {
    const t = this.selected();
    if (t)
      this.confirm(
        'Supprimer la tâche ?',
        `« ${t.title} » sera définitivement supprimée.`,
        async () => {
          await this.api.send('DELETE', '/tasks/' + t.id);
          this.selected.set(null);
        },
      );
  }
  openList(list?: TaskList) {
    this.nameValidation(120);
    this.form.reset({
      name: list?.name ?? '',
      description: list?.description ?? '',
      color: list?.color ?? '#65866b',
    });
    this.dialog.set({
      kind: 'list',
      title: list ? 'Paramètres de la liste' : 'Nouvelle liste',
      id: list?.id,
      expectedUpdatedAt: list?.updatedAt,
    });
  }
  openSection(section?: Section) {
    this.nameValidation(160);
    this.form.reset({ name: section?.title ?? '', description: '', color: '#65866b' });
    this.dialog.set({
      kind: 'section',
      title: section ? 'Renommer la section' : 'Nouvelle section',
      id: section?.id,
    });
  }
  openCategory(category?: Category) {
    this.nameValidation(60);
    this.form.reset({
      name: category?.name ?? '',
      color: category?.color ?? '#65866b',
      description: '',
    });
    this.dialog.set({
      kind: 'category',
      title: category ? 'Modifier la catégorie' : 'Nouvelle catégorie',
      id: category?.id,
    });
  }
  private nameValidation(max: number) {
    this.form.controls.name.setValidators([
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(max),
    ]);
    this.form.controls.name.updateValueAndValidity();
  }
  confirm(title: string, message: string, action: () => Promise<unknown>) {
    this.dialog.set({ kind: 'confirm', title, message, action });
  }
  deleteList() {
    const l = this.list();
    if (l)
      this.confirm(
        'Supprimer cette liste ?',
        `La liste « ${l.name} », toutes ses sections, ses tâches et ses catégories seront définitivement supprimées.`,
        async () => {
          await this.api.send('DELETE', '/lists/' + l.id);
          void this.router.navigate(['/']);
        },
      );
  }
  deleteSection(section: Section) {
    this.confirm(
      'Supprimer la section ?',
      `« ${section.title} » et ses ${section.tasks.length} tâche(s) seront définitivement supprimées.`,
      () => this.api.send('DELETE', '/sections/' + section.id),
    );
  }
  deleteCategory(category: Category) {
    this.confirm(
      'Supprimer la catégorie ?',
      `La catégorie « ${category.name} » sera supprimée. Ses tâches seront conservées sans catégorie.`,
      () => this.api.send('DELETE', '/categories/' + category.id),
    );
  }
  async submitDialog() {
    const d = this.dialog();
    if (!d) return;
    if (d.kind === 'confirm') {
      if (d.action && (await this.act(d.action, 'Suppression effectuée'))) this.dialog.set(null);
      return;
    }
    if (this.form.invalid) return;
    const values = this.form.getRawValue();
    const list = this.list();
    let newList: TaskList | undefined;
    const ok = await this.act(
      async () => {
        if (d.kind === 'list') {
          if (d.id)
            await this.api.saveList(d.id, { ...values, expectedUpdatedAt: d.expectedUpdatedAt });
          else newList = await this.api.createList(values);
        } else if (d.kind === 'section' && list) {
          if (d.id) {
            const section = list.sections.find((s) => s.id === d.id);
            await this.api.send('PATCH', '/sections/' + d.id, {
              title: values.name,
              expectedUpdatedAt: section?.updatedAt,
            });
          } else await this.api.createSection(list.id, values.name);
        } else if (d.kind === 'category' && list) {
          const data = { name: values.name, color: values.color };
          if (d.id) await this.api.saveCategory(d.id, data);
          else await this.api.send('POST', `/lists/${list.id}/categories`, data);
        }
      },
      d.id ? 'Modifications enregistrées' : 'Création effectuée',
    );
    if (ok) {
      this.dialog.set(null);
      if (newList) void this.router.navigate(['/lists', newList.id]);
    }
  }
  async dropLists(event: CdkDragDrop<TaskList[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const items = [...this.lists()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    await this.act(() => this.api.send('PATCH', '/lists/reorder', { ids: items.map((l) => l.id) }));
  }
  async dropSections(event: CdkDragDrop<SectionNode[]>) {
    if (this.filtered() || event.previousIndex === event.currentIndex) return;
    await this.reorderBranch(event.container.data, event.previousIndex, event.currentIndex);
  }
  private async reorderBranch(branch: SectionNode[], from: number, to: number) {
    const list = this.list();
    if (!list || to < 0 || to >= branch.length) return;
    const roots = this.sectionTree();
    const moved = reordered(branch, from, to);
    const replace = (nodes: SectionNode[]): SectionNode[] =>
      nodes === branch
        ? moved
        : nodes.map((node) => ({ ...node, children: replace(node.children) }));
    const items = flattenSections(replace(roots));
    await this.act(() =>
      this.api.send('PATCH', '/sections/reorder', { listId: list.id, ids: items.map((s) => s.id) }),
    );
  }
  private branchFor(id: string, nodes = this.sectionTree()): SectionNode[] | undefined {
    if (nodes.some((s) => s.id === id)) return nodes;
    for (const node of nodes) {
      const found = this.branchFor(id, node.children);
      if (found) return found;
    }
    return undefined;
  }
  async dropTask(event: CdkDragDrop<Task[], Task[], Task>) {
    if (this.filtered()) return;
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex)
      return;
    const task = event.item.data;
    await this.act(() =>
      this.api.send('PATCH', '/tasks/reorder', {
        taskId: task.id,
        sectionId: event.container.id,
        position: event.currentIndex,
      }),
    );
  }
  async moveSection(section: Section, direction: number) {
    const branch = this.branchFor(section.id);
    if (!branch) return;
    const index = branch.findIndex((s) => s.id === section.id);
    await this.reorderBranch(branch, index, index + direction);
  }
  private revealSection(id: string) {
    const ancestors = (nodes: SectionNode[], path: string[] = []): string[] | undefined => {
      for (const node of nodes) {
        if (node.id === id) return [...path, id];
        const found = ancestors(node.children, [...path, node.id]);
        if (found) return found;
      }
      return undefined;
    };
    for (const sectionId of ancestors(this.sectionTree()) ?? [id]) {
      if (this.prefs.collapsed().includes(sectionId)) this.prefs.toggleSection(sectionId);
    }
  }
  focusQuick(id: string) {
    this.revealSection(id);
    setTimeout(() => document.getElementById('quick-' + id)?.focus(), 0);
  }
}
