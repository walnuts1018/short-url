use crate::domain::models::ShortenedURL;
use anyhow::Result;
use chrono::{DateTime, Utc};

pub trait ShortenedURLRepository {
    async fn create(
        &self,
        original_url: &str,
        custom_id: Option<&str>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<ShortenedURL>;

    async fn find_by_id(&self, id: &str) -> Result<Option<ShortenedURL>>;
}
