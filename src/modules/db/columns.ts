import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Columns every entity carries, defined once.
 *
 * SOFT DELETE on anything an Export can reach. DATA-CONTRACTS-V2:399 —
 * "`deleted_at` + an explicit `live()` filter in every list query — Drizzle has
 * no middleware, so it is never implicit." That last clause is the reason this
 * is a helper and not a base class: nothing here filters for you, and a list
 * query that forgets `live()` returns deleted rows. The explicitness is the
 * design, not an omission.
 */
export const identity = {
	id: uuid("id").primaryKey().defaultRandom(),
};

export const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.default(sql`now()`),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.default(sql`now()`)
		// Without $onUpdate this column holds the CREATION time forever, so any
		// "last modified" display, sort or cache key reads wrong from the first
		// edit onward. A default is not an update.
		.$onUpdate(() => new Date()),
};

export const softDelete = {
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
