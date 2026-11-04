-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "TaskList" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" VARCHAR(7) NOT NULL DEFAULT '#65866b',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSection" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "listId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#65866b',
    "listId" UUID NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "categoryId" UUID,
    "sectionId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskList_position_idx" ON "TaskList"("position");

-- CreateIndex
CREATE INDEX "TaskSection_listId_position_idx" ON "TaskSection"("listId", "position");

-- CreateIndex
CREATE INDEX "Category_listId_idx" ON "Category"("listId");

-- CreateIndex
CREATE INDEX "Task_sectionId_position_idx" ON "Task"("sectionId", "position");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_priority_idx" ON "Task"("priority");

-- CreateIndex
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");

-- AddForeignKey
ALTER TABLE "TaskSection" ADD CONSTRAINT "TaskSection_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Protect the shared-list invariant even for direct SQL writes.
CREATE FUNCTION "check_task_category_list"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."categoryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Category" c JOIN "TaskSection" s ON s."listId" = c."listId"
    WHERE c.id = NEW."categoryId" AND s.id = NEW."sectionId"
  ) THEN RAISE EXCEPTION 'Task category and section must belong to the same list' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "task_category_list_guard" BEFORE INSERT OR UPDATE OF "categoryId", "sectionId" ON "Task" FOR EACH ROW EXECUTE FUNCTION "check_task_category_list"();
-- List ownership is immutable; moving tasks is handled through their section.
CREATE FUNCTION "prevent_list_reparent"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."listId" <> OLD."listId" THEN RAISE EXCEPTION 'List ownership is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "section_list_guard" BEFORE UPDATE OF "listId" ON "TaskSection" FOR EACH ROW EXECUTE FUNCTION "prevent_list_reparent"();
CREATE TRIGGER "category_list_guard" BEFORE UPDATE OF "listId" ON "Category" FOR EACH ROW EXECUTE FUNCTION "prevent_list_reparent"();
ALTER TABLE "Task" ADD CONSTRAINT "task_completion_consistency" CHECK ((status = 'DONE' AND "completedAt" IS NOT NULL) OR (status <> 'DONE' AND "completedAt" IS NULL));
ALTER TABLE "Task" ADD CONSTRAINT "task_position_nonnegative" CHECK (position >= 0);
