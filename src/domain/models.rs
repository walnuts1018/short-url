use crate::domain::id::ID;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Serialize, Deserialize)]
pub struct ShortenedURL {
    pub id: ID, // pathになる
    pub original_url: Url,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShortUrlState {
    pub id: ID,
    pub enabled: bool,
    pub disabled_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShortUrlAdminView {
    pub id: ID,
    pub original_url: Option<Url>,
    pub created_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub state: Option<ShortUrlState>,
}
