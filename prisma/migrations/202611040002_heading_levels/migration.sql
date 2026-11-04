ALTER TABLE "TaskSection" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "TaskSection" ADD CONSTRAINT "section_heading_level" CHECK ("level" BETWEEN 1 AND 6);
