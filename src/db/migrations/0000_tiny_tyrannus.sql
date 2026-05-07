CREATE TABLE `conflict_resolutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_name` text NOT NULL,
	`chosen_value` text,
	`rejected_value` text,
	`chosen_source` text,
	`rejected_source` text,
	`resolution` text NOT NULL,
	`resolved_by` text DEFAULT 'owner',
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conflict_res_entity` ON `conflict_resolutions` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `customer_aliases` (
	`customer_id` text NOT NULL,
	`alias` text NOT NULL,
	PRIMARY KEY(`customer_id`, `alias`),
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_aliases_alias` ON `customer_aliases` (`alias`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`official_name` text,
	`org_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `document_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`link_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relation` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_doc_links_document` ON `document_links` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_doc_links_target` ON `document_links` (`link_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_type` text NOT NULL,
	`original_filename` text,
	`approved_name` text,
	`doc_number` text,
	`doc_date` text,
	`valid_until` text,
	`file_path` text,
	`extracted_summary` text,
	`confidence` text DEFAULT 'medium',
	`status` text DEFAULT 'detected',
	`origin` text,
	`supersedes_document_id` text,
	`reused_from_transition_id` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_documents_type` ON `documents` (`doc_type`);--> statement-breakpoint
CREATE INDEX `idx_documents_status` ON `documents` (`status`);--> statement-breakpoint
CREATE INDEX `idx_documents_number` ON `documents` (`doc_number`);--> statement-breakpoint
CREATE TABLE `field_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_name` text NOT NULL,
	`value` text,
	`source_type` text NOT NULL,
	`source_id` text,
	`confidence` text DEFAULT 'high',
	`confirmed_by_owner` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`superseded_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_field_values_entity` ON `field_values` (`entity_type`,`entity_id`,`field_name`);--> statement-breakpoint
CREATE TABLE `generated_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transition_id` text NOT NULL,
	`file_type` text NOT NULL,
	`file_path` text NOT NULL,
	`revision` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `transitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`material_type` text NOT NULL,
	`name` text NOT NULL,
	`manufacturer` text,
	`specifications` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_materials_type` ON `materials` (`material_type`);--> statement-breakpoint
CREATE TABLE `objects` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`short_name` text NOT NULL,
	`official_name` text,
	`title_line` text,
	`default_address` text,
	`default_project_number` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`inn` text,
	`ogrn` text,
	`legal_address` text,
	`phone` text,
	`sro_name` text,
	`sro_number` text,
	`sro_date` text,
	`aosr_block` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`surname` text NOT NULL,
	`position` text,
	`position_long` text,
	`org_id` text,
	`nrs_id` text,
	`nrs_date` text,
	`aosr_full_line` text,
	`notes` text,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_people_surname` ON `people` (`surname`);--> statement-breakpoint
CREATE INDEX `idx_people_org` ON `people` (`org_id`);--> statement-breakpoint
CREATE TABLE `person_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`doc_number` text,
	`doc_date` text,
	`valid_from` text,
	`valid_until` text,
	`role_granted` text,
	`issuing_org` text,
	`file_path` text,
	`is_current` integer DEFAULT 1,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_person_docs_person` ON `person_documents` (`person_id`);--> statement-breakpoint
CREATE TABLE `person_role_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`object_id` text,
	`assigned_at` text NOT NULL,
	`removed_at` text,
	`person_doc_id` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_doc_id`) REFERENCES `person_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_role_assign_person` ON `person_role_assignments` (`person_id`);--> statement-breakpoint
CREATE INDEX `idx_role_assign_object` ON `person_role_assignments` (`object_id`);--> statement-breakpoint
CREATE TABLE `transition_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transition_id` text NOT NULL,
	`material_id` text NOT NULL,
	`document_id` text,
	`quantity` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `transitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trans_materials_transition` ON `transition_materials` (`transition_id`);--> statement-breakpoint
CREATE TABLE `transition_orgs` (
	`transition_id` text NOT NULL,
	`role` text NOT NULL,
	`org_id` text NOT NULL,
	PRIMARY KEY(`transition_id`, `role`),
	FOREIGN KEY (`transition_id`) REFERENCES `transitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transition_signatories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transition_id` text NOT NULL,
	`role` text NOT NULL,
	`person_id` text NOT NULL,
	`person_doc_id` integer,
	`org_id` text,
	`position_override` text,
	`aosr_line_override` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `transitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_doc_id`) REFERENCES `person_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trans_sig_transition` ON `transition_signatories` (`transition_id`);--> statement-breakpoint
CREATE INDEX `idx_trans_sig_person` ON `transition_signatories` (`person_id`);--> statement-breakpoint
CREATE TABLE `transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`object_id` text NOT NULL,
	`gnb_number` text NOT NULL,
	`gnb_number_short` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`address` text,
	`project_number` text,
	`title_line` text,
	`object_name` text,
	`executor_id` text,
	`start_date` text,
	`end_date` text,
	`act_date` text,
	`profile_length` real,
	`plan_length` real,
	`pipe_count` integer DEFAULT 2,
	`drill_diameter` real,
	`configuration` text,
	`pipe_mark` text,
	`pipe_diameter_mm` real,
	`pipe_quality_passport` text,
	`base_transition_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`finalized_at` text,
	FOREIGN KEY (`object_id`) REFERENCES `objects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`executor_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transitions_object` ON `transitions` (`object_id`);--> statement-breakpoint
CREATE INDEX `idx_transitions_status` ON `transitions` (`status`);