use actix_web::{
    HttpResponse, Responder, ResponseError,
    web::{self, Redirect},
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{domain::repository::ShortenedURLRepository, handler::config::Config};

#[derive(Debug, Error)]
pub enum HandlerError {
    #[error("Database error: {0}")]
    DBError(#[from] anyhow::Error),
    #[error("URL not found")]
    NotFound,
}

impl ResponseError for HandlerError {
    fn error_response(&self) -> HttpResponse {
        match self {
            HandlerError::DBError(e) => {
                tracing::error!("Internal Server Error: {:?}", e);
                HttpResponse::InternalServerError().body("Internal Server Error")
            }
            HandlerError::NotFound => HttpResponse::NotFound().body("URL not found"),
        }
    }
}

#[derive(Clone)]
pub struct Handler<T: ShortenedURLRepository> {
    config: Config,
    url_repo: T,
}

impl<T: ShortenedURLRepository> Handler<T> {
    pub fn new(config: Config, url_repo: T) -> Self {
        Handler { config, url_repo }
    }

    pub async fn livez(&self) -> impl Responder + use<T> {
        HttpResponse::Ok().body("Ok")
    }

    pub async fn readyz(&self) -> impl Responder + use<T> {
        HttpResponse::Ok().body("Ok")
    }

    pub async fn shorten(
        &self,
        info: web::Json<ShortenParams>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let shortened = self
            .url_repo
            .create(&info.url, info.custom_id.as_deref(), None)
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?;

        Ok(web::Json(ShortenResponse { id: shortened.id }))
    }

    pub async fn redirect(
        &self,
        path: web::Path<String>,
    ) -> Result<impl Responder + use<T>, HandlerError> {
        let id = path.into_inner();

        let url = self
            .url_repo
            .find_by_id(&id)
            .await
            .map_err(|e| HandlerError::DBError(e.into()))?
            .ok_or(HandlerError::NotFound)?;

        Ok(Redirect::to(url.original_url).permanent())
    }
}

#[derive(Deserialize)]
pub struct ShortenParams {
    pub url: String,
    pub custom_id: Option<String>,
}

#[derive(Serialize)]
pub struct ShortenResponse {
    pub id: String,
}
