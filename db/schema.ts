import {sqliteTable,text,integer,primaryKey} from "drizzle-orm/sqlite-core";
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
export const flowStats=sqliteTable("flow_stats",{
 statKey:text("stat_key").primaryKey(),
 calls:integer("calls").notNull(),
 updatedAt:integer("updated_at").notNull()
});
export const shares=sqliteTable("shares",{
 token:text("token").primaryKey(),
 data:text("data").notNull(),
 createdAt:integer("created_at").notNull(),
 expiresAt:integer("expires_at").notNull()
});
export const tripReviews=sqliteTable("trip_reviews",{
 userId:text("user_id").notNull(),
 tripId:text("trip_id").notNull(),
 payload:text("payload").notNull(),
 createdAt:integer("created_at").notNull(),
 updatedAt:integer("updated_at").notNull()
},table=>[
 primaryKey({columns:[table.userId,table.tripId]})
]);
// 闭环改革二期：宿舍拼团最小版。groups 存团，group_members 按（团，成员）
// 存成员偏好（requiredIds / excludedIds / budget 的 JSON），重复加入只更新偏好、不重复计数。
export const groups=sqliteTable("groups",{
 id:text("id").primaryKey(),
 name:text("name").notNull(),
 creatorId:text("creator_id").notNull(),
 maxMembers:integer("max_members").notNull(),
 createdAt:integer("created_at").notNull()
});
export const groupMembers=sqliteTable("group_members",{
 groupId:text("group_id").notNull(),
 userId:text("user_id").notNull(),
 payload:text("payload").notNull(),
 joinedAt:integer("joined_at").notNull()
},table=>[
 primaryKey({columns:[table.groupId,table.userId]})
]);
// 闭环改革二期：演示模式。演示复盘只进 demo_reviews，永不进 trip_reviews；
// 按（会话，行程编号）保存，清空演示数据时只删本会话的演示行。
export const demoReviews=sqliteTable("demo_reviews",{
 sessionId:text("session_id").notNull(),
 userLabel:text("user_label").notNull(),
 tripId:text("trip_id").notNull(),
 payload:text("payload").notNull(),
 createdAt:integer("created_at").notNull()
},table=>[
 primaryKey({columns:[table.sessionId,table.tripId]})
]);
