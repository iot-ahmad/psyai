CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TYPE gender_enum           AS ENUM ('male', 'female');
CREATE TYPE spec_gender_pref_enum AS ENUM ('any', 'male', 'female');
CREATE TYPE language_enum         AS ENUM ('ar', 'en');
CREATE TYPE user_status_enum      AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE user_role_enum        AS ENUM ('user', 'specialist', 'admin');
CREATE TYPE booking_status_enum   AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE payment_status_enum   AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE article_status_enum   AS ENUM ('draft', 'published', 'archived');
CREATE TYPE moderation_status_enum AS ENUM ('pending', 'published', 'rejected');
CREATE TYPE b2b_status_enum       AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE reminder_type_enum    AS ENUM ('24h', '1h', 'session_link');
CREATE TYPE reminder_status_enum  AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE day_enum              AS ENUM ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday');

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    
    email_encrypted     TEXT NOT NULL,
    email_hash          VARCHAR(64) NOT NULL UNIQUE, -- HMAC-SHA256 for fast lookup
    phone_encrypted     TEXT NOT NULL,
    phone_hash          VARCHAR(64) NOT NULL UNIQUE, -- HMAC-SHA256 for fast lookup
    
    password_hash       VARCHAR(255) NOT NULL,       -- Bcrypt / Argon2
    gender              gender_enum NOT NULL,
    
    condition_encrypted TEXT,                        
    spec_gender_pref    spec_gender_pref_enum DEFAULT 'any',
    
    role                user_role_enum DEFAULT 'user' NOT NULL,
    is_verified         BOOLEAN DEFAULT FALSE NOT NULL,
    token_version       INTEGER DEFAULT 0 NOT NULL,
    
    language            language_enum DEFAULT 'ar',
    status              user_status_enum DEFAULT 'active' NOT NULL,
    google_id           VARCHAR(64) UNIQUE,
    
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_users_email_hash ON users(email_hash);
CREATE UNIQUE INDEX idx_users_phone_hash ON users(phone_hash);
CREATE UNIQUE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE specialists (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, -- Strict 1:1
    name                VARCHAR(255) NOT NULL,
    title               VARCHAR(255) NOT NULL,
    specialty           VARCHAR(255) NOT NULL,
    bio                 TEXT,
    price               NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    rating              NUMERIC(2, 1) DEFAULT 0.0,
    is_featured         BOOLEAN DEFAULT FALSE,
    license_number      VARCHAR(100),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_specialists_user_id ON specialists(user_id);
CREATE INDEX idx_specialists_featured_rating ON specialists(is_featured, rating DESC);

CREATE TABLE specialist_schedule (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialist_id       UUID NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
    day                 day_enum NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    available           BOOLEAN DEFAULT TRUE
);

CREATE TABLE bookings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    specialist_id       UUID NOT NULL REFERENCES specialists(id) ON DELETE RESTRICT,
    session_time        TIMESTAMP NOT NULL,
    status              booking_status_enum DEFAULT 'pending' NOT NULL,
    meeting_link        VARCHAR(500),
    notes               TEXT,
    condition_encrypted TEXT,
    
    -- Integrated Review & Rating Fields
    rating              NUMERIC(2, 1),
    review_notes        TEXT,
    reviewed_at         TIMESTAMP,
    
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT chk_booking_rating_range CHECK (rating IS NULL OR (rating >= 1.0 AND rating <= 5.0)),
    CONSTRAINT unique_booking_specialist_time UNIQUE (specialist_id, session_time)
);

CREATE INDEX idx_bookings_user_created ON bookings(user_id, created_at DESC);
CREATE INDEX idx_bookings_specialist_time ON bookings(specialist_id, session_time);
CREATE INDEX idx_bookings_specialist_rating ON bookings(specialist_id, rating) WHERE rating IS NOT NULL AND status = 'completed';

CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id          UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount              NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency            VARCHAR(10) DEFAULT 'SAR' NOT NULL,
    status              payment_status_enum DEFAULT 'PENDING' NOT NULL,
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
    visa_session_id     VARCHAR(255) UNIQUE,
    transaction_id      VARCHAR(255) UNIQUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX unique_active_payment_per_booking ON payments(booking_id) WHERE status = 'SUCCEEDED';


CREATE TABLE articles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialist_id       UUID NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    category_slug       VARCHAR(150) NOT NULL,
    body                TEXT NOT NULL,
    status              article_status_enum DEFAULT 'draft' NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_articles_specialist ON articles(specialist_id);

