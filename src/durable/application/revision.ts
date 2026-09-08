export type RevisionMigration =
  | { action: "retain"; workItemIds: string[] }
  | { action: "map"; fromTemplateId: string; toTemplateId: string }
  | { action: "cancel_rebuild"; workItemIds?: string[] }
  | { action: "archive_job" };
