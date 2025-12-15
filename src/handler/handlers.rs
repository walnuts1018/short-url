use actix_web::{
    HttpRequest, HttpResponse, Responder, ResponseError,
    web::{self, Redirect},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
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

        // Best-effort: save creator meta (TTL=30d). Stored once per id.
        let _ = self
            .url_repo
            .save_create_meta_if_absent(
                shortened.id.0.as_str(),
                shortened.created_at,
                ip.as_deref(),
                user_agent.as_deref(),
                request_id.as_deref(),
            )
            .await;

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

    pub async fn admin_list_links(
        &self,
        query: web::Query<AdminListQuery>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let limit = query.limit.unwrap_or(20).clamp(1, 100);

        let paging_state = match query.page_state.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(token) => {
                let decoded = URL_SAFE_NO_PAD
                    .decode(token)
                    .map_err(|_| HandlerError::ParamError("Invalid page_state".to_string()))?;
                Some(decoded)
            }
        };

        let (urls, next_page_state) = self
            .url_repo
            .list_by_created_at_page(limit, paging_state)
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
            let create_meta = self
                .url_repo
                .get_create_meta(&id)
                .await
                .map_err(|e| HandlerError::DBError(e.into()))?;

            let (creator_ip, creator_user_agent, creator_request_id) = match create_meta {
                Some((_ts, ip, ua, rid)) => {
                    let ip = (!ip.is_empty()).then_some(ip);
                    let ua = (!ua.is_empty()).then_some(ua);
                    let rid = (!rid.is_empty()).then_some(rid);
                    (ip, ua, rid)
                }
                None => (None, None, None),
            };

            items.push(AdminLinkListItem {
                id: url.id,
                original_url: url.original_url,
                created_at: url.created_at,
                expires_at: url.expires_at,
                enabled: state.as_ref().map(|s| s.enabled).unwrap_or(true),
                disabled_at: state.and_then(|s| s.disabled_at),
                last_access_at: last_access.map(|(ts, _)| ts),
                creator_ip,
                creator_user_agent,
                creator_request_id,
            });
        }

        let next_page_state = next_page_state.map(|raw| URL_SAFE_NO_PAD.encode(raw));

        Ok(web::Json(AdminLinkListResponse {
            items,
            next_page_state,
        }))
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

    pub async fn admin_list_access_logs(
        &self,
        path: web::Path<String>,
        query: web::Query<AdminAccessLogQuery>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let id = path.into_inner();
        let id = id.trim();
        if id.is_empty() {
            return Err(HandlerError::ParamError("The 'id' parameter is required.".to_string()));
        }

        // Ensure the link exists.
        let url = self
            .url_repo
            .find_by_id(ID::new(id.to_string()))
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;
        if url.is_none() {
            return Err(HandlerError::NotFound);
        }

        let limit = query.limit.unwrap_or(100).clamp(1, 500);
        let rows = self
            .url_repo
            .list_access_logs_recent(id, limit)
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;

        let mut items = Vec::with_capacity(rows.len());
        for (ts, ip, ua, rid, status_code) in rows {
            let ip = (!ip.is_empty()).then_some(ip);
            let ua = (!ua.is_empty()).then_some(ua);
            let rid = (!rid.is_empty()).then_some(rid);
            items.push(AdminAccessLogItem {
                ts,
                ip,
                user_agent: ua,
                request_id: rid,
                status_code,
            });
        }

        Ok(web::Json(AdminAccessLogResponse { items }))
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
    pub creator_ip: Option<String>,
    pub creator_user_agent: Option<String>,
    pub creator_request_id: Option<String>,
}

#[derive(Serialize)]
pub struct AdminLinkListResponse {
    pub items: Vec<AdminLinkListItem>,
    pub next_page_state: Option<String>,
}

#[derive(Deserialize)]
pub struct AdminListQuery {
    pub limit: Option<i32>,
    pub page_state: Option<String>,
}

#[derive(Deserialize)]
pub struct AdminAccessLogQuery {
    pub limit: Option<i32>,
}

#[derive(Serialize)]
pub struct AdminAccessLogItem {
    pub ts: chrono::DateTime<chrono::Utc>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub request_id: Option<String>,
    pub status_code: i32,
}

#[derive(Serialize)]
pub struct AdminAccessLogResponse {
    pub items: Vec<AdminAccessLogItem>,
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
