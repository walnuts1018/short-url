use crate::domain::{
    id::ID,
    models::{ShortUrlState, ShortenedURL},
};
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
        id: ID,
    ) -> impl std::future::Future<Output = Result<Option<ShortenedURL>>> + Send;

    fn list_by_created_at_page(
        &self,
        limit: i32,
        paging_state: Option<Vec<u8>>,
    ) -> impl std::future::Future<Output = Result<(Vec<ShortenedURL>, Option<Vec<u8>>)>> + Send;

    fn save_create_meta_if_absent(
        &self,
        id: &str,
        created_at: DateTime<Utc>,
        ip: Option<&str>,
        user_agent: Option<&str>,
        request_id: Option<&str>,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    fn get_create_meta(
        &self,
        id: &str,
    ) -> impl std::future::Future<Output = Result<Option<(DateTime<Utc>, String, String, String)>>> + Send;

    fn get_state(
        &self,
        id: &str,
    ) -> impl std::future::Future<Output = Result<Option<ShortUrlState>>> + Send;

    fn set_enabled(
        &self,
        id: &str,
        enabled: bool,
        now: DateTime<Utc>,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    fn log_create(
        &self,
        id: &str,
        ts: DateTime<Utc>,
        ip: Option<&str>,
        user_agent: Option<&str>,
        original_url: &str,
        request_id: Option<&str>,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    fn log_access(
        &self,
        id: &str,
        ts: DateTime<Utc>,
        ip: Option<&str>,
        user_agent: Option<&str>,
        request_id: Option<&str>,
        status_code: i32,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    fn list_access_logs_recent(
        &self,
        id: &str,
        limit: i32,
    ) -> impl std::future::Future<Output = Result<Vec<(DateTime<Utc>, String, String, String, i32)>>>
    + Send;

    fn get_last_access(
        &self,
        id: &str,
    ) -> impl std::future::Future<Output = Result<Option<(DateTime<Utc>, i32)>>> + Send;

    fn set_last_access(
        &self,
        id: &str,
        ts: DateTime<Utc>,
        status_code: i32,
    ) -> impl std::future::Future<Output = Result<()>> + Send;
}
