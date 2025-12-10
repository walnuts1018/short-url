use std::sync::Arc;

use crate::{
    domain::{models::ShortenedURL, repository::ShortenedURLRepository},
    postgres::config::Config,
};
use anyhow::Result;
use sqlx::PgPool;

pub struct DB {
    pub pool: PgPool,
}

impl DB {
    pub async fn new(config: Config) -> Self {
        let pool = PgPool::connect(&config.dsn).await.unwrap();
        DB { pool }
    }
}

impl ShortenedURLRepository for Arc<DB> {
    async fn create(
        &self,
        original_url: &str,
        custom_id: Option<&str>,
        expires_at: Option<chrono::DateTime<chrono::Utc>>,
    ) -> Result<ShortenedURL> {
        panic!("Not yet implemented");
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<ShortenedURL>> {
        panic!("Not yet implemented");
    }
}
