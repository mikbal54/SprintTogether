-- CreateIndex
CREATE INDEX "idx_sprint_created_desc" ON "public"."Sprint"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_task_sprint_parent_pagination" ON "public"."Task"("sprintId", "parentId", "id");

-- CreateIndex
CREATE INDEX "idx_task_parent_children" ON "public"."Task"("parentId", "id");

-- CreateIndex
CREATE INDEX "idx_task_sprint_parent_count" ON "public"."Task"("sprintId", "parentId");

-- CreateIndex
CREATE INDEX "idx_task_parent_count" ON "public"."Task"("parentId");

-- CreateIndex
CREATE INDEX "idx_user_name" ON "public"."User"("name");
