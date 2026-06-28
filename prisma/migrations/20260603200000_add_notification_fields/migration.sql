-- Create inbox_notifications table if it does not exist (it was created outside migrations)
CREATE TABLE IF NOT EXISTS inbox_notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    title varchar(150) NOT NULL,
    message text NOT NULL,
    link varchar(255),
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamp(6) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inbox_notifications_pkey PRIMARY KEY (id),
    CONSTRAINT inbox_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add missing columns to inbox_notifications table
ALTER TABLE inbox_notifications ADD COLUMN IF NOT EXISTS tracking_id uuid REFERENCES recommendation_tracking(id) ON DELETE CASCADE;
ALTER TABLE inbox_notifications ADD COLUMN IF NOT EXISTS type varchar(50) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE inbox_notifications ADD COLUMN IF NOT EXISTS severity varchar(20) NOT NULL DEFAULT 'INFO';
ALTER TABLE inbox_notifications ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE inbox_notifications ADD COLUMN IF NOT EXISTS read_at timestamp(6) without time zone;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS inbox_notifications_user_id_is_read_idx ON inbox_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS inbox_notifications_user_id_created_at_idx ON inbox_notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS inbox_notifications_tracking_id_type_idx ON inbox_notifications(tracking_id, type);