CREATE TABLE article_questions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id          UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    guest_name          VARCHAR(150),
    question            TEXT NOT NULL,
    answer              TEXT,
    answered_by         UUID REFERENCES specialists(id) ON DELETE SET NULL,
    status              moderation_status_enum DEFAULT 'pending' NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_article_questions_article_status ON article_questions(article_id, status);
CREATE INDEX idx_article_questions_created ON article_questions(created_at DESC);


CREATE TABLE b2b_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name        VARCHAR(255) NOT NULL,
    phone               VARCHAR(50) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    employees_count     VARCHAR(50) NOT NULL,
    status              b2b_status_enum DEFAULT 'pending' NOT NULL,
    reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    review_note         TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_b2b_requests_user_created ON b2b_requests(user_id, created_at DESC);
CREATE INDEX idx_b2b_requests_status ON b2b_requests(status);


CREATE TABLE session_reminders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id          UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reminder_type       reminder_type_enum NOT NULL,
    status              reminder_status_enum DEFAULT 'pending' NOT NULL,
    scheduled_at        TIMESTAMP NOT NULL,
    sent_at             TIMESTAMP,
    CONSTRAINT unique_booking_reminder UNIQUE (booking_id, reminder_type)
);

CREATE INDEX idx_session_reminders_status_scheduled ON session_reminders(status, scheduled_at);

CREATE TABLE audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    action              VARCHAR(255) NOT NULL,
    entity              VARCHAR(150),
    entity_id           UUID,
    details             JSONB,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE otp_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone               VARCHAR(50) NOT NULL UNIQUE,
    code_hash           VARCHAR(255) NOT NULL,
    attempts            INTEGER DEFAULT 0 NOT NULL,
    phone_lock_until    TIMESTAMP,
    expires_at          TIMESTAMP NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX idx_otp_tokens_phone ON otp_tokens(phone);


CREATE OR REPLACE FUNCTION decrypt_user_condition(
    p_target_user_id UUID,
    p_accessed_by_user_id UUID,
    p_encryption_key TEXT,
    p_access_reason TEXT DEFAULT 'Clinical Review'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_encrypted_data TEXT;
    v_decrypted_text TEXT;
BEGIN
    SELECT condition_encrypted INTO v_encrypted_data
    FROM users
    WHERE id = p_target_user_id;

    IF v_encrypted_data IS NULL THEN
        RETURN NULL;
    END IF;

    BEGIN
        v_decrypted_text := pgp_sym_decrypt(v_encrypted_data::bytea, p_encryption_key);
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Decryption failed: Invalid key or corrupted data';
    END;

    INSERT INTO audit_logs (
        user_id, action, entity, entity_id, details
    ) VALUES (
        p_accessed_by_user_id,
        'DECRYPT_CONDITION',
        'users',
        p_target_user_id,
        jsonb_build_object(
            'reason', p_access_reason,
            'accessed_at', NOW(),
            'target_user_id', p_target_user_id
        )
    );

    RETURN v_decrypted_text;
END;
$$;

CREATE OR REPLACE FUNCTION update_specialist_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_specialist_id UUID;
    v_new_rating NUMERIC(2, 1);
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_specialist_id := OLD.specialist_id;
    ELSE
        v_specialist_id := NEW.specialist_id;
    END IF;

    SELECT ROUND(COALESCE(AVG(rating), 0.0)::numeric, 1)
    INTO v_new_rating
    FROM bookings
    WHERE specialist_id = v_specialist_id
      AND rating IS NOT NULL
      AND status = 'completed';

    UPDATE specialists
    SET rating = v_new_rating
    WHERE id = v_specialist_id;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION log_specialist_promotion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (OLD.role IS DISTINCT FROM NEW.role) AND (NEW.role = 'specialist') THEN
        INSERT INTO audit_logs (
            user_id, action, entity, entity_id, details
        ) VALUES (
            NEW.id,
            'promote_to_specialist',
            'users',
            NEW.id,
            jsonb_build_object(
                'previous_role', OLD.role,
                'new_role', NEW.role,
                'promoted_at', NOW()
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_audit_logs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Security Policy Violation: Modifications or deletions on audit_logs are strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_update_specialist_rating ON bookings;
CREATE TRIGGER trg_update_specialist_rating
    AFTER INSERT OR DELETE OR UPDATE OF rating ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_specialist_rating();

DROP TRIGGER IF EXISTS trg_audit_specialist_promotion ON users;
CREATE TRIGGER trg_audit_specialist_promotion
    AFTER UPDATE OF role ON users
    FOR EACH ROW
    EXECUTE FUNCTION log_specialist_promotion();

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON audit_logs;
CREATE TRIGGER trg_prevent_audit_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_audit_logs_append_only();

DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_audit_logs_append_only();
