import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
export const modelUsage=sqliteTable("model_usage",{
 usageKey:text("usage_key").primaryKey(),
 calls:integer("calls").notNull(),
 updatedAt:integer("updated_at").notNull()
});
export const travelDrafts=sqliteTable("travel_drafts",{userId:text("user_id").primaryKey(),payload:text("payload").notNull(),updatedAt:integer("updated_at").notNull()});
export const users=sqliteTable("users",{
 id:text("id").primaryKey(),
 username:text("username").notNull().unique(),
 passwordHash:text("password_hash").notNull(),
 createdAt:integer("created_at").notNull()
});
export const sessions=sqliteTable("sessions",{
 token:text("token").primaryKey(),
 userId:text("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
 createdAt:integer("created_at").notNull(),
 expiresAt:integer("expires_at").notNull()
});
