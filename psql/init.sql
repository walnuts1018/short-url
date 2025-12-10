CREATE DATABASE short_url;

-- 短縮URLテーブルの作成
CREATE TABLE IF NOT EXISTS short_urls (
    id UUID PRIMARY KEY,
    original_url TEXT NOT NULL,
    short_code VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at_idx TIMESTAMP WITH TIME ZONE GENERATED ALWAYS AS (created_at) STORED
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_short_urls_short_code ON short_urls(short_code);

CREATE INDEX IF NOT EXISTS idx_short_urls_created_at ON short_urls(created_at_idx);

CREATE INDEX IF NOT EXISTS idx_short_urls_expires_at ON short_urls(expires_at);

-- 短縮コードの長さ制約
ALTER TABLE
    short_urls
ADD
    CONSTRAINT check_short_code_length CHECK (
        length(short_code) >= 4
        AND length(short_code) <= 50
    );

-- URLの形式制約
ALTER TABLE
    short_urls
ADD
    CONSTRAINT check_original_url_format CHECK (
        original_url LIKE 'http://%'
        OR original_url LIKE 'https://%'
    );
