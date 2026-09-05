CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`detail` text,
	`module` text NOT NULL,
	`tone` text DEFAULT 'teal' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`category` text NOT NULL,
	`amount` text NOT NULL,
	`reference` text NOT NULL,
	`tags` text NOT NULL,
	`tone` text NOT NULL,
	`cost_of_delay` text,
	`priority` integer DEFAULT 50 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`jurisdiction` text NOT NULL,
	`role` text NOT NULL,
	`emoji` text NOT NULL,
	`assets` real NOT NULL,
	`parent_id` text,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`interest` text NOT NULL,
	`source` text NOT NULL,
	`budget` real NOT NULL,
	`score` integer NOT NULL,
	`owner` text NOT NULL,
	`stage` text NOT NULL,
	`value` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`country` text NOT NULL,
	`type` text NOT NULL,
	`units` integer NOT NULL,
	`occupancy` real NOT NULL,
	`valuation` real NOT NULL,
	`noi` real NOT NULL,
	`yield_pct` real NOT NULL,
	`roi` real NOT NULL,
	`health` text NOT NULL,
	`image` text,
	`entity` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`tone` text NOT NULL,
	`tags` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`kind` text NOT NULL,
	`action_label` text,
	`action_to` text,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`property` text NOT NULL,
	`since` text NOT NULL,
	`rent` real NOT NULL,
	`deposit` real NOT NULL,
	`score` integer NOT NULL,
	`band` text NOT NULL,
	`on_time_rate` real NOT NULL,
	`arrears` real,
	`days_late` integer
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`property_id` text NOT NULL,
	`property_name` text NOT NULL,
	`type` text NOT NULL,
	`price` real NOT NULL,
	`market_price` real,
	`status` text NOT NULL,
	`days_vacant` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`issue` text NOT NULL,
	`location` text NOT NULL,
	`raised_by` text NOT NULL,
	`priority` text NOT NULL,
	`assignee` text NOT NULL,
	`age_hours` integer NOT NULL,
	`sla_hours` integer NOT NULL,
	`cost` real NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`module` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`runs` text NOT NULL,
	`when_json` text NOT NULL,
	`condition_json` text,
	`then_json` text NOT NULL,
	`wait_json` text
);
--> statement-breakpoint
CREATE INDEX `approvals_status_idx` ON `approvals` (`status`);--> statement-breakpoint
CREATE INDEX `leads_stage_idx` ON `leads` (`stage`);--> statement-breakpoint
CREATE INDEX `tasks_kind_idx` ON `tasks` (`kind`);--> statement-breakpoint
CREATE INDEX `tenants_arrears_idx` ON `tenants` (`arrears`);--> statement-breakpoint
CREATE INDEX `units_property_idx` ON `units` (`property_id`);--> statement-breakpoint
CREATE INDEX `wo_status_idx` ON `work_orders` (`status`);