import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    identity: text('identity').notNull().unique(),
    email: text('email').unique(),
    passwordHash: text('password_hash'),
    role: text('role').notNull().default('user'),
    nick: text('nick').notNull(),
    bio: text('bio').notNull().default(''),
    theme: text('theme').notNull().default('neon'),
    avatar: text('avatar').notNull().default('moon'),
    pin: text('pin'),
    wallOpen: integer('wall_open').notNull().default(1),
    collectionPublic: integer('collection_public').notNull().default(1),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('users_nick_unique').on(t.nick)],
);
export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expires: integer('expires').notNull(),
});
export const authFlows = sqliteTable('auth_flows', {
  state: text('state').primaryKey(),
  browserHash: text('browser_hash').notNull(),
  verifier: text('verifier').notNull(),
  expires: integer('expires').notNull(),
});
export const collection = sqliteTable(
  'collection',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    animeId: integer('anime_id').notNull(),
    title: text('title').notNull(),
    image: text('image').notNull(),
    status: text('status').notNull().default('planned'),
    rating: integer('rating').notNull().default(0),
    favorite: integer('favorite').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.animeId] })],
);
export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    parentId: text('parent_id'),
    body: text('body').notNull(),
    spoiler: integer('spoiler').notNull().default(0),
    pinned: integer('pinned').notNull().default(0),
    deleted: integer('deleted').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    editedAt: integer('edited_at'),
  },
  (t) => [
    index('comments_scope_created').on(t.scope, t.createdAt),
    index('comments_author_created').on(t.authorId, t.createdAt),
  ],
);
export const likes = sqliteTable(
  'likes',
  {
    value: integer('value').notNull().default(1),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    commentId: text('comment_id')
      .notNull()
      .references(() => comments.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.commentId] })],
);
export const authLimits = sqliteTable('auth_limits', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  expires: integer('expires').notNull(),
});
export const animeCache = sqliteTable('anime_cache', {
  id: integer('id').primaryKey(),
  data: text('data').notNull(),
  episodes: text('episodes').notNull().default('[]'),
  updatedAt: integer('updated_at').notNull(),
});
export const history = sqliteTable(
  'history',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    animeId: integer('anime_id').notNull(),
    episode: integer('episode').notNull(),
    position: integer('position').notNull().default(0),
    duration: integer('duration').notNull(),
    watchedSeconds: integer('watched_seconds').notNull().default(0),
    completed: integer('completed').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.animeId, t.episode] })],
);
export const watchSessions = sqliteTable('watch_sessions', {
  token: text('token').primaryKey(),
  actor: text('actor').notNull(),
  userId: text('user_id'),
  animeId: integer('anime_id').notNull(),
  episode: integer('episode').notNull(),
  duration: integer('duration').notNull(),
  lastAt: integer('last_at').notNull(),
  watched: integer('watched').notNull().default(0),
  expires: integer('expires').notNull(),
});
export const dailyActivity = sqliteTable(
  'daily_activity',
  {
    day: text('day').notNull(),
    actor: text('actor').notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.actor] })],
);
export const dailyViews = sqliteTable(
  'daily_views',
  {
    day: text('day').notNull(),
    actor: text('actor').notNull(),
    animeId: integer('anime_id').notNull(),
    episode: integer('episode').notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.actor, t.animeId, t.episode] })],
);
export const blocks = sqliteTable(
  'blocks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    targetId: text('target_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetId] })],
);
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    commentId: text('comment_id').notNull(),
    reason: text('reason').notNull(),
    resolved: integer('resolved').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('reports_user_comment').on(t.userId, t.commentId)],
);
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    actorId: text('actor_id').notNull(),
    scope: text('scope').notNull(),
    commentId: text('comment_id').notNull(),
    seen: integer('seen').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('notifications_user_created').on(t.userId, t.createdAt)],
);
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    providerId: text('provider_id').unique(),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('orders_user_created').on(t.userId, t.createdAt)],
);
export const grants = sqliteTable(
  'grants',
  {
    orderId: text('order_id')
      .primaryKey()
      .references(() => orders.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    startsAt: integer('starts_at').notNull(),
    expires: integer('expires').notNull(),
  },
  (t) => [index('grants_user_expires').on(t.userId, t.expires)],
);
