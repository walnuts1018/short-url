use actix_web::{
    HttpRequest, HttpResponse, Responder, ResponseError,
    web::{self, Redirect},
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

use crate::domain::{
    id::ID,
    models::{ShortUrlAdminView, ShortUrlState},
    repository::ShortenedURLRepository,
};

#[derive(Debug, Error)]
pub enum HandlerError {
    #[error("Parameter error: {0}")]
    ParamError(String),
    #[error("Database error: {0}")]
    DBError(#[from] anyhow::Error),
    #[error("URL not found")]
    NotFound,

    #[error("URL disabled")]
    Disabled,
}

impl ResponseError for HandlerError {
    fn error_response(&self) -> HttpResponse {
        match self {
            HandlerError::ParamError(msg) => HttpResponse::BadRequest().body(msg.clone()),
            HandlerError::DBError(e) => {
                tracing::error!("Internal Server Error: {:?}", e);
                HttpResponse::InternalServerError().body("Internal Server Error")
            }
            HandlerError::NotFound => HttpResponse::NotFound().body("URL not found"),
            HandlerError::Disabled => HttpResponse::Gone().body("URL disabled"),
        }
    }
}

#[derive(Clone)]
pub struct Handler<T: ShortenedURLRepository> {
    url_repo: T,
}

impl<T: ShortenedURLRepository> Handler<T> {
    pub fn new(url_repo: T) -> Self {
        Handler { url_repo }
    }

    fn extract_request_meta(req: &HttpRequest) -> (Option<String>, Option<String>, Option<String>) {
        let ip = req
            .connection_info()
            .realip_remote_addr()
            .map(|s| s.to_string());
        let user_agent = req
            .headers()
            .get(actix_web::http::header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let request_id = req
            .headers()
            .get("x-request-id")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        (ip, user_agent, request_id)
    }

    pub async fn livez(&self) -> impl Responder + use<T> {
        HttpResponse::Ok().body("Ok")
    }

    pub async fn readyz(&self) -> impl Responder + use<T> {
        HttpResponse::Ok().body("Ok")
    }

    pub async fn shorten(
        &self,
        req: HttpRequest,
        info: web::Json<ShortenParams>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let url = info.url.trim();
        if url.is_empty() {
            return Err(HandlerError::ParamError(
                "The 'url' parameter is required.".to_string(),
            ));
        }

        let url = Url::parse(url)
            .map_err(|e| HandlerError::ParamError(format!("Invalid URL format: {}", e)))?;

        let shortened = self
            .url_repo
            .create(url, info.custom_id.as_deref(), None)
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;

        let (ip, user_agent, request_id) = Self::extract_request_meta(&req);
        let now = chrono::Utc::now();

        // Save to Scylla (TTL=30d) and also emit to stdout via tracing.
        let _ = self
            .url_repo
            .log_create(
                shortened.id.0.as_str(),
                now,
                ip.as_deref(),
                user_agent.as_deref(),
                shortened.original_url.as_str(),
                request_id.as_deref(),
            )
            .await;
        tracing::info!(
            event = "short_url_created",
            id = shortened.id.0.as_str(),
            ip = ip.as_deref().unwrap_or(""),
            user_agent = user_agent.as_deref().unwrap_or(""),
            request_id = request_id.as_deref().unwrap_or(""),
            original_url = shortened.original_url.as_str()
        );

        Ok(web::Json(ShortenResponse { id: shortened.id }))
    }

    pub async fn redirect(
        &self,
        req: HttpRequest,
        path: web::Path<String>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let id = ID::new(path.into_inner());

        let (ip, user_agent, request_id) = Self::extract_request_meta(&req);
        let now = chrono::Utc::now();

        let url = self
            .url_repo
            .find_by_id(id.clone())
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;

        let Some(url) = url else {
            let _ = self
                .url_repo
                .log_access(
                    id.0.as_str(),
                    now,
                    ip.as_deref(),
                    user_agent.as_deref(),
                    request_id.as_deref(),
                    404,
                )
                .await;
            tracing::info!(
                event = "short_url_access",
                id = id.0.as_str(),
                status_code = 404,
                ip = ip.as_deref().unwrap_or(""),
                user_agent = user_agent.as_deref().unwrap_or(""),
                request_id = request_id.as_deref().unwrap_or("")
            );
            return Err(HandlerError::NotFound);
        };

        let state = self
            .url_repo
            .get_state(id.0.as_str())
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;
        if matches!(state.as_ref(), Some(ShortUrlState { enabled: false, .. })) {
            let _ = self.url_repo.set_last_access(id.0.as_str(), now, 410).await;
            let _ = self
                .url_repo
                .log_access(
                    id.0.as_str(),
                    now,
                    ip.as_deref(),
                    user_agent.as_deref(),
                    request_id.as_deref(),
                    410,
                )
                .await;
            tracing::info!(
                event = "short_url_access",
                id = id.0.as_str(),
                status_code = 410,
                ip = ip.as_deref().unwrap_or(""),
                user_agent = user_agent.as_deref().unwrap_or(""),
                request_id = request_id.as_deref().unwrap_or("")
            );
            return Err(HandlerError::Disabled);
        }

        let _ = self.url_repo.set_last_access(id.0.as_str(), now, 308).await;
        let _ = self
            .url_repo
            .log_access(
                id.0.as_str(),
                now,
                ip.as_deref(),
                user_agent.as_deref(),
                request_id.as_deref(),
                308,
            )
            .await;
        tracing::info!(
            event = "short_url_access",
            id = id.0.as_str(),
            status_code = 308,
            ip = ip.as_deref().unwrap_or(""),
            user_agent = user_agent.as_deref().unwrap_or(""),
            request_id = request_id.as_deref().unwrap_or("")
        );

        Ok(Redirect::to(url.original_url.to_string()).permanent())
    }

    pub async fn admin_list_links(&self) -> Result<impl Responder + use<T>, HandlerError> {
        let urls = self
            .url_repo
            .list_all()
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;

        let mut items = Vec::with_capacity(urls.len());
        for url in urls {
            let id = url.id.0.clone();
            let state = self
                .url_repo
                .get_state(&id)
                .await
                .map_err(|e| HandlerError::DBError(e.into()))?;
            let last_access = self
                .url_repo
                .get_last_access(&id)
                .await
                .map_err(|e| HandlerError::DBError(e.into()))?;

            items.push(AdminLinkListItem {
                id: url.id,
                original_url: url.original_url,
                created_at: url.created_at,
                expires_at: url.expires_at,
                enabled: state.as_ref().map(|s| s.enabled).unwrap_or(true),
                disabled_at: state.and_then(|s| s.disabled_at),
                last_access_at: last_access.map(|(ts, _)| ts),
            });
        }

        items.sort_by(|a, b| match (a.last_access_at, b.last_access_at) {
            (Some(at), Some(bt)) => bt.cmp(&at),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.created_at.cmp(&b.created_at),
        });

        Ok(web::Json(items))
    }

    pub async fn admin_get_link(
        &self,
        path: web::Path<String>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let id = ID::new(path.into_inner());

        let url = self
            .url_repo
            .find_by_id(id.clone())
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;
        let state = self
            .url_repo
            .get_state(id.0.as_str())
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;

        let view = ShortUrlAdminView {
            id: id,
            original_url: url.as_ref().map(|u| u.original_url.clone()),
            created_at: url.as_ref().map(|u| u.created_at),
            expires_at: url.as_ref().and_then(|u| u.expires_at),
            state,
        };

        Ok(web::Json(view))
    }

    pub async fn admin_disable(
        &self,
        path: web::Path<String>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let id = path.into_inner();
        let now = chrono::Utc::now();
        self.url_repo
            .set_enabled(&id, false, now)
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;
        Ok(HttpResponse::Ok().finish())
    }

    pub async fn admin_restore(
        &self,
        path: web::Path<String>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let id = path.into_inner();
        let now = chrono::Utc::now();
        self.url_repo
            .set_enabled(&id, true, now)
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;
        Ok(HttpResponse::Ok().finish())
    }
}

#[derive(Serialize)]
pub struct AdminLinkListItem {
    pub id: ID,
    pub original_url: Url,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub enabled: bool,
    pub disabled_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_access_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize)]
pub struct ShortenParams {
    pub url: String,
    pub custom_id: Option<String>,
}

#[derive(Serialize)]
pub struct ShortenResponse {
    pub id: ID,
}
