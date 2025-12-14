use crate::domain::models::ShortenedURL;
use anyhow::Result;
use chrono::{DateTime, Utc};
use url::Url;

pub trait ShortenedURLRepository {
    fn create(
        &self,
        original_url: Url,
        custom_id: Option<&str>,
        expires_at: Option<DateTime<Utc>>,
    ) -> impl std::future::Future<Output = Result<ShortenedURL>> + Send;

    fn find_by_id(
        &self,
        id: &str,
    ) -> impl std::future::Future<Output = Result<Option<ShortenedURL>>> + Send;
}
